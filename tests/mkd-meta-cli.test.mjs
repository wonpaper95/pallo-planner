// scripts/mkd/meta-ad.mjs 를 진짜로 실행해 새로고침·환율·0 줄 처리·저장·종료코드를 본다.
// DB 는 이 파일 안의 가짜 PostgREST 서버, 환율은 가짜 서버(MKD_FX_BASE), pull-meta 는 가짜 스크립트(MKD_PULL_META) — 서비스 키 파일도 가짜. 운영 DB·메타 API 에는 닿지 않는다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TEAMS = [{ id: 1, name: "대구동성로점" }, { id: 2, name: "대구일본어중국어점" }, { id: 3, name: "울산점" }, { id: 4, name: "구미점" }];
const DAY = "2026-10-29";
const CLI = fileURLToPath(new URL("../scripts/mkd/meta-ad.mjs", import.meta.url));
const ad = (team_id, campaign, ad_name, o = {}) => ({ team_id, date: DAY, ad_name, campaign, adset: "세트", impressions: 100, clicks: 5, leads: 1, spend: 10, ...o });

let db, fx, tmp, envFile, writes, st, fxHits;
// st: 시험마다 바꾸는 가짜 DB·환율 상태
const reset = () => { writes.length = 0; fxHits.length = 0; st = { ads: [], recent: [], past: [], fxDay: 1400, fxLatest: 1380, fxJsonDate: null }; };
before(async () => {
  writes = []; fxHits = [];
  db = createServer((req, res) => {
    const chunks = []; req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const u = new URL(req.url, "http://x"), table = u.pathname.split("/").pop(), body = Buffer.concat(chunks).toString();
      if (req.method === "GET") {
        const first = (req.headers.range ?? "0-").startsWith("0-"), q = u.searchParams;
        let rows = [];
        if (first && table === "teams") rows = TEAMS;
        else if (first && table === "mk_ad_daily") rows = q.get("date")?.startsWith("eq.") ? st.ads : st.recent; // 그날 줄 / 직전 7일 지점 목록
        else if (first && table === "mkd_daily") rows = st.past;
        res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(rows));
      }
      writes.push({ method: req.method, table, query: u.search, body: body ? JSON.parse(body) : null });
      res.writeHead(req.method === "DELETE" ? 204 : 201); res.end();
    });
  });
  fx = createServer((req, res) => {
    const day = new URL(req.url, "http://x").pathname.slice(1); fxHits.push(day);
    const v = day === "latest" ? st.fxLatest : st.fxDay;
    if (v === null) { res.writeHead(503); return res.end("{}"); }
    res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ amount: 1, base: "USD", date: st.fxJsonDate ?? day, rates: { KRW: v } })); // fxJsonDate: 주말·휴일이면 서버가 앞 영업일 날짜로 답한다
  });
  await Promise.all([db, fx].map((s) => new Promise((r) => s.listen(0, "127.0.0.1", r))));
  tmp = mkdtempSync(join(tmpdir(), "mkd-meta-cli-"));
  envFile = join(tmp, "fake.env");
  writeFileSync(envFile, `SUPABASE_URL=http://127.0.0.1:${db.address().port}\nSUPABASE_SERVICE_ROLE_KEY=fake-key-for-test\n`);
  reset();
});
after(() => { db.close(); fx.close(); rmSync(tmp, { recursive: true, force: true }); });

const file = (name, text) => { const p = join(tmp, name); writeFileSync(p, text); return p; };
const NO_TOKEN_FILE = () => join(tmp, "no-such-token.txt");
// extra 로 환경을 덧씌운다. 토큰 파일 기본값 = 없는 경로(새로고침 건너뜀), 환율 서버 = 가짜
const sh = (args, extra = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, MK_ENV: envFile, META_TOKEN_FILE: NO_TOKEN_FILE(), MKD_FX_BASE: `http://127.0.0.1:${fx.address().port}`, ...extra } });
  let out = "", err = ""; p.stdout.on("data", (c) => (out += c)); p.stderr.on("data", (c) => (err += c));
  p.on("close", (code) => resolve({ code, out, err, last: (() => { try { return JSON.parse(out.trim().split("\n").at(-1)); } catch { return null; } })() }));
});
const mkdWrites = () => writes.filter((w) => w.table === "mkd_daily" && w.method === "POST");
const FAKE_TOKEN = "EAAGm0PX4ZCpsBAKZCtoken1234567890abcdefXYZ";

