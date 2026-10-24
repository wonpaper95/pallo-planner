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
  assert.deepEqual(r.rows, [{ date: "2026-10-20", campaign: "동성로 리드", adset: "직장인", ad_name: "퇴근후영어A", impressions: 1200, reach: 900, clicks: 30, leads: 4, spend: 40000, team_key: "dsr" }]);
});

test("normalize: 광고 연령·성별 (영어 헤더, 리드 없으면 결과)", () => {
  const csv = [
    "Reporting starts,Reporting ends,Ad name,Age,Gender,Impressions,Link clicks,Results,Amount spent (KRW)",
    "2026-07-27,2026-10-25,퇴근후영어A,25-34,female,500,12,3,15000",
  ].join("\n");
  const r = MK.normalize(csv);
  assert.equal(r.kind, "ads_demo");
  assert.deepEqual(r.rows[0], { period_from: "2026-07-27", period_to: "2026-10-25", ad_name: "퇴근후영어A", age: "25-34", gender: "female", impressions: 500, clicks: 12, leads: 3, spend: 15000, team_key: null });
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
    day("2026-10-02", "B", 60, 0), day("2026-10-21", "B", 60, 0),
    // C: 리드 2건 → hold
    day("2026-10-21", "C", 20000, 2),
    // D: 이전 리드당 1만 → 이번주 3만, 등록 0 → cut(피로도)
    day("2026-09-30", "D", 50000, 5), day("2026-10-22", "D", 30000, 1),
  ];
  const leads = [lead("1", "A", "2026-10-01", "enroll"), lead("2", "A", "2026-10-20", "enroll"), lead("3", "D", "2026-09-30", "consult")];
  const r = MK.buildWeekly({ week, ads, organic: [], leads });
  const v = Object.fromEntries(r.ads.map((a) => [a.ad_name, [a.verdict, a.reason]]));
  assert.deepEqual(v.A, ["keep", "등록당 비용 지점 평균 이하"]);
  assert.deepEqual(v.B, ["cut", "4주 지출 $120, 리드 0"]);
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
  assert.deepEqual(r.organic.bottom.map((x) => x.post_id), []); // 3개뿐이면 전부 top 이라 bottom 은 비움
  assert.equal(r.flags.noAds, true);
});

test("buildWeekly: 오가닉 bottom 은 top 과 겹치지 않음", () => {
  const p = (id, saves) => ({ platform: "instagram", post_id: id, published_at: "2026-10-20", type: "릴스", permalink: "", caption: id, views: 0, reach: 1000, likes: 0, comments: 0, saves, shares: 0, follows: 0 });
  const r = MK.buildWeekly({ week: "2026-10-19", ads: [], leads: [], organic: [p("a", 60), p("b", 50), p("c", 40), p("d", 30), p("e", 20)] });
  assert.deepEqual(r.organic.top.map((x) => x.post_id), ["a", "b", "c"]);
  assert.deepEqual(r.organic.bottom.map((x) => x.post_id), ["e", "d"]);
});

test("buildWeekly: 광고 밖 등록은 지점 평균·합계에서 빼고 otherEnrolls4w 로 따로 센다", () => {
  const r = MK.buildWeekly({ week: "2026-10-19", ads: [day("2026-10-01", "A", 30000, 3), day("2026-10-20", "A", 30000, 3)], organic: [],
    leads: [lead("1", "A", "2026-10-20", "enroll"), lead("2", "", "2026-10-20", "enroll"), lead("3", "", "2026-10-10", "enroll")] });
  assert.deepEqual([r.ads[0].verdict, r.ads[0].reason], ["keep", "등록당 비용 지점 평균 이하"]);
  assert.equal(r.totals.enrolls4w, 1);
  assert.equal(r.totals.otherEnrolls4w, 2);
  assert.equal(r.totals.cpe4w, 60000);
});

test("buildWeekly: 이번 주 지출 있고 리드 0 이면 피로도 (cheap 이면 watch, 아니면 cut)", () => {
  const ads = [day("2026-10-01", "X", 50000, 5), day("2026-10-20", "X", 20000, 0), day("2026-10-01", "Y", 50000, 5), day("2026-10-20", "Y", 20000, 0)];
  const leads = [lead("1", "Y", "2026-10-02", "enroll")];
  const r = MK.buildWeekly({ week: "2026-10-19", ads, organic: [], leads });
  const v = Object.fromEntries(r.ads.map((a) => [a.ad_name, [a.verdict, a.reason]]));
  assert.deepEqual(v.X, ["cut", "이번 주 지출 $20,000, 리드 0 (피로도)"]);
  assert.deepEqual(v.Y, ["watch", "등록은 좋지만 이번 주 지출 $20,000, 리드 0 (피로도)"]);
});

