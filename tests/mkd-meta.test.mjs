import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_TOKEN, SKIPPED_PRINT, NO_FX, unitOf, aggregateAds, parseFx, lastKnownFx, fxUrl, tokenPath, sanitizeReason, refreshOutcome, refreshOk, metaRows, activeTeamIds, emptyRows, buildInput, summarize } from "../scripts/mkd/meta-rows.mjs";
import { toRowsPure, D as DC } from "../scripts/mkd/rows.mjs";

const TEAMS = [{ id: 1, name: "대구동성로점", key: "dsr" }, { id: 2, name: "대구일본어중국어점", key: "jpcn" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "구미점", key: "gumi" }];
const DAY = "2026-10-29";
// mk_ad_daily 한 줄 (광고 단위)
const ad = (team_id, campaign, ad_name, o = {}) => ({ team_id, date: DAY, ad_name, campaign, adset: "세트", impressions: 100, reach: 90, clicks: 5, leads: 1, spend: 10, ...o });
const errOf = (fn) => { try { fn(); } catch (e) { return String(e.message); } assert.fail("던져야 하는데 통과했어요"); };

// ── 단위(unit) 이름 ──
test("unitOf: 캠페인 → 광고세트 → 광고 이름 → '(캠페인 없음)' 순서, 앞뒤 공백 제거", () => {
  assert.equal(unitOf({ campaign: " 대구 영어 리드 ", adset: "세트", ad_name: "광고" }), "대구 영어 리드");
  assert.equal(unitOf({ campaign: "", adset: "광고세트 A", ad_name: "광고" }), "광고세트 A");
  assert.equal(unitOf({ campaign: null, adset: "  ", ad_name: "광고 1" }), "광고 1");
  assert.equal(unitOf({ campaign: undefined, adset: undefined, ad_name: "" }), "(캠페인 없음)");
  assert.equal(unitOf({}), "(캠페인 없음)");
  assert.equal(unitOf({ campaign: "가".repeat(200) }).length, 120);
});

// ── 광고 줄 → 지점·캠페인 합계 ──
test("aggregateAds: 지점+캠페인 단위로 노출·클릭·리드·비용(USD)을 더한다, 도달(reach)은 싣지 않는다", () => {
  const rows = [ad(1, "캠페인A", "광고1", { impressions: 100, clicks: 4, leads: 1, spend: 10.25 }), ad(1, "캠페인A", "광고2", { impressions: 50, clicks: 2, leads: 0, spend: 5.5 }), ad(1, "캠페인B", "광고3", { impressions: 30, clicks: 1, leads: 2, spend: 1.1 })];
  const out = aggregateAds(rows);
  assert.deepEqual(out, [
    { team_id: 1, unit: "캠페인A", impressions: 150, clicks: 6, leads: 1, spend_usd: 15.75 },
    { team_id: 1, unit: "캠페인B", impressions: 30, clicks: 1, leads: 2, spend_usd: 1.1 }]);
  for (const o of out) assert.equal("reach" in o, false);
});
test("aggregateAds: 같은 캠페인 이름이라도 지점이 다르면 따로, 결과는 지점 번호·이름순", () => {
  const out = aggregateAds([ad(3, "공통", "a"), ad(1, "공통", "b"), ad(1, "가나다", "c")]);
  assert.deepEqual(out.map((r) => `${r.team_id}:${r.unit}`), ["1:가나다", "1:공통", "3:공통"]);
});
test("aggregateAds: 캠페인 이름이 비면 광고세트 → 광고 이름 → '(캠페인 없음)' 으로 묶는다", () => {
  const out = aggregateAds([ad(1, "", "광고1", { adset: "세트X" }), ad(1, null, "광고2", { adset: "세트X" }), ad(1, "", "광고3", { adset: "" }), ad(1, "", "", { adset: "" })]);
  assert.deepEqual(out.map((r) => [r.unit, r.impressions]), [["(캠페인 없음)", 100], ["광고3", 100], ["세트X", 200]]);
});
test("aggregateAds: 비용은 소수 둘째 자리로 맞춘다 (0.1+0.2 → 0.3), 숫자 문자열·빈 값도 안전", () => {
  const out = aggregateAds([ad(1, "A", "a", { spend: 0.1, impressions: "10", clicks: null, leads: undefined }), ad(1, "A", "b", { spend: "0.2", impressions: "", clicks: "x", leads: "2" })]);
  assert.deepEqual(out, [{ team_id: 1, unit: "A", impressions: 10, clicks: 0, leads: 2, spend_usd: 0.3 }]);
});
test("aggregateAds: 지점이 없는 줄은 건너뛰고, 줄이 없으면 빈 배열", () => {
  assert.deepEqual(aggregateAds([ad(null, "A", "a"), ad(undefined, "A", "b")]), []);
  assert.deepEqual(aggregateAds([]), []);
});
test("aggregateAds: 입력 배열을 바꾸지 않는다", () => {
  const rows = [ad(1, "A", "a"), ad(1, "A", "b")], before = JSON.stringify(rows);
  aggregateAds(rows);
  assert.equal(JSON.stringify(rows), before);
});

