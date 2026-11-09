// 🌏 [외국인] 탭 › 📋 멤버 리스트 계산 — gx.js 와 tools/test-gx.js 가 같이 씀
(function (root) {
  const PER_MONTH = 8, GOAL = 6; // 영어 프리토킹 한 달 총 8회 (11-09 사용자 지정) · 6회(75%) 오면 출석 보상 (해민 포스터)
  // 출석률 = 그 달(YYYY-MM) 출석한 날 수 ÷ 8 · 100% 넘으면 100%
  function rate(attend, ym) {
    const n = (attend || []).filter((d) => d.startsWith(ym)).length;
    return { n, of: PER_MONTH, pct: Math.min(100, Math.round((n / PER_MONTH) * 100)), goal: n >= GOAL };
  }
  // 영어세션시간 고르기 목록: 리더 현황 표의 반·시간대 → "월수 11AM" 중복 없이, 월수→화목→토일, 시간 순
  // 운영 리더 표엔 일본어·중국어반, 블로그스텝·백업리더 같은 줄, "오후 6시"/"6PM" 섞임이 있음 (11-09 라이브 확인) →
  // 영어반만(일본어·중국어 빼고), 반(월수·화목·토일) 있는 것만, "오후 6시"→"6PM", 그 반에 시각이 있으면 "오전/오후" 같은 큰 묶음은 뺌
  const GRP = { 월수: 0, 화목: 1, 토일: 2 };
  const norm = (s) => s.replace(/\s+/g, " ").trim().replace(/^(오전|오후|저녁)\s*(\d{1,2})시(?:\s*(\d{1,2})분)?$/, (_, ap, h, m) => `${h}${m ? ":" + m.padStart(2, "0") : ""}${ap === "오전" ? "AM" : "PM"}`).replace(/\s*(AM|PM)$/i, (x) => x.trim().toUpperCase());
  const mins = (s) => { const m = /^(\d{1,2})(?::(\d{2}))?(AM|PM)$/.exec(s); return m ? ((+m[1] % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + (+m[2] || 0) : { 오전: 600, 오후: 900, 저녁: 1140 }[s] ?? 9999; };
  function slots(rows) {
    const by = {};
    for (const { grp, slot } of rows || []) {
      const t = norm(slot || "");
      if (!(grp in GRP) || /일본어|중국어/.test(t) || !/^(\d{1,2}(:\d{2})?(AM|PM)|오전|오후|저녁)$/.test(t)) continue;
      (by[grp] ??= new Set()).add(t);
    }
    return Object.keys(GRP).flatMap((g) => { const ts = [...(by[g] ?? [])], exact = ts.filter((t) => /\d/.test(t)); return (exact.length ? exact : ts).sort((a, b) => mins(a) - mins(b)).map((t) => `${g} ${t}`); });
  }
  const api = { rate, slots, PER_MONTH, GOAL };
  if (typeof module === "object" && module.exports) module.exports = api; else root.GXC = api;
})(this);
