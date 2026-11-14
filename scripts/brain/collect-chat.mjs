// 🧠 뇌 탭 분석 자료 모으기 ②-2 Claude 채팅(claude.ai) — 대표가 채팅에 "직접 쓴 말"만 뽑아 claude-chat.json 으로
// 사용: node scripts/brain/collect-chat.mjs login     처음 1회·로그인이 풀렸을 때. 창이 뜨면 사람이 claude.ai 에 직접 로그인하고 창을 닫는다 (비밀번호는 절대 대신 넣지 않는다)
//       node scripts/brain/collect-chat.mjs           읽기만(GET) → ~/.local/share/pallo-brain/claude-chat.json. 지난번 뒤로 바뀐 대화만 다시 읽는다
//       node scripts/brain/collect-chat.mjs selftest  계산 점검
// Claude 의 답·첨부 파일 내용은 담지 않는다. 아무것도 고치거나 지우지 않는다. 로그인 프로필은 맥미니 안 ~/.cache/pallo-brain/chat-profile.
// 출력 JSON 한 줄 {ok,chats,fetched,left,sessions,msgs} | {ok:false,reason:"login_required"|"blocked"|"error"} (실패면 종료코드 1, 지난 파일은 그대로 둔다)
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { playwrightCandidates } from "../mkd/browser-rows.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.BRAIN_DIR || join(homedir(), ".local", "share", "pallo-brain");
const PROFILE = join(homedir(), ".cache", "pallo-brain", "chat-profile"), CHROME_APP = "/Applications/Google Chrome.app";
const OUT = join(DIR, "claude-chat.json"), MAX = 3000, BUDGET = 60_000; // BUDGET: 대화 읽기에 쓰는 시간(ms). 넘으면 남은 대화는 다음 번에
const cmd = process.argv[2];

// 대화 하나(상세 응답에서 뽑은 사람 말) → 저장할 대화. 글이 하나도 없으면 null
export function toSession(g) {
  const msgs = (g.msgs ?? []).map((m) => { const text = String(m.text ?? "").trim(); return text ? { t: String(m.t ?? "").slice(0, 16), kind: "say", text: text.slice(0, MAX), ...(text.length > MAX ? { cut: text.length } : {}) } : null; }).filter(Boolean);
  return msgs.length ? { id: g.uuid.slice(0, 8), uuid: g.uuid, upd: g.upd, project: "claude.ai", start: msgs[0].t, title: String(g.name ?? "").slice(0, 120), msgs } : null;
}
// 지난 파일 + 새로 읽은 대화 → 새 파일. 글이 없는 대화(첨부만 올린 대화)는 손으로 적어 둔 지난 것을 지키고, claude.ai 에서 지운 대화도 남긴다
export function mergeChats(old, got) {
  const by = new Map((old?.sessions ?? []).map((s) => [s.id, s]));
  for (const g of got) { const id = g.uuid.slice(0, 8), s = toSession(g), prev = by.get(id); if (s) by.set(id, s); else if (prev) by.set(id, { ...prev, uuid: g.uuid, upd: g.upd }); else by.set(id, { id, uuid: g.uuid, upd: g.upd, project: "claude.ai", start: "", title: String(g.name ?? "").slice(0, 120), msgs: [] }); }
  return { host: "chat", sessions: [...by.values()].sort((a, b) => String(a.start).localeCompare(String(b.start))) };
}
// 다시 안 읽어도 되는 대화: {uuid: 지난번 updated_at}
export const knownOf = (old) => Object.fromEntries((old?.sessions ?? []).filter((s) => s.uuid && s.upd).map((s) => [s.uuid, s.upd]));

// 페이지 안에서 실행 — 로그인한 사람 자격으로 목록과 바뀐 대화만 읽는다 (GET 만)
async function readInPage({ known, budget }) {
  const t0 = Date.now();
  const get = async (u) => { const r = await fetch(u, { credentials: "include" }); if (!r.ok) throw new Error("http " + r.status); return r.json(); };
  const orgs = await get("/api/organizations"), want = (document.cookie.match(/lastActiveOrg=([^;]+)/) || [])[1];
  const org = (orgs.find((o) => o.uuid === want) || orgs[0] || {}).uuid; if (!org) throw new Error("http 401");
  const list = []; for (let off = 0; off < 5000; off += 200) { const r = await get(`/api/organizations/${org}/chat_conversations?limit=200&offset=${off}`); list.push(...r); if (r.length < 200) break; }
  const got = []; let left = 0;
  for (const c of list) {
    if (known[c.uuid] === c.updated_at) continue;
    if (Date.now() - t0 > budget) { left++; continue; }
    try {
      const d = await get(`/api/organizations/${org}/chat_conversations/${c.uuid}?tree=True&rendering_mode=messages&render_all_tools=false`);
      got.push({ uuid: c.uuid, name: c.name || "", upd: c.updated_at, msgs: (d.chat_messages || []).filter((m) => m.sender === "human").map((m) => ({ t: m.created_at, text: m.text || (Array.isArray(m.content) ? m.content.filter((x) => x.type === "text").map((x) => x.text).join("\n") : "") })) });
    } catch { left++; }
  }
  return { chats: list.length, got, left };
}