// ── 환율 ──
test("fxUrl: frankfurter USD→KRW 날짜 주소 (기본 서버, 바꿀 수도 있음)", () => {
  assert.equal(fxUrl(DAY), "https://api.frankfurter.app/2026-10-29?from=USD&to=KRW");
  assert.equal(fxUrl("latest"), "https://api.frankfurter.app/latest?from=USD&to=KRW");
  assert.equal(fxUrl(DAY, "http://127.0.0.1:9/"), "http://127.0.0.1:9/2026-10-29?from=USD&to=KRW");
});
test("parseFx: rates.KRW 가 0 보다 큰 유한한 숫자일 때만, 아니면 null", () => {
  assert.equal(parseFx({ amount: 1, base: "USD", date: DAY, rates: { KRW: 1447.3 } }), 1447.3);
  for (const bad of [null, undefined, {}, { rates: {} }, { rates: { KRW: 0 } }, { rates: { KRW: -3 } }, { rates: { KRW: "1447" } }, { rates: { KRW: NaN } }, { rates: { KRW: null } }, "x", []]) assert.equal(parseFx(bad), null, JSON.stringify(bad));
});
test("lastKnownFx: 그 날짜보다 앞선 meta_ad 행 중 가장 최근의 fx — 이후·당일·숫자 아닌 값은 무시", () => {
  const rows = [
    { date: "2026-10-26", metrics: { fx: 1440 } }, { date: "2026-10-28", metrics: { fx: 1450.5 } }, { date: "2026-10-28", metrics: { fx: 1450.5, spend: 1 } },
    { date: "2026-10-29", metrics: { fx: 1999 } }, { date: "2026-10-30", metrics: { fx: 1888 } },
    { date: "2026-10-27", metrics: { fx: null } }, { date: "2026-10-27", metrics: {} }, { date: "2026-10-27", metrics: { fx: 0 } }, { date: "2026-10-27", metrics: { fx: "abc" } }];
  assert.equal(lastKnownFx(rows, DAY), 1450.5);
  assert.equal(lastKnownFx(rows, "2026-10-28"), 1440);
  assert.equal(lastKnownFx(rows, "2026-10-26"), null);
  assert.equal(lastKnownFx([], DAY), null);
  assert.equal(lastKnownFx([{ date: "2026-10-27", metrics: { fx: null } }, { date: "2026-10-28", metrics: null }, { date: "2026-10-28" }], DAY), null);
});

