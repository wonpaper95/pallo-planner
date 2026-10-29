// 💼 재무 계산 (fin.js·tools/test-fin.js 공용) → window.FNC. 칸 이름은 시트 헤더 그대로 (planner-fin/merge.ts 와 같아야 함)
(() => {
const SALE_H = ["날짜", "멤버쉽", "매출", "이름", "언어", "거래형태", "결제수단", "카드사", "할부개월", "결제상세", "코멘트", "가입경로", "Lv", "전화번호", "상담자", "전산입력", "성별", "나이"];
const COST_H = ["구분", "날짜", "사용처", "금액", "비고", "근무시간"];
// 시트 드롭다운(데이터 확인)과 같은 목록 — 목록에 없는 값도 그대로 둠(옛 줄·시트에서 직접 친 값)
const OPTS = {
  거래형태: ["※", "가입", "환불", "멤버쉽변경", "결제방법변경", "차액결제(분할납부)", "디파짓(가입/환불)", "양도", "환불정산", "시작전환불", "전화영어전환"],
  결제수단: ["카드", "개인이체", "법인이체", "링크페이", "스탭페이", "현찰"],
  카드사: ["삼성", "현대", "국민", "신한", "비씨", "하나", "롯데", "농협", "우리", "기타"],
  할부개월: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
};
// 칩 색 (시트와 같게): 환불·시작전환불 = 주황, 가입 = 초록, 나머지 = 회색
const chip = (k, v) => k !== "거래형태" ? "" : v === "환불" || v === "시작전환불" ? "or" : v === "가입" ? "gr" : "";
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
// ⚠️ 덜 쓴 줄 (울산 마야 제안 10-29): 꼭 있어야 할 칸이 비면 그 칸 이름들
const empty = (v) => String(v ?? "").trim() === "";
function missing(r) {
  const v = r.vals, need = r.kind === "sale" ? ["날짜", "멤버쉽", "매출", "이름", "거래형태", "결제수단", "상담자"] : ["사용처", "금액"];
  if (r.kind === "sale" && String(v.결제수단 ?? "").trim() === "카드") need.push("카드사", "할부개월");
  if (r.kind === "sale" && String(v.거래형태 ?? "").trim() === "가입") need.push("전화번호", "가입경로");
  if (r.kind === "cost" && ["본사지출", "지점기타지출"].includes(String(v.구분 ?? "").trim())) need.push("날짜");
  return need.filter((k) => empty(v[k]));
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
window.FNC = { OPTS, chip, missing, SALE_H, COST_H, SECTIONS, toNum, normDate, summary, daily, amt };
})();
