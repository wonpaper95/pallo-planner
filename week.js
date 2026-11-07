// 날짜 계산 (브라우저·node 테스트 공용). 날짜 문자열은 항상 로컬 'YYYY-MM-DD' — toISOString(UTC) 쓰면 한국 오전에 하루 밀림.
const W = {
  ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; },
  parse(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); },
  add(s, n) { const d = W.parse(s); d.setDate(d.getDate() + n); return W.ymd(d); },
  monday(s) { const d = W.parse(s); return W.add(s, -((d.getDay() + 6) % 7)); },
  // ISO 주차 (노션 'Week 43' 과 같은 번호)
  isoWeek(s) {
    const thu = W.parse(W.add(W.monday(s), 3));
    const year = thu.getFullYear();
    const w1thu = W.parse(W.add(W.monday(`${year}-01-04`), 3));
    return { year, week: 1 + Math.round((thu - w1thu) / 604800000) };
  },
  weeksOf(year) {
    const out = [];
    for (let m = W.monday(`${year}-01-04`); W.isoWeek(m).year === year; m = W.add(m, 7)) out.push(m);
    return out;
  },
  // 달력 6주 칸. 기본 월요일 시작(노션 MON~SUN), sun=true 면 일요일 시작(애플 캘린더). m 은 1~12
  monthGrid(y, m, sun = false) {
    const d1 = `${y}-${String(m).padStart(2, "0")}-01`;
    const first = sun ? W.add(d1, -W.parse(d1).getDay()) : W.monday(d1);
    return Array.from({ length: 42 }, (_, i) => W.add(first, i));
  },
  // 하루 할 일 순서(주간·월간·위젯 공용): 끝낸 일 위 → 안 끝낸 일 아래. 각 묶음 안에서 시작시간 없는 일(끌어 놓은 순서) 먼저, 그다음 시작시간 순
  daySort(a, b) {
    return (!!b.done - !!a.done) || (!!a.start_time - !!b.start_time) || String(a.start_time ?? "").localeCompare(String(b.start_time ?? ""))
      || ((a.sort ?? 0) - (b.sort ?? 0)) || ((a.id ?? 0) - (b.id ?? 0));
  },
  // ⏳ 해결목표 합계(분): total 전부, left 안 끝낸 일만
  estSum(list) {
    return list.reduce((o, t) => { const m = t.estimate_min || 0; o.total += m; if (!t.done) o.left += m; return o; }, { total: 0, left: 0 });
  },
  // 팀 업무 순서: 날짜 → 그날 안에서 daySort (팀 업무는 시작시간이 없어 마감 시각을 대신 씀)
  teamSort(a, b) {
    const v = (k) => ({ done: k.done_by, start_time: k.deadline, id: k.id });
    return String(a.day).localeCompare(String(b.day)) || W.daySort(v(a), v(b));
  },
  // 🧠 몰입 시간 안의 할 일인지. st = 'HH:MM(:SS)', f = { s:'10:00', e:'12:00' } (e 가 s 보다 작으면 밤을 넘김, 예 22:00~02:00)
  inFocus(st, f) {
    if (!st || !f?.s || !f?.e || f.s === f.e) return false;
    const t = String(st).slice(0, 5);
    return f.s < f.e ? t >= f.s && t < f.e : t >= f.s || t < f.e;
  },
  // 데드라인 상태: over(지남) / soon(24시간 안) / ok
  due(deadline, now = new Date()) {
    const ms = new Date(deadline) - now, h = Math.abs(ms) / 3600000;
    const span = h < 1 ? `${Math.max(1, Math.round(h * 60))}분` : h < 24 ? `${Math.floor(h)}시간` : `${Math.floor(h / 24)}일`;
    if (ms < 0) return { cls: "over", text: `${span} 지남` };
    return { cls: h < 24 ? "soon" : "ok", text: h < 24 ? `${span} 남음` : `D-${Math.ceil(ms / 86400000)}` };
  },
};
if (typeof module !== "undefined") module.exports = W;
