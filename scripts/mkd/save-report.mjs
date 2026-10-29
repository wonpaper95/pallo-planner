// 사용: node scripts/mkd/save-report.mjs <YYYY-MM-DD> <daily|weekly> <report.json> [--comment-file <comment.txt>]
// daily: build-report 출력(파일)에 Claude 가 쓴 comment(1~3줄)를 붙인 것. --comment-file 을 주면 그 파일 내용(앞뒤 공백 제거)을 comment 로 넣고 검증한다. teams 상세·summary 는 빼고 status·flags·flagCounts·days·comment 만 저장.
//        report.json 의 date 가 <날짜> 와 다르면 저장하지 않는다(엉뚱한 날 리포트를 덮어쓰지 않게).
// weekly: {body, …} 그대로 저장(5단계). 컬컴/CULCOM·전화번호 검사는 Claude 가 쓴 글(comment · body)에만 한다 — 캠페인 이름에는 옛 브랜드가 실제로 들어 있다. 규칙은 report.mjs 의 prepareSave.
// 종료코드: 입력이 잘못되면 2(저장 안 함), DB 오류는 1.
import { readFileSync } from "node:fs";
import { upsert, arg, dateArg, run } from "../mk/db.mjs";
import { prepareSave, dateMismatch } from "./report.mjs";
const date = dateArg(2, "date"), kind = arg(3, "kind"), file = arg(4, "report.json");
const fail = (m) => { console.error(m); process.exit(2); };
if (!["daily", "weekly"].includes(kind)) fail("kind 는 daily 또는 weekly");
const ci = process.argv.indexOf("--comment-file"), commentFile = ci < 0 ? null : process.argv[ci + 1];
if (ci >= 0 && (!commentFile || commentFile.startsWith("--"))) fail("--comment-file 뒤에 파일 경로가 필요해요");
if (commentFile && kind !== "daily") fail("--comment-file 은 daily 에서만 써요");
let report;
try { report = JSON.parse(readFileSync(file, "utf8")); }
catch (e) { fail(`${file} 을 읽지 못했어요 (${e?.code ?? "JSON 형식 오류"})`); }
if (kind === "daily") { const m = dateMismatch(report, date); if (m) fail(m); }
if (commentFile) {
  let text;
  try { text = readFileSync(commentFile, "utf8").trim(); }
  catch (e) { fail(`${commentFile} 을 읽지 못했어요 (${e?.code ?? "읽기 오류"})`); }
  if (report !== null && typeof report === "object" && !Array.isArray(report)) report.comment = text; // 검증(비었는지·컬컴·전화번호)은 prepareSave 가
}
const { data, error } = prepareSave(kind, report);
if (error) fail(error);
await run(async () => {
  await upsert("mkd_reports", [{ date, kind, data, updated_at: new Date().toISOString() }], "date,kind");
  console.log(JSON.stringify({ ok: true, date, kind, flags: (data.flags ?? []).length }));
});
