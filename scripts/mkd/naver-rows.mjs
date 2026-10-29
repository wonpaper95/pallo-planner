// 네이버 검색광고 일별 수집의 순수 부분 — 네트워크·DB·환경파일을 읽지 않는다(tests/mkd-naver.test.mjs). CLI 는 naver-ad.mjs.
// 계정이 둘: 기본 키(NAVER_AD_*) = 대구 계정(dsr·jpcn), _ULSAN 키(NAVER_AD_*_ULSAN) = 울산 계정(ulsan). 키가 셋 다 없는 계정은 건너뛴다(실패 아님).
// 만든 행은 {team_key, unit, metrics, status?} — rows.mjs 의 toRowsPure 가 검증·저장 형태로 바꾼다. 지점은 항상 team_key 로 명시(미분류 없음).
import { createRequire } from "node:module";
const MK = createRequire(import.meta.url)("../../mk-core.js");

export const ACCOUNTS = [
  // 대구 계정: 이름에 일본어·중국어·일중(·일어/중어 줄임말)이 있으면 jpcn, 나머지('팔로 소상고인'·'팔로 네이버플레이스'·대구 영어)는 dsr
  { suffix: "", name: "대구", teams: ["dsr", "jpcn"], teamOf: (n) => (MK.teamKeyOf(n) === "jpcn" || /일어|중어/.test(n) ? "jpcn" : "dsr") },
  { suffix: "_ULSAN", name: "울산", teams: ["ulsan"], teamOf: () => "ulsan" },
];
const NO_CAMPAIGN = "운영 캠페인 없음";
const n0 = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

// .env 형식: 주석(#)·앞쪽 export·값을 감싼 따옴표 허용 (scripts/mk/db.mjs 와 같은 규칙)
export const parseEnv = (t) => Object.fromEntries(String(t).split("\n").filter((l) => !/^\s*#/.test(l)).map((l) => l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(["'])(.*)\1$/, "$2")]));

// 계정의 키 세 개. state: ready(셋 다) | absent(셋 다 없음 → 건너뜀 후보) | partial(일부만 → 실패)
export function accountKeys(env, account) {
  const v = (name) => String(env[`NAVER_AD_${name}${account.suffix}`] ?? "").trim();
  const k = { cid: v("CUSTOMER_ID"), key: v("API_KEY"), secret: v("SECRET") };
  const have = Object.values(k).filter(Boolean).length;
  return { state: have === 3 ? "ready" : have === 0 ? "absent" : "partial", ...k };
}

// 오류 문장 → note. 4자리 이상 숫자(고객번호·키 조각·전화번호 모양)는 #, 120자까지 (개인정보 검사에 걸리지 않게)
export const sanitizeNote = (msg) => String(msg).replace(/\d{4,}/g, "#").slice(0, 120);

// 계정의 지점마다 '전체' 0 행. teams 를 넘기면 그 지점들만.
export const emptyRows = (account, teams = account.teams) => teams.map((team_key) => ({ team_key, unit: "전체", metrics: { impressions: 0, clicks: 0, spend: 0, note: NO_CAMPAIGN } }));
// 계정이 통째로 실패 → 그 계정의 지점에만 '전체' failed 행 (markChannel 은 구미까지 건드리므로 쓰지 않는다)
export const failRows = (account, msg) => account.teams.map((team_key) => ({ team_key, unit: "전체", metrics: { note: sanitizeNote(msg) }, status: "failed" }));

// 캠페인 목록 + 그 날 통계 → 행.
//   camps = GET /ncc/campaigns 결과, stats = GET /stats 의 data (id 로 맞춘다 — 통계가 없는 캠페인은 0).
//   · 꺼져 있고(PAUSED) 그 날 노출 0·비용 0 인 캠페인은 뺀다(옛 캠페인 군더더기). 운영 중이면 0 이어도 남긴다('광고 멈춤' 판단에 필요).
//   · 같은 지점·같은 이름은 한 행으로: 노출·클릭·비용 합, ctr·cpc 는 합으로 다시, avg_rank 는 노출 가중. id·상태는 운영 중인 캠페인(없으면 첫 번째) 것.
//   · 걸러진 뒤 행이 없는 지점은 '전체' 0 행(note) — 지점별 옛 실패 표시를 지우려면 지점마다 ok 행이 하나는 있어야 한다.
export function campaignRows(account, camps, stats) {
  if (!Array.isArray(camps)) throw new Error("캠페인 목록 응답이 배열이 아니에요");
  if (!Array.isArray(stats)) throw new Error("통계 응답이 배열이 아니에요");
  const statOf = new Map(stats.map((s) => [s?.id, s]));
  const groups = new Map(); // `${team}\0${unit}` → { team_key, unit, members: [{imp, clk, amt, rank, id, status}] }
  for (const c of camps) {
    const s = statOf.get(c.nccCampaignId) ?? {}, imp = n0(s.impCnt), clk = n0(s.clkCnt), amt = n0(s.salesAmt), status = String(c.status ?? "");
    if (status === "PAUSED" && imp === 0 && amt === 0) continue;
    const name = String(c.name ?? "").trim().slice(0, 120) || "(이름 없음)", team_key = account.teamOf(name), k = `${team_key}\0${name}`;
    if (!groups.has(k)) groups.set(k, { team_key, unit: name, members: [] });
    groups.get(k).members.push({ imp, clk, amt, rank: n0(s.avgRnk), id: String(c.nccCampaignId ?? ""), status });
  }
  const rows = [...groups.values()].map(({ team_key, unit, members }) => {
    const imp = sum(members, "imp"), clk = sum(members, "clk"), amt = sum(members, "amt");
    const head = members.find((m) => m.status !== "PAUSED") ?? members[0];
    const rank = imp ? Math.round((members.reduce((a, m) => a + m.rank * m.imp, 0) / imp) * 100) / 100 : null;
    return { team_key, unit, metrics: { impressions: imp, clicks: clk, spend: amt, ctr: imp ? clk / imp : null, cpc: clk ? amt / clk : null, avg_rank: rank, campaign_id: head.id, status: head.status } };
  });
  const covered = new Set(rows.map((r) => r.team_key));
  return [...rows, ...emptyRows(account, account.teams.filter((t) => !covered.has(t)))];
}
const sum = (members, k) => members.reduce((a, m) => a + m[k], 0);
