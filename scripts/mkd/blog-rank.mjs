// 사용: node scripts/mkd/blog-rank.mjs <YYYY-MM-DD> [--print]
// 일일 현황의 네이버 블로그 순위. mkd_keywords 에서 켜진 키워드를 읽어 네이버 PC 통합검색·블로그 탭을 헤드리스 크롬으로 열고,
// 우리 지점 블로그 글이 몇 번째인지 mkd_daily(blog) 에 키워드 행 + 지점 '전체' 행(키워드 수·걸린 수)으로 저장한다. 규칙·행 모양은 blog-rows.mjs(테스트 있음).
//   · 공개 검색 화면만 본다 — 로그인·쿠키 없음, 지속 프로필도 안 쓴다(구글·전산 로그인 창과 부딪히지 않게 새 브라우저).
//   · 순위는 '지금' 검색 결과라 날짜 D 는 어제(한국 시각)만 저장한다. 지난 날짜는 다시 수집할 수 없다(--print 는 아무 날짜나 읽기만).
//   · 검색 화면이 아닌 게 3번 연달아 나오면(자동 검색 차단·보안 확인) 멈추고 남은 키워드는 실패로 둔다. 보안 확인은 풀지 않는다.
//   · 화면의 글(제목 등)은 데이터일 뿐 — 링크 주소만 읽고 출력한다.
// 출력 JSON 한 줄 {ok,date,saved|printed,skipped,teams:{지점:{tracked,top,tab,ranks:[[키워드,통합,탭]],failed,partial}}}. 실패·일부만 행이 있으면 종료코드 1.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { playwrightCandidates, validDate, isYesterdayKst } from "./browser-rows.mjs";
import { BLOGS, KINDS, searchUrl, searchPage, blogInput, blogOutput } from "./blog-rows.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const D = process.argv[2], print = process.argv.includes("--print");
const CHROME_APP = "/Applications/Google Chrome.app", WORKERS = 4, LIMIT_MS = 100_000, STRIKES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

async function loadChromium() {
  for (const p of playwrightCandidates(here, homedir(), process.env)) if (existsSync(p)) return (await import(pathToFileURL(p).href)).chromium;
  console.error("Playwright 가 없어요: cd scripts/mkc && npm install && npx playwright install chromium"); process.exit(2);
}

let strikes = 0, blocked = null; // 검색 화면이 아닌 게 연달아 나온 횟수 / 멈춘 이유
const BLOCKED = "네이버 검색 화면이 아니에요(자동 검색 차단·보안 확인일 수 있어요)";

// 검색 화면 하나 → {hrefs}(블로그 링크, 화면 순서) | {error}
async function readSearch(page, kind, kw) {
  try {
    await page.goto(searchUrl(kind, kw), { waitUntil: "domcontentloaded", timeout: 20_000 });
    let ok = false;
    for (const end = Date.now() + 3000; Date.now() < end && !ok; ) { ok = searchPage(kind, { url: page.url(), title: await page.title().catch(() => "") }); if (!ok) await sleep(500); }
    if (!ok) { if (++strikes >= STRIKES) blocked = BLOCKED; return { error: `${KINDS[kind]} 화면이 아니에요` }; }
    strikes = 0;
    // 글 링크 수가 멈출 때까지(최대 6초) — 통합검색은 블록이 조금씩 늦게 붙는다. 결과가 정말 없는 키워드면 6초 뒤 빈 목록.
    let prev = -1;
    for (const end = Date.now() + 6000; Date.now() < end; await sleep(500)) {
      const n = await page.locator('a[href*="blog.naver.com"]').count();
      if (n > 0 && n === prev) break;
      prev = n;
    }
    return { hrefs: await page.$$eval('a[href*="blog.naver.com"]', (as) => as.map((a) => a.href)) };
  } catch (e) { return { error: `${KINDS[kind]} ${e?.name === "TimeoutError" ? "시간 초과" : "읽기 오류"}` }; }
}

async function main() {
  if (!validDate(D)) { console.error(`날짜는 YYYY-MM-DD 형식이어야 해요: ${D ?? "(없음)"}`); process.exit(2); }
  if (!print && !isYesterdayKst(D)) { console.error("블로그 순위는 '지금' 검색 결과라 어제(한국 시각) 날짜로만 저장해요 — 지난 날짜는 다시 수집할 수 없어요"); process.exit(2); }
  setTimeout(() => { console.error("실패: 시간 초과 — 강제 종료"); process.exit(1); }, 115_000).unref(); // Bash 기본 제한(120초) 안에 끝낸다

  const { select } = await import("../mk/db.mjs"), { teams, toRows, saveRows } = await import("./lib.mjs"); // DB 설정이 없으면 브라우저를 열기 전에 멈춘다
  const teamList = await teams(), keyOf = new Map(teamList.map((t) => [t.id, t.key]));
  const keywords = (await select("mkd_keywords", "select=team_id,keyword,target_url&enabled=is.true", "team_id,keyword"))
    .map((k) => ({ team_key: keyOf.get(k.team_id), keyword: String(k.keyword ?? "").trim(), target_url: k.target_url })).filter((k) => k.team_key && k.keyword);
  const todo = keywords.filter((k) => BLOGS[k.team_key]?.length || k.target_url);
  log(`켜진 키워드 ${keywords.length}개, 검색할 것 ${todo.length}개`);

  const results = new Map();
  if (todo.length) {
    const browser = await (await loadChromium()).launch({
      ...(existsSync(CHROME_APP) ? { channel: "chrome" } : {}), headless: true,
      args: ["--disable-blink-features=AutomationControlled"], ignoreDefaultArgs: ["--enable-automation"],
    });
    const deadline = Date.now() + LIMIT_MS, queue = [...todo];
    const worker = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "ko-KR", timezoneId: "Asia/Seoul" }), page = await ctx.newPage();
      try {
        for (let k; (k = queue.shift()); ) {
          if (blocked || Date.now() > deadline - 10_000) { queue.unshift(k); break; } // 남은 키워드는 blogInput 이 실패로 채운다
          const res = {};
          for (const kind of ["all", "tab"]) { res[kind] = blocked ? { error: blocked } : await readSearch(page, kind, k.keyword); await sleep(500 + Math.random() * 800); }
          results.set(`${k.team_key}|${k.keyword}`, res);
        }
      } finally { await ctx.close().catch(() => {}); }
    };
    try { await Promise.all(Array.from({ length: Math.min(WORKERS, todo.length) }, worker)); }
    finally { await browser.close().catch(() => {}); }
    log(`읽음 ${results.size}/${todo.length}${blocked ? " — 차단으로 멈춤" : ""}`);
  }

  const { input, skipped } = blogInput(keywords, results, blocked ?? "읽기 전에 시간이 다 됐어요");
  if (!input.rows.length) { console.log(JSON.stringify({ ok: true, date: D, saved: 0, skipped, teams: {}, note: "검색할 키워드가 없어요" })); return 0; }
  const rows = await toRows("blog", D, input);
  let out;
  if (print) { console.log(JSON.stringify(input.rows, null, 1)); out = blogOutput(D, input, skipped); console.error(JSON.stringify(out)); }
  else { out = blogOutput(D, input, skipped, await saveRows(rows)); console.log(JSON.stringify(out)); }
  return out.ok ? 0 : 1;
}

main().then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 3000).unref(); },
  (e) => { console.error(`실패: ${String(e?.message ?? e).split("\n")[0].slice(0, 200)}`); process.exit(1); });