// ── 행 만들기 ──
const AGG = [{ team_id: 1, unit: "A", impressions: 1000, clicks: 20, leads: 3, spend_usd: 12.34 }, { team_id: 2, unit: "B", impressions: 0, clicks: 0, leads: 0, spend_usd: 0 }];
test("metaRows: 원 = round(USD × 환율), 지표 키는 정확히 impressions·clicks·leads·spend_usd·fx·spend, note 없음", () => {
  const rows = metaRows(AGG, 1465.3);
  assert.deepEqual(rows[0], { team_id: 1, unit: "A", metrics: { impressions: 1000, clicks: 20, leads: 3, spend_usd: 12.34, fx: 1465.3, spend: 18082 } }); // 12.34 × 1465.3 = 18081.802
  assert.deepEqual(rows[1].metrics, { impressions: 0, clicks: 0, leads: 0, spend_usd: 0, fx: 1465.3, spend: 0 });
  assert.equal("status" in rows[0], false);
});
test("metaRows: 원 환산은 반올림 — 2.5 × 1401 = 3502.5 → 3503, 1.001 × 1000 = 1001 (소수 버림 아님)", () => {
  assert.equal(metaRows([{ ...AGG[0], spend_usd: 2.5 }], 1401)[0].metrics.spend, 3503);
  assert.equal(metaRows([{ ...AGG[0], spend_usd: 7.3333 }], 1000)[0].metrics.spend, 7333);
  assert.equal(metaRows([{ ...AGG[0], spend_usd: 7.3336 }], 1000)[0].metrics.spend, 7334);
});
test("metaRows: 환율이 없으면 spend·fx 는 null, 행 상태 partial, note '환율 못 받음' (USD 와 나머지 숫자는 그대로)", () => {
  for (const fx of [null, undefined, 0, NaN]) {
    const r = metaRows([AGG[0]], fx)[0];
    assert.deepEqual(r, { team_id: 1, unit: "A", metrics: { impressions: 1000, clicks: 20, leads: 3, spend_usd: 12.34, fx: null, spend: null, note: NO_FX }, status: "partial" });
  }
  assert.equal(NO_FX, "환율 못 받음");
});

// ── 새로고침(pull-meta 자식 프로세스) 결과 ──
test("tokenPath: META_TOKEN_FILE 이 있으면 그것, 없으면 ~/Downloads/GEO:SEO 스킬/meta-ads/meta-token.txt (pull-meta 와 같은 규칙)", () => {
  assert.equal(tokenPath({ META_TOKEN_FILE: "/x/t.txt" }, "/home/u"), "/x/t.txt");
  assert.equal(tokenPath({}, "/home/u"), "/home/u/Downloads/GEO:SEO 스킬/meta-ads/meta-token.txt");
  assert.equal(tokenPath({ META_TOKEN_FILE: "" }, "/home/u"), "/home/u/Downloads/GEO:SEO 스킬/meta-ads/meta-token.txt");
});
test("refreshOutcome: 종료코드 0 + 마지막 stdout 줄이 ok:true JSON 이면 'ok' (앞줄은 무시)", () => {
  assert.equal(refreshOutcome({ status: 0, stdout: "잡음\n{\"ok\":true,\"daily\":77}\n", stderr: "" }), "ok");
  assert.equal(refreshOk("ok"), true);
});
test("refreshOutcome: 실패는 'failed: 이유' — 이유는 stderr 마지막 줄, 4자리 이상 숫자는 #", () => {
  const r = refreshOutcome({ status: 1, stdout: "", stderr: "무언가\n실패: 메타 API 190: Error validating access token (2026-10-29~2026-10-29)\n" });
  assert.match(r, /^failed: /); assert.doesNotMatch(r, /\d{4}/); assert.match(r, /메타 API 190/);
  assert.equal(refreshOk(r), false);
  assert.equal(refreshOutcome({ status: 2, stdout: "", stderr: "" }), "failed: 종료코드 2");
});
test("refreshOutcome: 시간 초과·실행 오류·응답 이상", () => {
  assert.equal(refreshOutcome({ status: null, signal: "SIGTERM", error: Object.assign(new Error("spawnSync ETIMEDOUT"), { code: "ETIMEDOUT" }), stdout: "", stderr: "" }), "failed: 시간 초과");
  assert.match(refreshOutcome({ status: null, error: Object.assign(new Error("boom"), { code: "ENOENT" }), stdout: "", stderr: "" }), /^failed: 실행 실패 \(ENOENT\)$/);
  assert.match(refreshOutcome({ status: 0, stdout: "", stderr: "" }), /^failed: /);
  assert.match(refreshOutcome({ status: 0, stdout: "그냥 글\n", stderr: "" }), /^failed: /);
  assert.match(refreshOutcome({ status: 0, stdout: "{\"ok\":false}\n", stderr: "" }), /^failed: /);
  assert.match(refreshOutcome(undefined), /^failed: /);
  assert.equal(refreshOk(NO_TOKEN), false); assert.equal(refreshOk(SKIPPED_PRINT), false);
});
test("sanitizeReason: 토큰·access_token 값·긴 영숫자 덩어리를 가리고, 4자리 이상 숫자는 #, 80자까지", () => {
  const tok = "EAAGm0PX4ZCpsBAKZCtoken1234567890abcdefXYZ";
  const t1 = sanitizeReason(`요청 실패 https://graph.facebook.com/v21.0/act_3542016502769477/insights?access_token=${tok}&x=1`);
  assert.doesNotMatch(t1, /EAAGm0|abcdefXYZ|access_token=E/); assert.doesNotMatch(t1, /\d{4}/);
  const t2 = sanitizeReason(`Error validating ${tok}`);
  assert.doesNotMatch(t2, /EAAGm0|1234567890/);
  assert.equal(sanitizeReason("A".repeat(40)), "***");
  assert.equal(sanitizeReason("가".repeat(300)).length, 80);
  assert.equal(sanitizeReason(undefined), "undefined");
});
test("refreshOutcome: stderr 에 토큰이 섞여 있어도 이유에 남지 않는다", () => {
  const tok = "EAAGm0PX4ZCpsBAKZCtoken1234567890abcdefXYZ";
  const r = refreshOutcome({ status: 1, stdout: "", stderr: `실패: fetch failed ?access_token=${tok}` });
  assert.doesNotMatch(r, /EAAGm0|abcdefXYZ|1234567890/);
});

