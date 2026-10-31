// 사용: node scripts/mkd/browser.mjs login [daangn | blog <블로그아이디>] | check | jeonsan <YYYY-MM-DD> [--print] | google <YYYY-MM-DD> [--print] | google-range <from> <to> --print
// 일일 현황의 구글 검색광고·전산 문의를 사람 없이 읽는다 — Claude in Chrome 대신 맥미니 Playwright(크롬, 지속 프로필 ~/.cache/pallo-mkd/profile, 경쟁사 정찰 pallo-mkc 와 따로).
//   login   처음 1회·로그인이 풀렸을 때. 창이 뜨면 사람이 두 탭(전산 SSO·구글 광고)에서 직접 로그인하고 창을 닫는다. 비밀번호는 절대 입력하지 않는다.
//           login daangn — 당근 비즈니스(프로필 ~/.cache/pallo-mkd/daangn) / login blog <아이디> — 그 블로그 주인 네이버 계정(프로필 ~/.cache/pallo-mkd/blog-<아이디>, 블로그 통계용).
//           네이버는 한 프로필에 한 계정만 로그인되므로 블로그마다 프로필을 따로 쓴다. 이 창들은 30분 기다린다.
//   check   헤드리스로 두 사이트가 로그인된 채인지만 본다(읽기 전용) → {"jeonsan":"ok|login_required|error","google":"…"}, 종료코드 0.
//   jeonsan 지점 3곳(DAEGUDSR·DAEGUJPCH·ULSAN) 신규 회신 › 데이터 보드에서 D 의 유입경로별 문의 건수(jeonsan-daily.js)를 세어 mkd_daily(jeonsan) 에 저장.
//   google  계정 2곳(대구·울산) 캠페인 표에서 D 하루치 노출·클릭·비용·전환 + 알림 배너를 읽어 mkd_daily(google_ad) 에 저장.
//   google-range  구글 3일 점검용(저장 없음, --print 만): 계정 2곳을 맞춤 기간 from~to 로 맞춰 캠페인별 {계정,지점,캠페인,상태,노출,클릭,비용,전환} + 계정 알림 + 전환 화면의 "팔로 신청 클릭" 추적 상태를
//                JSON 한 줄 {ok,from,to,accounts,campaigns} 로 낸다. 로그인 화면이면 그 계정 login_required.
// 둘 다 --print 면 저장하지 않고 행만 출력(읽기만 한다). 출력 JSON 한 줄 {ok,date,…}, 지점·계정이 하나라도 failed|login_required 면 종료코드 1.
// 쿠키·토큰은 읽지 않고, 이름·전화번호가 든 페이지 글은 출력하지 않는다(알림 글은 숫자·이메일을 가린 플래그로만, note 는 고정 문구만).
// 순수 부분(합격 검사·표 읽기·행 만들기)은 browser-rows.mjs(테스트 있음). 한 번 실행이 110초 안에 끝나도록 지점·계정을 한꺼번에 읽고 95초에 끊는다.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BRANCHES, GOOGLE_ACCOUNTS, SSO_URL, jeonsanUrl, googleUrl, playwrightCandidates, needsLogin, validDate, kstDate, isYesterdayKst, monthsBack,
  ReadError, acceptJeonsan, jeonsanRows, failRow, jeonsanOutput, readGrid, checkTotals, noticeFlags, googleRows, googleFailRows, googleOutput, parseRange, rangeIs, partitionValid,
  conversionsUrl, conversionStatus, checkRange, googleRangeAccount, googleRangeFail, googleRangeOutput,
} from "./browser-rows.mjs";
import { BLOGS } from "./blog-rows.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const [cmd, dateArg, dateArg2] = process.argv.slice(2), print = process.argv.includes("--print");
const PROFILE = join(homedir(), ".cache", "pallo-mkd", "profile"), CHROME_APP = "/Applications/Google Chrome.app";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...a); // 진행 상황 — 개인정보 없는 고정 문구만
const usage = () => { console.error("사용: node scripts/mkd/browser.mjs login [daangn | blog <블로그아이디>] | check | jeonsan <YYYY-MM-DD> [--print] | google <YYYY-MM-DD> [--print] | google-range <from> <to> --print"); process.exit(2); };
// 작업 p 를 ms 안에 끝내지 못하거나 던지면 fallback(오류) 값으로 — 하나가 멈춰도 나머지를 계속한다
const within = (p, ms, fallback) => new Promise((resolve) => {
  const t = setTimeout(() => resolve(fallback(null)), ms);
  p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); resolve(fallback(e)); });
});
// 오류 → 저장해도 되는 짧은 이유 (페이지 글이 섞일 수 있는 원문은 쓰지 않는다)
const reasonOf = (e, what) => (e instanceof ReadError ? e.message : e?.name === "TimeoutError" ? `${what} 시간 초과` : `${what} 읽기 오류`);

