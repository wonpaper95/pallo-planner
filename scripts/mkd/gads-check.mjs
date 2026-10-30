// 사용: node scripts/mkd/gads-check.mjs <시작일 YYYY-MM-DD> <끝일 YYYY-MM-DD>
// 구글 광고 3일 점검용(읽기 전용): mkd_daily 에서 기간 안 전산(jeonsan) 행을 읽어 gads_ 토큰(구글 광고 유입) 문의 건수를 지점·캠페인 토큰별로 합산한다.
// 출력 JSON 한 줄 {from,to,days,firstDate,incomplete,byTeam:{지점:{gads_…:건수}},total} — days 는 기간 안 전산 데이터가 있는 날 수(일일 현황은 2026-10-29 부터),
// incomplete 는 일부 지점 데이터가 빠진 날. 계산은 gads-check-rows.mjs(순수, 테스트 있음). 저장·변경은 하지 않는다. 서비스 키는 ../mk/db.mjs 가 읽는다(출력 금지).
import { select, dateArg, run } from "../mk/db.mjs";
import { teams } from "./lib.mjs";
import { gadsCheck } from "./gads-check-rows.mjs";

const from = dateArg(2, "시작일"), to = dateArg(3, "끝일");
if (from > to) { console.error(`시작일(${from})이 끝일(${to})보다 늦어요`); process.exit(2); }
await run(async () => {
  const rows = await select("mkd_daily", `select=team_id,date,channel,unit,metrics,status&channel=eq.jeonsan&date=gte.${from}&date=lte.${to}`, "date,team_id,unit");
  console.log(JSON.stringify(gadsCheck(rows, await teams(), from, to)));
});