// ── 0 줄(그날 데이터 없음) ──
test("activeTeamIds: 직전 7일(D-7~D-1)에 메타 줄이 있던 지점 번호만, 중복 없이 번호순", () => {
  const at = (team_id, date) => ({ team_id, date });
  const rows = [at(3, "2026-10-28"), at(1, "2026-10-22"), at(1, "2026-10-25"), at(2, "2026-10-21"), at(4, "2026-10-29"), at(4, "2026-10-30"), at(2, "2026-10-28"), at(null, "2026-10-28")];
  assert.deepEqual(activeTeamIds(rows, DAY), [1, 2, 3]);
  assert.deepEqual(activeTeamIds([], DAY), []);
});
test("emptyRows: 새로고침이 실패·건너뜀이면 지점마다 '전체' failed 행(note 에 이유), 성공이면 '메타 집행 없음' 0 행", () => {
  const failed = emptyRows([1, 3], "failed: 시간 초과");
  assert.deepEqual(failed, [
    { team_id: 1, unit: "전체", metrics: { note: "메타 데이터 아직 없음(failed: 시간 초과)" }, status: "failed" },
    { team_id: 3, unit: "전체", metrics: { note: "메타 데이터 아직 없음(failed: 시간 초과)" }, status: "failed" }]);
  assert.equal(emptyRows([2], NO_TOKEN)[0].metrics.note, `메타 데이터 아직 없음(${NO_TOKEN})`);
  assert.equal(emptyRows([2], NO_TOKEN)[0].status, "failed");
  assert.deepEqual(emptyRows([1, 2], "ok"), [1, 2].map((team_id) => ({ team_id, unit: "전체", metrics: { impressions: 0, clicks: 0, leads: 0, spend_usd: 0, spend: 0, note: "메타 집행 없음" } })));
});
test("emptyRows: note 의 4자리 이상 숫자는 #, 120자 안", () => {
  const n = emptyRows([1], `failed: ${"가".repeat(70)} 2026`)[0].metrics.note;
  assert.ok(n.length <= 120); assert.doesNotMatch(n, /\d{4}/);
});
test("buildInput: 줄이 있으면 캠페인 행 (환율 있음), 환율이 없으면 partial", () => {
  const ads = [ad(1, "A", "a", { spend: 10 }), ad(2, "B", "b", { spend: 20 })];
  const a = buildInput({ ads, fx: 1000, refresh: "ok", activeIds: [] });
  assert.deepEqual(a.rows.map((r) => [r.team_id, r.unit, r.metrics.spend]), [[1, "A", 10000], [2, "B", 20000]]);
  const b = buildInput({ ads, fx: null, refresh: "ok", activeIds: [] });
  assert.deepEqual(b.rows.map((r) => r.status), ["partial", "partial"]);
});
test("buildInput: 줄이 0 — 새로고침 실패·건너뜀이면 최근 7일에 있던 지점만 failed, 성공이면 그 지점만 '집행 없음' 0 행", () => {
  const bad = buildInput({ ads: [], fx: null, refresh: NO_TOKEN, activeIds: [1, 3] });
  assert.deepEqual(bad.rows.map((r) => [r.team_id, r.unit, r.status]), [[1, "전체", "failed"], [3, "전체", "failed"]]);
  assert.equal(bad.status, undefined);
  const none = buildInput({ ads: [], fx: null, refresh: "ok", activeIds: [2] });
  assert.deepEqual(none.rows.map((r) => [r.team_id, r.unit, r.metrics.note, r.status]), [[2, "전체", "메타 집행 없음", undefined]]);
});
test("buildInput: 줄도 0, 최근 7일 지점도 0 — 실패·건너뜀이면 채널 통째 failed 입력, 성공이면 저장할 게 없음(null)", () => {
  const bad = buildInput({ ads: [], fx: null, refresh: "failed: 시간 초과", activeIds: [] });
  assert.deepEqual(bad, { rows: [], status: "failed", note: "메타 데이터 아직 없음(failed: 시간 초과)" });
  assert.equal(buildInput({ ads: [], fx: null, refresh: "ok", activeIds: [] }), null);
});

