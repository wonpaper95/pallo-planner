// gads-check — 전산(jeonsan) 일일 현황의 gads_ 건수를 기간으로 합산하는 순수 계산(gads-check-rows.mjs)과 CLI(gads-check.mjs).
// CLI 는 DB 대신 이 파일 안의 가짜 PostgREST 서버(127.0.0.1)와 가짜 서비스 키 파일을 쓴다 — 운영·로컬 DB 에는 닿지 않는다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gadsCheck } from "../scripts/mkd/gads-check-rows.mjs";

const TEAMS = [{ id: 1, name: "대구동성로점", key: "dsr" }, { id: 2, name: "대구일본어중국어점", key: "jpcn" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "구미점", key: "gumi" }];
const row = (team_id, date, unit, inquiries, status = "ok", channel = "jeonsan") => ({ team_id, date, channel, unit, metrics: { inquiries }, status });
// 하루치 전산 행 한 벌: 세 지점 '전체' ok (+ 주어진 소스 행)
const day = (date, extra = []) => [row(1, date, "전체", 5), row(2, date, "전체", 3), row(3, date, "전체", 4), ...extra];

test("gadsCheck: 지점·캠페인 토큰별로 합산하고 총합을 낸다 (meta·homepage·기타·nad_ 는 세지 않는다)", () => {
  const rows = [
    ...day("2026-10-29", [row(1, "2026-10-29", "gads_daegu_en_search", 1), row(1, "2026-10-29", "meta", 2), row(3, "2026-10-29", "gads_ulsan_jp_search", 1), row(3, "2026-10-29", "homepage", 2), row(2, "2026-10-29", "기타", 1), row(2, "2026-10-29", "nad_daegu_jp", 1)]),
    ...day("2026-10-30", [row(1, "2026-10-30", "gads_daegu_en_search", 2), row(1, "2026-10-30", "gads_daegu_jp_search", 1), row(3, "2026-10-30", "gads_ulsan_pmax", 1)]),
  ];
  const r = gadsCheck(rows, TEAMS, "2026-10-29", "2026-10-30");
  assert.deepEqual(r.byTeam, { dsr: { gads_daegu_en_search: 3, gads_daegu_jp_search: 1 }, jpcn: {}, ulsan: { gads_ulsan_jp_search: 1, gads_ulsan_pmax: 1 } });
  assert.equal(r.total, 6);
  assert.deepEqual([r.from, r.to, r.days], ["2026-10-29", "2026-10-30", 2]);
});

test("gadsCheck: 기간 밖 날짜·다른 채널(구글 광고 행의 gads_ 이름 포함)은 합산하지 않는다", () => {
  const rows = [
    ...day("2026-10-28", [row(1, "2026-10-28", "gads_daegu_en_search", 7)]),   // 기간 앞
    ...day("2026-10-29", [row(1, "2026-10-29", "gads_daegu_en_search", 1), row(1, "2026-10-29", "gads_daegu_en_search", 5, "ok", "google_ad")]),
    ...day("2026-10-31", [row(1, "2026-10-31", "gads_daegu_en_search", 9)]),   // 기간 뒤
  ];
  const r = gadsCheck(rows, TEAMS, "2026-10-29", "2026-10-30");
  assert.equal(r.total, 1);
  assert.equal(r.days, 1);
});

test("gadsCheck: days = 전산 데이터가 있는 날 수 — 실패·로그인 필요뿐인 날과 행이 없는 날은 세지 않고 firstDate 는 첫 데이터 날", () => {
  const rows = [
    ...day("2026-10-27"),
    row(1, "2026-10-28", "전체", 0, "failed"), row(2, "2026-10-28", "전체", 0, "login_required"), row(3, "2026-10-28", "전체", 0, "failed"),
    // 10-29 는 행 없음
    ...day("2026-10-30"),
  ];
  const r = gadsCheck(rows, TEAMS, "2026-10-26", "2026-10-31");
  assert.equal(r.days, 2);
  assert.equal(r.firstDate, "2026-10-27");
});

test("gadsCheck: 데이터가 하나도 없으면 days 0, firstDate null, 세 지점은 빈 객체, total 0", () => {
  const r = gadsCheck([], TEAMS, "2026-10-10", "2026-10-29");
  assert.deepEqual(r, { from: "2026-10-10", to: "2026-10-29", days: 0, firstDate: null, incomplete: [], byTeam: { dsr: {}, jpcn: {}, ulsan: {} }, total: 0 });
});

test("gadsCheck: 실패 행에 붙은 gads_ 는 세지 않는다 (ok·partial 만)", () => {
  const rows = [...day("2026-10-29"), row(1, "2026-10-29", "gads_daegu_en_search", 4, "failed"), row(3, "2026-10-29", "gads_ulsan_pmax", 2, "partial")];
  const r = gadsCheck(rows, TEAMS, "2026-10-29", "2026-10-29");
  assert.deepEqual(r.byTeam.dsr, {});
  assert.deepEqual(r.byTeam.ulsan, { gads_ulsan_pmax: 2 });
});

