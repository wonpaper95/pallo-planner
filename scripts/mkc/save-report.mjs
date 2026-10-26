// 사용: node scripts/mkc/save-report.mjs <en|jpcn> <YYYY-MM-DD> <daily|creative> <report.json>
// creative(소재 추천)의 날짜는 그 주 월요일로 맞춘다. 추천 카피(creative)에 '컬컴/CULCOM' 이 우리 브랜드처럼 들어 있으면 저장하지 않는다 (daily 의 경쟁사 이름은 데이터라 검사 안 함).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { MK, select, upsert, arg, dateArg, run } from "../mk/db.mjs";
const C = createRequire(import.meta.url)("../../mkc-core.js");
const grp = arg(2, "grp"); if (!C.GROUPS.includes(grp)) { console.error("그룹은 en 또는 jpcn"); process.exit(2); }
const d = dateArg(3, "day"), kind = arg(4, "kind");
if (!["daily", "creative"].includes(kind)) { console.error("kind 는 daily 또는 creative"); process.exit(2); }
const file = arg(5, "report.json");
const day = kind === "creative" ? MK.weekStart(d) : d;
await run(async () => {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (kind === "creative") {
    // 점검기: 경쟁사 문구 베끼기·컬컴·과장·가격. 경고는 같이 저장해서 화면에 띄우고, 컬컴만 막는다.
    if (!Array.isArray(data.ideas) || !data.ideas.length) { console.error("ideas 가 비어 있어요"); process.exit(2); }
    const comp = await select("mkc_ads", `select=library_id,page_name,body,headline&grp=eq.${grp}&active=is.true`, "library_id");
    data.warnings = C.checkIdeas(data.ideas, comp.filter((a) => !C.isOwnPage(a.page_name)));
    const blocks = data.warnings.filter((w) => w.level === "block");
    if (blocks.length) { console.error(blocks.map((w) => w.msg).join("\n")); process.exit(2); }
    for (const w of data.warnings) console.error(`${w.level}: ${w.msg}`);
    delete data.competitor; delete data.ours; // 입력 자료는 저장하지 않는다 (화면엔 추천만)
  }
  await upsert("mkc_reports", [{ grp, day, kind, data, updated_at: new Date().toISOString() }], "grp,day,kind");
  console.log(JSON.stringify({ ok: true, grp, day, kind }));
});
