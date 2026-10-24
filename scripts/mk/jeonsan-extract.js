// 전산 "신규 회신"(branch.pallo.co.kr/{지점코드}/admin/call) 화면에서 리드를 읽는 스니펫. 스킬이 Claude in Chrome javascript_tool 로 그 페이지에 넣어 실행한다.
// 이름·전화번호 열은 읽지 않는다. 표에서 상태·광고명·지원 시간만, 상세 창에서 "이미 등록된 회원 n명"만 읽어 돌려준다.
// 표는 지원 시간 최신순이다. cutoff(YYYY-MM-DD)보다 오래된 행이 나오면 멈춘다. 한 명당 상세 창 확인에 약 1.3초.
// 사용: javascript_tool 한 번의 실행은 45초에서 끊기므로 백그라운드로 돌린다.
//   1) 이 파일 내용 + `window.__mkLast = null; __mkJeonsan("2026-09-28").then((r) => (window.__mkLast = r));`
//   2) 10초쯤 간격으로 `window.__mkLast` 를 확인 → 끝나면 `.leads` 를 JSON 으로 받아 push-leads.mjs 에 넘긴다.
// 전산 상태 필터는 스니펫이 "전체"로 바꾼다. "등록"은 상세 창의 '이미 등록된 회원'이 1명 이상일 때 (기존 회원이 다시 지원해도 1이 될 수 있음).
async function __mkJeonsan(cutoff, { maxPages = 40, detailWait = 1200 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const status = [...document.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "ALL" || o.text === "전체") && [...s.options].some((o) => /예약확정/.test(o.text)));
  if (status && status.value !== "ALL") {
    status.value = "ALL"; status.dispatchEvent(new Event("change", { bubbles: true })); await sleep(2000);
  }
  const H = [...document.querySelectorAll("thead th")].map((t) => t.innerText.trim());
  const ix = (n) => H.indexOf(n);
  for (const need of ["상태", "광고명", "지원 시간"]) if (ix(need) < 0) return { error: `열 없음: ${need} (전산 화면이 바뀌었을 수 있어요)`, headers: H.filter((h) => !/NAME|전화/.test(h)) };
  const out = [], seen = {};
  let stop = false, pages = 0;
  while (!stop && pages++ < maxPages) {
    const rows = [...document.querySelectorAll("table tbody tr")];
    for (const r of rows) {
      const td = r.querySelectorAll("td"), cell = (n) => td[ix(n)]?.innerText.trim() ?? "";
      const m = cell("지원 시간").match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/);
      if (!m) continue;
      const date = `${m[1]}-${m[2]}-${m[3]}`;
      if (date < cutoff) { stop = true; break; }
      td[ix("상태")].click(); await sleep(detailWait);
      const box = [...document.querySelectorAll("*")].find((e) => e.children.length < 6 && /이미 등록된 회원/.test(e.innerText || "") && (e.innerText || "").length < 200);
      const reg = +((box?.innerText || "").match(/(\d+)\s*명/)?.[1] ?? 0);
      const ad = cell("광고명") === "-" ? "" : cell("광고명");
      const base = `${date}T${m[4]}:${m[5]}|${ad}`;
      seen[base] = (seen[base] ?? -1) + 1;           // 같은 분·같은 광고 지원자 구분
      out.push({ source_key: `${base}|${seen[base]}`, ad_name: ad, lead_date: date, status: reg > 0 ? "등록" : cell("상태"), channel: cell("광고 매체"), path: cell("유입경로") });
    }
    if (stop) break;
    // 페이지 넘김은 표 밖의 숫자 버튼(1 2 3 … 10). 화살표 "›"는 위쪽 '다음 달' 버튼이라 쓰면 안 된다.
    const next = [...document.querySelectorAll("button")].find((b) => !b.closest("table") && !b.getAttribute("aria-label") && b.innerText.trim() === String(pages + 1) && !b.disabled);
    if (!next) break;
    const first = document.querySelector("table tbody tr")?.innerText;
    next.click();
    for (let i = 0; i < 20 && document.querySelector("table tbody tr")?.innerText === first; i++) await sleep(250);
  }
  return { count: out.length, pages, leads: out };
}
