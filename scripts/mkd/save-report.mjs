// 사용: node scripts/mkd/save-report.mjs <YYYY-MM-DD> <daily|weekly> <report.json>
// daily: build-report 출력에 Claude 가 comment(1~3줄)를 붙인 파일. teams 상세는 빼고 status·summary·flags·flagCounts·days·comment 만 저장.
// weekly: {body, …} 그대로 저장(5단계). 컬컴/CULCOM·전화번호 검사는 Claude 가 쓴 글(comment · body)에만 한다 — 캠페인 이름에는 옛 브랜드가 실제로 들어 있다. 규칙은 report.mjs 의 prepareSave.
// 종료코드: 입력이 잘못되면 2(저장 안 함), DB 오류는 1.
import { readFileSync } from "node:fs";
import { upsert, arg, dateArg, run } from "../mk/db.mjs";
import { prepareSave } from "./report.mjs";
const date = dateArg(2, "date"), kind = arg(3, "kind"), file = arg(4, "report.json");
if (!["daily", "weekly"].includes(kind)) { console.error("kind 는 daily 또는 weekly"); process.exit(2); }
let report;
try { report = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { console.error(`${file} 을 읽지 못했어요 (${e?.code ?? "JSON 형식 오류"})`); process.exit(2); }
const { data, error } = prepareSave(kind, report);
if (error) { console.error(error); process.exit(2); }
await run(async () => {
  await upsert("mkd_reports", [{ date, kind, data, updated_at: new Date().toISOString() }], "date,kind");
  console.log(JSON.stringify({ ok: true, date, kind, flags: (data.flags ?? []).length }));
});
