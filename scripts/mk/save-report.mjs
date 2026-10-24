// 사용: node scripts/mk/save-report.mjs <team_id> <week_or_month_start> <weekly|persona> <report.json>
import { readFileSync } from "node:fs";
import { upsert, arg } from "./db.mjs";
const kind = arg(4, "kind");
if (!["weekly", "persona"].includes(kind)) { console.error("kind 는 weekly 또는 persona"); process.exit(2); }
const data = JSON.parse(readFileSync(arg(5, "report.json"), "utf8"));
await upsert("mk_reports", [{ team_id: +arg(2, "team_id"), week: arg(3, "week"), kind, data, updated_at: new Date().toISOString() }], "team_id,week,kind");
console.log(JSON.stringify({ ok: true }));