test("buildWeekly: 리드 대부분이 7일 이내면 등록 0 이어도 판단 보류", () => {
  const ads = [day("2026-10-20", "M", 30000, 6)];
  const leads = [lead("1", "M", "2026-10-10", "lead"), ...["2026-10-19", "2026-10-20", "2026-10-22", "2026-10-24"].map((d, i) => lead("y" + i, "M", d, "lead"))];
  const r = MK.buildWeekly({ week: "2026-10-19", ads, organic: [], leads });
  assert.deepEqual([r.ads[0].verdict, r.ads[0].reason], ["hold", "판단 보류 (최근 7일 리드 4/5건)"]);
  // 오래된 리드가 더 많으면 기존 규칙 그대로
  const r2 = MK.buildWeekly({ week: "2026-10-19", ads, organic: [], leads: [lead("1", "M", "2026-10-02", "lead"), lead("2", "M", "2026-10-05", "lead"), lead("3", "M", "2026-10-20", "lead")] });
  assert.deepEqual([r2.ads[0].verdict, r2.ads[0].reason], ["watch", "리드는 있으나 4주 등록 0"]);
});

test("teamKeyOf: 평일중·일본여행 영어회화는 일본어중국어점이 아님", () => {
  assert.equal(MK.teamKeyOf("대구 평일중 직장인 영어"), "dsr");
  assert.equal(MK.teamKeyOf("대구 일본여행 영어회화"), "dsr");
  assert.equal(MK.teamKeyOf("대구 일중 모집"), "jpcn");
  assert.equal(MK.teamKeyOf("250917 대구 일본여행자 - 사본"), "jpcn");
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

test("decode: UTF-8 BOM · UTF-16LE", () => {
  const u8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("광고 이름,x")]);
  assert.equal(MK.decode(u8), "광고 이름,x");
  const s = "id\tad_name";
  const u16 = new Uint8Array(2 + s.length * 2); u16[0] = 0xff; u16[1] = 0xfe;
  for (let i = 0; i < s.length; i++) { u16[2 + i * 2] = s.charCodeAt(i) & 255; u16[3 + i * 2] = s.charCodeAt(i) >> 8; }
  assert.equal(MK.decode(u16.buffer), s);
});

test("teamKeyOf: 지역 단어로 지점", () => {
  assert.equal(MK.teamKeyOf("울산 일본어"), "ulsan");
  assert.equal(MK.teamKeyOf("[일본어] 울산_AI와앙 261013"), "ulsan");
  assert.equal(MK.teamKeyOf("대구 영어"), "dsr");
  assert.equal(MK.teamKeyOf("[스페인어][멤버모집] 261021 대구 영상_틀려도괜찮아"), "dsr");
  assert.equal(MK.teamKeyOf("대구 일본어"), "jpcn");
  assert.equal(MK.teamKeyOf("260629 대일 세연마츠리"), "jpcn");
  assert.equal(MK.teamKeyOf("구미 오픈"), "gumi");
  assert.equal(MK.teamKeyOf("261012 팔로첫광고"), null);
  assert.equal(MK.teamKeyOf("팔로 일본어 잠재고객"), "jpcn");
  assert.equal(MK.teamKeyOf("팔로 중국어 잠재고객 니쩐빵워쩐빵"), "jpcn");
  assert.equal(MK.teamKeyOf("대*일중*landing or Naver"), "jpcn");
  assert.equal(MK.teamKeyOf("250917 대구 일본여행자 - 사본"), "jpcn");
  assert.equal(MK.teamKeyOf("울산 일본어"), "ulsan");
  assert.equal(MK.teamKeyOf("대구 영어"), "dsr");
});

test("normalize: 실제 광고관리자 일별 (USD, 일 열 없음, 결과 표시 도구)", () => {
  const csv = [
    '"보고 시작","보고 종료","캠페인 이름","광고 이름",결과,"결과 표시 도구","지출 금액 (USD)",노출,도달,"링크 클릭","광고 세트 이름"',
    "2026-10-23,2026-10-23,대구 스페인어,[스페인어][멤버모집] 261021 대구 영상_틀려도괜찮아,1,actions:leadgen.other,3.29,630,500,20,[스페인어] 대구 영상소재",
    "2026-10-23,2026-10-23,울산 영어,팔로_랜딩_IMG1378,7,actions:omni_landing_page_view,2.10,300,250,9,랜딩홈페이지",
    "2026-10-22,2026-10-22,,261012 팔로첫광고,,,1.00,100,90,1,베스트소재",
  ].join("\n");
  const r = MK.normalize(csv);
  assert.equal(r.kind, "ads_daily");
  assert.equal(r.currency, "USD");
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.rows.map((x) => [x.date, x.leads, x.spend, x.team_key]), [
    ["2026-10-23", 1, 3.29, "dsr"],
    ["2026-10-23", 0, 2.1, "ulsan"],
    ["2026-10-22", 0, 1, null],
  ]);
});

