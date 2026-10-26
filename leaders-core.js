// 🧑‍🏫 리더 현황 보드 계산 (브라우저·node 테스트 공용): 수업 날짜, 달마다 결석·개근, 구글시트 붙여넣기 해석
(() => {
const D = typeof module !== "undefined" ? require("./week.js") : W; // week.js 의 W (전역 const 라 window.W 아님)
const LDC = {
  GRPS: ["월수", "화목", "토일"],
  DAYS: { 월수: [1, 3], 화목: [2, 4], 토일: [6, 0] },
  ABSENT_LIMIT: 3, // 한 달에 3번 이상 빠지면 🚨 재관리
  // from~to(포함) 사이 그 반 수업 날짜
  sessions(grp, from, to) {
    const out = [], days = LDC.DAYS[grp] ?? [];
    for (let d = from; d <= to; d = D.add(d, 1)) if (days.includes(D.parse(d).getDay())) out.push(d);
    return out;
  },
  monthStart: (d) => d.slice(0, 8) + "01",
  monthEnd(d) { const p = D.parse(LDC.monthStart(d)); p.setMonth(p.getMonth() + 1); p.setDate(0); return D.ymd(p); },
  addMonths(d, n) { const p = D.parse(LDC.monthStart(d)); p.setMonth(p.getMonth() + n); return D.ymd(p); },
  // 그달 성적. att: Map(day → 'O'|'X'). 지난 수업만 셈 (오늘은 체크했을 때만)
  monthStat(grp, month, att, today) {
    const all = LDC.sessions(grp, LDC.monthStart(month), LDC.monthEnd(month)), past = all.filter((d) => d < today || (d === today && att.has(d))); // 오늘 수업은 체크해야 셈
    const o = past.filter((d) => att.get(d) === "O").length, x = past.filter((d) => att.get(d) === "X").length;
    const ended = LDC.monthEnd(month) < today, perfect = past.length > 0 && o === past.length;
    return { total: all.length, past: past.length, o, x, blank: past.length - o - x,
      recheck: x >= LDC.ABSENT_LIMIT, award: perfect && ended, onTrack: perfect && !ended };
  },
  // 이름 끝 숫자(예: '김주란4+', '백지훈 3+')는 시트에서 쓰던 라포 → 별점으로
  splitName(raw) {
    const m = String(raw ?? "").trim().match(/^(.*?)\s*([1-5])\s*[+-]?\s*$/);
    return m && m[1] ? { name: m[1].trim(), rapport: +m[2] } : { name: String(raw ?? "").trim(), rapport: null };
  },
  // 구글시트에서 복사한 줄(탭 구분) → 리더 목록. 시간대 칸이 비면 위(구역 제목·이전 줄) 것을 이어 씀
  parsePaste(text) {
    const rows = [], cur = { grp: "", slot: "" };
    const grpOf = (s) => (s.match(/월수|화목|토일/) ?? [s.includes("주말") ? "토일" : ""])[0];
    const slotOf = (s) => (s.match(/\d{1,2}(:\d{2})?\s*(AM|PM)/i) ?? [""])[0].replace(/\s+/g, "").toUpperCase();
    for (const line of String(text).split(/\r?\n/)) {
      const c = line.split("\t").map((x) => x.trim());
      if (!c.some(Boolean)) continue;
      if (grpOf(c[0]) && slotOf(c[0])) { cur.grp = grpOf(c[0]); cur.slot = slotOf(c[0]); } // 구역 제목 줄이나 '월수 11AM' 칸
      if (c.length < 5 || c[3] === "리더" || c[1] === "레벨" || (!c[1] && !c[3])) continue; // 제목·머리줄·빈 줄
      if (!cur.grp) continue;
      const { name, rapport } = LDC.splitName(c[3] || "구해야됨");
      rows.push({ grp: cur.grp, slot: cur.slot, level: c[1] ?? "", seat: c[2] ?? "", name, rapport,
        status: /구해야/.test(c[4] + c[3]) ? "구해야 함" : "확정", start_day: c[5] ?? "", phone: c[6] ?? "", note: c[7] ?? "",
        edu: [c[18], c[19]].filter(Boolean).join(" · "), memo: c[20] ?? "" });
    }
    return rows;
  },
  // 시간대 정렬용 (11AM < 6PM < 8PM)
  slotMin(s) { const m = String(s).match(/(\d{1,2})(?::(\d{2}))?(AM|PM)/i); if (!m) return 9999; return ((+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + (+m[2] || 0); },
};
if (typeof module !== "undefined") module.exports = LDC; else window.LDC = LDC;
})();
