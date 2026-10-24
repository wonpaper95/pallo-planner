// 사용: node scripts/mk/save-report.mjs <team_id> <week_or_month_start> <weekly|persona> <report.json>
import { readFileSync } from "node:fs";
import { upsert, arg, teamArg, dateArg, run } from "./db.mjs";
const team = teamArg(2), week = dateArg(3, "week"), kind = arg(4, "kind");
if (!["weekly", "persona"].includes(kind)) { console.error("kind 는 weekly 또는 persona"); process.exit(2); }
const file = arg(5, "report.json");
await run(async () => {
  const data = JSON.parse(readFileSync(file, "utf8"));
  await upsert("mk_reports", [{ team_id: team, week, kind, data, updated_at: new Date().toISOString() }], "team_id,week,kind");
  console.log(JSON.stringify({ ok: true }));
});
