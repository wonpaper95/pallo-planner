import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const D = createRequire(import.meta.url)("../mkd-core.js");

// 행 만들기: row(날짜, 채널, 단위, metrics, 상태)
const row = (date, channel, unit, metrics, status = "ok") => ({ team_id: 2, date, channel, unit, metrics, status });
// 지점(team_id)을 지정한 행
const trow = (team, ...a) => ({ ...row(...a), team_id: team });
// 날짜 end 부터 거꾸로 n 일, 날마다 같은 metrics
const days = (end, n, channel, unit, metrics, status) => Array.from({ length: n }, (_, i) => row(D.addDays(end, -i), channel, unit, typeof metrics === "function" ? metrics(i) : metrics, status));
const END = "2026-10-28";

test("windowRange: 끝 날짜 포함 days 일과 직전 같은 길이", () => {
  assert.deepEqual(D.windowRange(END, 3), { from: "2026-10-26", to: END, pfrom: "2026-10-23", pto: "2026-10-25" });
  assert.deepEqual(D.windowRange(END, 1), { from: END, to: END, pfrom: "2026-10-27", pto: "2026-10-27" });
  assert.equal(D.addDays("2026-11-01", -1), "2026-10-31");
});

test("aggregate: 합계·평균·마지막·비율, 값 없으면 null", () => {
  const ms = [{ clicks: 10, impressions: 100, rank: 3, followers: 5 }, { clicks: 20, impressions: 100, rank: 5, followers: 7 }];
  assert.equal(D.aggregate(ms, "clicks"), 30);
  assert.equal(D.aggregate(ms, "rank"), 4);
  assert.equal(D.aggregate(ms, "followers"), 7);
  assert.equal(D.aggregate(ms, "ctr"), 0.15);
  assert.equal(D.aggregate(ms, "spend"), null);
  assert.equal(D.aggregate([{ clicks: 0, impressions: 0 }], "ctr"), null); // 0 으로 나누지 않음
  assert.equal(D.aggregate([{ clicks: "7" }], "clicks"), 7);           // 문자열 숫자도
});

test("pctChange: 직전 0·없음이면 null", () => {
  assert.equal(D.pctChange(120, 100), 0.2);
  assert.equal(D.pctChange(80, 100), -0.2);
  assert.equal(D.pctChange(5, 0), null);
  assert.equal(D.pctChange(null, 3), null);
  assert.equal(D.pctChange(3, null), null);
});

test("unitsOf·totalRows: 전체 행은 날짜마다 우선, 실패한 전체 행은 무시", () => {
  const rows = [row(END, "jeonsan", "전체", { inquiries: 3 }), row(END, "jeonsan", "meta", { inquiries: 2 }), row(END, "jeonsan", "gads_daegu_en_search", { inquiries: 1 }),
    row("2026-10-27", "jeonsan", "meta", { inquiries: 4 }), row("2026-10-26", "jeonsan", "전체", { note: "로그인" }, "login_required")];
  assert.deepEqual(D.unitsOf(rows), ["gads_daegu_en_search", "meta"]);
  const t = D.totalRows(rows);
  assert.deepEqual(t.map((r) => [r.date, r.unit]).sort(), [["2026-10-27", "meta"], [END, "전체"]]);
});

test("unitsOf: 가나다 순으로 안정적으로 정렬, 전체·중복 제외", () => {
  const rs = [row(END, "blog", "울산_영어", {}), row(END, "blog", "대구_영어", {}), row(END, "blog", "전체", {}), row("2026-10-27", "blog", "대구_영어", {}), row(END, "blog", "b", {}), row(END, "blog", "a", {})];
  const u = D.unitsOf(rs);
  assert.equal(u.length, 4);
  assert.deepEqual(u.filter((x) => /^[a-z]$/.test(x)), ["a", "b"]);          // 한글·영문 섞인 순서는 ICU 에 맡기고, 각각의 내부 순서만 고정
  assert.deepEqual(u.filter((x) => !/^[a-z]$/.test(x)), ["대구_영어", "울산_영어"]);
});

