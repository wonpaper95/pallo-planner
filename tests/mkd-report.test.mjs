import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, prepareSave, slim, reportFrom } from "../scripts/mkd/report.mjs";
import { toRowsPure, D as DC } from "../scripts/mkd/rows.mjs";

const TEAMS = [{ id: 1, name: "대구동성로점", key: "dsr" }, { id: 2, name: "대구일본어중국어점", key: "jpcn" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "구미점", key: "gumi" }];
const END = "2026-10-28", PREV = "2026-10-27";
const mk = (channel, date, input) => toRowsPure(channel, date, input, TEAMS);
const put = (team_key, unit, metrics) => ({ team_key, unit, metrics });
const cell = (r, label, key) => r.summary.find((l) => l.label === label).cells[key];

// 작은 고정 데이터 (이틀치). 손으로 계산한 기대값이 아래 테스트에 있다.
//   네이버: 구분 dsr 캠페인 2개 + 울산 1개  /  구글: dsr 1개(예비 결제 수단 경고, 이름에 옛 브랜드)  /  메타: 로그인 풀림(양일)  /  전산: dsr 만
const fixture = () => [
  ...mk("naver_ad", END, { rows: [put("dsr", "컬컴 영어 대구점_네이버플레이스", { impressions: 1000, clicks: 40, spend: 10000 }), put("dsr", "대구_영어회화(검색광고)", { impressions: 500, clicks: 10, spend: 5000 }), put("ulsan", "울산_영어(검색광고)", { impressions: 300, clicks: 12, spend: 3000 })] }),
  ...mk("naver_ad", PREV, { rows: [put("dsr", "컬컴 영어 대구점_네이버플레이스", { impressions: 900, clicks: 30, spend: 8000 }), put("dsr", "대구_영어회화(검색광고)", { impressions: 400, clicks: 8, spend: 4000 }), put("ulsan", "울산_영어(검색광고)", { impressions: 250, clicks: 10, spend: 2500 })] }),
  ...mk("google_ad", END, { rows: [put("dsr", "컬컴 영어 대구_구글검색", { impressions: 800, clicks: 38, spend: 7300, conversions: 1, flags: ["예비 결제 수단 없음"] })] }),
  ...mk("google_ad", PREV, { rows: [put("dsr", "컬컴 영어 대구_구글검색", { impressions: 700, clicks: 30, spend: 6000, conversions: 0 })] }),
  ...mk("meta_ad", END, { rows: [], status: "login_required", note: "로그인 풀림" }),
  ...mk("meta_ad", PREV, { rows: [], status: "login_required", note: "로그인 풀림" }),
  ...mk("jeonsan", END, { rows: [put("dsr", "전체", { inquiries: 3 }), put("dsr", "meta", { inquiries: 2 }), put("dsr", "gads_daegu_en_search", { inquiries: 1 })] }),
  ...mk("jeonsan", PREV, { rows: [put("dsr", "전체", { inquiries: 2 }), put("dsr", "meta", { inquiries: 1 }), put("dsr", "gads_daegu_en_search", { inquiries: 1 })] }),
];

test("reportFrom: 기준일 포함 56일 앞", () => {
  assert.equal(reportFrom("2026-10-28"), "2026-09-03");
  assert.equal(DC.addDays("2026-09-03", 55), "2026-10-28");
});

test("slim: 값·증감·데이터 일수(prevDays 포함)만, 반올림", () => {
  const line = { label: "문의당 비용", unit: "krw", good: "down", metric: "x", cells: [{ key: "d1", value: 8433.333333, prev: 1, change: -0.1772357, days: 1, prevDays: 1, hold: false }, { key: "d3", value: null, prev: null, change: null, days: 0, prevDays: 0, hold: false }] };
  assert.deepEqual(slim(line), { label: "문의당 비용", unit: "krw", cells: { d1: { value: 8433.33, change: -0.177, days: 1, prevDays: 1 }, d3: { value: null, change: null, days: 0, prevDays: 0 } } });
});