test("normalize: 실제 연령·성별 (성 열, 기간)", () => {
  const csv = [
    '"보고 시작","보고 종료","광고 이름",연령,성,결과,"결과 표시 도구","지출 금액 (USD)",노출,"링크 클릭","광고 세트 이름"',
    "2026-07-26,2026-10-23,250415 울산 feelfree - 사본,25-34,female,5,actions:leadgen.other,44.82,8111,72,테스트1(맞춤타겟)",
  ].join("\n");
  const r = MK.normalize(csv);
  assert.equal(r.kind, "ads_demo");
  assert.deepEqual(r.rows[0], { period_from: "2026-07-26", period_to: "2026-10-23", ad_name: "250415 울산 feelfree - 사본", age: "25-34", gender: "female", impressions: 8111, clicks: 72, leads: 5, spend: 44.82, team_key: "ulsan" });
});

test("normalize: 원화 파일은 currency KRW", () => {
  assert.equal(MK.normalize("광고 이름,일,지출 금액 (KRW)\nA,2026-10-20,1000").currency, "KRW");
});

test("sanitizeLead: 전산 신규 회신 실제 상태값 (띄어쓰기 포함)", () => {
  const s = (status) => MK.sanitizeLead({ source_key: "2026-10-24T19:35|A|0", ad_name: "A", lead_date: "2026-10-24", status }).lead?.status;
  assert.equal(s("진행 중"), "lead");
  assert.equal(s("최후 통첩"), "lead");
  assert.equal(s("예약 확정"), "consult");
  assert.equal(s("전화상 안함"), "lost");
  assert.equal(s("등록"), "enroll");
});

test("sanitizeLead: 긴 숫자 리드 번호는 전화번호로 오인하지 않음", () => {
  assert.equal(MK.sanitizeLead({ source_key: "90106123456789", ad_name: "A", lead_date: "2026-10-20", status: "lead" }).ok, true);
  assert.equal(MK.sanitizeLead({ source_key: "1", ad_name: "A", lead_date: "2026-10-20", status: "lead", subject: "01012345678" }).ok, false);
});

test("buildWeekly: 4주 안에 리드가 없으면(오래된 리드만) 등록 데이터 누락", () => {
  const r = MK.buildWeekly({ week: "2026-10-19", ads: [{ date: "2026-10-20", ad_name: "A", campaign: "", adset: "", impressions: 0, reach: 0, clicks: 0, leads: 10, spend: 50 }], organic: [],
    leads: [{ source_key: "1", ad_name: "A", lead_date: "2025-01-01", status: "enroll" }] });
  assert.equal(r.flags.noLeads, true);
  assert.deepEqual([r.ads[0].verdict, r.ads[0].reason], ["hold", "등록 데이터 누락"]);
});

test("teamKeyOf: 명시 과목이 우선, 영어 제외는 느슨한 말에만", () => {
  assert.equal(MK.teamKeyOf("[중국어][멤버모집] 대구 영어권 여행"), "jpcn");
  assert.equal(MK.teamKeyOf("대구 일본어 영어로 배우기"), "jpcn");
  assert.equal(MK.teamKeyOf("대구 일중 스페인어 무료체험"), "jpcn");
  assert.equal(MK.teamKeyOf("대구 평일중 직장인 영어"), "dsr");
  assert.equal(MK.teamKeyOf("대구 일본여행 영어회화"), "dsr");
});

test("teamKeyOfTeamName: 운영·개발 지점 이름 8개", () => {
  const m = { 대구영어점: "dsr", 대구동성로점: "dsr", 대구일중점: "jpcn", 대구일본어중국어점: "jpcn", 울산점: "ulsan", 구미점: "gumi" };
  for (const [n, k] of Object.entries(m)) assert.equal(MK.teamKeyOfTeamName(n), k, n);
  assert.equal(MK.teamKeyOfTeamName("모르는점"), null);
  assert.equal(MK.teamKeyOfTeamName(undefined), null);
});

test("buildWeekly: 이번 주 지출 $1·리드 0 은 피로도 아님, $60 은 피로도", () => {
  assert.equal(MK.ZERO_WEEK_MIN_SPEND, 5);
  const mk = (sp) => [day("2026-10-01", "X", 50000, 5), day("2026-10-20", "X", sp, 0)];
  const lds = [lead("1", "X", "2026-10-02", "enroll")];
  const run = (sp) => MK.buildWeekly({ week: "2026-10-19", ads: mk(sp), organic: [], leads: lds }).ads[0];
  assert.doesNotMatch(run(1).reason, /피로도/);
  assert.match(run(60).reason, /피로도/);
});
