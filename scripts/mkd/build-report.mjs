// 사용: node scripts/mkd/build-report.mjs <YYYY-MM-DD> > report.json
// 기준일까지 56일치 mkd_daily 를 읽어 전체·팀별 수집 상태, 핵심 4개(5칸), 이상 징후를 계산해 JSON 으로 낸다. 계산은 report.mjs(순수, 테스트 있음).
// 숫자·플래그는 여기서 끝(스킬이 고치지 않는다). Claude 는 comment(1~3줄)만 붙여 save-report.mjs 로 저장한다.
import { select, dateArg, run } from "../mk/db.mjs";
import { teams } from "./lib.mjs";
import { buildReport, reportFrom } from "./report.mjs";
const date = dateArg(2, "date");
await run(async () => {
  const rows = await select("mkd_daily", `select=team_id,date,channel,unit,metrics,status&date=gte.${reportFrom(date)}&date=lte.${date}`, "date,team_id,channel,unit");
  console.log(JSON.stringify(buildReport(rows, await teams(), date), null, 1));
});
