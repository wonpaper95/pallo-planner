import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRANCHES, GOOGLE_ACCOUNTS, jeonsanUrl, googleUrl, needsLogin, kstDate, isYesterdayKst, monthsBack, validDate,
  acceptJeonsan, isFirstOfMonth, prevMonthOf, mergeJeonsan, jeonsanRows, failRow, jeonsanOutput,
  googleTeamOf, parseStatus, num, parseMoney, readGrid, checkTotals, noticeFlags, googleRows, googleFailRows, googleOutput,
  parseRange, rangeIsDay, rangeText, partitionValid, playwrightCandidates,
  rangeIs, checkRange, conversionsUrl, conversionStatus, googleRangeAccount, googleRangeFail, googleRangeOutput,
} from "../scripts/mkd/browser-rows.mjs";
import { toRowsPure } from "../scripts/mkd/rows.mjs";

const TEAMS = [{ id: 1, name: "대구동성로점", key: "dsr" }, { id: 2, name: "대구일본어중국어점", key: "jpcn" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "구미점", key: "gumi" }];
const D = "2026-10-28";
const errOf = (fn) => { try { fn(); } catch (e) { return String(e.message); } assert.fail("던져야 하는데 통과했어요"); };

// ── 상수·주소 ──
test("지점·계정 표: 전산 코드 3곳, 구글 계정 2곳(구미는 없음)", () => {
  assert.deepEqual(BRANCHES.map((b) => [b.code, b.team_key]), [["DAEGUDSR", "dsr"], ["DAEGUJPCH", "jpcn"], ["ULSAN", "ulsan"]]);
  assert.deepEqual(GOOGLE_ACCOUNTS.map((a) => [a.name, a.ocid, a.teams]), [["대구", "6771267051", ["dsr", "jpcn"]], ["울산", "7116215996", ["ulsan"]]]);
  assert.equal(jeonsanUrl("DAEGUDSR"), "https://branch.pallo.co.kr/DAEGUDSR/admin/call");
  assert.equal(googleUrl("6771267051"), "https://ads.google.com/aw/campaigns?ocid=6771267051");
});

// ── 로그인 판정 ──
test("needsLogin: sso./accounts.google.com 주소, 비밀번호 칸, 제목의 '로그인' 중 하나면 로그인 필요", () => {
  const ok = { url: "https://branch.pallo.co.kr/DAEGUDSR/admin/call", title: "팔로 전산", hasPassword: false };
  assert.equal(needsLogin(ok), false);
  assert.equal(needsLogin({ ...ok, url: "https://sso.pallo.co.kr/select" }), true);
  assert.equal(needsLogin({ ...ok, url: "https://accounts.google.com/v3/signin/identifier?continue=x" }), true);
  assert.equal(needsLogin({ ...ok, hasPassword: true }), true);
  assert.equal(needsLogin({ ...ok, title: "팔로 로그인" }), true);
  assert.equal(needsLogin({ url: "https://ads.google.com/aw/campaigns?ocid=1", title: "캠페인 - Google Ads", hasPassword: false }), false);
  assert.equal(needsLogin({ url: "not a url", title: "", hasPassword: false }), false); // 주소를 못 읽어도 던지지 않는다
});

// ── 날짜 ──
test("validDate: YYYY-MM-DD 이면서 달력에 있는 날만", () => {
  assert.equal(validDate("2026-10-29"), true);
  for (const bad of ["2026-02-30", "2026-13-01", "20261029", "2026-1-9", "", undefined, "2026-10-29x"]) assert.equal(validDate(bad), false, String(bad));
});
test("kstDate·isYesterdayKst: 한국 날짜 기준 (UTC 15시 이후는 다음 날)", () => {
  const now = new Date("2026-10-30T20:00:00Z"); // KST 10-31 05:00
  assert.equal(kstDate(now), "2026-10-31");
  assert.equal(isYesterdayKst("2026-10-30", now), true);
  assert.equal(isYesterdayKst("2026-10-29", now), false);
  assert.equal(isYesterdayKst("2026-10-31", now), false);
  assert.equal(isYesterdayKst("2026-09-30", new Date("2026-10-01T01:00:00Z")), true); // 달 경계
});
test("monthsBack: D 의 달이 이번 달(KST)보다 몇 달 앞인가", () => {
  const now = new Date("2026-11-01T00:30:00Z"); // KST 11-01 09:30
  assert.equal(monthsBack("2026-11-01", now), 0);
  assert.equal(monthsBack("2026-10-31", now), 1);
  assert.equal(monthsBack("2026-08-15", now), 3);
  assert.equal(monthsBack("2025-12-31", now), 11);
  assert.equal(monthsBack("2026-11-30", now), 0);
  assert.equal(monthsBack("2026-12-01", now), -1); // 미래 달 — 호출한 쪽이 거른다
});

// ── 전산 합격 검사 ──
const GOOD = { date: D, total: 11, bySource: { meta: { inquiries: 9 }, "카카오채널": { inquiries: 1 }, "네이버 예약": { inquiries: 1 } }, pages: 10, scanned: 193, stoppedBy: "cutoff", newest: "2026-10-29", oldest: "2026-10-13", unparsed: 0, missingCols: [], filterSet: true, statuses: { "예약 확정": 68 }, lastPageRows: 20 };
const rejects = (patch, reason) => { const v = acceptJeonsan({ ...GOOD, ...patch }, D); assert.equal(v.ok, false, JSON.stringify(patch)); assert.equal(v.reason, reason, JSON.stringify(patch)); };

