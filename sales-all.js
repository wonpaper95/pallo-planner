// 📅 매출 탭 '전체 달 한눈에': 지금 고른 지점의 달마다 목표(sales_plans) vs 실제 순매출. 줄을 누르면 그 달로.
// 실제 = 재무 탭(fin_rows, 장부 달 + 날짜가 그달인 줄 — 매출 탭·planner-sheets 와 같은 규칙). 재무 줄이 없는 지점·달은 달력 실적(sales_days).
(() => {
const SLA = window.SLA = {};
const el = (id) => document.getElementById(id);
const krw = (n) => Math.round(n).toLocaleString("ko-KR");
const monthEnd = (m) => { const [y, mo] = m.split("-").map(Number); return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, "0")}`; };

// plans {달: data}, fin [{month, day, amount}], days [{day, amount, refund}] → 새 달부터 [{month, plan, net, source, skipped, skippedAmt}]
SLA.summarize = ({ plans, fin, days, today, always = [] }) => {
  const months = new Set([...Object.keys(plans), ...fin.map((r) => r.month), ...days.map((d) => d.day.slice(0, 7)), ...always]);
  return [...months].sort().reverse().map((month) => {
    const plan = plans[month] ?? null, end = monthEnd(month), to = today < end ? today : end;
    const from = plan?.start?.slice(0, 7) === month ? plan.start : `${month}-01`;
    const rows = fin.filter((r) => r.month === month), inRange = rows.filter((r) => r.day && r.day >= from && r.day <= to);
    const out = rows.filter((r) => !r.day || r.day.slice(0, 7) !== month);
    if (rows.length) return { month, plan, source: "fin", net: inRange.reduce((a, r) => a + r.amount, 0), skipped: out.length, skippedAmt: out.reduce((a, r) => a + r.amount, 0) };
    const base = plan?.base ?? "", cal = days.filter((d) => d.day.slice(0, 7) === month && d.day > base && d.day <= to);
    const has = cal.length || plan?.current > 0;
    return { month, plan, source: has ? "cal" : null, net: has ? (plan?.current || 0) + cal.reduce((a, d) => a + (d.amount || 0) - (d.refund || 0), 0) : null, skipped: 0, skippedAmt: 0 };
  });
};

async function allFin(team) { // 지점당 1,000줄 넘음 → 나눠 읽기
  const out = [];
  for (let at = 0; ; at += 1000) {
    const { data, error } = await sb.from("fin_rows").select("month, day, amount").eq("team_id", team).eq("kind", "sale").is("deleted_at", null).not("amount", "is", null).order("id").range(at, at + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
const rate = (v) => (typeof v === "number" ? `${Math.round(v * 10) / 10}%` : "-");
const rowHtml = (r, cur) => {
  const p = r.plan, goal = p?.goal > 0 ? p.goal : null;
  const warn = r.skipped ? `<span class="warn">⚠ 날짜 없음·다른 달 ${r.skipped}줄 ${krw(r.skippedAmt)}원 빠짐</span>` : "";
  return `<tr data-slm="${r.month}" class="${r.month === cur ? "cur" : ""}"><td>${r.month.slice(0, 4)}년 ${+r.month.slice(5)}월</td><td>${goal ? `${krw(goal)}원` : "-"}</td>
    <td>${r.net == null ? "-" : `${krw(r.net)}원`}${r.source === "cal" ? " <small class=\"mut\">달력</small>" : ""}${warn}</td><td>${goal && r.net != null ? `${(Math.round(r.net / goal * 1000) / 10).toLocaleString("ko-KR")}%` : "-"}</td>
    <td>${p?.appsGoal > 0 ? `${krw(p.appsGoal)}명` : "-"}</td><td>${rate(p?.reply)}</td><td>${rate(p?.consult)}</td><td>${rate(p?.pay)}</td><td>${p?.arpu > 0 ? `${krw(p.arpu)}원` : "-"}</td><td>${rate(p?.refundRate)}</td></tr>`;
};

SLA.load = async function () {
  const box = el("slAll"), body = el("slAllBody");
  if (!box?.open || !SL.team) return;
  const team = SL.team, now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (body.dataset.team !== String(team)) body.innerHTML = `<p class="mut">불러오는 중…</p>`;
  try {
    const [p, d, fin] = await Promise.all([sb.from("sales_plans").select("month, data").eq("team_id", team), sb.from("sales_days").select("day, amount, refund").eq("team_id", team).limit(5000), allFin(team)]);
    if (fail(p.error || d.error) || team !== SL.team) return;
    const rows = SLA.summarize({ plans: Object.fromEntries(p.data.map((x) => [x.month, x.data])), fin, days: d.data, today, always: [SL.month] });
    body.dataset.team = team;
    body.innerHTML = `<p class="slhint">${esc(SL.teamName)} — 줄을 누르면 그 달로 이동해요. 실제 순매출은 재무 탭 기준이에요.</p><div class="slscroll"><table class="slt"><tr><th>달</th><th>목표 순매출</th><th>실제 순매출</th><th>달성률</th><th>지원자</th><th>회신율</th><th>상담률</th><th>결제율</th><th>객단가</th><th>환불율</th></tr>${rows.map((r) => rowHtml(r, SL.month)).join("")}</table></div>`;
  } catch (e) { fail(e); }
};
document.addEventListener("toggle", (e) => { if (e.target.id === "slAll") SLA.load(); }, true);
document.addEventListener("click", (e) => {
  const m = e.target.closest?.("#slAll [data-slm]")?.dataset.slm;
  if (m && m !== SL.month) { SL.month = m; SL.day = SL.week = null; SL.load(); }
});
})();
