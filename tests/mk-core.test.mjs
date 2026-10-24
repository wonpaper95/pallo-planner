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

test("sanitizeLead: 허용 필드만, 전화번호·이름 거부", () => {
  const ok = MK.sanitizeLead({ source_key: "1234", ad_name: "퇴근후영어A", lead_date: "2026-10-20", status: "등록", name: "홍길동", phone: "010-1234-5678" });
  assert.deepEqual(ok, { ok: true, lead: { source_key: "1234", ad_name: "퇴근후영어A", lead_date: "2026-10-20", status: "enroll", age_band: null, subject: null } });
  assert.equal(MK.sanitizeLead({ source_key: "1", ad_name: "010-1234-5678", lead_date: "2026-10-20", status: "lead" }).ok, false);
  assert.equal(MK.sanitizeLead({ source_key: "1", ad_name: "A", lead_date: "2026-10-20", status: "알수없음" }).ok, false);
  assert.equal(MK.sanitizeLead({ ad_name: "A", lead_date: "2026-10-20", status: "lead" }).ok, false);
});

test("weekStart: 월요일", () => {
  assert.equal(MK.weekStart("2026-10-25"), "2026-10-19"); // 일요일
  assert.equal(MK.weekStart("2026-10-19"), "2026-10-19");
  assert.equal(MK.addDays("2026-10-19", -21), "2026-09-28");
});

const day = (date, ad_name, spend, leads) => ({ date, ad_name, campaign: "", adset: "", impressions: 0, reach: 0, clicks: 0, leads, spend });
const lead = (k, ad_name, lead_date, status) => ({ source_key: k, ad_name, lead_date, status });

test("buildWeekly: 판정 규칙", () => {
  const week = "2026-10-19";
  const ads = [
    // A: 싸게 등록 → keep
    day("2026-10-01", "A", 30000, 3), day("2026-10-20", "A", 30000, 3),
    // B: 돈만 쓰고 리드 0 → cut
    day("2026-10-02", "B", 60000, 0), day("2026-10-21", "B", 60000, 0),
    // C: 리드 2건 → hold
    day("2026-10-21", "C", 20000, 2),
    // D: 이전 리드당 1만 → 이번주 3만, 등록 0 → cut(피로도)
    day("2026-09-30", "D", 50000, 5), day("2026-10-22", "D", 30000, 1),
  ];
  const leads = [lead("1", "A", "2026-10-01", "enroll"), lead("2", "A", "2026-10-20", "enroll"), lead("3", "D", "2026-09-30", "consult")];
  const r = MK.buildWeekly({ week, ads, organic: [], leads });
  const v = Object.fromEntries(r.ads.map((a) => [a.ad_name, [a.verdict, a.reason]]));
  assert.deepEqual(v.A, ["keep", "등록당 비용 지점 평균 이하"]);
  assert.deepEqual(v.B, ["cut", "4주 지출 120,000원, 리드 0"]);
  assert.deepEqual(v.C, ["hold", "판단 보류 (표본 2건)"]);
  assert.deepEqual(v.D, ["cut", "리드당 비용 200% 상승(피로도)"]);
  assert.equal(r.totals.enrolls4w, 2);
  assert.equal(r.flags.noOrganic, true);
});

test("buildWeekly: 등록 데이터 없으면 보류, 리드당 비용으로 대체 안 함", () => {
  const r = MK.buildWeekly({ week: "2026-10-19", ads: [day("2026-10-20", "A", 50000, 10)], organic: [], leads: [] });
  assert.equal(r.flags.noLeads, true);
  assert.deepEqual([r.ads[0].verdict, r.ads[0].reason], ["hold", "등록 데이터 누락"]);
});

test("buildWeekly: 오가닉 상위·하위", () => {
  const p = (id, reach, saves, shares) => ({ platform: "instagram", post_id: id, published_at: "2026-10-20", type: "릴스", permalink: "", caption: id, views: 0, reach, likes: 0, comments: 0, saves, shares, follows: 0 });
  const r = MK.buildWeekly({ week: "2026-10-19", ads: [], leads: [], organic: [p("a", 1000, 50, 10), p("b", 1000, 1, 0), p("c", 50, 40, 40), p("d", 1000, 10, 5)] });
  assert.deepEqual(r.organic.top.map((x) => x.post_id), ["a", "d", "b"]);
  assert.deepEqual(r.organic.bottom.map((x) => x.post_id), ["b", "d", "a"]);
  assert.equal(r.flags.noAds, true);
});

test("buildPersonaInputs: 퍼널·등록자 분포", () => {
  const leads = [
    { ...lead("1", "A", "2026-10-01", "enroll"), age_band: "30대", subject: "영어" },
    { ...lead("2", "A", "2026-10-02", "enroll"), age_band: "30대", subject: "스페인어" },
    { ...lead("3", "B", "2026-10-03", "consult"), age_band: "20대", subject: "영어" },
  ];
  const demo = [{ ad_name: "A", age: "25-34", gender: "female", leads: 6 }, { ad_name: "A", age: "25-34", gender: "male", leads: 2 }];
  const r = MK.buildPersonaInputs({ leads, demo });
  assert.equal(r.sample, 3);
  assert.deepEqual(r.funnel, { lead: 0, consult: 1, visit: 0, enroll: 2, lost: 0 });
  assert.deepEqual(r.enrolledByAge, { "30대": 2 });
  assert.deepEqual(r.enrolledBySubject, { 영어: 1, 스페인어: 1 });
  assert.deepEqual(r.leadsByAgeGender, [{ age: "25-34", gender: "female", leads: 6, share: 0.75 }, { age: "25-34", gender: "male", leads: 2, share: 0.25 }]);
});