test("gadsCheck: incomplete = 데이터는 있지만 어느 지점의 '전체' ok 행이 없는 날 (일부 지점 실패·열 없음 partial) — 그 날 gads_ 가 적을 수 있다", () => {
  const rows = [
    ...day("2026-10-29"),
    row(1, "2026-10-30", "전체", 5), row(2, "2026-10-30", "전체", 3, "partial"), row(3, "2026-10-30", "전체", 0, "failed"), // 지점 둘이 온전하지 않음
    row(1, "2026-10-31", "전체", 5), row(2, "2026-10-31", "전체", 3), // 울산 행 없음
  ];
  const r = gadsCheck(rows, TEAMS, "2026-10-29", "2026-10-31");
  assert.equal(r.days, 3);
  assert.deepEqual(r.incomplete, ["2026-10-30", "2026-10-31"]);
});

test("gadsCheck: 숫자가 아닌 문의 값(null 등)은 0 으로 본다, 같은 토큰이 날마다 나오면 더한다", () => {
  const rows = [...day("2026-10-29", [{ team_id: 1, date: "2026-10-29", channel: "jeonsan", unit: "gads_daegu_en_search", metrics: { inquiries: null }, status: "ok" }]), ...day("2026-10-30", [row(1, "2026-10-30", "gads_daegu_en_search", 2)])];
  assert.deepEqual(gadsCheck(rows, TEAMS, "2026-10-29", "2026-10-30").byTeam.dsr, { gads_daegu_en_search: 2 });
});

test("gadsCheck: 모르는 지점(team_id)의 행은 무시한다", () => {
  const rows = [...day("2026-10-29"), row(99, "2026-10-29", "gads_daegu_en_search", 5)];
  assert.equal(gadsCheck(rows, TEAMS, "2026-10-29", "2026-10-29").total, 0);
});

test("gadsCheck: 날짜 형식이 틀리거나 시작이 끝보다 늦으면 던진다", () => {
  assert.throws(() => gadsCheck([], TEAMS, "2026-10-30", "2026-10-29"), /시작일/);
  assert.throws(() => gadsCheck([], TEAMS, "2026-13-01", "2026-10-29"), /YYYY-MM-DD/);
  assert.throws(() => gadsCheck([], TEAMS, "2026-10-01", "내일"), /YYYY-MM-DD/);
});

// ── CLI ──
const S = fileURLToPath(new URL("../scripts/mkd/gads-check.mjs", import.meta.url));
const DAILY = [
  ...day("2026-10-29", [row(1, "2026-10-29", "gads_daegu_en_search", 1), row(3, "2026-10-29", "gads_ulsan_pmax", 2), row(3, "2026-10-29", "meta", 4)]),
];
let server, tmp, envFile, requests;
before(async () => {
  requests = [];
  server = createServer((req, res) => {
    const u = new URL(req.url, "http://x"), table = u.pathname.split("/").pop();
    requests.push({ method: req.method, table, query: u.search });
    const first = (req.headers.range ?? "0-").startsWith("0-");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(!first ? [] : table === "teams" ? TEAMS.map(({ id, name }) => ({ id, name })) : table === "mkd_daily" ? DAILY : []));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  tmp = mkdtempSync(join(tmpdir(), "mkd-gads-"));
  envFile = join(tmp, "fake.env");
  writeFileSync(envFile, `SUPABASE_URL=http://127.0.0.1:${server.address().port}\nSUPABASE_SERVICE_ROLE_KEY=fake-key-for-test\n`);
});
after(() => { server.close(); rmSync(tmp, { recursive: true, force: true }); });
const sh = (...args) => new Promise((resolve) => {
  const p = spawn(process.execPath, [S, ...args], { env: { ...process.env, MK_ENV: envFile } });
  let out = "", err = ""; p.stdout.on("data", (c) => (out += c)); p.stderr.on("data", (c) => (err += c));
  p.on("close", (code) => resolve({ code, out, err }));
});

test("gads-check CLI: JSON 한 줄 {from,to,days,…,byTeam,total}, 읽기만 한다 (GET 만)", async () => {
  requests.length = 0;
  const r = await sh("2026-10-29", "2026-10-29");
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.trim().includes("\n"), "한 줄이어야 해요");
  const j = JSON.parse(r.out);
  assert.deepEqual([j.from, j.to, j.days, j.total], ["2026-10-29", "2026-10-29", 1, 3]);
  assert.deepEqual(j.byTeam, { dsr: { gads_daegu_en_search: 1 }, jpcn: {}, ulsan: { gads_ulsan_pmax: 2 } });
  assert.ok(requests.length > 0 && requests.every((q) => q.method === "GET"));
  const q = requests.find((x) => x.table === "mkd_daily").query;
  assert.match(q, /channel=eq\.jeonsan/); assert.match(q, /date=gte\.2026-10-29/); assert.match(q, /date=lte\.2026-10-29/);
});

test("gads-check CLI: 날짜가 틀리거나 인자가 없거나 시작이 끝보다 늦으면 종료코드 2 (출력 없음)", async () => {
  for (const args of [[], ["2026-10-29"], ["2026-13-01", "2026-10-29"], ["2026-10-30", "2026-10-29"]]) {
    const r = await sh(...args);
    assert.equal(r.code, 2, JSON.stringify(args)); assert.equal(r.out, "");
  }
});