test("--print: 새로고침·저장 없이 행과 요약만, 환율은 당일 값", async () => {
  reset(); st.ads = [ad(1, "대구 영어", "a", { spend: 10 }), ad(1, "대구 영어", "b", { spend: 5 }), ad(3, "울산 영어", "c", { spend: 2.5, leads: 4 })];
  const r = await sh([DAY, "--print"]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual([r.last.ok, r.last.date, r.last.refresh, r.last.fx, r.last.fxSource, r.last.saved], [true, DAY, "skipped (--print)", 1400, "당일", 0]);
  assert.deepEqual(r.last.teams, { 대구동성로점: { spend: 21000, spend_usd: 15, leads: 2 }, 울산점: { spend: 3500, spend_usd: 2.5, leads: 4 } });
  assert.equal(writes.length, 0, "print 는 아무것도 쓰지 않는다");
  assert.deepEqual(fxHits, [DAY]);
});

test("저장: 토큰 파일이 없으면 새로고침 건너뜀, 캠페인 행이 mkd_daily 로 한 번에 들어가고 옛 '전체' 행은 정리된다", async () => {
  reset(); st.ads = [ad(1, "대구 영어", "a", { spend: 10, impressions: 100, clicks: 4, leads: 1 }), ad(1, "대구 영어", "b", { spend: 5, impressions: 50, clicks: 2, leads: 0 }), ad(2, "대구 일중", "c", { spend: 1 })];
  const r = await sh([DAY]);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual([r.last.ok, r.last.refresh, r.last.saved, r.last.fx], [true, "skipped (토큰 없음 — 맥북 적재 데이터 사용)", 2, 1400]);
  const posts = mkdWrites(); assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body.map((x) => [x.team_id, x.channel, x.date, x.unit, x.status, x.metrics.spend, x.metrics.fx]), [[1, "meta_ad", DAY, "대구 영어", "ok", 21000, 1400], [2, "meta_ad", DAY, "대구 일중", "ok", 1400, 1400]]);
  assert.deepEqual(posts[0].body[0].metrics, { impressions: 150, clicks: 6, leads: 1, spend_usd: 15, fx: 1400, spend: 21000 });
  assert.ok(writes.some((w) => w.method === "DELETE" && w.query.includes("channel=eq.meta_ad") && w.query.includes("team_id=in.(1,2)")));
});

test("새로고침: 토큰 파일이 있으면 pull-meta 를 --from D --to D 로 실행하고 성공하면 'ok', 토큰은 인자·출력에 없다", async () => {
  reset(); st.ads = [ad(1, "A", "a")];
  const token = file("token.txt", "FAKE"), argsOut = join(tmp, "pull-args.json");
  const fake = file("fake-pull-ok.mjs", `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(argsOut)}, JSON.stringify(process.argv.slice(2))); console.log("잡음"); console.log(JSON.stringify({ ok: true, daily: 1 }));`);
  const r = await sh([DAY], { META_TOKEN_FILE: token, MKD_PULL_META: fake });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.last.refresh, "ok");
  assert.deepEqual(JSON.parse(readFileSync(argsOut, "utf8")), ["--from", DAY, "--to", DAY]);
  assert.equal(mkdWrites()[0].body.length, 1);
});

test("새로고침이 실패해도 있는 데이터로 계속한다 (refresh 에 가려진 이유, 종료코드 0)", async () => {
  reset(); st.ads = [ad(1, "A", "a")];
  const token = file("token2.txt", "FAKE");
  const fake = file("fake-pull-bad.mjs", `console.error("실패: 메타 API 190: Error validating access token ?access_token=${FAKE_TOKEN} (2026-10-29~2026-10-29)"); process.exit(1);`);
  const r = await sh([DAY], { META_TOKEN_FILE: token, MKD_PULL_META: fake });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.last.refresh, "failed: 메타 API 190", "메타가 보낸 문장은 버리고 코드만");
  for (const t of [r.out, r.err, JSON.stringify(writes)]) assert.doesNotMatch(t, /EAAGm0|abcdefXYZ|1234567890|2026-10-29~|Error validating/);
  assert.equal(r.last.saved, 1);
});

