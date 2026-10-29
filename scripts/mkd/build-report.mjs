// 사용: node scripts/mkd/build-report.mjs <YYYY-MM-DD> [out.json]
// 기준일까지 56일치 mkd_daily 를 읽어 전체·팀별 수집 상태, 핵심 4개(5칸), 이상 징후를 계산해 JSON 으로 낸다. 계산은 report.mjs(순수, 테스트 있음).
//   out.json 을 주면 전체 JSON 은 그 파일에 쓰고 stdout 에는 요약 한 줄 {status,flagCounts,flags:[[수준,지점,문장]],summary:[[이름,d1,d3]]} 만 찍는다(스킬이 이 줄만 읽는다).
//   out.json 이 없으면 전체 JSON 을 stdout 으로 낸다(예전 방식).
// 숫자·플래그는 여기서 끝(스킬이 고치지 않는다). Claude 는 comment(1~3줄)만 써서 save-report.mjs 로 저장한다.
import { writeFileSync } from "node:fs";
import { select, dateArg, run } from "../mk/db.mjs";
import { teams } from "./lib.mjs";
import { buildReport, reportFrom, shortSummary } from "./report.mjs";
const date = dateArg(2, "date"), out = process.argv[3];
await run(async () => {
  const rows = await select("mkd_daily", `select=team_id,date,channel,unit,metrics,status&date=gte.${reportFrom(date)}&date=lte.${date}`, "date,team_id,channel,unit");
  const report = buildReport(rows, await teams(), date);
  if (out) { writeFileSync(out, JSON.stringify(report, null, 1)); console.log(JSON.stringify(shortSummary(report))); }
  else console.log(JSON.stringify(report, null, 1));
});