async function loadChromium() {
  for (const p of playwrightCandidates(here, homedir(), process.env)) if (existsSync(p)) return (await import(pathToFileURL(p).href)).chromium;
  console.error("Playwright 가 없어요: cd scripts/mkc && npm install && npx playwright install chromium"); process.exit(2);
}
// 지속 프로필 크롬 — 진짜 Google Chrome 이 있으면 그걸(구글 로그인이 자동화 브라우저로 안 막히게), 없으면 Playwright 크롬. 같은 프로필을 쓰는 창이 열려 있으면 못 연다.
async function launch(headless, dir = PROFILE) {
  const chromium = await loadChromium();
  mkdirSync(dir, { recursive: true });
  try {
    return await chromium.launchPersistentContext(dir, {
      ...(existsSync(CHROME_APP) ? { channel: "chrome" } : {}), headless, viewport: { width: 1366, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul",
      args: ["--disable-blink-features=AutomationControlled"], ignoreDefaultArgs: ["--enable-automation"],
    });
  } catch (e) { console.error(`브라우저를 못 열었어요 — 같은 프로필을 쓰는 창(login)이 아직 열려 있나요? (${String(e?.message).split("\n")[0].slice(0, 100)})`); process.exit(1); }
}

// ── 화면 상태 ──
const info = async (page) => { try { return { url: page.url(), title: await page.title(), hasPassword: (await page.locator('input[type="password"]').count()) > 0 }; } catch { return null; } }; // 이동 중이면 null
const onLogin = async (page) => { const i = await info(page); return !!i && needsLogin(i); };
// ready(page) 가 참이 될 때까지(최대 ms) 본다: "login"(로그인 화면) | "ready" | "timeout"
async function waitReady(page, ready, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(700)) {
    if (await onLogin(page)) return "login";
    if (await ready(page).catch(() => false)) return "ready";
  }
  return (await onLogin(page)) ? "login" : "timeout";
}
const boardButton = (page) => page.getByRole("button", { name: "데이터 보드" }).first();
const boardReady = (page) => boardButton(page).isVisible();
const CELLS = '[role="gridcell"], [role="cell"], [role="rowheader"], td';
const gridReady = (page) => page.evaluate((cells) => { // 캠페인 머리글 + 칸이 있는 행
  const heads = [...document.querySelectorAll('[role="columnheader"]')].map((h) => (h.innerText || "").replace(/\s+/g, " ").trim());
  return heads.some((h) => /^캠페인/.test(h)) && [...document.querySelectorAll('[role="row"]')].some((r) => r.querySelector(cells));
}, CELLS);