test("acceptJeonsan: 10/29 실제 결과 모양은 합격", () => { assert.deepEqual(acceptJeonsan(GOOD, D), { ok: true, reason: "" }); });
test("acceptJeonsan: 합격 모양 둘 — lastPage(끝 쪽, oldest<=D) 도 합격", () => {
  assert.equal(acceptJeonsan({ ...GOOD, stoppedBy: "lastPage", pages: 3, oldest: "2026-10-20", lastPageRows: 7 }, D).ok, true);
  assert.equal(acceptJeonsan({ ...GOOD, stoppedBy: "lastPage", pages: 1, lastPageRows: 19 }, D).ok, true);   // 1쪽에 20 미만이면 정말 끝
  assert.equal(acceptJeonsan({ ...GOOD, stoppedBy: "lastPage", oldest: "2026-10-28" }, D).ok, true);          // oldest == D 도 통과
});
test("acceptJeonsan: error 가 있으면 불합격 — 열 없음은 '열 없음', 나머지는 '전산 오류' (원문은 note 에 싣지 않는다)", () => {
  assert.deepEqual(acceptJeonsan({ error: "열 없음: 상태 (전산 화면이 바뀌었을 수 있어요)", filterSet: true }, D), { ok: false, reason: "열 없음" });
  assert.deepEqual(acceptJeonsan({ error: "지원 시간 형식을 못 읽었어요", pages: 1, unparsed: 20 }, D), { ok: false, reason: "시간 형식 못 읽음" });
  assert.deepEqual(acceptJeonsan({ error: "날짜 형식은 YYYY-MM-DD" }, D), { ok: false, reason: "전산 오류" });
});
test("acceptJeonsan: 결과가 없거나 객체가 아니면 불합격", () => {
  for (const bad of [null, undefined, "x", 3]) assert.equal(acceptJeonsan(bad, D).ok, false);
});
test("acceptJeonsan: filterSet !== true", () => { rejects({ filterSet: false }, "필터 못 맞춤"); rejects({ filterSet: undefined }, "필터 못 맞춤"); });
test("acceptJeonsan: scanned 가 0 이거나 없음", () => { rejects({ scanned: 0 }, "읽은 행 없음"); rejects({ scanned: undefined }, "읽은 행 없음"); });
test("acceptJeonsan: unparsed !== 0", () => { rejects({ unparsed: 1 }, "시간 못 읽은 행"); rejects({ unparsed: undefined }, "시간 못 읽은 행"); });
test("acceptJeonsan: stoppedBy 는 cutoff|lastPage 만 — maxPages·stalled·없음은 불합격", () => {
  rejects({ stoppedBy: "maxPages" }, "쪽 수 상한");
  rejects({ stoppedBy: "stalled" }, "표 끝을 못 찾음");
  rejects({ stoppedBy: null }, "표 끝을 못 찾음");
});
test("acceptJeonsan: lastPage 인데 1쪽이고 마지막 쪽 행이 20 이상이면(꽉 찬 쪽에서 다음 버튼을 못 찾음) 불합격", () => {
  rejects({ stoppedBy: "lastPage", pages: 1, lastPageRows: 20 }, "표 끝을 못 찾음");
  rejects({ stoppedBy: "lastPage", pages: 1, lastPageRows: 25 }, "표 끝을 못 찾음");
  assert.equal(acceptJeonsan({ ...GOOD, stoppedBy: "lastPage", pages: 2, lastPageRows: 20, oldest: "2026-10-20" }, D).ok, true); // 2쪽 이상이면 괜찮다
});
test("acceptJeonsan: newest 가 그 보드의 달도 다음 달 1일도 아니면 불합격(표가 그 달 맨 앞에서 시작하지 않음)", () => {
  rejects({ newest: "2026-11-02" }, "달이 안 맞음");
  rejects({ newest: "2026-09-30" }, "달이 안 맞음");
  rejects({ newest: null }, "달이 안 맞음");
  // 보드가 세계 시각으로 달을 나눠 다음 달 1일(한국 0~9시) 문의가 맨 위에 올 수 있다 — 2026-11-01 대구일중 10월 보드에서 실제로 봄
  assert.equal(acceptJeonsan({ ...GOOD, newest: "2026-11-01" }, D).ok, true);
});
test("acceptJeonsan: 전달 보드(boardMonth) — D 가 1일일 때 전달 보드 맨 위는 D 이거나 전달 날짜", () => {
  const D1 = "2026-11-01";
  assert.equal(acceptJeonsan({ ...GOOD, newest: "2026-11-01", oldest: "2026-10-31" }, D1, "2026-10").ok, true);
  assert.equal(acceptJeonsan({ ...GOOD, newest: "2026-10-31", oldest: "2026-10-31" }, D1, "2026-10").ok, true); // 그날 이른 아침 문의가 없으면 전달 날짜부터
  assert.equal(acceptJeonsan({ ...GOOD, newest: "2026-11-02" }, D1, "2026-10").reason, "달이 안 맞음");
  assert.equal(acceptJeonsan({ ...GOOD, newest: "2026-12-31" }, "2027-01-01", "2026-12").ok, true);
  assert.equal(acceptJeonsan({ ...GOOD, newest: "2027-01-01" }, "2027-01-01", "2026-12").ok, true); // 해 넘김
});
test("isFirstOfMonth·prevMonthOf", () => {
  assert.deepEqual(["2026-11-01", "2026-11-02", "2027-01-01"].map(isFirstOfMonth), [true, false, true]);
  assert.deepEqual(["2026-11-01", "2027-01-01"].map(prevMonthOf), ["2026-10", "2026-12"]);
});
test("mergeJeonsan: 두 보드의 합계·유입경로별 건수·쪽·읽은 행을 더한다", () => {
  const a = { total: 3, bySource: { meta: { inquiries: 2, enrolls: 0 }, 기타: { inquiries: 1, enrolls: 0 } }, pages: 1, scanned: 10, missingCols: [] };
  const b = { total: 2, bySource: { meta: { inquiries: 1, enrolls: 0 }, nad_daegu_en_naver: { inquiries: 1, enrolls: 0 } }, pages: 1, scanned: 4, missingCols: ["코멘트"] };
  const m = mergeJeonsan(a, b);
  assert.equal(m.total, 5);
  assert.deepEqual(m.bySource, { meta: { inquiries: 3, enrolls: 0 }, 기타: { inquiries: 1, enrolls: 0 }, nad_daegu_en_naver: { inquiries: 1, enrolls: 0 } });
  assert.deepEqual([m.pages, m.scanned, m.missingCols], [2, 14, ["코멘트"]]);
  assert.equal(acceptJeonsan({ ...GOOD, ...m, bySource: m.bySource, total: m.total }, D).ok, true); // 합친 결과도 합계 검사를 통과
});
test("acceptJeonsan: lastPage 이면 oldest <= D 여야 한다 (D 까지 못 내려간 것이면 불합격)", () => {
  rejects({ stoppedBy: "lastPage", pages: 2, oldest: "2026-10-29" }, "D 까지 못 내려감");
  rejects({ stoppedBy: "lastPage", pages: 2, oldest: null }, "D 까지 못 내려감");
  assert.equal(acceptJeonsan({ ...GOOD, oldest: "2026-10-29" }, D).ok, true); // cutoff 일 땐 이 검사를 하지 않는다
});
test("acceptJeonsan: bySource 문의 합 !== total", () => {
  rejects({ total: 12 }, "합계 불일치");
  rejects({ bySource: { meta: { inquiries: 9 } } }, "합계 불일치");
  rejects({ bySource: undefined }, "합계 불일치");
  assert.equal(acceptJeonsan({ ...GOOD, total: 0, bySource: {} }, D).ok, true); // 0건도 합격
});
test("acceptJeonsan: total 이 숫자가 아니면 불합격", () => { rejects({ total: "11" }, "합계 불일치"); rejects({ total: undefined }, "합계 불일치"); });
test("acceptJeonsan: 앞의 규칙이 먼저 — 여러 개 어긋나면 첫 이유", () => {
  assert.equal(acceptJeonsan({ ...GOOD, filterSet: false, unparsed: 3, total: 99 }, D).reason, "필터 못 맞춤");
});

