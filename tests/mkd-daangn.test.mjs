import { test } from "node:test";
import assert from "node:assert/strict";
import { DAANGN_TEAMS, dashboardUrl, teamOfProfile, accountsFrom, daangnLogin, lastFinal, datesToWrite, teamInputs, failInputs } from "../scripts/mkd/daangn-rows.mjs";
import { toRowsPure } from "../scripts/mkd/rows.mjs";

const TEAMS = [{ id: 1, name: "구미점", key: "gumi" }, { id: 2, name: "대구영어점", key: "dsr" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "대구일중점", key: "jpcn" }];

test("teamOfProfile·accountsFrom: 비즈프로필 이름 → 지점, ACTIVE·숫자 id·지점마다 하나만", () => {
  assert.deepEqual(["팔로 대구동성로점", "팔로 일본어중국어회화 대구동성로점", "팔로 울산점", "팔로 구미점", "다른 학원 대구점", ""].map(teamOfProfile), ["dsr", "jpcn", "ulsan", "gumi", null, null]);
  const json = { data: { businessAccounts: [{ id: "4150192", name: "팔로 대구동성로점", status: "ACTIVE" }, { id: 4138201, name: "팔로 울산점", status: "ACTIVE" }, { id: "9", name: "팔로 울산점", status: "ACTIVE" },
    { id: "7", name: "팔로 일본어중국어회화 대구동성로점", status: "PENDING" }, { id: "x", name: "팔로 구미점", status: "ACTIVE" }] } };
  assert.deepEqual(accountsFrom(json), [{ id: "4150192", team_key: "dsr" }, { id: "4138201", team_key: "ulsan" }]);
  assert.deepEqual(accountsFrom(null), []);
  assert.equal(dashboardUrl("4150192"), "https://business.daangn.com/profile/4150192/dashboard");
  assert.deepEqual(DAANGN_TEAMS, ["dsr", "jpcn", "ulsan"]);
});
test("daangnLogin: 당근 계정 로그인 화면", () => {
  assert.equal(daangnLogin({ url: "https://accounts.daangn.com/sign-in?next=x", title: "로그인 - 당근 계정" }), true);
  assert.equal(daangnLogin({ url: "https://business.daangn.com/profile/1/dashboard", title: "통계 - 당근비즈니스" }), false);
  assert.equal(daangnLogin({ url: "https://business.daangn.com/login", title: "로그인 - 당근비즈니스" }), true);
});
test("lastFinal: 한국 시각 8시 전이면 그저께, 8시부터 어제", () => {
  assert.equal(lastFinal(new Date("2026-10-30T21:10:00Z")), "2026-10-29"); // 10/31 06:10 KST
  assert.equal(lastFinal(new Date("2026-10-30T23:00:00Z")), "2026-10-30"); // 10/31 08:00 KST
});
test("datesToWrite: 창 [D-(N-1), D] 중 확정된 날까지, 이미 ok 인 날 빼고 오름차순", () => {
  assert.deepEqual(datesToWrite("2026-10-30", 3, "2026-10-29"), ["2026-10-28", "2026-10-29"]);
  assert.deepEqual(datesToWrite("2026-10-30", 3, "2026-10-29", new Set(["2026-10-28"])), ["2026-10-29"]);
  assert.deepEqual(datesToWrite("2026-10-28", 2, "2026-10-29"), ["2026-10-27", "2026-10-28"]);
  assert.deepEqual(datesToWrite("2026-10-30", 1, "2026-10-29"), []);
});
const DETAIL = { data: { details: [{ date: "2026-10-29", inflowCount: 3, inflowCustomerCount: 2, followerCount: 0 }, { date: "2026-10-28", inflowCount: 0, inflowCustomerCount: 0, followerCount: 0 }, { date: "2026-10-27", inflowCount: "x", inflowCustomerCount: 1 }] } };
test("teamInputs: 날짜마다 '전체' 한 행(조회수·방문 고객수), 단골은 가장 최근 날에만, 그날 줄이 없거나 이상하면 failed", () => {
  const r = teamInputs("dsr", DETAIL, 4, ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]);
  assert.deepEqual(r["2026-10-29"].rows, [{ team_key: "dsr", unit: "전체", metrics: { views: 3, visitors: 2, followers: 4 }, status: "ok" }]);
  assert.deepEqual(r["2026-10-28"].rows[0].metrics, { views: 0, visitors: 0 });
  assert.equal(r["2026-10-27"].rows[0].status, "failed");
  assert.equal(r["2026-10-26"].rows[0].metrics.note, "그날 통계 없음");
  assert.deepEqual(teamInputs("dsr", DETAIL, null, ["2026-10-29"])["2026-10-29"].rows[0].metrics, { views: 3, visitors: 2 });
  for (const [d, input] of Object.entries(r)) assert.equal(toRowsPure("daangn", d, input, TEAMS)[0].team_id, 2);
});
test("failInputs: 날짜마다 실패·로그인 필요 '전체' 행 — rows 검증 통과", () => {
  const f = failInputs("ulsan", ["2026-10-29"], "로그인 필요", "login_required");
  assert.deepEqual(f, { "2026-10-29": { rows: [{ team_key: "ulsan", unit: "전체", metrics: { note: "로그인 필요" }, status: "login_required" }] } });
  assert.equal(toRowsPure("daangn", "2026-10-29", f["2026-10-29"], TEAMS)[0].status, "login_required");
});