// ── login ──
// 당근·블로그 통계용 따로 로그인: 대상 → {프로필, 열 주소, 안내}. 블로그 아이디는 blog-rows.mjs 의 지점 블로그만 받는다.
function extraLogin(target, id) {
  if (target === "daangn") return { dir: join(homedir(), ".cache", "pallo-mkd", "daangn"), url: "https://business.daangn.com/", what: "당근 비즈니스(business.daangn.com)" };
  if (target === "blog" && Object.values(BLOGS).flat().includes(id)) return { dir: join(homedir(), ".cache", "pallo-mkd", `blog-${id}`), url: `https://nid.naver.com/nidlogin.login?url=${encodeURIComponent(`https://admin.blog.naver.com/${id}/stat/today`)}`, what: `네이버(블로그 ${id} 주인 계정)` };
  console.error(`login 대상은 daangn 또는 blog <${Object.values(BLOGS).flat().join("|")}> 예요`); process.exit(2);
}
async function login(target, id) {
  if (target) {
    const x = extraLogin(target, id), ctx = await launch(false, x.dir), page = ctx.pages()[0] ?? (await ctx.newPage());
    page.goto(x.url).catch(() => {});
    console.log(`${x.what} 에 직접 로그인한 뒤 창을 닫아 주세요. 최대 30분 기다려요.`);
    await new Promise((res) => { ctx.on("close", res); setTimeout(res, 30 * 60e3); });
    await within(ctx.close(), 8000, () => {});
    return;
  }
  const ctx = await launch(false);
  const first = ctx.pages()[0] ?? (await ctx.newPage()), second = await ctx.newPage();
  first.goto(SSO_URL).catch(() => {}); second.goto(googleUrl(GOOGLE_ACCOUNTS[0].ocid)).catch(() => {});
  console.log("두 탭에서 직접 로그인한 뒤 창을 닫아 주세요 — 전산(sso.pallo.co.kr) 과 구글 광고(ads.google.com). 최대 15분 기다려요.");
  await new Promise((res) => { ctx.on("close", res); setTimeout(res, 15 * 60e3); });
  await within(ctx.close(), 8000, () => {});
}

// ── check ──
async function check() {
  const ctx = await launch(true);
  const probe = async (url, ready) => {
    const page = await ctx.newPage();
    try { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 }); const s = await waitReady(page, ready, 45_000); return s === "ready" ? "ok" : s === "login" ? "login_required" : "error"; }
    catch { return "error"; } finally { await page.close().catch(() => {}); }
  };
  const [jeonsan, google] = await Promise.all([probe(jeonsanUrl(BRANCHES[0].code), boardReady), probe(googleUrl(GOOGLE_ACCOUNTS[0].ocid), gridReady)]);
  console.log(JSON.stringify({ jeonsan, google }));
  await within(ctx.close(), 8000, () => {});
}

// ── jeonsan ──
async function readBranch(ctx, b, D, back, snippet) {
  const page = await ctx.newPage(), key = b.team_key;
  const fail = (note) => ({ team_key: key, status: "failed", note, rows: [failRow(key, note)] });
  try {
    let reason = "전산 오류";
    for (let attempt = 1; attempt <= 2; attempt++) { // 어긋나면 처음(새로 이동)부터 딱 한 번 더
      try {
        await page.goto(jeonsanUrl(b.code), { waitUntil: "domcontentloaded", timeout: 30_000 }); // 새로 열어야 1쪽·이번 달로 초기화된다
        const s = await waitReady(page, boardReady, 20_000);
        if (s === "login") return { team_key: key, status: "login_required", note: "로그인 필요", rows: [failRow(key, "로그인 필요", "login_required")] };
        if (s === "timeout") throw new ReadError("데이터 보드 버튼 없음");
        await boardButton(page).click({ timeout: 10_000 }); await sleep(2000);
        for (let i = 0; i < back; i++) { // 이전 달: 표 밖의 ‹ 버튼 (표 아래 숫자 쪽 버튼·› 는 누르지 않는다)
          const prev = page.locator("button:not(table button)").filter({ hasText: /^\s*[‹〈]\s*$|chevron_left/ }).first();
          if (!(await prev.isVisible().catch(() => false))) throw new ReadError("이전 달 버튼 없음");
          await prev.click({ timeout: 10_000 }); await sleep(2500);
        }
        const result = await within(page.evaluate(`(async () => {\n${snippet}\nreturn await __mkdDaily(${JSON.stringify(D)});\n})()`), 60_000, (e) => (e ? { error: "전산 오류" } : undefined));
        if (result === undefined) throw new ReadError("전산 시간 초과");
        const v = acceptJeonsan(result, D);
        if (v.ok) { const rows = jeonsanRows(key, result); return { team_key: key, status: rows.some((r) => r.status === "partial") ? "partial" : "ok", total: result.total, rows }; }
        reason = v.reason; log(`${key}: 불합격(${attempt}) — ${v.reason}`);
      } catch (e) { reason = reasonOf(e, "전산"); log(`${key}: 오류(${attempt}) — ${reason}`); }
    }
    return fail(reason);
  } finally { await page.close().catch(() => {}); }
}

