// 전산 캘린더(branch.pallo.co.kr/{지점코드}/admin/dashboard) › [캘린더 통계] 창에서 날짜별 상담 예약 숫자를 읽는 스니펫. 스킬이 Claude in Chrome javascript_tool 로 그 페이지에 넣어 실행한다.
// 읽는 것은 통계 창 위쪽 숫자(총 예약·방문·등록 전환·불참, 상태별·언어별·동기별 건수)뿐. 아래 '최근 예약' 목록(이름·전화번호)은 읽지 않는다. 아무것도 저장·수정하지 않는다(기간 고르기·적용만).
// 하루씩 기간을 '그날 ~ 그날'로 바꿔 읽는다(하루 약 2초). 한 번의 javascript_tool 은 45초에서 끊기므로 백그라운드로 돌린다:
//   1) 이 파일 내용 + `window.__mkVisLast = null; __mkVisits("2026-10-01", "2026-10-29").then((r) => (window.__mkVisLast = r));`
//   2) 10초 간격으로 `window.__mkVisLast ? { n: __mkVisLast.days?.length, error: __mkVisLast.error } : "running"` → 끝나면 `JSON.stringify(__mkVisLast.days.slice(0, 10))` … 로 나눠 받는다.
// 방문완 = 실제로 와서 상담한 사람(대표 기준). 통계 창의 '방문'은 전산이 따로 세는 값이라 둘 다 남긴다.
async function __mkVisits(from, to) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const D = /^\d{4}-\d{2}-\d{2}$/;
  if (!D.test(from) || !D.test(to) || from > to) return { error: "날짜 형식은 YYYY-MM-DD, from ≤ to" };
  const stats = () => [...document.querySelectorAll("[role=dialog]")].find((e) => /캘린더 통계/.test(e.innerText || ""));
  if (!stats()) {
    const open = [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "캘린더 통계");
    if (!open) return { error: "캘린더 통계 버튼 없음 (전산 화면이 바뀌었을 수 있어요)" };
    open.click(); await sleep(1500);
  }
  if (!stats()) return { error: "캘린더 통계 창이 안 열림" };
  // '1,234건' · '38' → 숫자
  const num = (s) => +String(s).replace(/[^\d]/g, "") || 0;
  function parse(text) {
    const t = text.slice(0, text.indexOf("최근 예약") >= 0 ? text.indexOf("최근 예약") : undefined); // 이름 목록 앞에서 자른다
    const lines = t.split("\n").map((s) => s.trim()).filter(Boolean);
    const at = (label) => { const i = lines.indexOf(label); return i >= 0 ? num(lines[i + 1]) : null; };
    const section = (head, nexts) => {
      const i = lines.indexOf(head); if (i < 0) return {};
      const out = {};
      for (let j = i + 1; j < lines.length - 1 && !nexts.includes(lines[j]); j += 2) if (/건$/.test(lines[j + 1])) out[lines[j]] = num(lines[j + 1]);
      return out;
    };
    const period = (lines.find((s) => /^\d{4}\.\d{2}\.\d{2} ~ \d{4}\.\d{2}\.\d{2}$/.test(s)) || lines.find((s) => /~/.test(s)) || "");
    if (lines.some((s) => /예약 일정이 없습니다/.test(s))) return { period, total: 0, visit: 0, enroll: 0, noshow: 0, byStatus: {}, byLang: {}, byMotive: {} }; // 예약 없는 날
    return { period, total: at("총 예약"), visit: at("방문"), enroll: at("등록 전환"), noshow: at("불참"),
      byStatus: section("상태별 분포", ["언어별", "동기별"]), byLang: section("언어별", ["동기별", "상태별 분포"]), byMotive: section("동기별", ["언어별", "상태별 분포"]) };
  }
  const days = [];
  for (let day = from; day <= to; day = new Date(Date.parse(day) + 864e5).toISOString().slice(0, 10)) {
    const [y, m, d] = day.split("-").map(Number), label = `${y}년 ${m}월`, want = `${day.replace(/-/g, ".")} ~ ${day.replace(/-/g, ".")}`;
    const pickBtn = stats()?.querySelector('button[title="기간 직접 선택"]');
    if (!pickBtn) return { error: "기간 직접 선택 버튼 없음", days };
    pickBtn.click(); await sleep(500);
    const pk = [...document.querySelectorAll("[role=dialog]")].find((e) => /선택된 기간/.test(e.innerText || ""));
    if (!pk) return { error: "기간 고르기 창이 안 열림", days };
    // 왼쪽 달력 머리('2026년 10월')를 그 달로 맞춘다 — ◀ ▶ 는 왼쪽 달력 머리 양옆 버튼
    const head = () => [...pk.querySelectorAll("*")].find((e) => /^\d{4}년 \d{1,2}월/.test(e.innerText?.trim() || "") && e.children.length <= 2);
    for (let i = 0; i < 24; i++) {
      const h = head(), [hy, hm] = (h?.innerText.match(/(\d{4})년 (\d{1,2})월/) ?? []).slice(1).map(Number);
      if (!h) return { error: "달력 머리 없음", days };
      if (hy === y && hm === m) break;
      const arrow = [...pk.querySelectorAll("button")].find((b) => b.innerText.trim() === ((hy * 12 + hm) > (y * 12 + m) ? "◀" : "▶"));
      if (!arrow) return { error: "달 이동 버튼 없음", days };
      arrow.click(); await sleep(250);
    }
    let box = head(); while (box && box.querySelectorAll("button").length < 28) box = box.parentElement;
    const btn = [...(box?.querySelectorAll("button") ?? [])].find((b) => b.innerText.trim() === String(d));
    if (!btn) return { error: `${day} 버튼 없음`, days };
    btn.click(); await sleep(150); btn.click(); await sleep(250);
    const apply = [...pk.querySelectorAll("button")].find((b) => b.innerText.trim() === "적용");
    if (!apply) return { error: "적용 버튼 없음", days };
    apply.click();
    let r = null;
    for (let i = 0; i < 30; i++) { await sleep(200); r = parse(stats()?.innerText || ""); if (r.period === want) break; r = null; }
    if (!r) return { error: `${day} 기간이 안 바뀜`, days };
    await sleep(400); // 숫자가 기간보다 늦게 바뀔 수 있다
    r = parse(stats()?.innerText || "");
    const sumStatus = Object.values(r.byStatus).reduce((a, b) => a + b, 0);
    days.push({ day, total: r.total, visit: r.visit, enroll: r.enroll, noshow: r.noshow, done: r.byStatus["방문완"] ?? 0, byStatus: r.byStatus, byLang: r.byLang, byMotive: r.byMotive, check: sumStatus === r.total });
  }
  return { days };
}

// javascript_tool 결과는 약 2,000자에서 잘린다 → 예약 있는 날만 한 줄씩(push-visits.mjs 가 읽는 꼴) 10일씩 받는다: `__mkVisPack(0, 10)`, `__mkVisPack(10, 20)` …
function __mkVisPack(a, b) {
  const kv = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(",");
  return window.__mkVisLast.days.filter((d) => d.total).slice(a, b).map((d) => [d.day, d.total, d.done, d.noshow, d.visit, d.enroll, kv(d.byStatus), kv(d.byLang), kv(d.byMotive)].join("|"));
}