test("totalRows: 지점(team_id)·날짜마다 따로 고른다 (여러 지점 합계)", () => {
  // 두 지점의 전체 행이 같은 날 → 둘 다 남아 합산
  const both = [trow(1, END, "jeonsan", "전체", { inquiries: 3 }), trow(2, END, "jeonsan", "전체", { inquiries: 5 })];
  assert.equal(D.totalRows(both).length, 2);
  assert.equal(D.cell(D.totalRows(both), "inquiries", END, 1).value, 8);
  // 지점1 은 전체 행(+ unit 행), 지점2 는 unit 행만 → 지점1 의 전체가 지점2 의 unit 행을 가리면 안 됨
  const mixed = [trow(1, END, "jeonsan", "전체", { inquiries: 3 }), trow(1, END, "jeonsan", "meta", { inquiries: 3 }),
    trow(2, END, "jeonsan", "meta", { inquiries: 2 }), trow(2, END, "jeonsan", "gads", { inquiries: 4 })];
  const t = D.totalRows(mixed);
  assert.deepEqual(t.map((r) => [r.team_id, r.unit]), [[1, "전체"], [2, "meta"], [2, "gads"]]);
  assert.equal(D.cell(t, "inquiries", END, 1).value, 9);
  // 지점2 의 전체 행이 실패면 그 지점은 unit 행으로 센다
  const failedAll = [trow(1, END, "jeonsan", "전체", { inquiries: 3 }), trow(2, END, "jeonsan", "전체", { note: "x" }, "failed"), trow(2, END, "jeonsan", "meta", { inquiries: 2 })];
  assert.equal(D.cell(D.totalRows(failedAll), "inquiries", END, 1).value, 5);
});

test("cell: 단골(마지막 값)은 지점마다 마지막 값을 구해 더한다", () => {
  const rs = [trow(1, "2026-10-27", "daangn", "전체", { followers: 40 }), trow(1, END, "daangn", "전체", { followers: 50 }),
    trow(2, "2026-10-26", "daangn", "전체", { followers: 80 }), trow(2, END, "daangn", "전체", { followers: 100 })];
  assert.equal(D.cell(rs, "followers", END, 1).value, 150);
  assert.equal(D.cell(rs, "followers", END, 7).value, 150);
  // 지점마다 마지막 날이 달라도 각자 마지막 값
  const skew = [trow(1, "2026-10-27", "daangn", "전체", { followers: 40 }), trow(2, END, "daangn", "전체", { followers: 100 })];
  assert.equal(D.cell(skew, "followers", END, 7).value, 140);
  // 한 지점이면 그대로
  assert.equal(D.cell(rs.filter((r) => r.team_id === 2), "followers", END, 7).value, 100);
});

test("cell: 합계·직전 기간·증감·데이터 일수", () => {
  const rows = days(END, 6, "naver_ad", "대구 영어", { clicks: 10, impressions: 200, spend: 1000 });
  const d3 = D.cell(rows, "clicks", END, 3);
  assert.deepEqual(d3, { value: 30, prev: 30, change: 0, days: 3, prevDays: 3, hold: false });
  const w1 = D.cell(rows, "clicks", END, 7);
  assert.equal(w1.value, 60); assert.equal(w1.prev, null); assert.equal(w1.change, null); assert.equal(w1.days, 6); assert.equal(w1.prevDays, 0);
  const grown = days(END, 2, "naver_ad", "a", (i) => ({ clicks: i === 0 ? 15 : 10 }));
  assert.equal(D.cell(grown, "clicks", END, 1).change, 0.5);
});

