// 전산 "신규 회신"(branch.pallo.co.kr/{지점코드}/admin/call) › 데이터 보드 표에서 날짜 D 의 유입경로별 문의·등록 **건수만** 센다. 스킬이 Claude in Chrome javascript_tool 로 그 페이지에 넣어 실행한다.
// NAME·전화번호 열은 읽지 않는다. 코멘트 열은 gads_/nad_/homepage 토큰만 정규식으로 뽑고 전문은 버린다. 행을 누르거나 저장하는 일은 하지 않는다(필터·페이지 이동만).
// 표는 지원 시간 최신순, 페이지당 20명. 페이지 넘김은 표 밖 숫자 버튼(위쪽 ‹ › 는 이전/다음 달이라 쓰지 않는다). 표는 1페이지, D 가 든 달이어야 한다 — D 가 지난달이면 스킬이 먼저 ‹ 를 한 번 눌러 달을 바꾼다.
// 결과가 맞는지는 호출한 쪽이 반드시 본다: error 없음 · stoppedBy 가 "cutoff"|"lastPage" · oldest <= D (또는 lastPage) · unparsed === 0 · scanned > 0. 하나라도 어긋나면 그 지점은 partial/failed (docs/meta-marketing/jeonsan-leads.md).
// 사용: 내용 + `window.__mkdLast = null; __mkdDaily("2026-10-28").then((r) => (window.__mkdLast = r));` → 5~10초 뒤 `window.__mkdLast`.
async function __mkdDaily(date, { maxPages = 12, backDays = 14 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cutD = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : null;
  if (!cutD || isNaN(cutD) || cutD.toISOString().slice(0, 10) !== date) return { error: "날짜 형식은 YYYY-MM-DD" };
  cutD.setUTCDate(cutD.getUTCDate() - backDays); const cut = cutD.toISOString().slice(0, 10);
  const allOpt = (s) => [...s.options].find((o) => o.value === "ALL" || o.text.trim() === "전체");
  const status = [...document.querySelectorAll("select")].find((s) => allOpt(s) && [...s.options].some((o) => /예약확정|예약 확정/.test(o.text)));
  let filterSet = false;
  if (status) {
    const all = allOpt(status);
    if (status.value !== all.value) { status.value = all.value; status.dispatchEvent(new Event("change", { bubbles: true })); await sleep(2000); }
    filterSet = status.value === all.value;
  }
  const H = [...document.querySelectorAll("thead th")].map((t) => t.innerText.trim()), ix = (n) => H.indexOf(n);
  for (const need of ["상태", "지원 시간"]) if (ix(need) < 0) return { error: `열 없음: ${need} (전산 화면이 바뀌었을 수 있어요)`, filterSet, headers: H.filter((h) => !/NAME|전화/.test(h)) };
  const missingCols = ["코멘트", "광고명", "유입경로", "마지막 업무 시간"].filter((n) => ix(n) < 0); // 빠진 열은 그 신호만 못 쓴다 → 호출한 쪽이 본다
  const enrollsUnavailable = ix("마지막 업무 시간") < 0;
  const TIME = /(\d{4})\.(\d{2})\.(\d{2})/, day = (t) => { const m = (t || "").match(TIME); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
  const TOKEN = /\b(gads_[a-z0-9_]+|nad_[a-z0-9_]+|homepage)(?:-[a-z]+)?\b/i;
  // 토큰은 40자까지만, 숫자 3자리 이상 덩어리(전화번호 등)가 있으면 그 앞까지만 쓴다. rows.mjs 는 gads_/nad_ 뒤에 글자가 있어야 해서 남는 게 없으면 "기타".
  const safeToken = (t) => { t = t.slice(0, 40); if (/\d{3,}/.test(t)) t = t.split(/\d{3,}/)[0].replace(/_+$/, ""); return t === "homepage" || /^(gads|nad)_[a-z0-9_]+$/.test(t) ? t : "기타"; };
  const source = (td) => {
    const cell = (n) => (ix(n) < 0 ? "" : (td[ix(n)]?.innerText ?? "").trim());
    const tok = cell("코멘트").match(TOKEN)?.[1]?.toLowerCase(); if (tok) return safeToken(tok);      // 토큰만, 전문은 버림
    const ad = cell("광고명"); if (ad && ad !== "-") return "meta";
    // 유입경로 글자는 전화번호가 섞일 수 있어 숫자 덩어리를 전부 # 로 가린 뒤 자른다 (rows.mjs 의 jeonsan unit 은 숫자 3자리 연속 불가). "전체"는 합계 행 이름이라 쓰지 않는다.
    const path = cell("유입경로"); if (!path || path === "-") return "기타";
    const key = path.replace(/\d+/g, "#").slice(0, 20).trim(); return !key || key === "전체" ? "기타" : key;
  };
  const bySource = {}, bump = (s, k) => { (bySource[s] ??= { inquiries: 0, enrolls: 0 })[k]++; };
  const statuses = {}; // 상태 글자 분포 (진행 중·예약 확정 같은 업무 라벨이라 개인정보 아님). 숫자는 가리고 12자까지만
  const firstTime = () => document.querySelector("table tbody tr")?.querySelectorAll("td")[ix("지원 시간")]?.innerText;
  let pages = 0, scanned = 0, total = 0, unparsed = 0, newest = null, oldest = null, stoppedBy = null, sawRows = false;
  while (!stoppedBy) {
    pages++;
    for (const r of document.querySelectorAll("table tbody tr")) {
      sawRows = true;
      const td = r.querySelectorAll("td"), applied = day(td[ix("지원 시간")]?.innerText); if (!applied) { unparsed++; continue; }
      scanned++; newest ??= applied; oldest = applied;
      const st = (td[ix("상태")]?.innerText ?? "").trim(), sk = st.replace(/\d/g, "#").slice(0, 12) || "(빈칸)"; statuses[sk] = (statuses[sk] ?? 0) + 1;
      if (applied < cut) { stoppedBy = "cutoff"; break; }
      if (applied === date) { bump(source(td), "inquiries"); total++; }
      if (!enrollsUnavailable && st === "등록" && day(td[ix("마지막 업무 시간")]?.innerText) === date) bump(source(td), "enrolls");
    }
    if (stoppedBy || (sawRows && !scanned)) break;           // 첫 쪽부터 날짜를 못 읽으면 더 넘기지 않고 아래에서 error
    if (pages >= maxPages) { stoppedBy = "maxPages"; break; }   // 더 누르기 전에 멈춘다
    const next = [...document.querySelectorAll("button")].find((b) => !b.closest("table") && !b.getAttribute("aria-label") && b.innerText.trim() === String(pages + 1) && !b.disabled);
    if (!next) { stoppedBy = "lastPage"; break; }
    const first = firstTime(); next.click();
    for (let i = 0; i < 20 && (!firstTime() || firstTime() === first); i++) await sleep(250);
    if (!firstTime() || firstTime() === first) { stoppedBy = "stalled"; break; }   // 페이지가 안 바뀜 → 같은 쪽을 또 세지 않는다
  }
  if (sawRows && scanned === 0) return { error: "지원 시간 형식을 못 읽었어요", pages, unparsed, filterSet, missingCols, stoppedBy };
  return { date, total, bySource, pages, scanned, stoppedBy, newest, oldest, unparsed, missingCols, filterSet, statuses, enrollsUnavailable };
}