// ── 전산 행 ──
test("jeonsanRows: 전체 행 + 소스별 행 (키 그대로, 0건 전체 행도 쓴다)", () => {
  assert.deepEqual(jeonsanRows("dsr", GOOD), [
    { team_key: "dsr", unit: "전체", metrics: { inquiries: 11 } },
    { team_key: "dsr", unit: "meta", metrics: { inquiries: 9 } },
    { team_key: "dsr", unit: "카카오채널", metrics: { inquiries: 1 } },
    { team_key: "dsr", unit: "네이버 예약", metrics: { inquiries: 1 } },
  ]);
  assert.deepEqual(jeonsanRows("ulsan", { ...GOOD, total: 0, bySource: {} }), [{ team_key: "ulsan", unit: "전체", metrics: { inquiries: 0 } }]);
});
test("jeonsanRows: 소스 키가 '전체' 로 오면 '기타' 에 합친다 (같은 unit 두 번 방지)", () => {
  const rows = jeonsanRows("dsr", { ...GOOD, total: 3, bySource: { "전체": { inquiries: 1 }, "기타": { inquiries: 2 } } });
  assert.deepEqual(rows.map((r) => `${r.unit}:${r.metrics.inquiries}`), ["전체:3", "기타:3"]);
});
test("jeonsanRows: 코멘트·광고명·유입경로 열이 없으면 전체 행 하나만 partial + '열 없음: …'", () => {
  assert.deepEqual(jeonsanRows("jpcn", { ...GOOD, missingCols: ["코멘트"] }), [{ team_key: "jpcn", unit: "전체", metrics: { inquiries: 11, note: "열 없음: 코멘트" }, status: "partial" }]);
  assert.equal(jeonsanRows("jpcn", { ...GOOD, missingCols: ["광고명", "유입경로"] })[0].metrics.note, "열 없음: 광고명, 유입경로");
  assert.equal(jeonsanRows("jpcn", { ...GOOD, missingCols: [] }).length, 4);
});
test("jeonsanRows: 만든 행이 rows.mjs 검증을 통과한다 (세 지점 한 번에)", () => {
  const rows = [...jeonsanRows("dsr", GOOD), ...jeonsanRows("jpcn", { ...GOOD, missingCols: ["코멘트"] }), failRow("ulsan", "열 없음")];
  const out = toRowsPure("jeonsan", D, { rows }, TEAMS);
  assert.equal(out.length, 6);
  assert.deepEqual(out.filter((r) => r.team_id === 3).map((r) => [r.unit, r.status]), [["전체", "failed"]]);
  assert.deepEqual(out.filter((r) => r.team_id === 2).map((r) => [r.unit, r.status]), [["전체", "partial"]]);
});
test("failRow: 전체 failed(기본)/login_required 행, note 는 4자리 이상 숫자를 #, 120자까지", () => {
  assert.deepEqual(failRow("dsr", "열 없음"), { team_key: "dsr", unit: "전체", metrics: { note: "열 없음" }, status: "failed" });
  assert.deepEqual(failRow("dsr", "로그인 필요", "login_required"), { team_key: "dsr", unit: "전체", metrics: { note: "로그인 필요" }, status: "login_required" });
  assert.equal(failRow("dsr", "코드 123456 오류").metrics.note, "코드 # 오류");
  assert.equal(failRow("dsr", "가".repeat(300)).metrics.note.length, 120);
});
test("jeonsanOutput: 한 줄 JSON 모양과 ok 판단 (failed·login_required 가 하나라도 있으면 ok=false)", () => {
  const good = { team_key: "dsr", status: "ok", total: 11 }, part = { team_key: "jpcn", status: "partial", total: 4 };
  assert.deepEqual(jeonsanOutput(D, [good, part]), { ok: true, date: D, branches: { dsr: { status: "ok", total: 11 }, jpcn: { status: "partial", total: 4 } } });
  const bad = jeonsanOutput(D, [good, { team_key: "ulsan", status: "failed", note: "쪽 수 상한" }]);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.branches.ulsan, { status: "failed", note: "쪽 수 상한" });
  assert.equal(jeonsanOutput(D, [{ team_key: "ulsan", status: "login_required", note: "로그인 필요" }]).ok, false);
});

// ── 구글: 팀·상태·숫자 ──
test("googleTeamOf: 대구 계정은 일본어|중국어|일중|일어|중어 → jpcn, 나머지 dsr / 울산 계정은 전부 ulsan", () => {
  for (const [n, t] of [["대구 일본어", "jpcn"], ["대구 중국어", "jpcn"], ["대구_일중(검색)", "jpcn"], ["소상공인일어중어", "jpcn"], ["소상공인 일어", "jpcn"], ["소상공인 중어", "jpcn"], ["대구_영어(검색광고)", "dsr"], ["대구_디멘드젠", "dsr"], ["", "dsr"]]) assert.equal(googleTeamOf("대구", n), t, n);
  for (const n of ["울산 영어", "울산 일본어", "아무거나"]) assert.equal(googleTeamOf("울산", n), "ulsan", n);
});
test("parseStatus: 예산에 의한·입찰 전략에 의해 앞까지만", () => {
  assert.equal(parseStatus("일시중지됨 예산에 의한 제약 입찰 전략에 의해 제한됨"), "일시중지됨");
  assert.equal(parseStatus("운영 가능 입찰 전략에 의해 제한됨"), "운영 가능");
  assert.equal(parseStatus("운영 가능 예산에 의한 제약"), "운영 가능");
  assert.equal(parseStatus("제한됨"), "제한됨");
  assert.equal(parseStatus("  종료됨  "), "종료됨");
  assert.equal(parseStatus("운영 가능"), "운영 가능");
  assert.equal(parseStatus(undefined), "");
  assert.equal(parseStatus("예산에 의한 제약"), "");
});
test("num: 쉼표·공백 처리, 대시는 null, 이상한 글자는 던진다", () => {
  assert.equal(num("1,204"), 1204); assert.equal(num("0"), 0); assert.equal(num("0.00"), 0); assert.equal(num(" 37 "), 37); assert.equal(num("12.5"), 12.5);
  for (const dash of ["—", "--", "-", "–", ""]) assert.equal(num(dash), null, dash);
  for (const bad of ["abc", "1.2천", "12%", "₩5"]) assert.throws(() => num(bad), /숫자 못 읽음/, bad);
});
test("parseMoney: ₩·쉼표·원 허용, 대시는 null", () => {
  assert.equal(parseMoney("₩18,200"), 18200); assert.equal(parseMoney("₩0"), 0); assert.equal(parseMoney("18,200"), 18200); assert.equal(parseMoney("18,200원"), 18200);
  assert.equal(parseMoney("₩ 1,000"), 1000); assert.equal(parseMoney("—"), null); assert.equal(parseMoney("--"), null);
  assert.throws(() => parseMoney("무료"), /숫자 못 읽음/);
});

// ── 구글: 날짜 범위 글 ──
test("rangeText·parseRange·rangeIsDay: 화면의 기간 글이 D 하루인지", () => {
  assert.equal(rangeText("2026-10-29"), "2026년 10월 29일");
  assert.deepEqual(parseRange("2026년 10월 29일"), { start: "2026-10-29", end: "2026-10-29" });
  assert.deepEqual(parseRange("어제 2026년 10월 29일"), { start: "2026-10-29", end: "2026-10-29" });
  assert.deepEqual(parseRange("2026년 10월 1일 - 2026년 10월 29일"), { start: "2026-10-01", end: "2026-10-29" });
  assert.deepEqual(parseRange("2026년 9월 5일 – 2026년 10월 5일"), { start: "2026-09-05", end: "2026-10-05" });
  assert.equal(parseRange("지난 30일"), null);
  assert.equal(rangeIsDay("2026년 10월 29일", "2026-10-29"), true);
  assert.equal(rangeIsDay("2026년 10월 29일 - 2026년 10월 29일", "2026-10-29"), true);
  assert.equal(rangeIsDay("2026년 10월 28일", "2026-10-29"), false);
  assert.equal(rangeIsDay("2026년 10월 1일 - 2026년 10월 29일", "2026-10-29"), false);
  assert.equal(rangeIsDay("2026년 10월 29일 - 2026년 10월 30일", "2026-10-29"), false);
  assert.equal(rangeIsDay("", "2026-10-29"), false);
});