// ── 저장 규격(rows.mjs toRowsPure)을 통과하는지 ──
test("toRowsPure: 캠페인 행(환율 있음·없음)과 전체 failed 행·집행 없음 0 행·채널 통째 failed 입력이 모두 통과한다", () => {
  const ads = [ad(1, "대구 영어 리드", "a", { spend: 10.25 }), ad(1, "대구 영어 리드", "b", { spend: 5 }), ad(2, "대구 일중 리드", "c", { spend: 7 }), ad(3, "울산 리드", "d", { spend: 1 })];
  const ok = toRowsPure("meta_ad", DAY, buildInput({ ads, fx: 1447.3, refresh: "ok", activeIds: [] }), TEAMS);
  assert.deepEqual(ok.map((r) => [r.team_id, r.channel, r.unit, r.status]), [[1, "meta_ad", "대구 영어 리드", "ok"], [2, "meta_ad", "대구 일중 리드", "ok"], [3, "meta_ad", "울산 리드", "ok"]]);
  assert.deepEqual(ok[0].metrics, { impressions: 200, clicks: 10, leads: 2, spend_usd: 15.25, fx: 1447.3, spend: 22071 }); // 15.25 × 1447.3 = 22071.325
  const part = toRowsPure("meta_ad", DAY, buildInput({ ads, fx: null, refresh: "ok", activeIds: [] }), TEAMS);
  assert.ok(part.every((r) => r.status === "partial" && r.metrics.spend === null && r.metrics.fx === null && r.metrics.note === NO_FX));
  const failed = toRowsPure("meta_ad", DAY, buildInput({ ads: [], fx: null, refresh: NO_TOKEN, activeIds: [1, 2] }), TEAMS);
  assert.deepEqual(failed.map((r) => [r.team_id, r.unit, r.status]), [[1, "전체", "failed"], [2, "전체", "failed"]]);
  const empty = toRowsPure("meta_ad", DAY, buildInput({ ads: [], fx: null, refresh: "ok", activeIds: [4] }), TEAMS);
  assert.deepEqual(empty.map((r) => [r.team_id, r.unit, r.status, r.metrics.spend]), [[4, "전체", "ok", 0]]);
  const all = toRowsPure("meta_ad", DAY, buildInput({ ads: [], fx: null, refresh: "failed: x", activeIds: [] }), TEAMS);
  assert.deepEqual(all.map((r) => [r.team_id, r.unit, r.status]), TEAMS.map((t) => [t.id, "전체", "failed"]));
});
test("toRowsPure: 전화번호 모양 캠페인 이름은 숫자만 #로 가려 저장된다 (광고 채널 규칙)", () => {
  const rows = toRowsPure("meta_ad", DAY, buildInput({ ads: [ad(1, "문의 010-1234-5678 캠페인", "a")], fx: 1000, refresh: "ok", activeIds: [] }), TEAMS);
  assert.equal(rows[0].unit, "문의 #-#-# 캠페인");
});

