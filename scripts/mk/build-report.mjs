// 사용: node scripts/mk/build-report.mjs <team_id> <week_monday> [--persona]
// weekly: 그 주 기준 4주 광고·오가닉·리드 → MKCORE.buildWeekly. persona: 최근 90일 리드 + 연령·성별 → buildPersonaInputs
import { MK, select, arg } from "./db.mjs";
const team = +arg(2, "team_id"), week = MK.weekStart(arg(3, "week"));
const end = MK.addDays(week, 6), from4 = MK.addDays(week, -21), from90 = MK.addDays(week, -90);
const num = (rows) => rows.map((r) => ({ ...r, spend: Number(r.spend) }));
if (process.argv.includes("--persona")) {
  const [leads, demo] = await Promise.all([
    select("mk_leads", `team_id=eq.${team}&lead_date=gte.${from90}&lead_date=lte.${end}`),
    select("mk_ad_demo", `team_id=eq.${team}&period_to=gte.${from90}`),
  ]);
  console.log(JSON.stringify({ month: week.slice(0, 8) + "01", ...MK.buildPersonaInputs({ leads, demo: num(demo) }) }, null, 1));
} else {
  const [ads, organic, leads] = await Promise.all([
    select("mk_ad_daily", `team_id=eq.${team}&date=gte.${from4}&date=lte.${end}`),
    select("mk_organic", `team_id=eq.${team}&published_at=gte.${from4}&published_at=lte.${end}`),
    select("mk_leads", `team_id=eq.${team}&lead_date=gte.${from4}&lead_date=lte.${end}`),
  ]);
  console.log(JSON.stringify(MK.buildWeekly({ week, ads: num(ads), organic, leads }), null, 1));
}