async function jeonsan(D) {
  const { toRows, teams } = await import("./lib.mjs"), { toRowsPure } = await import("./rows.mjs"); // DB 설정이 없으면 브라우저를 열기 전에 멈춘다
  const teamList = await teams(), snippet = readFileSync(join(here, "jeonsan-daily.js"), "utf8"), back = monthsBack(D);
  const ctx = await launch(true), deadline = Date.now() + 95_000;
  let results;
  try {
    results = await Promise.all(BRANCHES.map((b) => within(readBranch(ctx, b, D, back, snippet), Math.max(1000, deadline - Date.now()), (e) => {
      const note = e ? reasonOf(e, "전산") : "전산 시간 초과";
      return { team_key: b.team_key, status: "failed", note, rows: [failRow(b.team_key, note)] };
    })));
  } finally { await within(ctx.close(), 8000, () => {}); }
  // 한 번에 검증·저장 (한 지점의 행이 검증에 걸리면 그 지점만 실패 행으로 바꾼다)
  const { rows, bad } = partitionValid(results.map((r) => ({ name: r.team_key, rows: r.rows, fail: (n) => [failRow(r.team_key, n)] })), (rs) => toRowsPure("jeonsan", D, { rows: rs }, teamList));
  for (const r of results) if (bad.includes(r.team_key)) Object.assign(r, { status: "failed", note: "행 검증 실패", total: undefined });
  const out = await toRows("jeonsan", D, { rows });
  const summary = jeonsanOutput(D, results);
  if (print) { const keyOf = new Map(teamList.map((t) => [t.id, t.key])); console.log(JSON.stringify(out.map((r) => ({ team_key: keyOf.get(r.team_id), ...r })), null, 1)); console.error(JSON.stringify(summary)); }
  else { const { saveRows } = await import("./lib.mjs"); await saveRows(out); console.log(JSON.stringify(summary)); }
  return summary.ok ? 0 : 1;
}

