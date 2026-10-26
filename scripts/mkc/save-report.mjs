// 사용: node scripts/mkc/save-report.mjs <en|jpcn> <YYYY-MM-DD> <daily|creative> <report.json>
// creative(소재 추천)의 날짜는 그 주 월요일로 맞춘다. 추천 카피(creative)에 '컬컴/CULCOM' 이 우리 브랜드처럼 들어 있으면 저장하지 않는다 (daily 의 경쟁사 이름은 데이터라 검사 안 함).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { MK, upsert, arg, dateArg, run } from "../mk/db.mjs";
const C = createRequire(import.meta.url)("../../mkc-core.js");
const grp = arg(2, "grp"); if (!C.GROUPS.includes(grp)) { console.error("그룹은 en 또는 jpcn"); process.exit(2); }
const d = dateArg(3, "day"), kind = arg(4, "kind");
if (!["daily", "creative"].includes(kind)) { console.error("kind 는 daily 또는 creative"); process.exit(2); }
const file = arg(5, "report.json");
const day = kind === "creative" ? MK.weekStart(d) : d;
await run(async () => {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (kind === "creative" && /컬컴|culcom/i.test(JSON.stringify(data.ideas ?? data.notes ?? ""))) { console.error("추천 카피에 '컬컴/CULCOM' 이 들어 있어요. 팔로로 바꿔 다시 저장해 주세요."); process.exit(2); }
  await upsert("mkc_reports", [{ grp, day, kind, data, updated_at: new Date().toISOString() }], "grp,day,kind");
  console.log(JSON.stringify({ ok: true, grp, day, kind }));
});
