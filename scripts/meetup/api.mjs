// 밋업 공식 GraphQL API (https://api.meetup.com/gql-ext) — JWT 흐름으로 사람 없이 토큰을 받는다(docs: meetup.com/graphql/authentication).
// 설정은 MEETUP_ENV(기본 ~/.config/pallo/meetup.env)에서만 읽는다: MEETUP_CLIENT_KEY, MEETUP_SIGNING_KEY_ID, MEETUP_MEMBER_ID, MEETUP_PRIVATE_KEY(개인 키 파일 경로).
// 개인 키·토큰은 절대 출력하지 않는다.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createSign } from "node:crypto";
import { createRequire } from "node:module";
export const M = createRequire(import.meta.url)("../../meetup-core.js");

const ENDPOINT = "https://api.meetup.com/gql-ext", TOKEN_URL = "https://secure.meetup.com/oauth2/access";
const file = process.env.MEETUP_ENV || `${homedir()}/.config/pallo/meetup.env`;
const parseEnv = (t) => Object.fromEntries(t.split("\n").filter((l) => !/^\s*#/.test(l)).map((l) => l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(["'])(.*)\1$/, "$2")]));

export class AuthError extends Error {}
function config() {
  let env;
  try { env = parseEnv(readFileSync(file, "utf8")); } catch { throw new AuthError(`설정 파일이 없어요: ${file}`); }
  const need = ["MEETUP_CLIENT_KEY", "MEETUP_SIGNING_KEY_ID", "MEETUP_MEMBER_ID", "MEETUP_PRIVATE_KEY"].filter((k) => !env[k]);
  if (need.length) throw new AuthError(`${file} 에 ${need.join(", ")} 가 없어요`);
  let key;
  try { key = readFileSync(env.MEETUP_PRIVATE_KEY.replace(/^~\//, homedir() + "/"), "utf8"); } catch { throw new AuthError("개인 키 파일을 읽지 못했어요(MEETUP_PRIVATE_KEY 경로 확인)"); }
  return { clientKey: env.MEETUP_CLIENT_KEY, signingKeyId: env.MEETUP_SIGNING_KEY_ID, memberId: env.MEETUP_MEMBER_ID, key };
}

const b64url = (s) => Buffer.from(s).toString("base64url");
function signedJwt(cfg) {
  const { header, claims } = M.jwtParts(cfg, Math.floor(Date.now() / 1000));
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(cfg.key).toString("base64url")}`;
}

let token;
export async function accessToken() {
  if (token) return token;
  const cfg = config();
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedJwt(cfg) }) });
  const j = await r.json().catch(() => ({}));
  // 오류 응답에는 비밀값이 없지만, 그래도 error 코드만 쓴다
  if (!r.ok || !j.access_token) throw new AuthError(`토큰 받기 실패 ${r.status} ${j.error ?? ""}`.trim());
  return (token = j.access_token);
}

// GraphQL 호출. 오류(errors)가 있으면 첫 메시지·코드로 던진다. 요청 한도(RATE_LIMITED)면 resetAt 까지 한 번 기다렸다 다시.
export async function gql(query, variables = {}, retried = false) {
  const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` }, body: JSON.stringify({ query, variables }) });
  if (r.status === 401 || r.status === 403) throw new AuthError(`API 권한 없음 ${r.status}`);
  const j = await r.json().catch(() => null);
  if (!j) throw new Error(`API 응답을 읽지 못했어요 ${r.status}`);
  const err = j.errors?.[0];
  if (err?.extensions?.code === "RATE_LIMITED" && !retried) {
    const wait = Math.min(65e3, Math.max(1e3, Date.parse(err.extensions.resetAt) - Date.now() + 1e3) || 60e3);
    await new Promise((res) => setTimeout(res, wait));
    return gql(query, variables, true);
  }
  if (err) throw new Error(`API 오류: ${String(err.message).slice(0, 200)}${err.extensions?.code ? ` (${err.extensions.code})` : ""}`);
  return j.data;
}

const RSVP_FIELDS = `id status isHost isFirstEvent guestsCount updated member { id name city }`;
const EVENT_FIELDS = `id title dateTime eventUrl venue { name } rsvps(first: 100) { edges { node { ${RSVP_FIELDS} } } }`;

// 기간 안 예정 이벤트 중 신청이 min 명 이상(주최자 포함)인 것 + 그 신청들
export async function upcomingWithRsvps(fromIso, toIso, min) {
  const out = [];
  for (let after = null, page = 0; page < 20; page++) {
    const d = await gql(`query($u: ID!, $after: String, $f: NetworkEventsFilter) { proNetwork(urlname: $u) { eventsSearch(input: { first: 50, after: $after, filter: $f }) {
      pageInfo { hasNextPage endCursor } edges { node { ${EVENT_FIELDS} } } } } }`,
      { u: M.NETWORK, after, f: { status: "UPCOMING", eventDateMin: fromIso, eventDateMax: toIso, rsvpsPerEventMin: min } });
    const conn = d?.proNetwork?.eventsSearch;
    if (!conn) throw new Error("eventsSearch 결과가 없어요(네트워크 권한 확인)");
    out.push(...conn.edges.map((e) => e.node));
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

// 이벤트 번호로 다시 읽기 (지난 모임 출석 상태, 신청이 다 빠진 이벤트의 취소 확인용). 20개씩 별칭으로 묶는다.
export async function eventsById(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    const q = `query { ${chunk.map((id, k) => `e${k}: event(id: ${JSON.stringify(String(id))}) { ${EVENT_FIELDS} }`).join("\n")} }`;
    const d = await gql(q);
    out.push(...chunk.map((_, k) => d?.[`e${k}`]).filter(Boolean));
  }
  return out;
}

// since 이후 가입한 네트워크 회원
export async function newMembers(sinceIso) {
  const d = await gql(`query($u: ID!, $f: NetworkUsersFilter) { proNetwork(urlname: $u) { membersSearch(input: { first: 50, filter: $f }) {
    edges { metadata { joinTime } node { id name city } } } } }`, { u: M.NETWORK, f: { joinDateTimeMin: sinceIso } });
  return (d?.proNetwork?.membersSearch?.edges ?? []).map((e) => ({ member_id: String(e.node.id), name: String(e.node.name ?? ""), city: e.node.city ?? null, joined_at: e.metadata?.joinTime ?? null }));
}

export async function self() { return (await gql(`query { self { id name } }`))?.self ?? null; }