// ── google ──
// 날짜 선택기를 열어 from~to 로 맞춘다. 하루(from==to)가 어제면 "어제" 프리셋, 아니면(또는 프리셋이 안 되면) "맞춤" 에 시작·종료를 직접 적는다. 끝나면 화면의 기간 글이 from~to 인지 확인한다.
async function setGoogleRange(page, from, to) {
  let step = "선택기"; // 어디서 막혔는지 알려 주는 고정 문구(오류 note 에 들어간다)
  try {
    await sleep(2500); // 표가 뜬 직후엔 화면이 아직 다시 그려져서 열어 둔 선택기가 저절로 닫히곤 한다 → 가라앉길 기다린다
    const picker = page.locator('button:not([role="row"] *), [role="button"]:not([role="row"] *)').filter({ hasText: /\d{4}년\s*\d+월/ }).filter({ visible: true }).first();
    const shown = async () => ((await picker.innerText({ timeout: 5000 }).catch(() => "")) || "").replace(/\s+/g, " ");
    if (rangeIs(await shown(), from, to)) return; // 이미 그 기간
    await page.keyboard.press("Escape").catch(() => {}); // 떠 있는 팝업은 닫기만
    const item = (text) => page.getByText(text, { exact: true }).filter({ visible: true }).first();
    if (from === to && isYesterdayKst(to)) {
      try { await picker.click({ timeout: 10_000 }); await sleep(1000); await item("어제").click({ timeout: 10_000 }); await sleep(3000); } catch { /* 맞춤으로 */ }
      if (rangeIs(await shown(), from, to)) return;
      await page.keyboard.press("Escape").catch(() => {}); await sleep(500);
    }
    const typed = [from, to].map((D) => { const [y, m, d] = D.split("-").map(Number); return `${y}. ${m}. ${d}.`; });
    const boxes = page.locator('input[type="text"]').filter({ visible: true });
    const values = () => boxes.evaluateAll((els) => els.map((e) => e.value));
    const dayOf = (v) => { const r = parseRange(v); return r && r.start === r.end ? r.start : null; };
    // 시작·종료 입력칸: 값이 날짜 하루인 글상자 둘. 글 모양은 칸마다 바뀐다(커서가 있는 칸은 "2026. 10. 29.", 나머지는 "2026년 10월 29일").
    const findIdx = async () => (await values()).map((v, i) => (dayOf(v) ? i : -1)).filter((i) => i >= 0).slice(0, 2);
    const attempt = async () => {
      step = "선택기 열기";
      await picker.click({ timeout: 10_000 });
      if (!(await item("맞춤").waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false))) throw new ReadError("날짜 설정 실패 (선택기 안 열림)");
      step = "날짜 입력";
      // 선택기를 열면 입력칸이 이미 보인다 — "맞춤" 항목은 입력칸이 안 보일 때만 누른다(목록이 움직이는 동안 누르면 '안정됨' 검사가 끝나지 않아 시간 초과가 나곤 했다).
      let idx = [];
      for (let i = 0; i < 6 && idx.length < 2; i++) { idx = await findIdx(); if (idx.length < 2) await sleep(500); }
      if (idx.length < 2) { step = "맞춤 선택"; await item("맞춤").click({ timeout: 5000, force: true }); await sleep(1000); idx = await findIdx(); step = "날짜 입력"; }
      if (idx.length < 2) throw new ReadError("날짜 설정 실패");
      const filled = async () => { const vals = await values(); return idx.every((i, n) => dayOf(vals[i]) === [from, to][n]); };
      // 시작을 먼저 쓰면 옛 끝일보다 늦을 때 값이 밀릴 수 있어, 다 쓴 뒤 맞는지 보고 한 번 더 쓴다 (최종 확인은 아래 기간 글)
      for (let pass = 0; pass < 2 && !(await filled()); pass++) {
        for (const [n, i] of idx.entries()) { const box = boxes.nth(i); await box.click({ clickCount: 3, timeout: 4000 }); await box.fill(typed[n]); await box.press("Tab"); }
      }
      step = "적용";
      await page.getByRole("button", { name: /^적용$/ }).filter({ visible: true }).first().click({ timeout: 5000 }); await sleep(3000);
      if (!rangeIs(await shown(), from, to)) throw new ReadError("날짜 설정 실패");
    };
    for (let n = 1, end = Date.now() + 40_000; ; n++) { // 열어 둔 선택기가 닫히는 따위로 막히면 닫고 처음부터 최대 3번
      try { await attempt(); return; }
      catch (e) {
        if (process.env.MKD_DEBUG) log(`날짜 설정 ${n}회 (${step}): ${String(e?.message).split("\n").map((l) => l.replace(/<input[^>]*>/, "<input…>").slice(0, 160)).slice(0, 12).join(" / ").slice(0, 700)}`);
        if (n >= 3 || Date.now() > end) throw e;
        await page.keyboard.press("Escape").catch(() => {}); await sleep(2000);
        if (rangeIs(await shown(), from, to)) return; // 막힌 줄 알았는데 적용돼 있었다
      }
    }
  } catch (e) { if (e instanceof ReadError) throw e; throw new ReadError(`날짜 설정 실패 (${step})`); }
}