test("cell: 직전 기간이 절반 미만이면 증감 없음, 절반 이상이면 하루 평균끼리 비교", () => {
  // 10일치: 직전 주간엔 3일뿐(< 4) → 증감 보류
  const ten = days(END, 10, "naver_ad", "a", { clicks: 10 });
  assert.deepEqual(D.cell(ten, "clicks", END, 7), { value: 70, prev: 30, change: null, days: 7, prevDays: 3, hold: false });
  // 11일치: 직전 주간 4일(>= 4) → 하루 평균이 같으니 0
  const eleven = days(END, 11, "naver_ad", "a", { clicks: 10 });
  const w = D.cell(eleven, "clicks", END, 7);
  assert.equal(w.prevDays, 4); assert.equal(w.prev, 40); assert.equal(w.change, 0);
  // 직전 주간 7일 중 5일만 있고 하루 값이 같으면 감소로 보이면 안 됨 (합계끼리 비교하면 -29%)
  const gap = days(END, 14, "naver_ad", "a", { clicks: 10 }).filter((r) => r.date !== "2026-10-16" && r.date !== "2026-10-17");
  const g = D.cell(gap, "clicks", END, 7);
  assert.equal(g.prevDays, 5); assert.equal(g.prev, 50); assert.equal(g.change, 0);
  // 하루 평균이 실제로 늘었으면 그 비율 (직전 5일 평균 10 → 이번 평균 20)
  const up = [...days(END, 7, "naver_ad", "a", { clicks: 20 }), ...days("2026-10-21", 5, "naver_ad", "a", { clicks: 10 })];
  assert.equal(D.cell(up, "clicks", END, 7).change, 1);
  // 일 단위(d1)는 직전 하루가 있어야, 3일은 직전 3일 중 2일 이상
  assert.equal(D.cell(days(END, 1, "naver_ad", "a", { clicks: 10 }), "clicks", END, 1).change, null);
  const d3 = [...days(END, 3, "naver_ad", "a", { clicks: 10 }), row("2026-10-25", "naver_ad", "a", { clicks: 10 }), row("2026-10-24", "naver_ad", "a", { clicks: 10 })];
  assert.equal(D.cell(d3, "clicks", END, 3).change, 0);
  assert.equal(D.cell(d3.slice(0, 4), "clicks", END, 3).change, null);   // 직전 3일 중 1일뿐
  // 평균·마지막 값 지표는 값끼리 그대로 비교 (직전 기간 절반 규칙은 같이 적용)
  const rk = [...days(END, 4, "blog", "k", { rank: 3 }), ...days("2026-10-24", 4, "blog", "k", { rank: 6 })];
  const r = D.cell(rk, "rank", END, 4);
  assert.equal(r.value, 3); assert.equal(r.prev, 6); assert.equal(r.change, -0.5);
});

test("cell: 비율 지표는 분모가 적으면 보류, 실패 행은 뺀다", () => {
  const small = days(END, 2, "naver_ad", "a", { clicks: 2, impressions: 20 });
  const c = D.cell(small, "ctr", END, 1);
  assert.equal(c.value, 0.1); assert.equal(c.hold, true); assert.equal(c.change, null);
  const big = days(END, 2, "naver_ad", "a", { clicks: 5, impressions: 50 });
  assert.equal(D.cell(big, "ctr", END, 1).hold, false);
  const withFail = [row(END, "google_ad", "전체", { note: "x" }, "failed"), row("2026-10-27", "google_ad", "대구_영어", { clicks: 4 })];
  const d = D.cell(D.totalRows(withFail), "clicks", END, 1);
  assert.equal(d.value, null); assert.equal(d.days, 0);
});

test("cell: 비율 지표 보류는 값이 있을 때만, 직전 기간 분모가 적어도 증감 없음", () => {
  // 데이터가 아예 없으면 보류가 아니라 그냥 빈 칸
  assert.deepEqual(D.cell([], "ctr", END, 1), { value: null, prev: null, change: null, days: 0, prevDays: 0, hold: false });
  // 이번 분모 충분 · 직전 분모(20) 부족 → hold 아님, 증감만 없음
  const thinPrev = [row(END, "naver_ad", "a", { clicks: 10, impressions: 100 }), row("2026-10-27", "naver_ad", "a", { clicks: 2, impressions: 20 })];
  const t = D.cell(thinPrev, "ctr", END, 1);
  assert.equal(t.value, 0.1); assert.equal(t.hold, false); assert.equal(t.change, null);
  // 둘 다 충분하면 증감 (CTR 10% → 20%)
  const enough = [row(END, "naver_ad", "a", { clicks: 20, impressions: 100 }), row("2026-10-27", "naver_ad", "a", { clicks: 10, impressions: 100 })];
  const e = D.cell(enough, "ctr", END, 1);
  assert.equal(e.hold, false); assert.equal(e.change, 1);
});

test("aggregate·cell: 비율은 분자·분모가 둘 다 있는 행만 합친다", () => {
  // 비용만 있고 클릭이 없는 partial 행이 CPC 를 부풀리면 안 됨
  assert.equal(D.aggregate([{ spend: 1000, clicks: 10 }, { spend: 5000 }], "cpc"), 100);
  assert.equal(D.aggregate([{ spend: 5000 }, { clicks: 10 }], "cpc"), null);
  assert.equal(D.aggregate([{ clicks: 5, impressions: 100 }, { impressions: 900 }], "ctr"), 0.05);
  const rs = [row(END, "naver_ad", "a", { spend: 3000, clicks: 30 }), row(END, "naver_ad", "b", { spend: 9000 }, "partial")];
  const c = D.cell(rs, "cpc", END, 1);
  assert.equal(c.value, 100); assert.equal(c.hold, false);        // 분모도 둘 다 있는 행(클릭 30)만 센다
});