test("환율: 당일이 실패하면 직전에 저장한 fx, 그것도 없으면 latest, 모두 실패하면 비용 null + partial (종료코드 0)", async () => {
  reset(); st.ads = [ad(1, "A", "a", { spend: 10 })]; st.fxDay = null; st.past = [{ date: "2026-10-27", metrics: { fx: 1390 } }, { date: "2026-10-28", metrics: { fx: 1395.5 } }];
  let r = await sh([DAY, "--print"]);
  assert.deepEqual([r.code, r.last.fx, r.last.fxSource, r.last.teams.대구동성로점.spend], [0, 1395.5, "직전 저장값", 13955]);
  st.past = []; r = await sh([DAY, "--print"]);
  assert.deepEqual([r.code, r.last.fx, r.last.fxSource, r.last.teams.대구동성로점.spend], [0, 1380, "최신", 13800]);
  st.fxLatest = null; r = await sh([DAY, "--print"]);
  assert.deepEqual([r.code, r.last.fx, r.last.fxSource, r.last.teams.대구동성로점.spend, r.last.teams.대구동성로점.spend_usd], [0, null, "없음", null, 10]);
  r = await sh([DAY]);
  const body = mkdWrites()[0].body[0];
  assert.deepEqual([body.status, body.metrics.spend, body.metrics.fx, body.metrics.note], ["partial", null, null, "환율 못 받음"]);
});

test("그날 줄 0 + 새로고침 건너뜀: 직전 7일에 있던 지점에만 '전체' failed 행, 종료코드 1, 출력은 ok:false", async () => {
  reset(); st.recent = [{ team_id: 1, date: "2026-10-28" }, { team_id: 3, date: "2026-10-25" }, { team_id: 1, date: "2026-10-25" }];
  const r = await sh([DAY]);
  assert.equal(r.code, 1);
  assert.deepEqual([r.last.ok, r.last.saved, r.last.fx], [false, 2, null]);
  assert.match(r.err, /^실패: 메타 광고 수집 실패/);
  assert.deepEqual(mkdWrites()[0].body.map((x) => [x.team_id, x.unit, x.status, x.metrics.note]), [[1, "전체", "failed", "메타 데이터 아직 없음(skipped (토큰 없음 — 맥북 적재 데이터 사용))"], [3, "전체", "failed", "메타 데이터 아직 없음(skipped (토큰 없음 — 맥북 적재 데이터 사용))"]]);
  assert.deepEqual(fxHits, [], "줄이 없으면 환율을 조회하지 않는다");
});

test("그날 줄 0 + 새로고침 성공: 직전 7일에 있던 지점에 '메타 집행 없음' 0 행, 종료코드 0", async () => {
  reset(); st.recent = [{ team_id: 2, date: "2026-10-27" }];
  const token = file("token3.txt", "FAKE"), fake = file("fake-pull-ok2.mjs", `console.log(JSON.stringify({ ok: true, daily: 0 }));`);
  const r = await sh([DAY], { META_TOKEN_FILE: token, MKD_PULL_META: fake });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.last.refresh, "ok");
  assert.deepEqual(mkdWrites()[0].body.map((x) => [x.team_id, x.unit, x.status, x.metrics.spend, x.metrics.note]), [[2, "전체", "ok", 0, "메타 집행 없음"]]);
});