async function launch(headless) {
  let chromium; for (const p of playwrightCandidates(here, homedir(), process.env)) if (existsSync(p)) { chromium = (await import(pathToFileURL(p).href)).chromium; break; }
  if (!chromium) { console.error("Playwright 가 없어요: cd scripts/mkc && npm install"); process.exit(2); }
  mkdirSync(PROFILE, { recursive: true });
  return chromium.launchPersistentContext(PROFILE, { ...(existsSync(CHROME_APP) ? { channel: "chrome" } : {}), headless, viewport: { width: 1366, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul", args: ["--disable-blink-features=AutomationControlled"], ignoreDefaultArgs: ["--enable-automation"] });
}
const onLoginPage = (url) => /\/(login|logout|oauth|magic-link)|accounts\.google\.com/.test(url);

async function login() {
  const ctx = await launch(false), page = ctx.pages()[0] ?? (await ctx.newPage());
  page.goto("https://claude.ai/login").catch(() => {});
  console.log("claude.ai 에 직접 로그인한 뒤 창을 닫아 주세요. 최대 30분 기다려요.");
  await new Promise((res) => { ctx.on("close", res); setTimeout(res, 30 * 60e3); });
  await ctx.close().catch(() => {});
}

// 한 번 읽어 보기 → {chats,got,left} | {reason}
async function tryRead(headless, known) {
  let ctx; try { ctx = await launch(headless); } catch { return { reason: "error" }; }
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto("https://claude.ai/recents", { waitUntil: "domcontentloaded", timeout: 30_000 });
    for (let i = 0; i < 10 && /just a moment|잠시만/i.test(await page.title().catch(() => "")); i++) await new Promise((r) => setTimeout(r, 1000)); // 사람 확인 화면이 풀리기를 잠깐 기다림
    if (onLoginPage(page.url())) return { reason: "login_required" };
    if (/just a moment|잠시만/i.test(await page.title().catch(() => ""))) return { reason: "blocked" };
    try { return await page.evaluate(readInPage, { known, budget: BUDGET }); }
    catch (e) { return { reason: /http 40[13]/.test(String(e?.message)) ? (onLoginPage(page.url()) || headless === false ? "login_required" : "blocked") : "error" }; }
  } catch { return { reason: "error" }; } finally { await ctx.close().catch(() => {}); }
}

async function collect() {
  mkdirSync(DIR, { recursive: true });
  const old = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { host: "chat", sessions: [] };
  let r = await tryRead(true, knownOf(old));
  if (r.reason === "blocked" || r.reason === "error") r = await tryRead(false, knownOf(old)); // 창 없는 크롬이 막히면 창을 띄워 한 번 더
  if (r.reason) { console.log(JSON.stringify({ ok: false, reason: r.reason })); return 1; }
  const next = mergeChats(old, r.got);
  writeFileSync(OUT + ".tmp", JSON.stringify(next)); chmodSync(OUT + ".tmp", 0o600); renameSync(OUT + ".tmp", OUT);
  console.log(JSON.stringify({ ok: true, chats: r.chats, fetched: r.got.length, left: r.left, sessions: next.sessions.length, msgs: next.sessions.reduce((n, s) => n + s.msgs.length, 0) }));
  return 0;
}

function selftest() {
  const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("실패:", what, JSON.stringify(a)); process.exit(1); } };
  const g = (uuid, upd, msgs, name = "제목") => ({ uuid, name, upd, msgs });
  const s = toSession(g("aaaaaaaa-1", "u1", [{ t: "2026-11-07T08:22:13.1Z", text: " 안녕 " }, { t: "2026-11-07T08:23:00Z", text: "" }]));
  eq([s.id, s.start, s.msgs.length, s.msgs[0].text], ["aaaaaaaa", "2026-11-07T08:22", 1, "안녕"], "빈 글은 빼고 시각은 분까지");
  eq(toSession(g("bbbbbbbb-1", "u1", [{ t: "x", text: "가".repeat(3500) }])).msgs[0].cut, 3500, "긴 글은 자르고 원래 길이를 남김");
  const old = { host: "chat", sessions: [{ id: "cccccccc", project: "claude.ai", start: "2026-06-17T09:10", title: "손으로 적은 것", msgs: [{ t: "2026-06-17T09:10", kind: "say", text: "요약" }] }] };
  const m = mergeChats(old, [g("cccccccc-9", "u9", [{ t: "t", text: "" }]), g("aaaaaaaa-1", "u1", [{ t: "2026-11-07T08:22:00Z", text: "새 글" }])]);
  eq(m.sessions.map((x) => [x.id, x.msgs[0].text, x.upd]), [["cccccccc", "요약", "u9"], ["aaaaaaaa", "새 글", "u1"]], "글 없는 대화는 지난 것을 지키고 날짜순");
  eq(knownOf(m), { "cccccccc-9": "u9", "aaaaaaaa-1": "u1" }, "다시 안 읽을 대화");
  eq(mergeChats(m, []).sessions.length, 2, "claude.ai 에서 사라져도 남김");
  console.log("selftest ok");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (cmd === "selftest") selftest();
  else if (cmd === "login") { await login(); process.exit(0); }
  else if (cmd) { console.error("사용: node scripts/brain/collect-chat.mjs [login|selftest]"); process.exit(2); }
  else { setTimeout(() => { console.log(JSON.stringify({ ok: false, reason: "error" })); process.exit(1); }, 170_000).unref(); process.exit(await collect()); }
}