test("cell: 실패·로그인 필요 행은 숫자가 있어도 빼고, partial 은 센다", () => {
  const failed = row(END, "naver_ad", "a", { clicks: 99 }, "failed"), login = row(END, "naver_ad", "b", { clicks: 99 }, "login_required"), part = row(END, "naver_ad", "c", { clicks: 5 }, "partial");
  const none = D.cell([failed, login], "clicks", END, 1);
  assert.equal(none.value, null); assert.equal(none.days, 0);
  const some = D.cell([failed, login, part], "clicks", END, 1);
  assert.equal(some.value, 5); assert.equal(some.days, 1);
  // 직전 기간의 실패 행도 prev·prevDays 에 들어가지 않는다
  const prevFail = D.cell([part, row("2026-10-27", "naver_ad", "a", { clicks: 99 }, "failed")], "clicks", END, 1);
  assert.equal(prevFail.prev, null); assert.equal(prevFail.prevDays, 0); assert.equal(prevFail.change, null);
  const prevPart = D.cell([part, row("2026-10-27", "naver_ad", "c", { clicks: 10 }, "partial")], "clicks", END, 1);
  assert.equal(prevPart.prev, 10); assert.equal(prevPart.prevDays, 1); assert.equal(prevPart.change, -0.5);
});

test("buildTable: 채널 순서, 있는 지표만, 블로그 순위는 unit 에서만", () => {
  const rows = [...days(END, 3, "google_ad", "대구_영어", { impressions: 100, clicks: 10, spend: 5000, conversions: 1 }), ...days(END, 3, "google_ad", "울산_영어", { impressions: 50, clicks: 5, spend: 2000, conversions: 0 }),
    ...days(END, 3, "blog", "동성로 영어회화", { rank: 2 }), ...days(END, 3, "blog", "방문자", { visitors: 40, views: 90 }),
    row(END, "jeonsan", "전체", { inquiries: 2, enrolls: 0 }), row(END, "jeonsan", "meta", { inquiries: 2, enrolls: 0 })];
  const t = D.buildTable(rows, END);
  assert.deepEqual(t.map((c) => c.channel), ["google_ad", "blog", "jeonsan"]);
  const g = t[0];
  assert.deepEqual(g.metrics.map((m) => m.metric), ["impressions", "clicks", "spend", "conversions", "ctr", "cpc"]);
  assert.equal(g.metrics[1].cells[1].value, 45);                  // 3일 클릭 = (10+5)×3
  assert.equal(g.metrics[1].cells[0].key, "d1");
  assert.deepEqual(g.units.map((u) => u.unit), ["대구_영어", "울산_영어"]);
  assert.equal(g.units[0].metrics.find((m) => m.metric === "spend").cells[2].value, 15000);
  const b = t[1];
  assert.deepEqual(b.metrics.map((m) => m.metric), ["visitors", "views"]);
  assert.deepEqual(b.units.find((u) => u.unit === "동성로 영어회화").metrics.map((m) => m.metric), ["rank"]);
  assert.equal(b.units.find((u) => u.unit === "동성로 영어회화").metrics[0].cells[1].value, 2);
  const j = t[2];
  assert.equal(j.metrics[0].cells[0].value, 2); assert.deepEqual(j.units.map((u) => u.unit), ["meta"]);
});

test("buildTable: partial 행은 세고 실패 행은 숫자가 있어도 뺀다", () => {
  const rows = [row(END, "naver_ad", "대구", { clicks: 5, impressions: 100 }, "partial"), row(END, "naver_ad", "울산", { clicks: 99, impressions: 999 }, "failed")];
  const n = D.buildTable(rows, END)[0];
  assert.equal(n.metrics.find((m) => m.metric === "clicks").cells[0].value, 5);
  assert.equal(n.metrics.find((m) => m.metric === "impressions").cells[0].value, 100);
  assert.deepEqual(n.units.map((u) => u.unit), ["대구"]);
});

