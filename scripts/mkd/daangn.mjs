// 사용: node scripts/mkd/daangn.mjs <YYYY-MM-DD> [--days N] [--print]
// 일일 현황의 당근 비즈프로필(조회수·방문 고객수·단골)을 맥미니 자동 브라우저(Playwright 지속 프로필 ~/.cache/pallo-mkd/daangn)로 읽어 mkd_daily(daangn) 에 지점별 '전체' 행으로 저장한다.
//   · 당근비즈니스 화면이 스스로 받는 JSON(계정 목록·통계 일별 상세·단골 요약)을 응답에서 읽는다 — 쿠키·토큰은 읽지 않고, 화면에서 아무것도 누르지 않는다.
//   · 당근은 어제 숫자가 오전 8시에 확정돼서 확정된 날만, 아직 ok 로 없는 날만 쓴다: [D-(N-1), D] ∩ 확정된 날(기본 N=7 — 06:00 실행이면 그저께까지). 규칙은 daangn-rows.mjs(테스트 있음).
//   · 로그인이 풀렸으면(당근 계정 로그인 화면) 비밀번호를 넣지 않고 지점마다 login_required — 사람이 `node scripts/mkd/browser.mjs login daangn` 으로 다시 로그인한다.
// 출력 JSON 한 줄 {ok,date,final,wrote:{지점:[날짜…]},followers:{지점:n},status:{지점:ok|failed|login_required},note?}. 실패·로그인 필요가 있으면 종료코드 1.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { playwrightCandidates, validDate, kstDate } from "./browser-rows.mjs";
import { DAANGN_TEAMS, LOGIN_URL, dashboardUrl, accountsFrom, daangnLogin, lastFinal, datesToWrite, teamInputs, failInputs } from "./daangn-rows.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const D = process.argv[2], print = process.argv.includes("--print");
const di = process.argv.indexOf("--days"), DAYS = di > 0 ? Number(process.argv[di + 1]) : 7;
const PROFILE = join(homedir(), ".cache", "pallo-mkd", "daangn"), CHROME_APP = "/Applications/Google Chrome.app";
const log = (...a) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function loadChromium() {
  for (const p of playwrightCandidates(here, homedir(), process.env)) if (existsSync(p)) return (await import(pathToFileURL(p).href)).chromium;
  console.error("Playwright 가 없어요: cd scripts/mkc && npm install && npx playwright install chromium"); process.exit(2);
}
// url 로 가면서 경로에 part 가 든 JSON 응답 하나를 기다린다 → JSON | "login" | null
async function gotoFor(page, url, part, ms = 30_000) {
  const wait = page.waitForResponse((r) => r.url().includes(part) && r.status() === 200, { timeout: ms }).then((r) => r.json()).catch(() => null);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => {});
  const got = await Promise.race([wait, (async () => { for (let i = 0; i < ms / 1000; i++) { await new Promise((r) => setTimeout(r, 1000)); if (daangnLogin({ url: page.url(), title: await page.title().catch(() => "") })) return "login"; } return null; })()]);
  return got;
}

