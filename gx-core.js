// 🌏 [외국인] 탭 › 📋 멤버 리스트 계산 — gx.js 와 tools/test-gx.js 가 같이 씀
(function (root) {
  const PER_MONTH = 8; // 영어 프리토킹 한 달 총 8회 (11-09 사용자 지정)
  // 출석률 = 그 달(YYYY-MM) 출석한 날 수 ÷ 8 · 100% 넘으면 100%
  function rate(attend, ym) {
    const n = (attend || []).filter((d) => d.startsWith(ym)).length;
    return { n, of: PER_MONTH, pct: Math.min(100, Math.round((n / PER_MONTH) * 100)) };
  }
  // 영어세션시간 고르기 목록: 리더 현황 표의 반·시간대 → "월수 11AM" 중복 없이, 월수→화목→토일, 시간 순
  const GRP = { 월수: 0, 화목: 1, 토일: 2 };
  const mins = (s) => { const m = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i.exec(s); if (!m) return 9999; return ((+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + (+m[2] || 0); };
  function slots(rows) {
    const seen = new Map();
    for (const { grp, slot } of rows || []) { const label = [grp, slot].filter(Boolean).join(" ").trim(); if (label && !seen.has(label)) seen.set(label, [GRP[grp] ?? 9, mins(slot || "")]); }
    return [...seen].sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[0].localeCompare(b[0])).map(([l]) => l);
  }
  const api = { rate, slots, PER_MONTH };
  if (typeof module === "object" && module.exports) module.exports = api; else root.GXC = api;
})(this);