test("buildTable: 전부 실패한 unit 은 빼고, 전체 행만 실패한 채널은 머리줄로 남긴다", () => {
  const rows = [row(END, "google_ad", "대구_영어", { clicks: 4 }), row(END, "google_ad", "울산_영어", { clicks: 99 }, "failed"),
    row(END, "daangn", "전체", { note: "로그인" }, "login_required")];
  const t = D.buildTable(rows, END);
  assert.deepEqual(t.map((c) => c.channel), ["google_ad", "daangn"]);
  assert.deepEqual(t[0].units.map((u) => u.unit), ["대구_영어"]);       // 울산_영어 는 지표가 없어 빠짐
  assert.equal(t[1].label, "당근"); assert.deepEqual(t[1].metrics, []); assert.deepEqual(t[1].units, []);
});

test("buildTable: 여러 지점 행을 한꺼번에 넘기면 채널 합계는 지점 합", () => {
  const rows = [trow(1, END, "jeonsan", "전체", { inquiries: 3, enrolls: 1 }), trow(2, END, "jeonsan", "meta", { inquiries: 2, enrolls: 0 }), trow(2, END, "jeonsan", "gads", { inquiries: 4, enrolls: 1 }),
    trow(1, END, "daangn", "전체", { followers: 50 }), trow(2, END, "daangn", "전체", { followers: 100 })];
  const t = D.buildTable(rows, END);
  const j = t.find((c) => c.channel === "jeonsan");
  assert.equal(j.metrics.find((m) => m.metric === "inquiries").cells[0].value, 9);
  assert.equal(j.metrics.find((m) => m.metric === "enrolls").cells[0].value, 2);
  assert.equal(t.find((c) => c.channel === "daangn").metrics.find((m) => m.metric === "followers").cells[0].value, 150);
});

test("fmt: 단위별 표기", () => {
  assert.equal(D.fmt(null, "krw"), "–");
  assert.equal(D.fmt(142000.4, "krw"), "₩142,000");
  assert.equal(D.fmt(0.1234, "pct"), "12.3%");
  assert.equal(D.fmt(2.333, "rank"), "2.3위");
  assert.equal(D.fmt(1234.6, "int"), "1,235");
});

test("summary: 문의·등록·총 광고비·문의당 비용", () => {
  const rows = [...days(END, 2, "naver_ad", "a", { spend: 1000 }), ...days(END, 2, "google_ad", "b", { spend: 500 }),
    ...days(END, 2, "jeonsan", "전체", (i) => ({ inquiries: i === 0 ? 3 : 0, enrolls: 1 })), ...days(END, 2, "jeonsan", "meta", (i) => ({ inquiries: i === 0 ? 3 : 0, enrolls: 1 }))];
  const s = D.summary(rows, END);
  assert.deepEqual(s.map((l) => l.label), ["문의", "등록", "총 광고비", "문의당 비용"]);
  assert.equal(s[0].cells[0].value, 3);            // 매일 문의 = 전체 행 (meta 와 이중 계산 안 함)
  assert.equal(s[2].cells[0].value, 1500);         // 총 광고비 = 네이버+구글
  assert.equal(s[3].cells[0].value, 500);          // 문의당 비용
  assert.equal(s[3].cells[0].prev, null);          // 전날 문의 0 → 산출 불가
  assert.equal(s[3].unit, "krw");
  assert.equal(typeof s[3].cells[0].prevDays, "number");   // 문의당 비용 칸도 직전 기간 일수를 가진다
});

test("status: 채널별 기준일 수집 상태", () => {
  const rows = [row(END, "naver_ad", "a", { clicks: 1 }), row(END, "google_ad", "전체", { note: "로그인" }, "login_required"),
    row(END, "blog", "k1", { rank: 1 }), row(END, "blog", "k2", {}, "failed"), row("2026-10-27", "daangn", "전체", { views: 3 })];
  assert.deepEqual(D.status(rows, END), { naver_ad: "ok", google_ad: "login_required", meta_ad: "missing", blog: "partial", daangn: "missing", jeonsan: "missing" });
});

test("channelOfSource", () => {
  assert.equal(D.channelOfSource("gads_daegu_en_search"), "google_ad");
  assert.equal(D.channelOfSource("nad_ulsan"), "naver_ad");
  assert.equal(D.channelOfSource("meta"), "meta_ad");
  assert.equal(D.channelOfSource("homepage"), null);
  assert.equal(D.channelOfSource("전체"), null);
});

