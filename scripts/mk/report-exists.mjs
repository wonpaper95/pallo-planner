// 사용: node scripts/mk/report-exists.mjs <team_id> <YYYY-MM-DD> <weekly|persona> → {"exists":true|false}. 읽기 전용.
import { select, arg, teamArg, dateArg, run } from "./db.mjs";
const team = teamArg(2), week = dateArg(3, "week"), kind = arg(4, "kind");
if (!["weekly", "persona"].includes(kind)) { console.error("kind 는 weekly 또는 persona"); process.exit(2); }
await run(async () => {
  console.log(JSON.stringify({ exists: (await select("mk_reports", `team_id=eq.${team}&week=eq.${week}&kind=eq.${kind}&select=week`, "week")).length > 0 }));
});
