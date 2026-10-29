import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS, parseEnv, accountKeys, campaignRows, emptyRows, failRows, sanitizeNote } from "../scripts/mkd/naver-rows.mjs";
import { toRowsPure } from "../scripts/mkd/rows.mjs";

const TEAMS = [{ id: 1, name: "대구동성로점", key: "dsr" }, { id: 2, name: "대구일본어중국어점", key: "jpcn" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "구미점", key: "gumi" }];
const D = "2026-10-28";
const DAEGU = ACCOUNTS.find((a) => a.name === "대구"), ULSAN = ACCOUNTS.find((a) => a.name === "울산");
const camp = (name, status = "ELIGIBLE", id = `cmp-${name}`) => ({ nccCampaignId: id, name, status });
const st = (id, impCnt, clkCnt, salesAmt, avgRnk = 0) => ({ id, impCnt, clkCnt, salesAmt, avgRnk, ctr: 0, cpc: 0 });
const real = (rows) => rows.filter((r) => r.unit !== "전체"); // 캠페인 행만 — 캠페인 없는 지점에 붙는 '전체' 0 행은 따로 검사
const errOf = (fn) => { try { fn(); } catch (e) { return String(e.message); } assert.fail("던져야 하는데 통과했어요"); };

// ── 계정 목록 ──
test("계정: 대구(기본 키, dsr·jpcn) 와 울산(_ULSAN 키, ulsan)", () => {
  assert.deepEqual(ACCOUNTS.map((a) => [a.name, a.suffix, a.teams]), [["대구", "", ["dsr", "jpcn"]], ["울산", "_ULSAN", ["ulsan"]]]);
});

// ── 환경 파일·키 읽기 ──
test("parseEnv: 주석·export·따옴표 처리", () => {
  const e = parseEnv('# 메모\nexport A_1="x y"\nB=\'z\'\n  C = 3  \n\nNAVER_AD_API_KEY_ULSAN=abc=\n');
  assert.deepEqual(e, { A_1: "x y", B: "z", C: "3", NAVER_AD_API_KEY_ULSAN: "abc=" });
});
test("accountKeys: 기본 키는 대구, _ULSAN 키는 울산 — 서로 섞이지 않는다", () => {
  const env = { NAVER_AD_CUSTOMER_ID: "c1", NAVER_AD_API_KEY: "k1", NAVER_AD_SECRET: "s1", NAVER_AD_CUSTOMER_ID_ULSAN: "c2", NAVER_AD_API_KEY_ULSAN: "k2", NAVER_AD_SECRET_ULSAN: "s2" };
  assert.deepEqual(accountKeys(env, DAEGU), { state: "ready", cid: "c1", key: "k1", secret: "s1" });
  assert.deepEqual(accountKeys(env, ULSAN), { state: "ready", cid: "c2", key: "k2", secret: "s2" });
});
test("accountKeys: 셋 다 없으면 absent(건너뜀 후보), 일부만 있으면 partial, 공백만은 없는 것", () => {
  assert.equal(accountKeys({}, ULSAN).state, "absent");
  assert.equal(accountKeys({ NAVER_AD_CUSTOMER_ID: "c1", NAVER_AD_API_KEY: "k1", NAVER_AD_SECRET: "s1" }, ULSAN).state, "absent"); // 울산은 _ULSAN 이름만 본다
  assert.equal(accountKeys({ NAVER_AD_CUSTOMER_ID_ULSAN: "c2", NAVER_AD_API_KEY_ULSAN: "k2" }, ULSAN).state, "partial");
  assert.equal(accountKeys({ NAVER_AD_CUSTOMER_ID: "c1", NAVER_AD_API_KEY: "  ", NAVER_AD_SECRET: "s1" }, DAEGU).state, "partial");
  assert.equal(accountKeys({ NAVER_AD_CUSTOMER_ID: " ", NAVER_AD_API_KEY: "", NAVER_AD_SECRET: "" }, DAEGU).state, "absent");
  assert.equal(accountKeys({ NAVER_AD_CUSTOMER_ID: " c1 ", NAVER_AD_API_KEY: "k1", NAVER_AD_SECRET: "s1" }, DAEGU).cid, "c1");
});

