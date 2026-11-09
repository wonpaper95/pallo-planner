// 🌏 [외국인] 탭 › 📋 멤버 리스트 계산 — gx.js 와 tools/test-gx.js 가 같이 씀
(function (root) {
  // 출석률 = 영어 프리토킹 출석한 날 수 ÷ (시작일부터 오늘까지 주 수 × 2) · 주 2회 기준, 시작한 주 = 1주째, 100% 넘으면 100%
  function rate(start, attend, today) {
    if (!start || start > today) return null;
    const weeks = Math.floor((Date.parse(today) - Date.parse(start)) / (7 * 864e5)) + 1, of = weeks * 2, n = (attend || []).length;
    return { n, of, pct: Math.min(100, Math.round((n / of) * 100)) };
  }
  const api = { rate };
  if (typeof module === "object" && module.exports) module.exports = api; else root.GXC = api;
})(this);
