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
  // 데드라인 상태: over(지남) / soon(24시간 안) / ok
  due(deadline, now = new Date()) {
    const ms = new Date(deadline) - now, h = Math.abs(ms) / 3600000;
    const span = h < 1 ? `${Math.max(1, Math.round(h * 60))}분` : h < 24 ? `${Math.floor(h)}시간` : `${Math.floor(h / 24)}일`;
    if (ms < 0) return { cls: "over", text: `${span} 지남` };
    return { cls: h < 24 ? "soon" : "ok", text: h < 24 ? `${span} 남음` : `D-${Math.ceil(ms / 86400000)}` };
  },
};
if (typeof module !== "undefined") module.exports = W;