const setGoogleDate = (page, D) => setGoogleRange(page, D, D); // 하루치(google) 용

// 표 → {headers, rows}. 칸 글은 숫자·캠페인 이름·상태뿐이라 개인정보가 없다.
// 화면에 안 보이는 것(getClientRects 가 비는 것)은 뺀다 — 날짜 선택기의 달력(요일 머리글 일~토·7칸 행)이 닫힌 뒤에도 DOM 에 남아 머리글 수를 부풀리면 오른쪽 끝 맞춤이 어긋난다.
const readTable = (page) => page.evaluate((cells) => {
  const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim(), shown = (el) => el.getClientRects().length > 0;
  const headers = [...document.querySelectorAll('[role="columnheader"]')].filter(shown).map((h) => clean(h.innerText));
  const rows = [...document.querySelectorAll('[role="row"]')].filter(shown).map((r) => { const cs = r.querySelectorAll(cells); return [...cs].map((c) => clean(c.innerText)); }).filter((c) => c.length);
  return { headers, rows };
}, CELLS);
// 표가 가라앉을 때까지: 2.5초 간격으로 최대 3번 읽어 연속 두 번 같고 총계와 맞으면 받는다. 못 맞추면 마지막 이유로 던진다.
async function readStable(page) {
  let prev = null, last = new ReadError("표가 안 정해짐");
  for (let i = 0; i < 3; i++) {
    try {
      const t = await readTable(page), g = readGrid(t.headers, t.rows), c = checkTotals(g.campaigns, g.total), sig = JSON.stringify(g);
      if (!c.ok) last = new ReadError(c.reason); else if (prev === sig) return g; else last = new ReadError("표가 안 정해짐");
      prev = sig;
    } catch (e) { last = e; prev = null; }
    if (i < 2) await sleep(2500);
  }
  throw last;
}
// 위쪽 알림 배너를 "다음 알림" 으로 넘겨 가며(최대 5) 글을 모은다. 글은 noticeFlags 로 플래그만 남기고 출력하지 않는다.
async function readNotices(page) {
  const texts = [];
  try {
    const next = page.getByRole("button", { name: /다음 알림/ }).filter({ visible: true }).first();
    if (await next.count()) {
      const grab = () => next.evaluate((el) => { // 배너 칸: 글이 8자 이상인 가장 가까운 윗칸 (너무 큰 칸이면 포기), 안의 버튼 글(‹ › 등)은 뺀다
        for (let p = el.parentElement, i = 0; p && i < 8; p = p.parentElement, i++) {
          let t = p.innerText || "";
          for (const b of p.querySelectorAll('button, [role="button"]')) { const bt = (b.innerText || "").trim(); if (bt) t = t.split(bt).join(" "); }
          t = t.replace(/\s+/g, " ").trim();
          if (t.length >= 8) return t.length > 400 ? "" : t;
        }
        return "";
      });
      texts.push(await grab());
      for (let i = 0; i < 4; i++) { await next.click({ timeout: 3000 }); await sleep(500); const t = await grab(); if (!t || texts.includes(t)) break; texts.push(t); }
    } else texts.push(...(await page.locator('[role="alert"]').filter({ visible: true }).evaluateAll((els) => els.slice(0, 3).map((e) => (e.innerText || "").replace(/\s+/g, " ").trim().slice(0, 400)))));
  } catch { /* 알림은 보조 정보 — 못 읽어도 표는 쓴다 */ }
  return texts;
}