// ── 구글: 표 읽기 (실제 10/29 모양) ──
// 머리글 칸은 " help_outline" 이 붙고 첫 칸은 체크박스 자리 ", ". 행은 머리글보다 앞에 빈 칸이 하나 더 있다(이름 칸의 위치로 맞춘다).
const HEAD = [", ", "캠페인 help_outline", "예산", "상태", "최적화 점수", "캠페인 유형", "입찰 전략 유형", "전환 가치", "전환수", "전환율", "전환당비용", "노출수", "클릭수", "클릭률(CTR)", "비용", "평균 CPC"].map((h) => h);
const camp = (name, { budget = "₩20,000/일", status = "일시중지됨 예산에 의한 제약 입찰 전략에 의해 제한됨", conv = "0.00", imp = "0", clk = "0", spend = "₩0" } = {}) =>
  ["", "", `${name} settings`, budget, status, "—", "검색", "클릭수 최대화", "0.00", conv, "0.00%", "₩0", imp, clk, "—", spend, "—"];
const totalRow = (label, conv, imp, clk, spend) => ["", "", `${label} help_outline`, "", "", "", "", "", "", conv, "", "", imp, clk, "", spend, ""];
const ALLC = "총계: 현재 보기의 삭제되지 않은 모든 캠페인";
const GRID = [
  ["", "", "캠페인 help_outline", "예산 help_outline"], // 머리글 줄이 role=row 로 잡혀도 캠페인으로 세지 않는다
  camp("대구_영어(검색광고)"),
  camp("대구_일본어(검색광고)", { status: "운영 가능", imp: "1,204", clk: "37", spend: "₩18,200", conv: "2.00" }),
  camp("대구_중국어(검색광고)", { status: "운영 가능 입찰 전략에 의해 제한됨", imp: "310", clk: "9", spend: "₩9,400", conv: "0.00" }),
  ["", "", "작성 중인 초안 1건", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  totalRow("총계: 계정", "2.00", "1,514", "46", "₩27,600"),
  totalRow(ALLC, "2.00", "1,514", "46", "₩27,600"),
];

test("readGrid: 머리글에서 열을 찾고 캠페인 행만 모은다 (총계·초안·머리글 줄 제외, settings 떼기, 상태 첫 단어)", () => {
  const g = readGrid(HEAD, GRID);
  assert.deepEqual(g.campaigns, [
    { name: "대구_영어(검색광고)", status: "일시중지됨", impressions: 0, clicks: 0, spend: 0, conversions: 0 },
    { name: "대구_일본어(검색광고)", status: "운영 가능", impressions: 1204, clicks: 37, spend: 18200, conversions: 2 },
    { name: "대구_중국어(검색광고)", status: "운영 가능", impressions: 310, clicks: 9, spend: 9400, conversions: 0 },
  ]);
  assert.deepEqual(g.total, { impressions: 1514, clicks: 46, spend: 27600, conversions: 2 });
});
test("readGrid: '현재 보기의 삭제되지 않은 모든 캠페인' 총계 줄을 쓰고, 그 줄이 없으면 total 은 null", () => {
  const onlyAccount = GRID.filter((r) => !r[2]?.startsWith(ALLC));
  assert.equal(readGrid(HEAD, onlyAccount).total, null);
});
test("readGrid: 총계 줄의 앞 빈 칸 수가 달라도 라벨 위치로 맞춘다", () => {
  const rows = [camp("대구_영어(검색광고)", { imp: "5", clk: "1", spend: "₩300" }), ["", `${ALLC} help_outline`, "", "", "", "", "", "", "0.00", "", "", "5", "1", "", "₩300", ""]];
  assert.deepEqual(readGrid(HEAD, rows).total, { impressions: 5, clicks: 1, spend: 300, conversions: 0 });
});
test("readGrid: 대시 값은 null, 상태 사유는 떼고, 이름만 있는 행(settings 없음)도 숫자가 읽히면 캠페인", () => {
  const rows = [camp("대구_영어", { imp: "—", clk: "--", spend: "—", conv: "—", status: "제한됨" }), ["", "", "대구_일본어", "₩1/일", "운영 가능", "—", "검색", "x", "0", "1.00", "0%", "₩0", "7", "2", "—", "₩500", "—"]];
  const c = readGrid(HEAD, rows).campaigns;
  assert.deepEqual(c[0], { name: "대구_영어", status: "제한됨", impressions: null, clicks: null, spend: null, conversions: null });
  assert.deepEqual(c[1], { name: "대구_일본어", status: "운영 가능", impressions: 7, clicks: 2, spend: 500, conversions: 1 });
});
test("readGrid: 필요한 열이 없으면 '열 없음: …' 로 던진다", () => {
  const head = HEAD.filter((h) => !/^노출수|^비용/.test(h));
  assert.match(errOf(() => readGrid(head, GRID)), /^열 없음: .*노출수.*비용|^열 없음: .*비용.*노출수/);
  assert.match(errOf(() => readGrid([], GRID)), /^열 없음/);
});
test("readGrid: settings 로 끝나는 캠페인 행의 숫자를 못 읽으면 던진다(조용히 빼지 않는다)", () => {
  const rows = [camp("대구_영어", { imp: "많음" })];
  assert.match(errOf(() => readGrid(HEAD, rows)), /숫자 못 읽음/);
});
test("readGrid: 같은 이름 캠페인도 행마다 그대로 돌려준다(합치기는 googleRows)", () => {
  const rows = [camp("대구_영어", { imp: "1", clk: "0" }), camp("대구_영어", { imp: "2", clk: "1" })];
  assert.equal(readGrid(HEAD, rows).campaigns.length, 2);
});

// ── 구글: 실제 화면 모양 (구글 캠페인 표의 칸 글 그대로, 공백 정리 후) ──
// 머리글·캠페인 줄은 18칸. 초안 줄과 계정 총계 줄은 두 번째 칸이 아이콘 글자 "expand_more" 라서 라벨이 세 번째 칸에 온다.
// 캠페인 총계 줄은 19칸(앞에 아이콘 칸이 하나 더) — 머리글보다 한 칸씩 밀려 있다.
const REAL_HEAD = ["", "", "캠페인", "예산 help_outline", "상태 help_outline", "최적화 점수 help_outline", "캠페인 유형 help_outline", "입찰 전략 유형 help_outline", "전환 가치 help_outline", "전환수 help_outline", "전환율 help_outline", "전환당비용 help_outline", "노출수 help_outline", "클릭수 help_outline", "클릭률(CTR) help_outline", "비용 help_outline", "전환수 (유사 플랫폼) help_outline", "비용당 전환 가치(유사 플랫폼) help_outline"];
const REAL_DRAFT = ["", "expand_more", "작성 중인 초안: 1", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""];
const REAL_CAMP_A = ["", "", "대구_영어(검색광고) settings", "₩20,000/일", "일시중지됨 예산에 의한 제약 입찰 전략에 의해 제한됨", "—", "검색", "클릭수 최대화", "0.00", "0.00", "0.00%", "₩0", "0", "0", "—", "₩0", "—", "—"];
const REAL_CAMP_B = ["", "", "대구_일본어(검색광고) settings", "₩20,000/일", "일시중지됨 예산에 의한 제약 입찰 전략에 의해 제한됨", "—", "검색", "클릭수 최대화", "0.00", "0.00", "0.00%", "₩0", "0", "0", "—", "₩0", "—", "—"];
const REAL_CAMP_C = ["", "", "대구_중국어(검색광고) settings", "₩20,000/일", "일시중지됨 예산에 의한 제약 입찰 전략에 의해 제한됨", "—", "검색", "클릭수 최대화", "0.00", "0.00", "0.00%", "₩0", "0", "0", "—", "₩0", "—", "—"];
const REAL_CAMP_D = ["", "", "울산_영어(검색광고) settings", "₩20,000/일", "일시중지됨 예산에 의한 제약 입찰 전략에 의해 제한됨", "—", "검색", "클릭수 최대화", "0.00", "0.00", "0.00%", "₩0", "0", "0", "—", "₩0", "—", "—"];
const REAL_CAMP_B_120 = ["", "", "대구_일본어(검색광고) settings", "₩20,000/일", "일시중지됨 예산에 의한 제약 입찰 전략에 의해 제한됨", "—", "검색", "클릭수 최대화", "0.00", "0.00", "0.00%", "₩0", "120", "9", "—", "₩18,200", "—", "—"];
const REAL_TOTAL_0 = ["", "expand_more", "총계: 현재 보기의 삭제되지 않은 모든 캠페인 help_outline", "", "", "", "—", "", "", "0.00", "0.00", "0.00%", "₩0", "0", "0", "—", "₩0", "0.00", "—"];
const REAL_TOTAL_120 = ["", "expand_more", "총계: 현재 보기의 삭제되지 않은 모든 캠페인 help_outline", "", "", "", "—", "", "", "0.00", "0.00", "0.00%", "₩0", "120", "9", "—", "₩18,200", "0.00", "—"];
const REAL_ACCOUNT_TOTAL = ["", "expand_more", "총계: 계정 help_outline", "", "₩0/일", "", "—", "", "", "0.00", "0.00", "0.00%", "₩0", "0", "0", "—", "₩0", "0.00", "—"];
const REAL_ROWS = [REAL_HEAD, REAL_DRAFT, REAL_CAMP_A, REAL_CAMP_B, REAL_CAMP_C, REAL_CAMP_D, REAL_TOTAL_0, REAL_ACCOUNT_TOTAL];
const REAL_ROWS_120 = [REAL_HEAD, REAL_DRAFT, REAL_CAMP_A, REAL_CAMP_B_120, REAL_CAMP_C, REAL_CAMP_D, REAL_TOTAL_120, REAL_ACCOUNT_TOTAL];

test("readGrid: 실제 화면 — 아이콘 칸(expand_more)은 라벨이 아니다: 캠페인 4개만 나오고 머리글·초안 줄은 빠진다 (값은 전부 0)", () => {
  const g = readGrid(REAL_HEAD, REAL_ROWS);
  assert.deepEqual(g.campaigns, [
    { name: "대구_영어(검색광고)", status: "일시중지됨", impressions: 0, clicks: 0, spend: 0, conversions: 0 },
    { name: "대구_일본어(검색광고)", status: "일시중지됨", impressions: 0, clicks: 0, spend: 0, conversions: 0 },
    { name: "대구_중국어(검색광고)", status: "일시중지됨", impressions: 0, clicks: 0, spend: 0, conversions: 0 },
    { name: "울산_영어(검색광고)", status: "일시중지됨", impressions: 0, clicks: 0, spend: 0, conversions: 0 },
  ]);
});
test("readGrid: 실제 화면 — 캠페인 총계 줄(19칸, 머리글보다 한 칸 밀림)을 찾아 값을 읽고 checkTotals 가 통과한다", () => {
  const g = readGrid(REAL_HEAD, REAL_ROWS);
  assert.deepEqual(g.total, { impressions: 0, clicks: 0, spend: 0, conversions: 0 });
  assert.deepEqual(checkTotals(g.campaigns, g.total), { ok: true, reason: "" });
});
test("readGrid: 실제 화면 — 캠페인 하나가 노출 120·클릭 9·비용 ₩18,200 이면, 총계 줄은 한 칸 밀린 자리에서 120·9·18200 을 읽는다 (계정 총계 줄의 0 을 집지 않는다)", () => {
  const g = readGrid(REAL_HEAD, REAL_ROWS_120);
  assert.deepEqual(g.campaigns[1], { name: "대구_일본어(검색광고)", status: "일시중지됨", impressions: 120, clicks: 9, spend: 18200, conversions: 0 });
  assert.deepEqual(g.total, { impressions: 120, clicks: 9, spend: 18200, conversions: 0 });
  assert.deepEqual(checkTotals(g.campaigns, g.total), { ok: true, reason: "" });
});
test("readGrid: 실제 화면 — 초안 줄과 '총계: 계정' 줄만 있으면 캠페인도 합계도 없다", () => {
  assert.deepEqual(readGrid(REAL_HEAD, [REAL_DRAFT, REAL_ACCOUNT_TOTAL]), { campaigns: [], total: null });
});

// ── 구글: 합계 교차 검사 ──
test("checkTotals: 노출·클릭·비용 합이 총계와 같으면 ok", () => {
  const g = readGrid(HEAD, GRID);
  assert.deepEqual(checkTotals(g.campaigns, g.total), { ok: true, reason: "" });
});
test("checkTotals: 어느 하나라도 다르면 '합계 불일치', 총계 줄이 없어도 불합격", () => {
  const g = readGrid(HEAD, GRID);
  for (const k of ["impressions", "clicks", "spend"]) assert.deepEqual(checkTotals(g.campaigns, { ...g.total, [k]: g.total[k] + 5 }), { ok: false, reason: "합계 불일치" }, k);
  assert.deepEqual(checkTotals(g.campaigns, null), { ok: false, reason: "합계 행 없음" });
  assert.deepEqual(checkTotals(g.campaigns.slice(1), { impressions: 1514, clicks: 46, spend: 27600 }), { ok: true, reason: "" }); // 첫 줄이 0 이면 빼도 합은 같다(교차 검사의 한계)
  assert.equal(checkTotals(g.campaigns.slice(1, 2), g.total).ok, false);
});
test("checkTotals: 비용은 원 단위 반올림 오차(캠페인 수의 절반 원)까지만 허용, 대시(null)는 0", () => {
  const cs = [{ impressions: 10, clicks: 1, spend: 100, conversions: 0 }, { impressions: null, clicks: null, spend: null, conversions: null }];
  assert.equal(checkTotals(cs, { impressions: 10, clicks: 1, spend: 101 }).ok, true);
  assert.equal(checkTotals(cs, { impressions: 10, clicks: 1, spend: 102 }).ok, false);
  assert.equal(checkTotals(cs, { impressions: 10, clicks: 1, spend: 100 }).ok, true);
});
test("checkTotals: 총계의 값이 null(대시)이면 0 으로 본다", () => {
  assert.equal(checkTotals([{ impressions: 0, clicks: 0, spend: 0 }], { impressions: null, clicks: null, spend: null }).ok, true);
});

// ── 구글: 알림 → 플래그 ──
test("noticeFlags: 막힌 일(비승인·정책 제한·결제 거절/실패·계정 정지)은 [계정] 접두어의 빨강 글", () => {
  assert.deepEqual(noticeFlags(["광고 2개가 비승인되었습니다"]), ["[계정] 광고 2개가 비승인되었습니다"]);
  assert.equal(noticeFlags(["정책에 따라 광고 게재가 제한되었습니다"]).length, 1);
  assert.ok(noticeFlags(["결제가 거절되었습니다"])[0].startsWith("[계정] "));
  assert.ok(noticeFlags(["결제에 실패했습니다"])[0].startsWith("[계정] "));
  assert.ok(noticeFlags(["계정이 정지되었습니다"])[0].startsWith("[계정] "));
  for (const f of noticeFlags(["광고 비승인", "결제 거절", "계정 정지"])) assert.ok(!f.startsWith("[안내]"), f);
});
test("noticeFlags: 안내(계정 보안 강화·예비 결제 수단·게재 중인 광고가 없음·검토 중)는 '[안내] [계정] …' 이 맨 앞", () => {
  const f = noticeFlags(["계정 보안 강화 작업을 요청드립니다", "예비 결제 수단을 추가하세요", "게재 중인 광고가 없습니다", "광고가 검토 중입니다"]);
  assert.deepEqual(f, ["[안내] [계정] 계정 보안 강화 작업 요청", "[안내] [계정] 예비 결제 수단 없음", "[안내] [계정] 게재 중인 광고 없음", "[안내] [계정] 검토 중 광고"]);
});
test("noticeFlags: 광고 크레딧·추천·최적화 점수는 무시, 알 수 없는 알림도 기록하지 않는다", () => {
  assert.deepEqual(noticeFlags(["₩1,200,000 광고 크레딧이 있습니다", "추천 사항 3개", "최적화 점수가 낮아요", "새 기능을 만나보세요", "", null]), []);
});
test("noticeFlags: 4자리 이상 숫자는 #, 이메일은 가리고, 120자 안, 같은 글은 한 번만", () => {
  const f = noticeFlags(["광고 비승인 계정 1234567 김@x.com " + "가".repeat(200), "광고 비승인 계정 1234567 김@x.com " + "가".repeat(200)]);
  assert.equal(f.length, 1);
  assert.ok(f[0].length <= 120);
  assert.ok(!/\d{4}/.test(f[0])); assert.ok(!f[0].includes("@"));
  assert.equal(noticeFlags(["결제 거절", "결제 거절"]).length, 1);
});
test("noticeFlags: 빨강 우선 — 광고 크레딧 글에 비승인이 섞이면 빨강으로 센다; 추천이 든 안내는 무시", () => {
  assert.equal(noticeFlags(["광고 크레딧 사용 중 광고 비승인 1건"]).length, 1);
  assert.deepEqual(noticeFlags(["추천: 예비 결제 수단 추가"]), []);
});
test("noticeFlags: 만든 플래그가 rows.mjs 검증을 통과한다", () => {
  const flags = noticeFlags(["광고 비승인 전화 010-1234-5678", "계정 보안 강화 작업을 요청드립니다"]);
  const rows = googleRows("대구", [{ name: "대구_영어", status: "운영 가능", impressions: 1, clicks: 0, spend: 0, conversions: 0 }], flags);
  assert.doesNotThrow(() => toRowsPure("google_ad", D, { rows }, TEAMS));
});

// ── 구글 행 ──
const C = (name, status, imp, clk, spend, conv = 0) => ({ name, status, impressions: imp, clicks: clk, spend, conversions: conv });
test("googleRows: 캠페인마다 행 하나 — 팀은 이름으로, 값은 숫자, 대시는 '--', 계정 플래그는 맨 앞 캠페인 행에만", () => {
  const rows = googleRows("대구", [C("대구_영어", "운영 가능", 1204, 37, 18200, 2), C("대구_일본어", "일시중지됨", 0, 0, 0, null), C("대구_중국어", "운영 가능", 310, 9, 9400, 0)], ["[안내] [계정] 계정 보안 강화 작업 요청"]);
  assert.deepEqual(rows, [
    { team_key: "dsr", unit: "대구_영어", metrics: { impressions: 1204, clicks: 37, spend: 18200, conversions: 2, status: "운영 가능", flags: ["[안내] [계정] 계정 보안 강화 작업 요청"] } },
    { team_key: "jpcn", unit: "대구_일본어", metrics: { impressions: 0, clicks: 0, spend: 0, conversions: "--", status: "일시중지됨", flags: [] } },
    { team_key: "jpcn", unit: "대구_중국어", metrics: { impressions: 310, clicks: 9, spend: 9400, conversions: 0, status: "운영 가능", flags: [] } },
  ]);
});
test("googleRows: 같은 팀·같은 이름은 합친다 (숫자 합, 상태는 운영 중인 쪽, 대시만이면 '--')", () => {
  const rows = googleRows("대구", [C("대구_영어", "일시중지됨", 10, 1, 500, 1), C("대구_영어", "운영 가능", 20, 2, 700, null), C("대구_영어 ", "종료됨", null, null, null, null)], []);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].metrics, { impressions: 30, clicks: 3, spend: 1200, conversions: 1, status: "운영 가능", flags: [] });
  const only = googleRows("대구", [C("대구_영어", "일시중지됨", null, null, null, null), C("대구_영어", "일시중지됨", null, null, null, null)], [])[0].metrics;
  assert.deepEqual([only.impressions, only.clicks, only.spend, only.conversions, only.status], ["--", "--", "--", "--", "일시중지됨"]);
});
test("googleRows: 첫 캠페인과 같은 이름이 나중에 또 나와도 플래그는 한 번만 (첫 그룹)", () => {
  const rows = googleRows("대구", [C("대구_영어", "운영 가능", 1, 0, 0), C("대구_일본어", "운영 가능", 1, 0, 0), C("대구_영어", "운영 가능", 1, 0, 0)], ["[계정] 결제 거절"]);
  assert.deepEqual(rows.map((r) => r.metrics.flags.length), [1, 0]);
});
test("googleRows: 울산 계정은 전부 ulsan, 만든 행이 rows.mjs 를 통과하고 이름의 전화번호 모양은 #로 가려진다", () => {
  const rows = googleRows("울산", [C("울산_영어", "운영 가능", 5, 1, 300), C("울산 010-1234-5678", "운영 가능", 0, 0, 0)], []);
  const out = toRowsPure("google_ad", D, { rows }, TEAMS);
  assert.deepEqual(out.map((r) => [r.team_id, r.unit]), [[3, "울산_영어"], [3, "울산 #-#-#"]]);
});
test("googleRows: 같은 이름이 dsr·jpcn 으로 갈릴 일은 없지만 이름 규칙은 계정별 (대구 계정에서 '울산' 이름도 dsr)", () => {
  assert.equal(googleRows("대구", [C("울산 영어", "운영 가능", 1, 0, 0)], [])[0].team_key, "dsr");
});
test("googleFailRows: 계정의 지점마다 전체 failed|login_required 행", () => {
  assert.deepEqual(googleFailRows("대구", "합계 불일치"), [
    { team_key: "dsr", unit: "전체", metrics: { note: "합계 불일치" }, status: "failed" },
    { team_key: "jpcn", unit: "전체", metrics: { note: "합계 불일치" }, status: "failed" },
  ]);
  assert.deepEqual(googleFailRows("울산", "로그인 필요", "login_required"), [{ team_key: "ulsan", unit: "전체", metrics: { note: "로그인 필요" }, status: "login_required" }]);
  assert.throws(() => googleFailRows("부산", "x"), /계정/);
});
test("googleOutput: 한 줄 JSON — 계정별 상태·캠페인 수, 하나라도 failed·login_required 면 ok=false", () => {
  assert.deepEqual(googleOutput(D, [{ account: "대구", status: "ok", campaigns: 5 }, { account: "울산", status: "ok", campaigns: 3 }]), { ok: true, date: D, accounts: { 대구: { status: "ok", campaigns: 5 }, 울산: { status: "ok", campaigns: 3 } } });
  const bad = googleOutput(D, [{ account: "대구", status: "ok", campaigns: 5 }, { account: "울산", status: "login_required", note: "로그인 필요" }]);
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.accounts.울산, { status: "login_required", note: "로그인 필요" });
});

