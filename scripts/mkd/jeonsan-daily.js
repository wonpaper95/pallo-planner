// 전산 "신규 회신"(branch.pallo.co.kr/{지점코드}/admin/call) › 데이터 보드 표에서 날짜 D 의 유입경로별 문의·등록 **건수만** 센다. 스킬이 Claude in Chrome javascript_tool 로 그 페이지에 넣어 실행한다.
// NAME·전화번호 열은 읽지 않는다. 코멘트 열은 gads_/nad_/homepage 토큰만 정규식으로 뽑고 전문은 버린다. 행을 누르거나 저장하는 일은 하지 않는다(필터·페이지 이동만).
// 표는 지원 시간 최신순, 페이지당 20명. 페이지 넘김은 표 밖 숫자 버튼(위쪽 ‹ › 는 이전/다음 달이라 쓰지 않는다). D 가 지난달이면 스킬이 먼저 ‹ 를 한 번 눌러 달을 바꾼다.
// 사용: 내용 + `window.__mkdLast = null; __mkdDaily("2026-10-28").then((r) => (window.__mkdLast = r));` → 5~10초 뒤 `window.__mkdLast`.
async function __mkdDaily(date, { maxPages = 12, backDays = 14 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const status = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "ALL" || o.text === "전체") && [...s.options].some((o) => /예약확정|예약 확정/.test(o.text)));
  if (status && status.value !== "ALL") { status.value = "ALL"; status.dispatchEvent(new Event("change", { bubbles: true })); await sleep(2000); }
  const H = [...document.querySelectorAll("thead th")].map((t) => t.innerText.trim()), ix = (n) => H.indexOf(n);
  for (const need of ["상태", "지원 시간"]) if (ix(need) < 0) return { error: `열 없음: ${need} (전산 화면이 바뀌었을 수 있어요)`, headers: H.filter((h) => !/NAME|전화/.test(h)) };
  const enrollsUnavailable = ix("마지막 업무 시간") < 0;
  const TIME = /(\d{4})\.(\d{2})\.(\d{2})/, day = (t) => { const m = (t || "").match(TIME); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
  const cutoff = new Date(date + "T00:00:00Z"); cutoff.setUTCDate(cutoff.getUTCDate() - backDays); const cut = cutoff.toISOString().slice(0, 10);
  const TOKEN = /\b(gads_[a-z0-9_]+|nad_[a-z0-9_]+|homepage)(?:-[a-z]+)?\b/i;
  const source = (td) => {
    const cell = (n) => (ix(n) < 0 ? "" : (td[ix(n)]?.innerText ?? "").trim());
    const tok = cell("코멘트").match(TOKEN)?.[1]?.toLowerCase(); if (tok) return tok;      // 토큰만, 전문은 버림
    const ad = cell("광고명"); if (ad && ad !== "-") return "meta";
    // 유입경로 글자는 전화번호가 섞일 수 있어 숫자 3자리 이상 덩어리를 # 로 가린 뒤 자른다 (rows.mjs 의 jeonsan unit 은 숫자 3자리 연속 불가).
    const path = cell("유입경로"); return path && path !== "-" ? path.replace(/\d{3,}/g, "#").slice(0, 20) : "기타";
  };
  const bySource = {}, bump = (s, k) => { (bySource[s] ??= { inquiries: 0, enrolls: 0 })[k]++; };
  const firstTime = () => document.querySelector("table tbody tr")?.querySelectorAll("td")[ix("지원 시간")]?.innerText;
  let pages = 0, scanned = 0, total = 0, stop = false;
  while (!stop && pages++ < maxPages) {
    for (const r of document.querySelectorAll("table tbody tr")) {
      const td = r.querySelectorAll("td"), applied = day(td[ix("지원 시간")]?.innerText); if (!applied) continue;
      scanned++;
      if (applied < cut) { stop = true; break; }
      if (applied === date) { bump(source(td), "inquiries"); total++; }
      if (!enrollsUnavailable && (td[ix("상태")]?.innerText ?? "").trim() === "등록" && day(td[ix("마지막 업무 시간")]?.innerText) === date) bump(source(td), "enrolls");
    }
    if (stop) break;
    const next = [...document.querySelectorAll("button")].find((b) => !b.closest("table") && !b.getAttribute("aria-label") && b.innerText.trim() === String(pages + 1) && !b.disabled);
    if (!next) break;
    const first = firstTime(); next.click();
    for (let i = 0; i < 20 && firstTime() === first; i++) await sleep(250);
  }
  return { date, total, bySource, pages, scanned, enrollsUnavailable };
}