test("buildReport: 모양 — date·days·status·summary·flags·flagCounts·teams", () => {
  const r = buildReport(fixture(), TEAMS, END);
  assert.deepEqual(Object.keys(r), ["date", "days", "status", "summary", "flags", "flagCounts", "teams"]);
  assert.equal(r.date, END);
  assert.equal(r.days, 2);
  assert.deepEqual(r.summary.map((l) => l.label), ["문의", "등록", "총 광고비", "문의당 비용"]);
  assert.deepEqual(r.teams.map((t) => [t.team_id, t.team, t.days]), [[1, "대구동성로점", 2], [2, "대구일본어중국어점", 2], [3, "울산점", 2], [4, "구미점", 2]]);
  for (const t of r.teams) assert.deepEqual(Object.keys(t).sort(), ["days", "flags", "status", "summary", "team", "team_id"]);
  for (const l of [...r.summary, ...r.teams.flatMap((t) => t.summary)]) assert.deepEqual(Object.keys(l.cells), ["d1", "d3", "w1", "w2", "w4"]);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), r); // JSON 으로 오가도 그대로 (undefined·NaN 없음)
});

test("buildReport: 채널 상태 — 전체와 팀별", () => {
  const r = buildReport(fixture(), TEAMS, END);
  assert.deepEqual(r.status, { naver_ad: "ok", google_ad: "ok", meta_ad: "login_required", blog: "missing", daangn: "missing", jeonsan: "ok" });
  const t = (id) => r.teams.find((x) => x.team_id === id);
  assert.deepEqual(t(1).status, r.status);
  assert.deepEqual(t(2).status, { naver_ad: "missing", google_ad: "missing", meta_ad: "login_required", blog: "missing", daangn: "missing", jeonsan: "missing" });
  assert.deepEqual(t(3).status, { naver_ad: "ok", google_ad: "missing", meta_ad: "login_required", blog: "missing", daangn: "missing", jeonsan: "missing" });
});

// 손계산 — 전체: 광고비 D = 네이버 (10000+5000)+3000 + 구글 7300 = 25300, 전날 = (8000+4000)+2500 + 6000 = 20500. 문의 D 3, 전날 2.
test("buildReport: 전체 핵심 4개 — d1·d3 (손계산)", () => {
  const r = buildReport(fixture(), TEAMS, END);
  assert.deepEqual(cell(r, "문의", "d1"), { value: 3, change: 0.5, days: 1, prevDays: 1 });                       // (3-2)/2
  assert.deepEqual(cell(r, "문의", "d3"), { value: 5, change: null, days: 2, prevDays: 0 });                      // 3+2, 직전 3일 비어 증감 보류
  assert.deepEqual(cell(r, "총 광고비", "d1"), { value: 25300, change: 0.234, days: 1, prevDays: 1 });            // 4800/20500
  assert.deepEqual(cell(r, "총 광고비", "d3"), { value: 45800, change: null, days: 2, prevDays: 0 });             // 25300+20500
  assert.deepEqual(cell(r, "문의당 비용", "d1"), { value: 8433.33, change: -0.177, days: 1, prevDays: 1 });       // 25300/3 vs 20500/2=10250
  assert.deepEqual(cell(r, "문의당 비용", "d3"), { value: 9160, change: null, days: 2, prevDays: 0 });            // 45800/5
  assert.deepEqual(cell(r, "문의", "w4"), { value: 5, change: null, days: 2, prevDays: 0 });
});

test("buildReport: 등록은 데이터 출처가 없어도 줄은 남고 값은 null (0 을 지어내지 않는다)", () => {
  const r = buildReport(fixture(), TEAMS, END);
  const line = r.summary.find((l) => l.label === "등록");
  assert.ok(line);
  for (const c of Object.values(line.cells)) { assert.equal(c.value, null); assert.equal(c.change, null); }
  assert.deepEqual(line.cells.d1, { value: null, change: null, days: 1, prevDays: 1 });
});