// ── 검증 실패 격리 ──
test("partitionValid: 배치 전체가 통과하면 그대로, 하나의 그룹이 검증에 걸리면 그 그룹만 실패 행으로 바꾼다", () => {
  const groups = [
    { name: "대구", rows: ["a"], fail: (n) => [`F대구:${n}`] },
    { name: "울산", rows: ["BAD"], fail: (n) => [`F울산:${n}`] },
  ];
  const validate = (rows) => { if (rows.includes("BAD")) throw new Error("x"); };
  assert.deepEqual(partitionValid(groups, validate), { rows: ["a", "F울산:행 검증 실패"], bad: ["울산"] });
  assert.deepEqual(partitionValid([groups[0]], validate), { rows: ["a"], bad: [] });
  // 실패 행도 못 통과하면 던진다 (조용히 빈 채로 저장하지 않는다)
  assert.throws(() => partitionValid([{ name: "x", rows: ["BAD"], fail: () => ["BAD"] }], validate), /x/);
});

// ── playwright 위치 ──
test("playwrightCandidates: 이 저장소의 mkc → 메인 저장소의 mkc 순, PLAYWRIGHT_DIR 환경변수가 맨 앞", () => {
  const c = playwrightCandidates("/r/pallo-planner-daily/scripts/mkd", "/home/u", {});
  assert.deepEqual(c, ["/r/pallo-planner-daily/scripts/mkc/node_modules/playwright/index.mjs", "/home/u/pallo-planner/scripts/mkc/node_modules/playwright/index.mjs"]);
  assert.equal(playwrightCandidates("/r/scripts/mkd", "/home/u", { PLAYWRIGHT_DIR: "/opt/pw" })[0], "/opt/pw/playwright/index.mjs");
});