test("그날 줄 0 + 직전 7일도 0: 새로고침 건너뜀이면 모든 지점에 failed, 성공이면 아무것도 저장하지 않는다", async () => {
  reset();
  let r = await sh([DAY]);
  assert.equal(r.code, 1);
  assert.deepEqual(mkdWrites()[0].body.map((x) => [x.team_id, x.unit, x.status]), TEAMS.map((t) => [t.id, "전체", "failed"]));
  reset();
  const token = file("token4.txt", "FAKE"), fake = file("fake-pull-ok3.mjs", `console.log(JSON.stringify({ ok: true }));`);
  r = await sh([DAY], { META_TOKEN_FILE: token, MKD_PULL_META: fake });
  assert.equal(r.code, 0, r.err); assert.equal(r.last.saved, 0); assert.equal(writes.length, 0);
});

test("새로고침: 자식이 죽으면(스택) 처음 'Error:' 줄만 쓰고 경로·긴 덩어리는 #", async () => {
  reset(); st.ads = [ad(1, "A", "a")];
  const token = file("token-crash.txt", "FAKE");
  const fake = file("fake-pull-crash.mjs", `throw new Error("boom cannot open /Users/x/Downloads/GEO:SEO 스킬/meta-ads/meta-token.txt");`);
  const r = await sh([DAY], { META_TOKEN_FILE: token, MKD_PULL_META: fake });
  assert.equal(r.code, 0, r.err);
  assert.match(r.last.refresh, /^failed: Error: boom cannot open /);
  for (const t of [r.out, r.err, JSON.stringify(writes)]) assert.doesNotMatch(t, /meta-token|GEO:SEO|\/Users\/x/);
  assert.equal(r.last.saved, 1);
});

test("토큰 파일이 있는데 읽을 권한이 없으면 '토큰 읽기 권한 없음' 으로 건너뜀 (없는 파일은 '토큰 없음' 그대로), 있는 데이터로 계속", { skip: process.getuid?.() === 0 ? "root 는 권한 검사를 건너뜀" : false }, async () => {
  reset(); st.ads = [ad(1, "A", "a")];
  const token = file("token-noperm.txt", "FAKE"), argsOut = join(tmp, "noperm-args.json");
  chmodSync(token, 0o000);
  const fake = file("fake-pull-noperm.mjs", `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(argsOut)}, "ran"); console.log(JSON.stringify({ ok: true }));`);
  try {
    const r = await sh([DAY], { META_TOKEN_FILE: token, MKD_PULL_META: fake });
    assert.equal(r.code, 0, r.err);
    assert.equal(r.last.refresh, "skipped (토큰 읽기 권한 없음)");
    assert.throws(() => readFileSync(argsOut), /ENOENT/, "권한이 없으면 pull-meta 를 실행하지 않는다");
    assert.equal(r.last.saved, 1);
    st.ads = []; st.recent = [{ team_id: 1, date: "2026-10-28" }];
    const r2 = await sh([DAY], { META_TOKEN_FILE: token, MKD_PULL_META: fake });
    assert.equal(r2.code, 1);
    assert.equal(mkdWrites().at(-1).body[0].metrics.note, "메타 데이터 아직 없음(skipped (토큰 읽기 권한 없음))");
  } finally { chmodSync(token, 0o600); }
});

test("환율: 응답 날짜가 요청한 날과 다르면(주말·휴일) fxSource 는 '직전 영업일(응답 날짜)'", async () => {
  reset(); st.ads = [ad(1, "A", "a", { spend: 10 })]; st.fxJsonDate = "2026-10-28";
  const r = await sh([DAY, "--print"]);
  assert.deepEqual([r.code, r.last.fx, r.last.fxSource, r.last.teams.대구동성로점.spend], [0, 1400, "직전 영업일(2026-10-28)", 14000]);
});

test("환율: 500~3000 밖의 값은 무효로 보고 다음 단계로 (당일 → 직전 저장값 → latest → 없음)", async () => {
  reset(); st.ads = [ad(1, "A", "a", { spend: 10 })]; st.fxDay = 14000; st.past = [{ date: "2026-10-28", metrics: { fx: 1395.5 } }];
  let r = await sh([DAY, "--print"]);
  assert.deepEqual([r.code, r.last.fx, r.last.fxSource], [0, 1395.5, "직전 저장값"]);
  st.past = [{ date: "2026-10-28", metrics: { fx: 3.2 } }]; st.fxLatest = 1380; // 저장값도 범위 밖 → latest
  r = await sh([DAY, "--print"]);
  assert.deepEqual([r.code, r.last.fx, r.last.fxSource], [0, 1380, "최신"]);
  st.fxDay = 499; st.fxLatest = 3001; st.past = [];
  r = await sh([DAY, "--print"]);
  assert.deepEqual([r.code, r.last.fx, r.last.fxSource, r.last.teams.대구동성로점.spend], [0, null, "없음", null]);
});

