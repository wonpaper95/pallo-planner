// 사용: node scripts/mkd/save-daily.mjs <channel> <YYYY-MM-DD> <input.json>
// Claude(크롬 채널)나 다른 스크립트가 만든 JSON을 검증해 mkd_daily 에 저장한다. 규격·검증 규칙은 rows.mjs 맨 위 주석. rows 가 비면 status(failed/login_required)가 꼭 있어야 하고, 모든 팀에 '전체' 행.
// 종료코드: 파일을 못 읽거나 JSON 이 깨졌으면 2(저장 안 함), 행 검증·DB 오류는 1.
import { readFileSync } from "node:fs";
import { arg, dateArg, run } from "../mk/db.mjs";
import { toRows, saveRows } from "./lib.mjs";
const channel = arg(2, "channel"), date = dateArg(3, "date"), file = arg(4, "input.json");
let input;
try { input = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { console.error(e?.code ? `입력 파일을 읽지 못했어요 (${e.code})` : "입력 형식 오류: JSON 을 읽을 수 없어요"); process.exit(2); }
await run(async () => {
  const rows = await toRows(channel, date, input);
  const saved = await saveRows(rows);
  console.log(JSON.stringify({ ok: true, channel, date, saved, units: rows.map((r) => `${r.team_id}:${r.unit}:${r.status}`) }));
});
