// 사용: node scripts/mk/push-visits.mjs <team_id> <from> <to> <visits.txt>
// visits.txt = jeonsan-visits.js 결과를 줄인 줄들(예약 있는 날만, MKCORE.parseVisitLine 형식). from~to 중 줄이 없는 날은 예약 0 으로 넣는다(수집한 날 = 0 도 기록).
import { readFileSync } from "node:fs";
import { MK, upsert, arg, teamArg, dateArg, run } from "./db.mjs";
const team = teamArg(2), from = dateArg(3, "from"), to = dateArg(4, "to"), file = arg(5, "visits.txt");
await run(async () => {
  const byDay = new Map(), rejected = [];
  for (const line of readFileSync(file, "utf8").split("\n").filter((l) => l.trim())) {
    const r = MK.parseVisitLine(line);
    if (!r.ok) { rejected.push(r.reason); continue; }
    if (r.row.day < from || r.row.day > to) { rejected.push("기간 밖"); continue; }
    byDay.set(r.row.day, r.row);
  }
  if (rejected.length) throw new Error(`못 읽은 줄 ${rejected.length}개 (${[...new Set(rejected)].join(", ")}) — 저장 안 함`);
  const rows = [];
  for (let d = from; d <= to; d = MK.addDays(d, 1)) rows.push({ team_id: team, ...(byDay.get(d) ?? { day: d, total: 0, done: 0, noshow: 0, data: {} }), updated_at: new Date().toISOString() });
  await upsert("mk_visits", rows, "team_id,day");
  console.log(JSON.stringify({ saved: rows.length, booked: rows.reduce((a, r) => a + r.total, 0), done: rows.reduce((a, r) => a + r.done, 0) }));
});
