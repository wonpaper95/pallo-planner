import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const MK = createRequire(import.meta.url)("../mk-core.js");

test("parseCsv: BOM·따옴표·쉼표·CRLF", () => {
  const t = "﻿a,b,c\r\n\"x, y\",\"그가 \"\"안녕\"\"\",3\r\n";
  assert.deepEqual(MK.parseCsv(t), [["a", "b", "c"], ["x, y", "그가 \"안녕\"", "3"]]);
});

test("toNumber: 쉼표·원·빈칸", () => {
  assert.equal(MK.toNumber("12,345"), 12345);
  assert.equal(MK.toNumber("₩3,000"), 3000);
  assert.equal(MK.toNumber(""), 0);
  assert.equal(MK.toNumber("-"), 0);
});

test("toDate: ISO·슬래시·시간 포함", () => {
  assert.equal(MK.toDate("2026-10-20"), "2026-10-20");
  assert.equal(MK.toDate("10/20/2026 18:03"), "2026-10-20");
  assert.equal(MK.toDate("2026. 10. 5."), "2026-10-05");
  assert.equal(MK.toDate("합계"), null);
});

test("normalize: 광고 일별 (한국어 헤더), 합계 줄 무시", () => {
  const csv = [
    "보고 시작,보고 종료,캠페인 이름,광고 세트 이름,광고 이름,일,노출,도달,링크 클릭,리드,지출 금액 (KRW)",
    "2026-10-19,2026-10-25,동성로 리드,직장인,퇴근후영어A,2026-10-20,\"1,200\",900,30,4,\"40,000\"",
    "2026-10-19,2026-10-25,,,,,5000,,,,",
  ].join("\n");
  const r = MK.normalize(csv);
  assert.equal(r.kind, "ads_daily");
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.rows, [{ date: "2026-10-20", campaign: "동성로 리드", adset: "직장인", ad_name: "퇴근후영어A", impressions: 1200, reach: 900, clicks: 30, leads: 4, spend: 40000 }]);
});

test("normalize: 광고 연령·성별 (영어 헤더, 리드 없으면 결과)", () => {
  const csv = [
    "Reporting starts,Reporting ends,Ad name,Age,Gender,Impressions,Link clicks,Results,Amount spent (KRW)",
    "2026-07-27,2026-10-25,퇴근후영어A,25-34,female,500,12,3,15000",
  ].join("\n");
  const r = MK.normalize(csv);
  assert.equal(r.kind, "ads_demo");
  assert.deepEqual(r.rows[0], { period_from: "2026-07-27", period_to: "2026-10-25", ad_name: "퇴근후영어A", age: "25-34", gender: "female", impressions: 500, clicks: 12, leads: 3, spend: 15000 });
});

test("normalize: 인스타 오가닉", () => {
  const csv = [
    "게시물 ID,계정 사용자 이름,설명,게시 시간,게시물 유형,퍼머링크,조회,도달,좋아요,댓글 수,저장,공유,팔로우",
    "1789,pallo_dsr,퇴근 후 영어 한마디,10/21/2026 19:00,릴스,https://instagram.com/reel/x,3000,2500,120,8,40,15,3",
  ].join("\n");
  const r = MK.normalize(csv);
  assert.equal(r.kind, "organic");
  assert.deepEqual(r.rows[0], { platform: "instagram", post_id: "1789", published_at: "2026-10-21", type: "릴스", permalink: "https://instagram.com/reel/x", caption: "퇴근 후 영어 한마디", views: 3000, reach: 2500, likes: 120, comments: 8, saves: 40, shares: 15, follows: 3 });
});

test("normalize: 모르는 파일은 kind null, 필수 열 빠지면 missing", () => {
  assert.equal(MK.normalize("이름,전화\n홍길동,010").kind, null);
  const r = MK.normalize("광고 이름,일,노출\nA,2026-10-20,10");
  assert.equal(r.kind, "ads_daily");
  assert.deepEqual(r.missing, ["spend"]);
});