async function readAccount(ctx, acct, D) {
  const page = await ctx.newPage(), name = acct.name;
  const fail = (note, status = "failed") => ({ account: name, status, note, rows: googleFailRows(name, note, status) });
  try {
    await page.goto(googleUrl(acct.ocid), { waitUntil: "domcontentloaded", timeout: 45_000 });
    const s = await waitReady(page, gridReady, 60_000);
    if (s === "login") return fail("로그인 필요", "login_required");
    if (s === "timeout") return fail("표가 안 뜸");
    await setGoogleDate(page, D);
    const g = await readStable(page);
    if (!g.campaigns.length) return fail("캠페인 행 없음");
    const flags = noticeFlags(await readNotices(page));
    return { account: name, status: "ok", campaigns: g.campaigns.length, rows: googleRows(name, g.campaigns, flags) };
  } catch (e) { const note = reasonOf(e, "구글"); log(`${name}: ${note}`); return fail(note); }
  finally { await page.close().catch(() => {}); }
}

async function google(D) {
  const { toRows, teams } = await import("./lib.mjs"), { toRowsPure } = await import("./rows.mjs");
  const teamList = await teams();
  const ctx = await launch(true), deadline = Date.now() + 95_000;
  let results;
  try {
    results = await Promise.all(GOOGLE_ACCOUNTS.map((a) => within(readAccount(ctx, a, D), Math.max(1000, deadline - Date.now()), (e) => {
      const note = e ? reasonOf(e, "구글") : "구글 시간 초과";
      return { account: a.name, status: "failed", note, rows: googleFailRows(a.name, note) };
    })));
  } finally { await within(ctx.close(), 8000, () => {}); }
  const { rows, bad } = partitionValid(results.map((r) => ({ name: r.account, rows: r.rows, fail: (n) => googleFailRows(r.account, n) })), (rs) => toRowsPure("google_ad", D, { rows: rs }, teamList));
  for (const r of results) if (bad.includes(r.account)) Object.assign(r, { status: "failed", note: "행 검증 실패", campaigns: undefined });
  const out = await toRows("google_ad", D, { rows });
  const summary = googleOutput(D, results);
  if (print) { const keyOf = new Map(teamList.map((t) => [t.id, t.key])); console.log(JSON.stringify(out.map((r) => ({ team_key: keyOf.get(r.team_id), ...r })), null, 1)); console.error(JSON.stringify(summary)); }
  else { const { saveRows } = await import("./lib.mjs"); await saveRows(out); console.log(JSON.stringify(summary)); }
  return summary.ok ? 0 : 1;
}

// ── google-range ──
// 전환 화면에서 "팔로 신청 클릭" 의 추적 상태 글자만 읽는다. 표가 뜬 직후 1초쯤은 옛 상태("운영중")가 보였다가 "조치 필요" 로 바뀌므로, 같은 값이 4초 이상 이어질 때만 받는다.
// 30초 안에 안정되지 않거나 못 읽으면 null(보조 정보라 실패로 치지 않는다).
async function readConversion(ctx, acct) {
  const page = await ctx.newPage();
  try {
    await page.goto(conversionsUrl(acct.ocid), { waitUntil: "domcontentloaded", timeout: 30_000 });
    let cur = null, since = Date.now();
    for (const end = Date.now() + 30_000; Date.now() < end; await sleep(1000)) {
      if (await onLogin(page)) return null;
      const t = await readTable(page).catch(() => null), st = t ? conversionStatus(t.headers, t.rows) : null;
      if (st !== cur) { cur = st; since = Date.now(); } else if (st && Date.now() - since >= 4000) return st;
    }
    return null;
  } catch { return null; } finally { await page.close().catch(() => {}); }
}

