// scripts/mkd 의 CLI 세 개(build-report · save-report · save-daily)를 진짜로 실행해 종료코드·출력·저장 내용을 본다.
// DB 대신 이 파일 안의 가짜 PostgREST 서버(127.0.0.1)를 쓴다 — 서비스 키 파일도 가짜. 운영·로컬 DB 에는 닿지 않는다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { toRowsPure } from "../scripts/mkd/rows.mjs";
import { shortSummary } from "../scripts/mkd/report.mjs";

const TEAMS = [{ id: 1, name: "대구동성로점", key: "dsr" }, { id: 2, name: "대구일본어중국어점", key: "jpcn" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "구미점", key: "gumi" }];
const END = "2026-10-28";
const S = (n) => fileURLToPath(new URL(`../scripts/mkd/${n}`, import.meta.url));
const put = (team_key, unit, metrics) => ({ team_key, unit, metrics });
const DAILY = [
  ...toRowsPure("naver_ad", END, { rows: [put("dsr", "대구_영어회화(검색광고)", { impressions: 500, clicks: 10, spend: 5000 })] }, TEAMS),
  ...toRowsPure("google_ad", END, { rows: [put("dsr", "대구_영어", { impressions: 80, clicks: 3, spend: 700, flags: ["광고 비승인 1건"] })] }, TEAMS),
  ...toRowsPure("jeonsan", END, { rows: [put("dsr", "전체", { inquiries: 3 })] }, TEAMS),
];

// 매출 장부(fin_rows): 거래형태·가입경로만 골라 읽은 모양. 대구동성로 10/27 가입 1(인스타) · 10/28 가입 2(네이버·지인소개) + 환불 1
const FIN = [{ team_id: 1, day: "2026-10-27", amount: 300000, type: "가입", path: "인스타" }, { team_id: 1, day: END, amount: 250000, type: "가입", path: "네이버" },
  { team_id: 1, day: END, amount: 250000, type: "가입", path: "지인소개" }, { team_id: 1, day: END, amount: -100000, type: "환불", path: "" }];