// ── 지점 매핑 ──
test("대구 계정 매핑: 소상공인일어중어·일본어·중국어·대구일중 → jpcn, 소상고인·네이버플레이스·대구 영어 → dsr", () => {
  const cases = [["소상공인일어중어", "jpcn"], ["팔로 소상고인", "dsr"], ["팔로 네이버플레이스", "dsr"], ["대구 영어회화", "dsr"], ["대구_영어(검색광고)", "dsr"], ["대구일중", "jpcn"], ["대구 일본어", "jpcn"], ["팔로 중국어 파워링크", "jpcn"], ["동성로 영어", "dsr"]];
  for (const [name, team] of cases) assert.equal(DAEGU.teamOf(name), team, name);
});
test("울산 계정 매핑: 이름이 뭐든 ulsan", () => {
  for (const name of ["울산 영어", "팔로 네이버플레이스", "대구 영어", "소상공인일어중어", ""]) assert.equal(ULSAN.teamOf(name), "ulsan", name);
});

// ── 캠페인 → 행 ──
test("행 모양: 노출·클릭·비용·CTR·CPC·평균순위·캠페인 id·상태, 지점은 항상 명시", () => {
  const rows = real(campaignRows(DAEGU, [camp("대구 영어", "ELIGIBLE", "cmp-1")], [st("cmp-1", 200, 10, 18000, 2.5)]));
  assert.deepEqual(rows, [{ team_key: "dsr", unit: "대구 영어", metrics: { impressions: 200, clicks: 10, spend: 18000, ctr: 0.05, cpc: 1800, avg_rank: 2.5, campaign_id: "cmp-1", status: "ELIGIBLE" } }]);
});
test("통계에 없는 운영 캠페인은 0 으로 남긴다 (광고 멈춤 판단에 필요) — ctr·cpc·avg_rank 는 null", () => {
  const rows = real(campaignRows(DAEGU, [camp("대구 영어", "ELIGIBLE", "cmp-1")], []));
  assert.deepEqual(rows[0].metrics, { impressions: 0, clicks: 0, spend: 0, ctr: null, cpc: null, avg_rank: null, campaign_id: "cmp-1", status: "ELIGIBLE" });
  // 노출 0 이면 통계가 평균순위 0 을 줘도 순위는 없는 값
  assert.equal(campaignRows(DAEGU, [camp("대구 영어", "ELIGIBLE", "cmp-1")], [st("cmp-1", 0, 0, 0, 0)])[0].metrics.avg_rank, null);
  // 클릭 0 이면 cpc null, 노출만 있으면 ctr 0
  const m = campaignRows(DAEGU, [camp("대구 영어", "ELIGIBLE", "cmp-1")], [st("cmp-1", 50, 0, 0, 4)])[0].metrics;
  assert.equal(m.ctr, 0); assert.equal(m.cpc, null); assert.equal(m.avg_rank, 4);
});
test("PAUSED 이고 그날 노출 0·비용 0 이면 뺀다, PAUSED 라도 활동이 있으면 남기고, 운영 중(ELIGIBLE)은 0 이어도 남긴다", () => {
  const camps = [camp("대구 영어 A", "ELIGIBLE", "a"), camp("대구 영어 B", "PAUSED", "b"), camp("대구 영어 C", "PAUSED", "c"), camp("대구 영어 D", "PAUSED", "d"), camp("대구 영어 E", "ELIGIBLE", "e")];
  const rows = real(campaignRows(DAEGU, camps, [st("a", 0, 0, 0), st("c", 30, 1, 900, 3), st("d", 0, 0, 500), st("e", 10, 0, 0, 5)]));
  assert.deepEqual(rows.map((r) => r.unit), ["대구 영어 A", "대구 영어 C", "대구 영어 D", "대구 영어 E"]);
  assert.equal(rows[1].metrics.status, "PAUSED");
});
test("대구 계정 한 번에: 지점은 이름으로 나뉜다", () => {
  const camps = [camp("대구 영어", "ELIGIBLE", "1"), camp("소상공인일어중어", "ELIGIBLE", "2"), camp("팔로 소상고인", "ELIGIBLE", "3"), camp("팔로 네이버플레이스", "PAUSED", "4")];
  const rows = campaignRows(DAEGU, camps, [st("1", 100, 5, 5000, 2), st("2", 80, 4, 4000, 3), st("3", 60, 3, 3000, 4), st("4", 40, 2, 1000, 5)]);
  assert.deepEqual(rows.map((r) => `${r.team_key}:${r.unit}`), ["dsr:대구 영어", "jpcn:소상공인일어중어", "dsr:팔로 소상고인", "dsr:팔로 네이버플레이스"]);
});
test("울산 계정: 모든 캠페인이 ulsan", () => {
  const rows = campaignRows(ULSAN, [camp("울산 영어", "ELIGIBLE", "1"), camp("팔로 네이버플레이스", "ELIGIBLE", "2")], [st("1", 10, 1, 700, 2), st("2", 5, 0, 0, 3)]);
  assert.deepEqual(rows.map((r) => r.team_key), ["ulsan", "ulsan"]);
});