test("buildReport: 팀별 핵심 4개 (손계산)", () => {
  const r = buildReport(fixture(), TEAMS, END), t = (id) => r.teams.find((x) => x.team_id === id);
  // 대구동성로(dsr): 광고비 D 10000+5000+7300=22300, 전날 8000+4000+6000=18000
  assert.deepEqual(cell(t(1), "총 광고비", "d1"), { value: 22300, change: 0.239, days: 1, prevDays: 1 });          // 4300/18000
  assert.deepEqual(cell(t(1), "총 광고비", "d3"), { value: 40300, change: null, days: 2, prevDays: 0 });
  assert.deepEqual(cell(t(1), "문의", "d1"), { value: 3, change: 0.5, days: 1, prevDays: 1 });
  assert.deepEqual(cell(t(1), "문의당 비용", "d1"), { value: 7433.33, change: -0.174, days: 1, prevDays: 1 });     // 22300/3 vs 18000/2=9000
  assert.deepEqual(cell(t(1), "문의당 비용", "d3"), { value: 8060, change: null, days: 2, prevDays: 0 });         // 40300/5
  // 울산: 광고비만 있고 전산 문의 행이 없다 → 문의·문의당 비용은 null (0 건이 아니라 "모름")
  assert.deepEqual(cell(t(3), "총 광고비", "d1"), { value: 3000, change: 0.2, days: 1, prevDays: 1 });
  assert.deepEqual(cell(t(3), "문의", "d1"), { value: null, change: null, days: 0, prevDays: 0 });
  assert.deepEqual(cell(t(3), "문의당 비용", "d1"), { value: null, change: null, days: 0, prevDays: 0 });
  // 광고·전산 행이 없는 팀: 전부 null
  for (const id of [2, 4]) for (const l of t(id).summary) for (const c of Object.values(l.cells)) assert.deepEqual(c, { value: null, change: null, days: 0, prevDays: 0 });
});

test("buildReport: 이상 징후 — 구글 결제 경고(red) + 팀마다 메타 로그인 필요 2일째(gray)", () => {
  const r = buildReport(fixture(), TEAMS, END);
  assert.deepEqual(r.flags.map((f) => [f.level, f.code, f.channel, f.team_id]), [["red", "account_issue", "google_ad", 1], ["gray", "missing", "meta_ad", 1], ["gray", "missing", "meta_ad", 2], ["gray", "missing", "meta_ad", 3], ["gray", "missing", "meta_ad", 4]]);
  assert.equal(r.flags[0].msg, "구글 검색광고 '컬컴 영어 대구_구글검색' 예비 결제 수단 없음");
  assert.equal(r.flags[0].team, "대구동성로점");
  assert.equal(r.flags[1].msg, "메타 광고 로그인 필요 2일째");
  assert.deepEqual(r.flagCounts, { red: 1, gray: 4 });
  assert.deepEqual(r.teams.map((t) => t.flags.length), [2, 1, 1, 1]);
  assert.deepEqual(r.teams.flatMap((t) => t.flags), r.flags); // 전체 flags = 팀별 이어붙임
});

test("buildReport: 기준일 밖(미래·56일 전) 행은 무시", () => {
  const extra = [...mk("jeonsan", "2026-10-29", { rows: [put("dsr", "전체", { inquiries: 99 })] }), ...mk("jeonsan", "2026-09-02", { rows: [put("dsr", "전체", { inquiries: 77 })] })];
  const a = buildReport(fixture(), TEAMS, END), b = buildReport([...fixture(), ...extra], TEAMS, END);
  assert.deepEqual(b, a);
  assert.equal(b.days, 2);
});

test("buildReport: 데이터가 하나도 없으면 전부 missing·null, 죽지 않는다", () => {
  const r = buildReport([], TEAMS, END);
  assert.equal(r.days, 0);
  assert.deepEqual(Object.values(r.status), Array(6).fill("missing"));
  assert.deepEqual(r.flags, []);
  assert.deepEqual(r.flagCounts, {});
  assert.equal(cell(r, "문의", "d1").value, null);
});

test("buildReport: 광고 멈춤 징후도 팀 이름표를 달고 전체 flags 에 모인다", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) { const d = DC.addDays(END, -i); rows.push(...mk("naver_ad", d, { rows: [put("ulsan", "울산_영어(검색광고)", { impressions: i < 3 ? 0 : 100, clicks: 0, spend: 0 })] })); }
  const r = buildReport(rows, TEAMS, END);
  assert.deepEqual(r.flags.map((f) => [f.level, f.code, f.team_id, f.team, f.unit]), [["red", "ad_stopped", 3, "울산점", "울산_영어(검색광고)"]]);
  assert.deepEqual(r.flagCounts, { red: 1 });
});

// ── 저장 검증 ──
const daily = (over = {}) => ({ ...buildReport(fixture(), TEAMS, END), comment: "구글 광고비가 올랐고 문의는 3건이에요.", ...over });