let server, tmp, envFile, writes, gets;
before(async () => {
  writes = []; gets = [];
  server = createServer((req, res) => {
    const chunks = []; req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const u = new URL(req.url, "http://x"), table = u.pathname.split("/").pop(), body = Buffer.concat(chunks).toString();
      if (req.method === "GET") {
        gets.push({ table, query: decodeURIComponent(u.search) });
        const first = (req.headers.range ?? "0-").startsWith("0-");
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(!first ? [] : table === "teams" ? TEAMS.map(({ id, name }) => ({ id, name })) : table === "mkd_daily" ? DAILY : table === "fin_rows" ? FIN : []));
      }
      writes.push({ method: req.method, table, query: u.search, body: body ? JSON.parse(body) : null });
      res.writeHead(req.method === "DELETE" ? 204 : 201); res.end();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  tmp = mkdtempSync(join(tmpdir(), "mkd-cli-"));
  envFile = join(tmp, "fake.env");
  writeFileSync(envFile, `SUPABASE_URL=http://127.0.0.1:${server.address().port}\nSUPABASE_SERVICE_ROLE_KEY=fake-key-for-test\n`);
});
after(() => { server.close(); rmSync(tmp, { recursive: true, force: true }); });

const file = (name, text) => { const p = join(tmp, name); writeFileSync(p, text); return p; };
const sh = (script, ...args) => new Promise((resolve) => {
  const p = spawn(process.execPath, [S(script), ...args], { env: { ...process.env, MK_ENV: envFile } });
  let out = "", err = ""; p.stdout.on("data", (c) => (out += c)); p.stderr.on("data", (c) => (err += c));
  p.on("close", (code) => resolve({ code, out, err }));
});
const reportWrites = () => writes.filter((w) => w.table === "mkd_reports");

test("build-report <D> out.json: 전체 JSON 은 파일로, stdout 은 요약 한 줄({status,flagCounts,flags,summary})만", async () => {
  const out = join(tmp, "r1.json");
  const r = await sh("build-report.mjs", END, out);
  assert.equal(r.code, 0, r.err);
  const line = r.out.trim();
  assert.ok(!line.includes("\n"), "한 줄이어야 해요");
  const short = JSON.parse(line);
  assert.deepEqual(Object.keys(short), ["status", "flagCounts", "flags", "summary"]);
  const full = JSON.parse(readFileSync(out, "utf8"));
  assert.equal(full.date, END);
  assert.ok(Array.isArray(full.teams) && full.teams.length === 4); // 파일엔 전체
  assert.deepEqual(short, shortSummary(full));                    // 요약은 파일에서 만든 것과 같다
  assert.deepEqual(short.flags.map((f) => f.slice(0, 2)), [["red", "대구동성로점"]]);
  assert.deepEqual(short.summary.map((x) => x[0]), ["문의", "등록", "총 광고비", "문의당 비용", "등록당 비용", "등록 › 메타", "등록 › 네이버", "등록 › 지인·재등록", "등록 › 기타"]);
  assert.ok(line.length < 3000);
  // 등록 = 매출 장부 '가입' (환불 제외) — 10/28 2건, 3일 3건, 매체별로도
  const enr = full.summary.find((x) => x.label === "등록").cells;
  assert.deepEqual([enr.d1.value, enr.d3.value], [2, 3]);
  assert.deepEqual(["메타", "네이버", "지인·재등록", "기타"].map((u) => full.summary.find((x) => x.label === `등록 › ${u}`).cells.d3.value), [1, 1, 1, 0]);
  assert.equal(full.summary.find((x) => x.label === "등록당 비용").cells.d1.value, 2850); // (5000+700)/2
  // 장부는 거래형태·가입경로·매출만 — 이름·전화번호가 든 vals 통째로는 읽지 않는다
  const q = gets.find((g) => g.table === "fin_rows").query;
  assert.match(q, /select=team_id,day,amount,type:vals->>거래형태,path:vals->>가입경로/);
  assert.doesNotMatch(q, /이름|전화번호|select=[^&]*\bvals(,|&|$)/);
});

test("build-report <D> (out.json 없이): 예전처럼 전체 JSON 을 stdout 으로", async () => {
  const r = await sh("build-report.mjs", END);
  assert.equal(r.code, 0, r.err);
  const full = JSON.parse(r.out);
  assert.equal(full.date, END);
  assert.equal(full.teams.length, 4);
});

test("save-report … --comment-file: 파일 내용을 trim 해서 comment 로 넣고 저장 (summary 는 저장하지 않는다)", async () => {
  const rep = join(tmp, "r2.json"), c = file("c2.txt", "\n  구글 비승인 광고가 1건 있어요.\n문의는 3건이에요.  \n\n");
  assert.equal((await sh("build-report.mjs", END, rep)).code, 0);
  writes.length = 0;
  const r = await sh("save-report.mjs", END, "daily", rep, "--comment-file", c);
  assert.equal(r.code, 0, r.err);
  const ok = JSON.parse(r.out);
  assert.deepEqual([ok.ok, ok.date, ok.kind, ok.flags], [true, END, "daily", 1]);
  assert.equal(reportWrites().length, 1);
  const saved = reportWrites()[0].body[0];
  assert.deepEqual([saved.date, saved.kind], [END, "daily"]);
  assert.equal(saved.data.comment, "구글 비승인 광고가 1건 있어요.\n문의는 3건이에요.");
  assert.deepEqual(Object.keys(saved.data), ["status", "flags", "flagCounts", "days", "comment"]);
});

test("save-report: --comment-file 이 report.json 의 옛 comment 를 덮어쓴다 (순서 무관)", async () => {
  const rep = join(tmp, "r3.json"), c = file("c3.txt", "새 코멘트");
  assert.equal((await sh("build-report.mjs", END, rep)).code, 0);
  const full = JSON.parse(readFileSync(rep, "utf8")); full.comment = "옛 코멘트";
  writeFileSync(rep, JSON.stringify(full));
  writes.length = 0;
  const r = await sh("save-report.mjs", END, "daily", rep, "--comment-file", c);
  assert.equal(r.code, 0, r.err);
  assert.equal(reportWrites()[0].body[0].data.comment, "새 코멘트");
});

test("save-report: 리포트 date 와 저장 날짜가 다르면 종료코드 2, 저장하지 않는다", async () => {
  const rep = join(tmp, "r4.json"), c = file("c4.txt", "코멘트");
  assert.equal((await sh("build-report.mjs", END, rep)).code, 0);
  writes.length = 0;
  const r = await sh("save-report.mjs", "2026-10-27", "daily", rep, "--comment-file", c);
  assert.equal(r.code, 2);
  assert.match(r.err, /리포트 날짜\(2026-10-28\)와 저장 날짜\(2026-10-27\)가 달라요/);
  assert.equal(r.out, "");
  assert.equal(writes.length, 0);
});

test("save-report: comment 파일이 비었거나 없거나 경로 없이 플래그만 있으면 종료코드 2, 저장하지 않는다", async () => {
  const rep = join(tmp, "r5.json");
  assert.equal((await sh("build-report.mjs", END, rep)).code, 0);
  writes.length = 0;
  const empty = await sh("save-report.mjs", END, "daily", rep, "--comment-file", file("c5.txt", " \n "));
  assert.equal(empty.code, 2); assert.match(empty.err, /comment 가 비어/);
  const missing = await sh("save-report.mjs", END, "daily", rep, "--comment-file", join(tmp, "없는파일.txt"));
  assert.equal(missing.code, 2); assert.match(missing.err, /읽지 못했어요/);
  const noPath = await sh("save-report.mjs", END, "daily", rep, "--comment-file");
  assert.equal(noPath.code, 2); assert.match(noPath.err, /--comment-file/);
  assert.equal(writes.length, 0);
});

test("save-report: 코멘트 파일의 컬컴·전화번호도 그대로 거부 (종료코드 2)", async () => {
  const rep = join(tmp, "r6.json");
  assert.equal((await sh("build-report.mjs", END, rep)).code, 0);
  writes.length = 0;
  const a = await sh("save-report.mjs", END, "daily", rep, "--comment-file", file("c6a.txt", "컬컴 문의가 늘었어요"));
  assert.equal(a.code, 2); assert.match(a.err, /컬컴/);
  const b = await sh("save-report.mjs", END, "daily", rep, "--comment-file", file("c6b.txt", "010-1234-5678 로 연락"));
  assert.equal(b.code, 2); assert.match(b.err, /전화번호/); assert.doesNotMatch(b.err, /1234/);
  assert.equal(writes.length, 0);
});

test("save-report: 예전 방식(report.json 안에 comment, --comment-file 없음)도 그대로 된다", async () => {
  const rep = join(tmp, "r7.json");
  assert.equal((await sh("build-report.mjs", END, rep)).code, 0);
  const full = JSON.parse(readFileSync(rep, "utf8")); full.comment = "안에 들어 있는 코멘트";
  writeFileSync(rep, JSON.stringify(full));
  writes.length = 0;
  const r = await sh("save-report.mjs", END, "daily", rep);
  assert.equal(r.code, 0, r.err);
  assert.equal(reportWrites()[0].body[0].data.comment, "안에 들어 있는 코멘트");
});

test("save-daily: 입력이 JSON 이 아니면 '입력 형식 오류: JSON 을 읽을 수 없어요' 종료코드 2 (1 이 아니다), 저장하지 않는다", async () => {
  writes.length = 0;
  const r = await sh("save-daily.mjs", "google_ad", END, file("bad.json", "{rows: [오류"));
  assert.equal(r.code, 2);
  assert.match(r.err, /입력 형식 오류: JSON 을 읽을 수 없어요/);
  assert.equal(r.out, "");
  assert.equal(writes.length, 0);
  const empty = await sh("save-daily.mjs", "google_ad", END, file("empty.json", ""));
  assert.equal(empty.code, 2); assert.match(empty.err, /JSON 을 읽을 수 없어요/);
});

test("save-daily: 올바른 JSON 은 저장되고 종료코드 0", async () => {
  writes.length = 0;
  const r = await sh("save-daily.mjs", "google_ad", END, file("ok.json", JSON.stringify({ rows: [put("dsr", "대구_영어", { impressions: 10, clicks: 1, spend: 100 })] })));
  assert.equal(r.code, 0, r.err);
  assert.equal(JSON.parse(r.out).saved, 1);
  assert.equal(writes.filter((w) => w.table === "mkd_daily" && w.method === "POST").length, 1);
});
