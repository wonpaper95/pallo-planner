// 사용: node scripts/mk/build-report.mjs <team_id> <week_monday> [--persona]
//       node scripts/mk/build-report.mjs <team_id> <YYYY-MM-01> --monthly [--first]
// weekly: 그 주 기준 4주 광고·오가닉·리드 + 매출 시트 결제·네이버 광고비 → MKCORE.buildWeekly. persona: 최근 90일 리드 + 연령·성별 → buildPersonaInputs
// monthly: 그 달(--first 면 1~15일) 리드·캘린더 방문·매출 시트·메타/네이버 광고비 → buildMonthly (지난 6달 추이 포함)
// 매출 시트(fin_rows)의 이름은 '같은 날 같은 사람'을 한 번만 세는 해시로만 쓰고 버린다(출력·저장 안 함).
import { createHash } from "node:crypto";
import { MK, select, teamArg, dateArg, run } from "./db.mjs";
const team = teamArg(2), day = dateArg(3, "week"), has = (f) => process.argv.includes(f);
const num = (rows) => rows.map((r) => ({ ...r, spend: Number(r.spend) }));

async function sales(from, to) {
  const rows = await select("fin_rows", `team_id=eq.${team}&kind=eq.sale&deleted_at=is.null&day=gte.${from}&day=lte.${to}&select=day,amount,vals`, "day,id");
  return rows.map((r) => MK.saleRow({ day: r.day, amount: r.amount, vals: r.vals, who: createHash("sha256").update(`${r.day}|${String(r.vals?.이름 ?? "").trim()}`).digest("hex").slice(0, 12) }));
}
const naver = async (from, to) => (await select("mkd_daily", `team_id=eq.${team}&channel=eq.naver_ad&date=gte.${from}&date=lte.${to}&select=date,metrics`, "date,unit"))
  .map((r) => ({ date: r.date, spend: Number(r.metrics?.spend) || 0 }));
// 환율 USD→원 (frankfurter 두 번 → 안 되면 일일 현황 meta_ad 행에 남은 최근 환율). 500~3000 밖은 무효, 끝내 없으면 null → 메타 원화·ROAS 를 비운다
const okFx = (v) => (v >= 500 && v <= 3000 ? v : null);
async function fx() {
  for (let i = 0; i < 2; i++) {
    try { const v = okFx((await (await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW", { signal: AbortSignal.timeout(10_000) })).json())?.rates?.KRW); if (v) return v; } catch { /* 다시 */ }
  }
  const [r] = await select("mkd_daily", "channel=eq.meta_ad&metrics->>fx=not.is.null&select=metrics&limit=1", "date.desc").catch(() => []);
  return okFx(Number(r?.metrics?.fx)) ?? null;
}

await run(async () => {
  if (has("--monthly")) {
    if (!day.endsWith("-01")) throw new Error(`월간은 그 달 1일(YYYY-MM-01)로 주세요: ${day}`);
    const month = day.slice(0, 7), months = [];
    for (let m = month, i = 0; i < 6; i++, m = MK.prevMonth(m)) months.unshift(m);
    const from = months[0] + "-01", to = MK.monthEnd(month);
    const [leads, visits, sl, meta, nv, rate] = await Promise.all([
      select("mk_leads", `team_id=eq.${team}&lead_date=gte.${from}&lead_date=lte.${to}&select=lead_date,ad_name,status`, "source_key"),
      select("mk_visits", `team_id=eq.${team}&day=gte.${from}&day=lte.${to}&select=day,total,done,noshow,data`, "day").catch(() => []), // 표가 아직 없으면(마이그레이션 전) 방문 없이
      sales(from, to),
      select("mk_ad_daily", `team_id=eq.${team}&date=gte.${from}&date=lte.${to}&select=date,spend`, "date,ad_name"),
      naver(from, to), fx(),
    ]);
    // 데이터가 하나도 없는 옛 달은 추이에서 뺀다
    const any = (m) => [...leads.map((l) => l.lead_date), ...visits.map((v) => v.day), ...sl.map((s) => s.day)].some((d) => d.startsWith(m));
    console.log(JSON.stringify({ ...MK.buildMonthly({ month, half: has("--first") ? "first" : "full", months: months.filter((m) => m === month || any(m)),
      leads, visits, sales: sl, meta: num(meta), naver: nv, fx: rate }), fx: rate }, null, 1));
    return;
  }
  const week = MK.weekStart(day), end = MK.addDays(week, 6), from4 = MK.addDays(week, -21), from90 = MK.addDays(week, -90);
  if (has("--persona")) {
    const [leads, demo] = await Promise.all([
      select("mk_leads", `team_id=eq.${team}&lead_date=gte.${from90}&lead_date=lte.${end}`, "source_key"),
      select("mk_ad_demo", `team_id=eq.${team}&period_to=gte.${from90}&period_from=lte.${end}`, "period_from,period_to,ad_name,age,gender"),
    ]);
    console.log(JSON.stringify({ month: week.slice(0, 8) + "01", ...MK.buildPersonaInputs({ leads, demo: num(demo) }) }, null, 1));
  } else {
    const [ads, organic, leads, sl, nv, rate] = await Promise.all([
      select("mk_ad_daily", `team_id=eq.${team}&date=gte.${from4}&date=lte.${end}`, "date,ad_name"),
      select("mk_organic", `team_id=eq.${team}&published_at=gte.${from4}&published_at=lte.${end}`, "platform,post_id"),
      select("mk_leads", `team_id=eq.${team}&lead_date=gte.${from4}&lead_date=lte.${end}`, "source_key"),
      sales(from4, end), naver(from4, end), fx(),
    ]);
    console.log(JSON.stringify(MK.buildWeekly({ week, ads: num(ads), organic, leads, sales: sl, naver: nv, fx: rate }), null, 1));
  }
});