// ── google-range: 맞춤 기간(from~to) 읽기 ──
test("parseRange: 구글이 맞춤 기간을 줄여 보여 주는 모양('2026년 10월 23일 ~ 29일', '… ~ 11월 2일')도 읽는다 (실제 화면 글)", () => {
  assert.deepEqual(parseRange("2026년 10월 23일 ~ 29일 arrow_drop_down"), { start: "2026-10-23", end: "2026-10-29" });
  assert.deepEqual(parseRange("2026년 10월 10일 ~ 29일"), { start: "2026-10-10", end: "2026-10-29" });
  assert.deepEqual(parseRange("2026년 10월 28일 ~ 11월 2일"), { start: "2026-10-28", end: "2026-11-02" });
  assert.deepEqual(parseRange("2026년 12월 30일 ~ 1월 2일"), { start: "2026-12-30", end: "2027-01-02" }); // 해가 넘어가면 끝은 다음 해
  assert.deepEqual(parseRange("2026년 10월 23일 - 29일"), { start: "2026-10-23", end: "2026-10-29" });
  assert.deepEqual(parseRange("2026년 10월 29일 arrow_drop_down"), { start: "2026-10-29", end: "2026-10-29" }); // 끝이 없으면 하루
  assert.deepEqual(parseRange("2026년 10월 23일"), { start: "2026-10-23", end: "2026-10-23" });
  assert.equal(rangeIs("2026년 10월 23일 ~ 29일 arrow_drop_down", "2026-10-23", "2026-10-29"), true);
  assert.equal(rangeIs("2026년 10월 23일 ~ 28일", "2026-10-23", "2026-10-29"), false);
  assert.equal(rangeIs("2026년 10월 23일 ~ 29일", "2026-10-23", "2026-10-23"), false);
});
test("rangeIs: 화면의 기간 글이 from~to 와 같은지 (하루면 rangeIsDay 와 같다)", () => {
  assert.equal(rangeIs("2026년 10월 23일 - 2026년 10월 29일", "2026-10-23", "2026-10-29"), true);
  assert.equal(rangeIs("2026. 10. 23. – 2026. 10. 29.", "2026-10-23", "2026-10-29"), true);
  assert.equal(rangeIs("최근 7일 2026년 10월 23일 - 2026년 10월 29일", "2026-10-23", "2026-10-29"), true);
  assert.equal(rangeIs("2026년 10월 23일 - 2026년 10월 28일", "2026-10-23", "2026-10-29"), false); // 끝이 다름
  assert.equal(rangeIs("2026년 10월 22일 - 2026년 10월 29일", "2026-10-23", "2026-10-29"), false); // 시작이 다름
  assert.equal(rangeIs("2026년 10월 29일", "2026-10-23", "2026-10-29"), false);                    // 하루만 보임
  assert.equal(rangeIs("지난 7일", "2026-10-23", "2026-10-29"), false);
  assert.equal(rangeIs("2026년 10월 29일", "2026-10-29", "2026-10-29"), rangeIsDay("2026년 10월 29일", "2026-10-29"));
});
test("checkRange: 날짜 형식·시작<=끝·어제까지만 (오늘·이후는 아직 하루치가 아님) — 문제 없으면 빈 글", () => {
  const now = new Date("2026-10-30T10:00:00Z"); // KST 10-30 19:00
  assert.equal(checkRange("2026-10-10", "2026-10-29", now), "");
  assert.equal(checkRange("2026-10-29", "2026-10-29", now), "");
  assert.match(checkRange("2026-10-10", "2026-10-30", now), /오늘/);
  assert.match(checkRange("2026-10-10", "2026-11-02", now), /오늘/);
  assert.match(checkRange("2026-10-29", "2026-10-23", now), /시작일/);
  assert.match(checkRange("2026-1-1", "2026-10-29", now), /YYYY-MM-DD/);
  assert.match(checkRange("2026-10-10", undefined, now), /YYYY-MM-DD/);
});