async function readRangeAccount(ctx, acct, from, to) {
  const page = await ctx.newPage(), name = acct.name;
  try {
    await page.goto(googleUrl(acct.ocid), { waitUntil: "domcontentloaded", timeout: 45_000 });
    const s = await waitReady(page, gridReady, 60_000);
    if (s === "login") return googleRangeFail(name, "로그인 필요", "login_required");
    if (s === "timeout") return googleRangeFail(name, "표가 안 뜸");
    await setGoogleRange(page, from, to);
    const g = await readStable(page);
    if (!g.campaigns.length) return googleRangeFail(name, "캠페인 행 없음");
    return googleRangeAccount(name, g.campaigns, noticeFlags(await readNotices(page)), null);
  } catch (e) { const note = reasonOf(e, "구글"); log(`${name}: ${note}`); if (process.env.MKD_DEBUG) log(`${name}: ${String(e?.message).split("\n")[0].slice(0, 200)}`); return googleRangeFail(name, note); }
  finally { await page.close().catch(() => {}); }
}

// 계정을 하나씩 차례로 읽는다: 캠페인 표 → 전환 화면. 탭을 여러 개 동시에 열어 두면 뒤에 가려진 탭의 클릭이 시간 초과로 실패한다(한 번 실제로 겪음).
// 전체 한도 100초(진입의 115초 강제 종료 안): 첫 계정의 표 45초·전환 80초, 둘째 계정의 표 85초·전환 100초까지.
async function googleRange(from, to) {
  const ctx = await launch(true), t0 = Date.now(), left = (at) => Math.max(1000, t0 + at - Date.now()), results = [];
  try {
    for (const [i, a] of GOOGLE_ACCOUNTS.entries()) {
      const r = await within(readRangeAccount(ctx, a, from, to), left(i === 0 ? 45_000 : 85_000), (e) => googleRangeFail(a.name, e ? reasonOf(e, "구글") : "구글 시간 초과"));
      if (r.summary.status === "ok") r.summary.conversionStatus = await within(readConversion(ctx, a), left(i === 0 ? 80_000 : 100_000), () => null);
      results.push(r);
    }
  } finally { await within(ctx.close(), 8000, () => {}); }
  const out = googleRangeOutput(from, to, results);
  console.log(JSON.stringify(out));
  return out.ok ? 0 : 1;
}

// ── 진입 ──
const needDate = () => {
  if (!validDate(dateArg)) { console.error(`날짜는 YYYY-MM-DD 형식이어야 해요: ${dateArg ?? "(없음)"}`); process.exit(2); }
  if (dateArg >= kstDate()) { console.error("오늘·이후 날짜는 수집하지 않아요"); process.exit(2); }
};
const needRange = () => {
  if (!print) { console.error("google-range 는 저장하지 않고 읽기만 해요 — 끝에 --print 를 붙여 주세요"); process.exit(2); }
  const why = checkRange(dateArg, dateArg2); if (why) { console.error(`${why}: ${dateArg ?? "(없음)"} ${dateArg2 ?? "(없음)"}`); process.exit(2); }
};
async function main() {
  if (!["login", "check", "jeonsan", "google", "google-range"].includes(cmd)) usage();
  if (cmd === "jeonsan" || cmd === "google") needDate();
  if (cmd === "google-range") needRange();
  if (cmd !== "login") setTimeout(() => { console.error("실패: 시간 초과 — 강제 종료"); process.exit(1); }, 115_000).unref(); // Bash 기본 제한(120초) 안에 반드시 끝낸다 (login 은 사람을 기다린다)
  let code = 0;
  try { code = (await { login: () => login(dateArg, dateArg2), check, jeonsan: () => jeonsan(dateArg), google: () => google(dateArg), "google-range": () => googleRange(dateArg, dateArg2) }[cmd]()) ?? 0; }
  catch (e) { console.error(`실패: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`); code = 1; }
  process.exitCode = code;
  setTimeout(() => process.exit(code), 3000).unref(); // 브라우저 찌꺼기가 붙잡아도 마무리
}
export { readBranch, readAccount, readRangeAccount, readConversion, setGoogleDate, setGoogleRange, readTable, readStable, readNotices }; // 가짜 페이지로 흐름을 시험할 때 쓴다(직접 실행할 때만 main)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