async function main() {
  if (!validDate(D) || D >= kstDate()) { console.error(`날짜는 어제 이전 YYYY-MM-DD 여야 해요: ${D ?? "(없음)"}`); process.exit(2); }
  if (!(DAYS >= 1 && DAYS <= 30)) { console.error("--days 는 1~30"); process.exit(2); }
  setTimeout(() => { console.error("실패: 시간 초과 — 강제 종료"); process.exit(1); }, 115_000).unref();
  const { select } = await import("../mk/db.mjs"), { toRows, saveRows, teams } = await import("./lib.mjs");
  const teamList = await teams(), idOf = new Map(teamList.map((t) => [t.key, t.id])), keyOf = new Map(teamList.map((t) => [t.id, t.key]));
  const final = lastFinal(), from = (() => { const t = new Date(D + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() - (DAYS - 1)); return t.toISOString().slice(0, 10); })();
  const have = await select("mkd_daily", `select=team_id,date&channel=eq.daangn&status=eq.ok&date=gte.${from}&date=lte.${D}`, "date,team_id");
  const haveOf = (key) => new Set(have.filter((r) => keyOf.get(r.team_id) === key).map((r) => r.date));
  const plan = Object.fromEntries(DAANGN_TEAMS.map((k) => [k, datesToWrite(D, DAYS, final, haveOf(k))]));
  if (DAANGN_TEAMS.every((k) => !plan[k].length)) { console.log(JSON.stringify({ ok: true, date: D, final, wrote: {}, note: "쓸 날이 없어요(이미 저장됐거나 아직 확정 전)" })); return 0; }

  const inputs = {}, status = {}, followers = {};
  const fail = (k, note, st = "failed") => { status[k] = st; const ds = st === "login_required" ? plan[k].slice(-1) : plan[k]; Object.assign((inputs[k] = {}), failInputs(k, ds, note, st)); };
  const ctx = await (await loadChromium()).launchPersistentContext(PROFILE, {
    ...(existsSync(CHROME_APP) ? { channel: "chrome" } : {}), headless: true, viewport: { width: 1366, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul",
    args: ["--disable-blink-features=AutomationControlled"], ignoreDefaultArgs: ["--enable-automation"],
  }).catch((e) => { console.error(`브라우저를 못 열었어요 — 당근 로그인 창이 아직 열려 있나요? (${String(e?.message).split("\n")[0].slice(0, 100)})`); process.exit(1); });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    const list = await gotoFor(page, LOGIN_URL, "/business_accounts/search");
    if (list === "login" || list === null) for (const k of DAANGN_TEAMS) if (plan[k].length) fail(k, list === "login" ? "로그인 필요" : "계정 목록 못 읽음", list === "login" ? "login_required" : "failed");
    if (list && list !== "login") {
      const accounts = accountsFrom(list);
      for (const k of DAANGN_TEAMS) {
        if (!plan[k].length) continue;
        const a = accounts.find((x) => x.team_key === k);
        if (!a) { fail(k, "비즈프로필 없음"); continue; }
        const fwait = page.waitForResponse((r) => r.url().includes("/statistics/follow_summary") && r.status() === 200, { timeout: 30_000 }).then((r) => r.json()).catch(() => null);
        const detail = await gotoFor(page, dashboardUrl(a.id), "/statistics/statistic_detail");
        if (detail === "login") { fail(k, "로그인 필요", "login_required"); continue; }
        if (!detail) { fail(k, "통계 못 읽음"); continue; }
        const f = (await fwait)?.data?.totalCount;
        followers[k] = Number.isInteger(f) ? f : null;
        inputs[k] = teamInputs(k, detail, followers[k], plan[k]);
        status[k] = Object.values(inputs[k]).every((x) => x.rows[0].status === "ok") ? "ok" : "failed";
        log(`${k}: ${plan[k].join(",")} 읽음`);
      }
    }
  } finally { await ctx.close().catch(() => {}); }

  // 날짜별로 검증·저장 (toRows 는 한 번에 한 날짜)
  const out = [];
  for (const [k, byDate] of Object.entries(inputs)) for (const [d, input] of Object.entries(byDate)) out.push(...(await toRows("daangn", d, input)).filter((r) => r.team_id === idOf.get(k)));
  const wrote = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, Object.keys(v)]));
  const res = { ok: Object.values(status).every((s) => s === "ok"), date: D, final, wrote, followers, status };
  if (print) { console.log(JSON.stringify(out, null, 1)); console.error(JSON.stringify(res)); }
  else { await saveRows(out); console.log(JSON.stringify(res)); }
  return res.ok ? 0 : 1;
}

main().then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 3000).unref(); },
  (e) => { console.error(`실패: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`); process.exit(1); });