test("conversionsUrl: 전환 화면 주소", () => { assert.equal(conversionsUrl("6771267051"), "https://ads.google.com/aw/conversions/all?ocid=6771267051"); });
// 실제 전환 화면 모양: 머리글 10칸, 행은 앞에 빈 칸이 하나 더 있는 11칸. "추적 상태" 칸이 상태 글자.
const CV_HEAD = ["", "전환 액션 help_outline", "전환 소스", "추적 상태 help_outline", "액션 최적화 help_outline", "횟수 help_outline", "클릭연결 전환 추적 기간 help_outline", "계정 수준 목표에 포함됨 help_outline", "모든 전환 help_outline", "모든 전환 가치 help_outline"];
const cv = (name, status) => ["", "", name, "웹사이트", status, "기본", "1회", "90일", "예", "0.00", "0.00"];
const CV_ROWS = [["상태:: 전체"], [""], cv("문의", "조치 필요"), cv("Clicks to call", "운영중"), cv("팔로 신청 클릭", "조치 필요"), cv("페이지 조회", "삭제됨"), ["", "", "", "", "", "", "", "", "", "0.00", "0.00"]];
test("conversionStatus: '팔로 신청 클릭' 줄의 추적 상태 글자 (실제 화면 모양, 머리글보다 한 칸 밀린 행)", () => {
  assert.equal(conversionStatus(CV_HEAD, CV_ROWS), "조치 필요");
  assert.equal(conversionStatus(CV_HEAD, [cv("팔로 신청 클릭", "기록 중")]), "기록 중");
  assert.equal(conversionStatus(CV_HEAD, [cv("팔로 신청 클릭", "운영중")]), "운영중");
  assert.equal(conversionStatus(CV_HEAD, CV_ROWS, "문의"), "조치 필요");
  assert.equal(conversionStatus(CV_HEAD, CV_ROWS, "Clicks to call"), "운영중");
});
test("conversionStatus: 못 읽으면 null — 그 이름의 줄이 없거나, 머리글(전환 액션·추적 상태)이 없거나, 상태 칸이 비었거나", () => {
  assert.equal(conversionStatus(CV_HEAD, [cv("문의", "운영중")]), null);
  assert.equal(conversionStatus(CV_HEAD.filter((h) => !/^추적 상태/.test(h)), CV_ROWS), null);
  assert.equal(conversionStatus([], CV_ROWS), null);
  assert.equal(conversionStatus(CV_HEAD, [cv("팔로 신청 클릭", "")]), null);
  assert.equal(conversionStatus(CV_HEAD, []), null);
  assert.equal(conversionStatus(undefined, undefined), null);
});
test("conversionStatus: 같은 이름이 둘이면 삭제되지 않은 쪽, 이름이 비슷한 줄('팔로 신청 클릭 2')은 다른 줄", () => {
  assert.equal(conversionStatus(CV_HEAD, [cv("팔로 신청 클릭", "삭제됨"), cv("팔로 신청 클릭", "조치 필요")]), "조치 필요");
  assert.equal(conversionStatus(CV_HEAD, [cv("팔로 신청 클릭", "삭제됨")]), "삭제됨");
  assert.equal(conversionStatus(CV_HEAD, [cv("팔로 신청 클릭 2", "운영중")]), null);
});