test("flags: 광고 멈춤 — 가동 중이던 캠페인만, 일시중지는 제외", () => {
  const stopped = days(END, 10, "google_ad", "대구_영어", (i) => ({ impressions: i < 3 ? 0 : 50, clicks: 0, spend: 0 }));
  assert.deepEqual(D.flags(stopped, END).map((f) => f.code), ["ad_stopped"]);
  const never = days(END, 10, "google_ad", "대구 중국어", { impressions: 0 });
  assert.deepEqual(D.flags(never, END), []);
  const paused = days(END, 10, "google_ad", "대구_영어", (i) => ({ impressions: i < 3 ? 0 : 50, status: i < 3 ? "일시중지됨" : "운영 가능" }));
  assert.deepEqual(D.flags(paused, END), []);
  const twoDays = days(END, 10, "google_ad", "대구_영어", (i) => ({ impressions: i < 2 ? 0 : 50 }));
  assert.deepEqual(D.flags(twoDays, END), []);
});

test("flags: 승인/결제 문제는 화면에서 읽은 flags 배열", () => {
  const rows = [row(END, "google_ad", "전체", { flags: ["예비 결제 수단 없음"] }, "partial"), row(END, "google_ad", "울산_영어", { impressions: 10, flags: ["광고 비승인 1건"] })];
  const f = D.flags(rows, END);
  assert.deepEqual(f.map((x) => [x.code, x.level]), [["account_issue", "red"], ["account_issue", "red"]]);
  assert.match(f[1].msg, /울산_영어.*비승인/);
});

test("flags: 비용 급증인데 문의 안 늘면", () => {
  const spend = days(END, 6, "naver_ad", "a", (i) => ({ spend: i < 3 ? 2000 : 1000, clicks: 5 })); // 클릭은 주 50 미만으로(6번 규칙과 겹치지 않게)
  const inq = days(END, 6, "jeonsan", "전체", (i) => ({ inquiries: i < 3 ? 1 : 2 }));
  assert.deepEqual(D.flags([...spend, ...inq], END).map((f) => f.code), ["spend_spike"]);
  const inqUp = days(END, 6, "jeonsan", "전체", (i) => ({ inquiries: i < 3 ? 3 : 2 }));
  assert.deepEqual(D.flags([...spend, ...inqUp], END), []);
  const flat = days(END, 6, "naver_ad", "a", { spend: 1000, clicks: 5 });
  assert.deepEqual(D.flags([...flat, ...inq], END), []);
});

test("flags: 문의 급감은 전산 14일 이상 쌓였을 때만", () => {
  const drop = days(END, 28, "jeonsan", "전체", (i) => ({ inquiries: i < 7 ? 1 : 3 })); // 주간 7 vs 4주 주평균 (7+63)/4 = 17.5
  assert.deepEqual(D.flags(drop, END).map((f) => f.code), ["inquiry_drop"]);
  const short = days(END, 10, "jeonsan", "전체", (i) => ({ inquiries: i < 7 ? 0 : 5 }));
  assert.deepEqual(D.flags(short, END), []);
  const steady = days(END, 28, "jeonsan", "전체", { inquiries: 2 });
  assert.deepEqual(D.flags(steady, END), []);
});

test("flags: 순위 하락 3계단 또는 1페이지 이탈", () => {
  const drop3 = [row(END, "blog", "동성로 영어회화", { rank: 6 }), row("2026-10-27", "blog", "동성로 영어회화", { rank: 3 })];
  assert.deepEqual(D.flags(drop3, END).map((f) => f.code), ["rank_drop"]);
  const out = [row(END, "blog", "동성로 영어회화", { rank: null }), row("2026-10-26", "blog", "동성로 영어회화", { rank: 4 })];
  assert.match(D.flags(out, END)[0].msg, /1페이지에서 빠졌/);
  const fine = [row(END, "blog", "동성로 영어회화", { rank: 4 }), row("2026-10-27", "blog", "동성로 영어회화", { rank: 3 })];
  assert.deepEqual(D.flags(fine, END), []);
  const first = [row(END, "blog", "동성로 영어회화", { rank: null })];
  assert.deepEqual(D.flags(first, END), []);
});

