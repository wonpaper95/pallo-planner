// 사용: node scripts/mkd/save-daily.mjs <channel> <YYYY-MM-DD> <input.json>
// Claude(크롬 채널)나 다른 스크립트가 만든 JSON(규격은 lib.mjs 위 주석)을 검증해 mkd_daily 에 저장한다. rows 가 비면 채널 통째 상태(failed/login_required)로 모든 팀에 '전체' 행.
import { readFileSync } from "node:fs";
import { arg, dateArg, run } from "../mk/db.mjs";
import { toRows, saveRows } from "./lib.mjs";
const channel = arg(2, "channel"), date = dateArg(3, "date"), file = arg(4, "input.json");
await run(async () => {
  const rows = await toRows(channel, date, JSON.parse(readFileSync(file, "utf8")));
  const saved = await saveRows(rows);
  console.log(JSON.stringify({ ok: true, channel, date, saved, units: rows.map((r) => `${r.team_id}:${r.unit}:${r.status}`) }));
});