const GC = (name, status, impressions, clicks, spend, conversions) => ({ name, status, impressions, clicks, spend, conversions });
test("googleRangeAccount: 캠페인별 {계정,지점,캠페인,상태,노출,클릭,비용,전환} + 합계(대시는 0 으로 더함)·알림·전환 상태", () => {
  const a = googleRangeAccount("대구", [GC("대구_영어(검색광고)", "운영 가능", 1204, 37, 18200, 2), GC("대구_일본어(검색광고)", "일시중지됨", null, null, null, null), GC("대구_중국어(검색광고)", "운영 가능", 310, 9, 9400.5, 0)], ["[안내] [계정] 예비 결제 수단 없음"], "조치 필요");
  assert.deepEqual(a.campaigns[0], { account: "대구", team: "dsr", campaign: "대구_영어(검색광고)", status: "운영 가능", impressions: 1204, clicks: 37, spend: 18200, conversions: 2 });
  assert.deepEqual(a.campaigns[1], { account: "대구", team: "jpcn", campaign: "대구_일본어(검색광고)", status: "일시중지됨", impressions: null, clicks: null, spend: null, conversions: null });
  assert.deepEqual(a.summary, { status: "ok", campaigns: 3, impressions: 1514, clicks: 46, spend: 27600.5, conversions: 2, conversionStatus: "조치 필요", notices: ["[안내] [계정] 예비 결제 수단 없음"] });
  assert.equal(googleRangeAccount("울산", [GC("울산_영어", "운영 가능", 1, 0, 0, 0)], [], null).summary.conversionStatus, null);
  assert.equal(googleRangeAccount("울산", [GC("아무거나", "운영 가능", 1, 0, 0, 0)], [], null).campaigns[0].team, "ulsan");
});
test("googleRangeFail·googleRangeOutput: 한 줄 JSON {ok,from,to,accounts,campaigns} — 계정이 하나라도 ok 가 아니면 ok=false, 실패 계정은 {status,note}", () => {
  const ok = googleRangeAccount("대구", [GC("대구_영어", "운영 가능", 10, 1, 500, 0)], [], "조치 필요");
  const out = googleRangeOutput("2026-10-23", "2026-10-29", [ok, googleRangeFail("울산", "로그인 필요", "login_required")]);
  assert.equal(out.ok, false);
  assert.deepEqual([out.from, out.to], ["2026-10-23", "2026-10-29"]);
  assert.deepEqual(out.accounts.울산, { status: "login_required", note: "로그인 필요" });
  assert.equal(out.accounts.대구.campaigns, 1);
  assert.deepEqual(out.campaigns.map((c) => [c.account, c.campaign]), [["대구", "대구_영어"]]);
  const good = googleRangeOutput("2026-10-23", "2026-10-29", [ok, googleRangeAccount("울산", [GC("울산_영어", "운영 가능", 5, 1, 300, 0)], [], "기록 중")]);
  assert.equal(good.ok, true);
  assert.deepEqual(good.campaigns.map((c) => c.team), ["dsr", "ulsan"]);
  assert.ok(!JSON.stringify(good).includes("\n"));
});
test("googleRangeFail: note 는 4자리 이상 숫자를 # 로 가리고 120자까지 (failRow 와 같은 규칙)", () => {
  assert.equal(googleRangeFail("대구", "코드 123456 오류").summary.note, "코드 # 오류");
  assert.equal(googleRangeFail("대구", "가".repeat(300)).summary.note.length, 120);
  assert.equal(googleRangeFail("대구", "표가 안 뜸").summary.status, "failed");
  assert.deepEqual(googleRangeFail("울산", "x").campaigns, []);
});