test("줄이 있는 날: 직전 7일에 있었는데 그날 줄이 없는 지점에 '메타 집행 없음' 0 행 (새로고침 건너뜀이어도), 7일 안에 없던 지점(구미)은 없음, 종료코드 0", async () => {
  reset(); st.ads = [ad(1, "대구 영어", "a", { spend: 10 })];
  st.recent = [{ team_id: 1, date: "2026-10-28" }, { team_id: 2, date: "2026-10-27" }, { team_id: 3, date: "2026-10-23" }, { team_id: 3, date: "2026-10-28" }];
  const r = await sh([DAY]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.last.refresh, "skipped (토큰 없음 — 맥북 적재 데이터 사용)");
  assert.deepEqual([r.last.ok, r.last.saved], [true, 3]);
  const posts = mkdWrites(); assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body.map((x) => [x.team_id, x.unit, x.status, x.metrics.spend, x.metrics.note]), [[1, "대구 영어", "ok", 14000, undefined], [2, "전체", "ok", 0, "메타 집행 없음"], [3, "전체", "ok", 0, "메타 집행 없음"]]);
  assert.deepEqual(r.last.teams, { 대구동성로점: { spend: 14000, spend_usd: 10, leads: 1 }, 대구일본어중국어점: { spend: 0, spend_usd: 0, leads: 0 }, 울산점: { spend: 0, spend_usd: 0, leads: 0 } });
  assert.equal(posts[0].body.some((x) => x.team_id === 4), false);
  assert.ok(writes.some((w) => w.method === "DELETE" && w.query.includes("team_id=in.(1)")), "캠페인 행을 쓴 지점만 옛 '전체' 행 정리");
  // --print 도 같은 행을 보여준다
  const p = await sh([DAY, "--print"]);
  const lines = p.out.trim().split("\n"); // 앞은 행 배열(여러 줄), 마지막 줄이 요약
  assert.deepEqual(JSON.parse(lines.slice(0, -1).join("\n")).map((x) => [x.team_key, x.unit]), [["dsr", "대구 영어"], ["jpcn", "전체"], ["ulsan", "전체"]]);
});

test("시험용 환경변수(MKD_FX_BASE)는 MK_ENV 가 없으면 무시된다 — 가짜 환율 서버는 불리지 않는다 (DB 설정은 HOME 의 가짜 파일, --print 라 쓰기·새로고침 없음)", async () => {
  reset(); st.ads = [ad(1, "A", "a", { spend: 10 })];
  const home = join(tmp, "home"); mkdirSync(join(home, ".config", "pallo"), { recursive: true });
  writeFileSync(join(home, ".config", "pallo", "marketing.env"), `SUPABASE_URL=http://127.0.0.1:${db.address().port}\nSUPABASE_SERVICE_ROLE_KEY=fake-key-for-test\n`);
  const r = await sh([DAY, "--print"], { MK_ENV: undefined, HOME: home }); // 진짜 환율 서버(frankfurter)에는 읽기 요청이 간다 — 닿지 않으면 직전 저장값·없음으로 넘어갈 뿐
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(fxHits, [], "MKD_FX_BASE 가 무시돼 가짜 환율 서버는 한 번도 안 불린다");
  assert.equal(writes.length, 0);
});

test("날짜 인자가 틀리면 종료코드 2 (아무것도 읽거나 쓰지 않는다)", async () => {
  reset();
  for (const bad of [[], ["2026-13-40"], ["어제"]]) { const r = await sh(bad); assert.equal(r.code, 2, bad.join(" ")); }
  assert.equal(writes.length, 0);
});
