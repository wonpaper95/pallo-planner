// 💼 재무 계산 (fin.js·tools/test-fin.js 공용) → window.FNC. 칸 이름은 시트 헤더 그대로 (planner-fin/merge.ts 와 같아야 함)
(() => {
const SALE_H = ["날짜", "멤버쉽", "매출", "이름", "언어", "거래형태", "결제수단", "카드사", "할부개월", "결제상세", "코멘트", "가입경로", "Lv", "전화번호", "상담자", "스포입력", "성별", "나이"];
const COST_H = ["구분", "날짜", "사용처", "금액", "비고", "근무시간"];
const SECTIONS = ["고정비", "변동비", "광고비", "행정조교", "전일조교", "상담조교", "본사지출", "지점기타지출"];
const toNum = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[₩,\s원]/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};
const p2 = (n) => String(n).padStart(2, "0");
// '10/6'·'10.6'·'10/6/2026'·'2026/10/6'·'2026-10-06' → 'YYYY-MM-DD' (연도 없으면 장부 달의 연도). 못 읽으면 적은 그대로
function normDate(s, month) {
  const t = String(s ?? "").trim(); if (!t) return "";
  const p = t.split(/[\/.\-\s]+/).filter(Boolean).map(Number);
  if (p.some(isNaN) || p.length < 2 || p.length > 3) return t;
  let y = +month.slice(0, 4), m, d;
  if (p.length === 2) [m, d] = p; else if (p[0] > 999) [y, m, d] = p; else [m, d, y] = p;
  if (y < 100) y += 2000;
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${p2(m)}-${p2(d)}` : t;
}
const amt = (r) => toNum(r.vals[r.kind === "sale" ? "매출" : "금액"]) ?? 0;
// 매출(+)·환불(−)·순매출·구분별 비용·결제수수료(순매출 × %)·수익
function summary(rows, feePct) {
  const s = { plus: 0, minus: 0, net: 0, cost: 0, fee: 0, profit: 0, bySec: {} };
  for (const r of rows) {
    const a = amt(r);
    if (r.kind === "sale") { if (a >= 0) s.plus += a; else s.minus += a; }
    else { const k = (r.vals.구분 || "").trim() || "기타"; s.bySec[k] = (s.bySec[k] ?? 0) + a; s.cost += a; }
  }
  s.net = s.plus + s.minus;
  s.fee = Math.round(Math.max(0, s.net) * (feePct ?? 0) / 100);
  s.profit = s.net - s.cost - s.fee;
  return s;
}
// 관리자 체크: 날짜(YYYY-MM-DD)마다 매출·비용·수익·누적 — 날짜 없는 비용(월세 등)은 '날짜 없음' 한 줄
function daily(rows) {
  const m = new Map();
  for (const r of rows) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(r.vals.날짜 || "") ? r.vals.날짜 : "";
    const x = m.get(d) ?? { day: d, sale: 0, cost: 0 }; m.set(d, x);
    if (r.kind === "sale") x.sale += amt(r); else x.cost += amt(r);
  }
  let acc = 0;
  return [...m.values()].sort((a, b) => (a.day || "9").localeCompare(b.day || "9")).map((x) => ({ ...x, profit: x.sale - x.cost, acc: (acc += x.sale - x.cost) }));
}
window.FNC = { SALE_H, COST_H, SECTIONS, toNum, normDate, summary, daily, amt };
})();
