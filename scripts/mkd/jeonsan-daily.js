// 전산 "신규 회신"(branch.pallo.co.kr/{지점코드}/admin/call) › 데이터 보드 표에서 날짜 D 의 유입경로별 문의 **건수만** 센다(등록은 이 표에 없어 세지 않는다). 스킬이 Claude in Chrome javascript_tool 로 그 페이지에 넣어 실행한다.
// NAME·전화번호 열은 읽지 않는다. 코멘트 열은 gads_/nad_/homepage 토큰만 정규식으로 뽑고 전문은 버린다. 행을 누르거나 저장하는 일은 하지 않는다(필터·페이지 이동만).
// 표는 지원 시간 최신순, 페이지당 20명. 페이지 넘김은 표 밖 숫자 버튼(위쪽 ‹ › 는 이전/다음 달이라 쓰지 않는다). 표는 1페이지, D 가 든 달이어야 한다 — D 가 지난달이면 스킬이 먼저 ‹ 를 한 번 눌러 달을 바꾼다. 같은 탭에서 다시 돌리기 전엔 새로고침(또는 1 클릭) — 스니펫은 마지막으로 본 쪽에 멈춰 있다.
// 결과가 맞는지는 호출한 쪽이 반드시 본다(합격 검사): `error` 없음 · `filterSet === true` · `scanned > 0` 이고 `unparsed === 0` · `stoppedBy` 가 `"cutoff"` 또는 `"lastPage"` (단 `stoppedBy === "lastPage" && pages === 1 && lastPageRows >= 20` 이면 꽉 찬 쪽인데 다음 쪽 버튼을 못 찾은 것 — 불합격) · `newest.slice(0,7) === D.slice(0,7)` (표가 D 가 든 달의 맨 앞에서 시작) · `stoppedBy === "lastPage"` 이면 `oldest <= D` · `bySource` 의 `inquiries` 합 = `total`. 하나라도 어긋나면 같은 지점을 처음부터 딱 한 번 다시 돌리고, 그래도 어긋나면 그 지점은 `failed` 로 저장한다(숫자를 대충 고쳐 쓰지 않는다). (docs/meta-marketing/jeonsan-leads.md)
// 사용: 내용 + `window.__mkdLast = null; __mkdDaily("2026-10-28").then((r) => (window.__mkdLast = r));` → 5~10초 뒤 `window.__mkdLast`.
async function __mkdDaily(date, { maxPages = 25, backDays = 1 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cutD = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + "T00:00:00Z") : null;
  if (!cutD || isNaN(cutD) || cutD.toISOString().slice(0, 10) !== date) return { error: "날짜 형식은 YYYY-MM-DD" };
  cutD.setUTCDate(cutD.getUTCDate() - backDays); const cut = cutD.toISOString().slice(0, 10); // D-1 보다 오래된 첫 행에서 멈춘다(최신순이라 D 행은 다 지나간 뒤)
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
  const missingCols = ["코멘트", "광고명", "유입경로"].filter((n) => ix(n) < 0); // 빠진 열은 그 신호만 못 쓴다 → 호출한 쪽이 본다
  const TIME = /(\d{4})\.(\d{2})\.(\d{2})/, day = (t) => { const m = (t || "").match(TIME); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
  // 홈페이지(pallo-sites)가 광고 유입을 코멘트에 남기는 꼴: 구글 `gads_<utm_campaign>`, 네이버 `nads_<utm_campaign>[_m<n_media 번호>]` (예 nads_daegu_en_naver_m27758).
  const TOKEN = /\b(gads_[a-z0-9_]+|nads?_[a-z0-9_]+|homepage)(?:-[a-z]+)?\b/i;
  // 네이버는 `nad_<캠페인>` 하나로 맞춘다(nads_→nad_, 매체 번호 _m… 는 뗀다 — 캠페인별로 센다).
  // 토큰은 40자까지만, 숫자 3자리 이상 덩어리(전화번호 등)가 있으면 그 앞까지만 쓰고(끝의 _ 는 뗀다), gads_/nad_ 뒤에 남는 글자가 없으면 "기타".
  // rows.mjs 는 `gads_기타` 도 받아 주고 mkd-core 의 channelOfSource 는 gads_ 로 시작하면 구글로 센다 → 이 스니펫이 유일한 방어선이라 `gads_기타` 가 아니라 `기타` 를 돌려준다.
  const safeToken = (t) => { t = t.replace(/^nads_/, "nad_"); if (/^nad_/.test(t)) t = t.replace(/_m\d+$/, ""); t = t.slice(0, 40); if (/\d{3,}/.test(t)) t = t.split(/\d{3,}/)[0].replace(/_+$/, ""); return t === "homepage" || /^(gads|nad)_[a-z0-9_]+$/.test(t) ? t : "기타"; };
  const source = (td) => {
    const cell = (n) => (ix(n) < 0 ? "" : (td[ix(n)]?.innerText ?? "").trim());
    const tok = cell("코멘트").match(TOKEN)?.[1]?.toLowerCase(); if (tok) return safeToken(tok);      // 토큰만, 전문은 버림
    const ad = cell("광고명"); if (ad && ad !== "-") return "meta";
    // 유입경로 글자는 전화번호가 섞일 수 있어 숫자 덩어리를 전부 # 로 가린 뒤 자른다 (rows.mjs 의 jeonsan unit 은 숫자 3자리 연속 불가). "전체"는 합계 행 이름이라 쓰지 않는다.
    const path = cell("유입경로"); if (!path || path === "-") return "기타";
    const key = path.replace(/\d+/g, "#").slice(0, 20).trim(); return !key || key === "전체" ? "기타" : key;
  };
  // 키가 화면 글자라 "constructor"·"__proto__" 같은 값이 와도 안전하도록 프로토타입 없는 객체로 센다
  const bySource = Object.create(null), bump = (s) => { (bySource[s] ??= { inquiries: 0 }).inquiries++; };
  const statuses = Object.create(null); // 상태 글자 분포 (진행 중·예약 확정 같은 업무 라벨이라 개인정보 아님). 숫자는 가리고 12자까지
  const firstTime = () => document.querySelector("table tbody tr")?.querySelectorAll("td")[ix("지원 시간")]?.innerText;
  let pages = 0, scanned = 0, total = 0, unparsed = 0, newest = null, oldest = null, stoppedBy = null, sawRows = false, lastPageRows = 0;
  while (!stoppedBy) {
    pages++;
    const trs = document.querySelectorAll("table tbody tr"); lastPageRows = trs.length; // 마지막으로 훑은 쪽의 행 수 — 꽉 찬 쪽(20)인데 다음 버튼이 없으면 버튼을 못 찾은 것
    for (const r of trs) {
      sawRows = true;
      const td = r.querySelectorAll("td"), applied = day(td[ix("지원 시간")]?.innerText); if (!applied) { unparsed++; continue; }
      scanned++; newest ??= applied; oldest = applied;
      const st = (td[ix("상태")]?.innerText ?? "").trim(), sk = st.replace(/\d/g, "#").slice(0, 12) || "(빈칸)"; statuses[sk] = (statuses[sk] ?? 0) + 1;
      if (applied < cut) { stoppedBy = "cutoff"; break; }
      if (applied === date) { bump(source(td)); total++; }
    }
    if (stoppedBy || (sawRows && !scanned)) break;           // 첫 쪽부터 날짜를 못 읽으면 더 넘기지 않고 아래에서 error
    if (pages >= maxPages) { stoppedBy = "maxPages"; break; }   // 더 누르기 전에 멈춘다
    const next = [...document.querySelectorAll("button")].find((b) => !b.closest("table") && !b.getAttribute("aria-label") && b.innerText.trim() === String(pages + 1) && !b.disabled);
    if (!next) { stoppedBy = "lastPage"; break; }
    const first = firstTime(); next.click();
    for (let i = 0; i < 20 && (!firstTime() || firstTime() === first); i++) await sleep(250);
    if (!firstTime() || firstTime() === first) { stoppedBy = "stalled"; break; }   // 페이지가 안 바뀜 → 같은 쪽을 또 세지 않는다
  }
  // 행은 있는데 날짜를 하나도 못 읽은 경우 — "데이터 없음" 같은 안내 한 줄짜리 행도 여기로 온다(빈 보드는 0 이 아니라 실패로 알린다)
  if (sawRows && scanned === 0) return { error: "지원 시간 형식을 못 읽었어요", pages, unparsed, filterSet, missingCols, stoppedBy };
  return { date, total, bySource, pages, scanned, stoppedBy, newest, oldest, unparsed, missingCols, filterSet, statuses, lastPageRows };
}
