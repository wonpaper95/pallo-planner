// 사용: node scripts/mk/save-report.mjs <team_id> <week_or_month_start> <weekly|persona> <report.json>
// weekly 의 날짜는 그 주 월요일로 맞추고, persona 는 그 달 1일(YYYY-MM-01)만 받는다. 컬컴/CULCOM 이 들어 있으면 저장하지 않는다.
import { readFileSync } from "node:fs";
import { MK, upsert, arg, teamArg, dateArg, run } from "./db.mjs";
const team = teamArg(2), day = dateArg(3, "week"), kind = arg(4, "kind");
if (!["weekly", "persona"].includes(kind)) { console.error("kind 는 weekly 또는 persona"); process.exit(2); }
const file = arg(5, "report.json");
let week = day;
if (kind === "weekly") {
  week = MK.weekStart(day);
  if (week !== day) console.error(`알림: ${day} 는 월요일이 아니라 그 주 월요일 ${week} 로 저장해요`);
} else if (!day.endsWith("-01")) { console.error(`persona 의 날짜는 그 달 1일(YYYY-MM-01)이어야 해요: ${day}`); process.exit(2); }
await run(async () => {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (/컬컴|culcom/i.test(JSON.stringify(data))) { console.error("리포트에 '컬컴/CULCOM' 이 들어 있어요. 빼고 다시 저장해 주세요."); process.exit(2); }
  await upsert("mk_reports", [{ team_id: team, week, kind, data, updated_at: new Date().toISOString() }], "team_id,week,kind");
  console.log(JSON.stringify({ ok: true, week }));
});