// ── 화면 표에 어떻게 나오나 (mkd-core) ──
test("buildTable: 메타 행은 노출·클릭·리드·비용을 보이고 도달은 나오지 않는다, 비용 합은 캠페인 합", () => {
  const ads = [ad(1, "A", "a", { spend: 10, impressions: 100, clicks: 5, leads: 1 }), ad(1, "B", "b", { spend: 20, impressions: 200, clicks: 7, leads: 2 })];
  const rows = toRowsPure("meta_ad", DAY, buildInput({ ads, fx: 1000, refresh: "ok", activeIds: [] }), TEAMS);
  const t = DC.buildTable(rows, DAY).find((c) => c.channel === "meta_ad");
  assert.deepEqual(t.metrics.map((m) => m.metric), ["impressions", "clicks", "leads", "spend"]);
  const d1 = (metric) => t.metrics.find((m) => m.metric === metric).cells.find((c) => c.key === "d1").value;
  assert.equal(d1("spend"), 30000); assert.equal(d1("leads"), 3); assert.equal(d1("impressions"), 300);
  assert.deepEqual(t.units.map((u) => u.unit), ["A", "B"]);
});
test("buildTable: 환율을 못 받은 partial 행은 비용 줄 없이 노출·클릭·리드만 보인다", () => {
  const rows = toRowsPure("meta_ad", DAY, buildInput({ ads: [ad(1, "A", "a")], fx: null, refresh: "ok", activeIds: [] }), TEAMS);
  const t = DC.buildTable(rows, DAY).find((c) => c.channel === "meta_ad");
  assert.deepEqual(t.metrics.map((m) => m.metric), ["impressions", "clicks", "leads"]);
});
test("총 광고비 칸: 메타 비용(원)이 네이버·구글과 함께 더해진다", () => {
  const meta = toRowsPure("meta_ad", DAY, buildInput({ ads: [ad(1, "A", "a", { spend: 10 })], fx: 1000, refresh: "ok", activeIds: [] }), TEAMS);
  const naver = toRowsPure("naver_ad", DAY, { rows: [{ team_key: "dsr", unit: "대구 영어", metrics: { impressions: 10, clicks: 1, spend: 5000 } }] }, TEAMS);
  const sp = DC.summary([...meta, ...naver], DAY).find((l) => l.label === "총 광고비");
  assert.equal(sp.cells.find((c) => c.key === "d1").value, 15000);
});

// ── 출력 요약 ──
test("summarize: 지점 이름별 비용(원)·USD·리드 합 — 환율 없는 행·실패 행은 값이 null", () => {
  const rows = toRowsPure("meta_ad", DAY, buildInput({ ads: [ad(1, "A", "a", { spend: 10, leads: 2 }), ad(1, "B", "b", { spend: 5, leads: 1 }), ad(2, "C", "c", { spend: 1, leads: 0 })], fx: 1000, refresh: "ok", activeIds: [] }), TEAMS);
  assert.deepEqual(summarize(rows, TEAMS), { 대구동성로점: { spend: 15000, spend_usd: 15, leads: 3 }, 대구일본어중국어점: { spend: 1000, spend_usd: 1, leads: 0 } });
  const partial = toRowsPure("meta_ad", DAY, buildInput({ ads: [ad(1, "A", "a", { spend: 10, leads: 2 })], fx: null, refresh: "ok", activeIds: [] }), TEAMS);
  assert.deepEqual(summarize(partial, TEAMS), { 대구동성로점: { spend: null, spend_usd: 10, leads: 2 } });
  const failed = toRowsPure("meta_ad", DAY, buildInput({ ads: [], fx: null, refresh: NO_TOKEN, activeIds: [1] }), TEAMS);
  assert.deepEqual(summarize(failed, TEAMS), { 대구동성로점: { spend: null, spend_usd: null, leads: null } });
});
test("에러 메시지 확인용: toRowsPure 가 모르는 지점을 던지는 건 그대로 (조용히 넘기지 않음)", () => {
  assert.match(errOf(() => toRowsPure("meta_ad", DAY, buildInput({ ads: [ad(99, "A", "a")], fx: 1000, refresh: "ok", activeIds: [] }), TEAMS)), /team_id/);
});