test("prepareSave daily: comment 가 없거나 비면 거부", () => {
  for (const c of [undefined, null, "", "   \n ", 5, ["a"]]) assert.match(prepareSave("daily", daily({ comment: c })).error, /comment/, JSON.stringify(c));
});
test("prepareSave daily: comment 에 컬컴/CULCOM(대소문자 무관)이 있으면 거부", () => {
  for (const c of ["컬컴 대구점 문의가 늘었어요", "CULCOM 광고", "새 culcom 소재"]) assert.match(prepareSave("daily", daily({ comment: c })).error, /컬컴|CULCOM/, c);
  assert.equal(prepareSave("daily", daily({ comment: "컬 컴 아님" })).error, undefined); // 정확히 붙은 표기만 본다
});
test("prepareSave daily: comment 에 전화번호처럼 보이는 값이 있으면 거부 (값은 메시지에 싣지 않는다)", () => {
  for (const c of ["010-1234-5678 로 연락했어요", "01012345678 문의", "053-123-4567 전화", "(053) 123-4567"]) {
    const e = prepareSave("daily", daily({ comment: c })).error;
    assert.match(e, /전화번호/, c);
    assert.doesNotMatch(e, /\d{4}/, c);
  }
});
test("prepareSave daily: 숫자가 많은 평범한 코멘트는 통과", () => {
  const c = "총 광고비 ₩25,300 (▲23%), 문의 3건, 문의당 ₩8,433. 네이버 40300 / 구글 7300.";
  assert.equal(prepareSave("daily", daily({ comment: c })).error, undefined);
});
test("prepareSave daily: flags·unit 이름에 컬컴이 있어도 comment 가 깨끗하면 통과 (옛 캠페인 이름)", () => {
  const r = daily();
  assert.match(JSON.stringify(r.flags), /컬컴/);
  const p = prepareSave("daily", r);
  assert.equal(p.error, undefined);
  assert.match(JSON.stringify(p.data.flags), /컬컴/);
});
test("prepareSave daily: 저장 모양 — teams 상세는 빼고 status·summary·flags·flagCounts·days·comment", () => {
  const p = prepareSave("daily", daily({ comment: "  좋은 아침이에요.  " }));
  assert.deepEqual(Object.keys(p.data), ["status", "summary", "flags", "flagCounts", "days", "comment"]);
  assert.equal(p.data.comment, "좋은 아침이에요.");
  assert.equal(p.data.days, 2);
  assert.equal(p.data.teams, undefined);
});
test("prepareSave daily: comment 는 600자까지", () => {
  assert.equal(prepareSave("daily", daily({ comment: "가".repeat(700) })).data.comment.length, 600);
});
test("prepareSave daily: status·summary 가 없는 파일(손으로 쓴 comment 뿐)은 기존 리포트를 덮어쓰지 않게 거부", () => {
  assert.match(prepareSave("daily", { comment: "코멘트만" }).error, /build-report/);
  assert.match(prepareSave("daily", daily({ summary: undefined })).error, /build-report/);
  assert.match(prepareSave("daily", daily({ status: undefined })).error, /build-report/);
});
test("prepareSave daily: flags·flagCounts 가 없으면 빈 값으로", () => {
  const p = prepareSave("daily", daily({ flags: undefined, flagCounts: undefined, days: undefined }));
  assert.deepEqual([p.data.flags, p.data.flagCounts, p.data.days], [[], {}, 0]);
});
test("prepareSave: 객체가 아닌 파일은 거부", () => {
  for (const r of [null, [], "x", 3]) assert.match(prepareSave("daily", r).error, /객체/);
});
test("prepareSave weekly: body 필수, 나머지 필드는 그대로, 컬컴 검사는 body 에만", () => {
  assert.match(prepareSave("weekly", { title: "x" }).error, /body/);
  assert.match(prepareSave("weekly", { body: " " }).error, /body/);
  assert.match(prepareSave("weekly", { body: "컬컴 이야기" }).error, /컬컴|CULCOM/);
  assert.match(prepareSave("weekly", { body: "문의 010 1234 5678" }).error, /전화번호/);
  const ok = prepareSave("weekly", { body: " 이번 주 요약 ", top: [{ unit: "컬컴 영어 대구점_네이버플레이스", spend: 100 }] });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.data, { body: "이번 주 요약", top: [{ unit: "컬컴 영어 대구점_네이버플레이스", spend: 100 }] });
});
test("prepareSave: 모르는 kind 는 던진다", () => {
  assert.throws(() => prepareSave("monthly", {}), /kind/);
});
