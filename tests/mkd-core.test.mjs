import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const D = createRequire(import.meta.url)("../mkd-core.js");

// 행 만들기: row(날짜, 채널, 단위, metrics, 상태)
const row = (date, channel, unit, metrics, status = "ok") => ({ team_id: 2, date, channel, unit, metrics, status });
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
  assert.deepEqual(D.unitsOf(rows).sort(), ["gads_daegu_en_search", "meta"]);
  const t = D.totalRows(rows);
  assert.deepEqual(t.map((r) => [r.date, r.unit]).sort(), [["2026-10-27", "meta"], [END, "전체"]]);
});

test("cell: 합계·직전 기간·증감·데이터 일수", () => {
  const rows = days(END, 6, "naver_ad", "대구 영어", { clicks: 10, impressions: 200, spend: 1000 });
  const d3 = D.cell(rows, "clicks", END, 3);
  assert.deepEqual(d3, { value: 30, prev: 30, change: 0, days: 3, hold: false });
  const w1 = D.cell(rows, "clicks", END, 7);
  assert.equal(w1.value, 60); assert.equal(w1.prev, null); assert.equal(w1.change, null); assert.equal(w1.days, 6);
  const grown = days(END, 2, "naver_ad", "a", (i) => ({ clicks: i === 0 ? 15 : 10 }));
  assert.equal(D.cell(grown, "clicks", END, 1).change, 0.5);
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

test("fmt: 단위별 표기", () => {
  assert.equal(D.fmt(null, "krw"), "–");
  assert.equal(D.fmt(142000.4, "krw"), "₩142,000");
  assert.equal(D.fmt(0.1234, "pct"), "12.3%");
  assert.equal(D.fmt(2.333, "rank"), "2.3위");
  assert.equal(D.fmt(1234.6, "int"), "1,235");
});