test("flags: 클릭 있는데 전산 문의 0", () => {
  const clicks = days(END, 7, "google_ad", "대구_영어", { impressions: 100, clicks: 10 });
  const noSrc = [...days(END, 7, "jeonsan", "전체", { inquiries: 2 }), ...days(END, 7, "jeonsan", "meta", { inquiries: 2 })];
  assert.deepEqual(D.flags([...clicks, ...noSrc], END).map((f) => f.code), ["clicks_no_inquiry"]);
  const withSrc = [...noSrc, row(END, "jeonsan", "gads_daegu_en_search", { inquiries: 1 })];
  assert.deepEqual(D.flags([...clicks, ...withSrc], END), []);
  const few = days(END, 7, "google_ad", "대구_영어", { impressions: 100, clicks: 5 });
  assert.deepEqual(D.flags([...few, ...noSrc], END), []);
  assert.deepEqual(D.flags(clicks, END), []); // 전산 데이터 자체가 없으면 판단 안 함
});

test("flags: 결측 2일째 (한 번이라도 데이터 있던 채널만)", () => {
  const rows = [row("2026-10-25", "daangn", "전체", { views: 1 }), row("2026-10-27", "daangn", "전체", { note: "x" }, "login_required")];
  const f = D.flags(rows, END);
  assert.deepEqual(f.map((x) => [x.code, x.level, x.channel]), [["missing", "gray", "daangn"]]);
  assert.match(f[0].msg, /로그인 필요|수집 안 됨/);
  assert.deepEqual(D.flags([row("2026-10-27", "daangn", "전체", { views: 1 }), row(END, "daangn", "전체", {}, "failed")], END), []);
});

// ── 리뷰 수정 1: 없는 데이터는 0이 아니다 ──
const codes = (rows, end = END) => D.flags(rows, end).map((f) => f.code);
const naverSpike = days(END, 6, "naver_ad", "a", (i) => ({ spend: i < 3 ? 2000 : 1000, clicks: 5 }));

test("flags: 비용 급증 — 전산이 전부 실패했거나 아예 없으면 '문의 0건'으로 보지 않는다", () => {
  const failed = days(END, 6, "jeonsan", "전체", { inquiries: 0 }, "failed");
  assert.ok(!codes([...naverSpike, ...failed]).includes("spend_spike"));
  assert.ok(!codes(naverSpike).includes("spend_spike"));                       // 전산 행이 하나도 없음
  assert.ok(!codes([...naverSpike, row(END, "jeonsan", "전체", {}, "login_required")]).includes("spend_spike"));
  // 전산 데이터가 2일 이상 있고 3일 문의가 진짜 0 이면 여전히 켜진다
  const zero = days(END, 6, "jeonsan", "전체", { inquiries: 0 });
  const f = D.flags([...naverSpike, ...zero], END).find((x) => x.code === "spend_spike");
  assert.match(f.msg, /0건이에요/); assert.match(f.msg, /▲100%인데/);
  // 3일 안에 쓸 수 있는 전산 날이 하루뿐이면 0건 판단 보류 (직전 기간 대비 감소로도 안 잡히는 경우)
  const oneDay = [row(END, "jeonsan", "전체", { inquiries: 0 }), ...days(D.addDays(END, -1), 5, "jeonsan", "전체", { inquiries: 0 }, "failed")];
  assert.ok(!codes([...naverSpike, ...oneDay]).includes("spend_spike"));
});

test("flags: 클릭 있는데 문의 0 — 전산 쓸 수 있는 행이 이번 주에 없으면 판단 안 함", () => {
  const clicks = days(END, 7, "google_ad", "대구_영어", { impressions: 100, clicks: 10 });   // 주간 클릭 70
  const failed = days(END, 7, "jeonsan", "전체", { inquiries: 0 }, "failed");
  assert.ok(!codes([...clicks, ...failed]).includes("clicks_no_inquiry"));
  const oldOnly = [...failed, row("2026-10-10", "jeonsan", "전체", { inquiries: 3 })];      // 이번 주 밖의 정상 행뿐
  assert.ok(!codes([...clicks, ...oldOnly]).includes("clicks_no_inquiry"));
});