// ── 같은 이름 합치기 ──
test("같은 지점·같은 이름 캠페인은 한 행으로: 노출·클릭·비용 합, ctr·cpc 는 합에서 다시, 평균순위는 노출 가중, id·상태는 첫 번째", () => {
  const rows = real(campaignRows(DAEGU, [camp("대구 영어", "ELIGIBLE", "id-1"), camp("대구 영어", "ELIGIBLE", "id-2"), camp("대구 영어 ", "PAUSED", "id-3")], [st("id-1", 100, 10, 10000, 2), st("id-2", 300, 10, 20000, 4), st("id-3", 100, 0, 0, 6)]));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { team_key: "dsr", unit: "대구 영어", metrics: { impressions: 500, clicks: 20, spend: 30000, ctr: 0.04, cpc: 1500, avg_rank: (100 * 2 + 300 * 4 + 100 * 6) / 500, campaign_id: "id-1", status: "ELIGIBLE" } });
});
test("합칠 때 노출이 하나도 없으면 ctr·cpc·avg_rank 는 null", () => {
  const rows = real(campaignRows(DAEGU, [camp("대구 영어", "ELIGIBLE", "1"), camp("대구 영어", "ELIGIBLE", "2")], []));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].metrics, { impressions: 0, clicks: 0, spend: 0, ctr: null, cpc: null, avg_rank: null, campaign_id: "1", status: "ELIGIBLE" });
});
test("합친 행의 상태는 운영 중인 캠페인을 우선 — 멈춘 캠페인이 앞에 있어도 '광고 멈춤' 판단을 가리지 않는다", () => {
  const rows = real(campaignRows(DAEGU, [camp("대구 영어", "PAUSED", "old"), camp("대구 영어", "ELIGIBLE", "new")], [st("old", 10, 1, 500, 3), st("new", 0, 0, 0)]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metrics.status, "ELIGIBLE"); assert.equal(rows[0].metrics.campaign_id, "new");
});
test("합치기는 뺄 것을 뺀 뒤: 멈춘 0 행은 합산에 끼지 않는다", () => {
  const rows = real(campaignRows(DAEGU, [camp("대구 영어", "PAUSED", "p"), camp("대구 영어", "ELIGIBLE", "e")], [st("e", 40, 2, 1000, 3)]));
  assert.deepEqual(rows.map((r) => [r.metrics.campaign_id, r.metrics.status, r.metrics.impressions]), [["e", "ELIGIBLE", 40]]);
});

// ── 운영 캠페인 없음 ──
test("emptyRows: 계정의 지점마다 '전체' 0 행 + note", () => {
  assert.deepEqual(emptyRows(DAEGU), [
    { team_key: "dsr", unit: "전체", metrics: { impressions: 0, clicks: 0, spend: 0, note: "운영 캠페인 없음" } },
    { team_key: "jpcn", unit: "전체", metrics: { impressions: 0, clicks: 0, spend: 0, note: "운영 캠페인 없음" } }]);
  assert.deepEqual(emptyRows(ULSAN).map((r) => r.team_key), ["ulsan"]);
  assert.deepEqual(emptyRows(DAEGU, ["jpcn"]).map((r) => r.team_key), ["jpcn"]);
});
test("캠페인이 없거나 전부 걸러지면 계정의 지점마다 0 행", () => {
  assert.deepEqual(campaignRows(ULSAN, [], []).map((r) => [r.team_key, r.unit, r.metrics.note]), [["ulsan", "전체", "운영 캠페인 없음"]]);
  const all = campaignRows(DAEGU, [camp("대구 영어", "PAUSED", "1"), camp("대구일중", "PAUSED", "2")], [st("1", 0, 0, 0)]);
  assert.deepEqual(all.map((r) => [r.team_key, r.unit]), [["dsr", "전체"], ["jpcn", "전체"]]);
});
test("계정 안에서 캠페인이 없는 지점만 0 행을 받는다 (옛 실패 표시를 지우려면 모든 지점에 ok 행이 있어야 함)", () => {
  const rows = campaignRows(DAEGU, [camp("대구 영어", "ELIGIBLE", "1")], [st("1", 10, 1, 500, 2)]);
  assert.deepEqual(rows.map((r) => `${r.team_key}:${r.unit}`), ["dsr:대구 영어", "jpcn:전체"]);
});
test("campaigns 응답이 배열이 아니면 '캠페인 없음'으로 넘기지 않고 오류", () => {
  for (const bad of [null, undefined, {}, "x", { error: 1 }]) assert.match(errOf(() => campaignRows(DAEGU, bad, [])), /캠페인 목록/);
  assert.match(errOf(() => campaignRows(DAEGU, [camp("a")], { data: [] })), /통계/);
});

// ── 실패 행 ──
test("failRows: 그 계정의 지점에만 '전체' failed 행 — 구미·다른 계정 지점은 건드리지 않는다", () => {
  assert.deepEqual(failRows(ULSAN, "네이버 API /stats 401: 인증 실패"), [{ team_key: "ulsan", unit: "전체", metrics: { note: "네이버 API /stats 401: 인증 실패" }, status: "failed" }]);
  const d = failRows(DAEGU, "x");
  assert.deepEqual(d.map((r) => [r.team_key, r.unit, r.status]), [["dsr", "전체", "failed"], ["jpcn", "전체", "failed"]]);
});
test("sanitizeNote: 4자리 이상 숫자는 #, 120자 컷, 문자열 아닌 것도 안전", () => {
  assert.equal(sanitizeNote("고객 1234567 키 abc123456 오류 404 / 12.5"), "고객 # 키 abc# 오류 404 / 12.5");
  assert.equal(sanitizeNote("가".repeat(300)).length, 120);
  assert.equal(sanitizeNote(undefined), "undefined");
  assert.equal(sanitizeNote(new Error("x 99999")), "Error: x #");
});
test("failRows 의 note 는 전화번호처럼 보이는 숫자열을 가린다", () => {
  const rows = failRows(DAEGU, "네이버 API 실패 010-1234-5678 / 01012345678");
  for (const r of rows) assert.doesNotMatch(r.metrics.note, /\d{4}/);
  // 개인정보 검사를 통과해 저장 가능한 행이 된다
  assert.equal(toRowsPure("naver_ad", D, { rows }, TEAMS).length, 2);
});

// ── 검증기(rows.mjs)를 실제로 통과하는지 ──
test("두 계정 결과(정상 + 실패 + 0 행)를 한 번의 toRowsPure 에 넣어도 통과, 중복 없음", () => {
  const rows = [
    ...campaignRows(DAEGU, [camp("대구 영어", "ELIGIBLE", "1"), camp("대구 영어", "ELIGIBLE", "2"), camp("소상공인일어중어", "ELIGIBLE", "3"), camp("옛 캠페인", "PAUSED", "4")], [st("1", 100, 5, 5000, 2), st("2", 50, 1, 900, 3), st("3", 40, 2, 1500, 4)]),
    ...failRows(ULSAN, "네이버 API /ncc/campaigns 403: 권한 없음 #"),
  ];
  const out = toRowsPure("naver_ad", D, { rows }, TEAMS);
  assert.deepEqual(out.map((r) => [r.team_id, r.unit, r.status]), [[1, "대구 영어", "ok"], [2, "소상공인일어중어", "ok"], [3, "전체", "failed"]]);
  assert.equal(out[0].metrics.impressions, 150); assert.equal(out[0].metrics.campaign_id, "1");
  const empty = toRowsPure("naver_ad", D, { rows: [...emptyRows(DAEGU), ...emptyRows(ULSAN)] }, TEAMS);
  assert.deepEqual(empty.map((r) => [r.team_id, r.unit, r.status]), [[1, "전체", "ok"], [2, "전체", "ok"], [3, "전체", "ok"]]);
});