test("flags: 문의 급감 — 전산 실패일이 섞여도 주간을 일수로 환산해 비교한다", () => {
  const steady = days(END, 28, "jeonsan", "전체", (i) => ({ inquiries: 2 }), "ok").map((r, i) => (i === 1 || i === 3 || i === 5 ? { ...r, status: "failed" } : r));
  assert.deepEqual(D.flags(steady, END), []);                                     // 7일 중 4일만 정상(8건) = 주 14건 환산, 4주 평균도 14
  const few = days(END, 28, "jeonsan", "전체", { inquiries: 2 }).map((r, i) => (i >= 1 && i <= 4 ? { ...r, status: "failed" } : r));
  assert.deepEqual(D.flags(few, END), []);                                        // 주간에 쓸 날이 3일뿐이면 판단 보류
  const drop = days(END, 28, "jeonsan", "전체", (i) => ({ inquiries: i < 7 ? 1 : 3 })).map((r, i) => (i === 2 ? { ...r, status: "failed" } : r));
  const f = D.flags(drop, END).find((x) => x.code === "inquiry_drop");            // 6일 6건 → 주 7건 환산
  assert.match(f.msg, /주간 문의 7건/);
});

test("flags: 순위 이탈은 빠진 첫날 한 번만, 숫자 하락은 마지막으로 안 순위와 비교", () => {
  const kw = "동성로 영어회화", mk = [row("2026-10-25", "blog", kw, { rank: 4 }), row("2026-10-26", "blog", kw, { rank: null }), row("2026-10-27", "blog", kw, { rank: null }), row("2026-10-28", "blog", kw, { rank: null })];
  assert.deepEqual(codes(mk, "2026-10-26"), ["rank_drop"]);
  assert.deepEqual(codes(mk, "2026-10-27"), []);
  assert.deepEqual(codes(mk, "2026-10-28"), []);
  // 이탈 중에 실패 행이 끼어도 직전 '쓸 수 있는' 행이 순위 있던 날이면 이탈로 본다
  const gap = [row("2026-10-26", "blog", kw, { rank: 4 }), row("2026-10-27", "blog", kw, {}, "failed"), row(END, "blog", kw, { rank: null })];
  assert.deepEqual(codes(gap), ["rank_drop"]);
  // 이탈 뒤 다시 들어왔는데 처음보다 3계단 이상 낮으면 마지막으로 안 순위(4위)와 비교해 잡는다
  const back = [row("2026-10-26", "blog", kw, { rank: 4 }), row("2026-10-27", "blog", kw, { rank: null }), row(END, "blog", kw, { rank: 8 })];
  assert.deepEqual(codes(back), ["rank_drop"]);
});

test("flags: 결측 — 로그인 필요/수집 안 됨 구분과 실제 연속 일수", () => {
  const login4 = [row("2026-10-24", "daangn", "전체", { views: 1 }), ...[25, 26, 27, 28].map((d) => row(`2026-10-${d}`, "daangn", "전체", { note: "x" }, "login_required"))];
  const f = D.flags(login4, END).filter((x) => x.code === "missing");
  assert.equal(f.length, 1); assert.match(f[0].msg, /로그인 필요 4일째/);
  const failed3 = [row("2026-10-25", "daangn", "전체", { views: 1 }), ...[26, 27, 28].map((d) => row(`2026-10-${d}`, "daangn", "전체", {}, "failed"))];
  assert.match(D.flags(failed3, END)[0].msg, /수집 안 됨 3일째/);
  // 어제 로그인 필요 + 오늘 행 없음 → 로그인 필요 (기준일 행이 없다고 '수집 안 됨'으로 덮지 않는다)
  const yest = [row("2026-10-26", "daangn", "전체", { views: 1 }), row("2026-10-27", "daangn", "전체", { note: "x" }, "login_required")];
  assert.match(D.flags(yest, END)[0].msg, /로그인 필요 2일째/);
});

test("flags: 메시지 띄어쓰기 (이/인데 앞에 공백 없음)", () => {
  const stopped = days(END, 10, "google_ad", "대구_영어", (i) => ({ impressions: i < 3 ? 0 : 50 }));
  assert.match(D.flags(stopped, END)[0].msg, /노출 0이 3일째예요/);
  const clicks = days(END, 7, "google_ad", "대구_영어", { impressions: 100, clicks: 10 });
  const noSrc = days(END, 7, "jeonsan", "전체", { inquiries: 2 });
  assert.match(D.flags([...clicks, ...noSrc], END)[0].msg, /주간 클릭 70인데/);
  const zero = days(END, 6, "jeonsan", "전체", { inquiries: 0 });
  assert.match(D.flags([...naverSpike, ...zero], END)[0].msg, /▲100%인데 문의는/);
});
