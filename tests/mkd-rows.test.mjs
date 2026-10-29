import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMetrics, toRowsPure, looksPersonal, staleAllPlan } from "../scripts/mkd/rows.mjs";

const TEAMS = [{ id: 1, name: "대구동성로점", key: "dsr" }, { id: 2, name: "대구일본어중국어점", key: "jpcn" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "구미점", key: "gumi" }];
const D = "2026-10-28";
const rows = (channel, input) => toRowsPure(channel, D, input, TEAMS);
// 에러 메시지 얻기 (던지지 않으면 테스트 실패)
const errOf = (fn) => { try { fn(); } catch (e) { return String(e.message); } assert.fail("던져야 하는데 통과했어요"); };

// ── 숫자 ──
test("cleanMetrics: 천 단위 쉼표·₩·$·US$ 를 받아 숫자로", () => {
  const m = cleanMetrics({ impressions: "1,204", spend: "₩18,200", spend_usd: "$12.50", fx: "US$1,380.5", clicks: 31, ctr: "0.0123", cpc: " 590 " });
  assert.deepEqual(m, { impressions: 1204, spend: 18200, spend_usd: 12.5, fx: 1380.5, clicks: 31, ctr: 0.0123, cpc: 590 });
});
test("cleanMetrics: '--' '-' '–' '—' 와 빈 값은 null", () => {
  for (const v of ["--", "-", "–", "—", "", null, undefined, " -- "]) assert.equal(cleanMetrics({ clicks: v }).clicks, null, JSON.stringify(v));
});
test("cleanMetrics: 쉼표는 천 단위일 때만 — '12,3,4' 는 거부, 원문은 안 찍음", () => {
  const msg = errOf(() => cleanMetrics({ clicks: "12,3,4" }));
  assert.match(msg, /^clicks 는 숫자여야 해요 \(길이 6\)$/);
  assert.doesNotMatch(msg, /12,3,4/);
  assert.throws(() => cleanMetrics({ clicks: "1,23" }), /숫자여야 해요/);
  assert.throws(() => cleanMetrics({ clicks: "1234,567" }), /숫자여야 해요/);
});
test("cleanMetrics: 원·% 같은 글자가 붙은 값은 거부", () => {
  for (const v of ["18,200원", "5%", "12개", "1e5", "0x10", "1.2.3", "abc"]) assert.throws(() => cleanMetrics({ spend: v }), /spend 는 숫자여야 해요/, v);
});
test("cleanMetrics: 배열·불리언·객체·NaN 은 숫자가 아니다", () => {
  for (const v of [[7], true, { a: 1 }, NaN, Infinity]) assert.throws(() => cleanMetrics({ clicks: v }), /clicks 는 숫자여야 해요/, JSON.stringify(v));
});
test("cleanMetrics: 음수는 rank/avg_rank 만", () => {
  assert.throws(() => cleanMetrics({ clicks: -3 }), /clicks/);
  assert.throws(() => cleanMetrics({ spend: "-3" }), /spend/);
  assert.throws(() => cleanMetrics({ impressions: "$-3" }), /impressions/);
  assert.deepEqual(cleanMetrics({ rank: -3, avg_rank: "-1.5" }), { rank: -3, avg_rank: -1.5 });
});

// ── 키·문자열·배열 ──
test("cleanMetrics: 모르는 키는 거부", () => {
  assert.throws(() => cleanMetrics({ name: "홍길동" }), /^Error: 모르는 지표 키: name$/);
});
test("cleanMetrics: metrics 는 객체여야 (없으면 {})", () => {
  assert.deepEqual(cleanMetrics(undefined), {});
  assert.deepEqual(cleanMetrics(null), {});
  for (const v of [[1], "abc", 5]) assert.throws(() => cleanMetrics(v), /입력 형식 오류: metrics/, JSON.stringify(v));
});
test("cleanMetrics: 문자열 지표 길이 자르기·타입 검사, flags 는 문자열 목록", () => {
  const m = cleanMetrics({ note: "가".repeat(300), status: "운영 가능", flags: ["a", "", "b".repeat(200)] });
  assert.equal(m.note.length, 200); assert.equal(m.status, "운영 가능"); assert.deepEqual(m.flags, ["a", "b".repeat(120)]);
  assert.deepEqual(cleanMetrics({ flags: "한 개" }).flags, ["한 개"]);
  assert.throws(() => cleanMetrics({ status: 5 }), /status 는 문자열/);
  assert.throws(() => cleanMetrics({ flags: [{ a: 1 }] }), /flags/);
});

// ── 개인정보 ──
test("looksPersonal: 전화번호 모양은 true, 날짜·금액·이름은 false", () => {
  for (const s of ["01012345678", "010 1234 5678", "010-1234-5678", "010.1234.5678", "(053) 123-4567", "(053)123-4567", "053-123-4567", "연락처 053 123 4567 입니다"]) assert.equal(looksPersonal(s), true, s);
  for (const s of ["대구_영어(검색광고)", "gads_daegu_en_search", "2026-10-28", "2026.10.28 ~ 2026.11.03", "1,204", "12,345,678", "홍길동", "", null]) assert.equal(looksPersonal(s), false, String(s));
});
test("cleanMetrics: note·status·flags 의 전화번호 거부, 메시지에 숫자 안 찍음", () => {
  for (const m of [{ note: "문의 010-1234-5678" }, { status: "01012345678" }, { flags: ["ok", "010 1234 5678"] }]) {
    const msg = errOf(() => cleanMetrics(m));
    assert.match(msg, /^개인정보\(전화번호\)처럼 보이는 값이 있어 저장하지 않아요: (note|status|flags)$/);
    assert.doesNotMatch(msg, /\d{4}/);
  }
});
test("cleanMetrics: top_url·our_url·campaign_id 는 전화번호 검사에서 제외", () => {
  const m = cleanMetrics({ top_url: "https://blog.naver.com/x/222012345678901", our_url: "https://blog.naver.com/y/010-1234-5678", campaign_id: "cmp-a001-01-000000012345678" });
  assert.equal(m.campaign_id, "cmp-a001-01-000000012345678");
});

// ── 봉투 ──
test("봉투: 입력은 객체, rows 는 객체 배열", () => {
  for (const bad of [[], [{ unit: "x" }], "rows", 5, null, undefined]) assert.throws(() => rows("google_ad", bad), /^Error: 입력 형식 오류: /, JSON.stringify(bad));
  assert.throws(() => rows("google_ad", { rows: "abc" }), /입력 형식 오류: rows/);
  assert.throws(() => rows("google_ad", { rows: { unit: "x" } }), /입력 형식 오류: rows/);
  assert.throws(() => rows("google_ad", { rows: [1] }), /입력 형식 오류: rows\[0\]/);
  assert.throws(() => rows("google_ad", { rows: [[]] }), /입력 형식 오류: rows\[0\]/);
  assert.throws(() => rows("google_ad", { rows: [{ unit: "대구 x" }, null] }), /입력 형식 오류: rows\[1\]/);
});
test("봉투: 채널 검사", () => {
  assert.throws(() => rows("tiktok", { rows: [] }), /채널은 naver_ad/);
});
test("봉투: rows 가 없거나 비면 failed|login_required 가 있어야 — 오타 키·ok 도 거부", () => {
  const MSG = /rows 가 비었는데 status\(failed\/login_required\)가 없어요/;
  assert.throws(() => rows("google_ad", {}), MSG);
  assert.throws(() => rows("google_ad", { rows: [] }), MSG);
  assert.throws(() => rows("google_ad", { row: [] }), MSG);
  assert.throws(() => rows("google_ad", { rows: [], status: "ok" }), MSG);
  assert.throws(() => rows("google_ad", { rows: [], status: "partial" }), MSG);
  assert.throws(() => rows("google_ad", { rows: [], status: "weird" }), /status 는 ok\/partial\/failed\/login_required/);
});
test("봉투: 빈 rows + failed/login_required → 모든 팀에 '전체' 행 {note}", () => {
  const out = rows("meta_ad", { rows: [], status: "login_required", note: "광고관리자 로그인 풀림" });
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((r) => r.team_id), [1, 2, 3, 4]);
  for (const r of out) assert.deepEqual(r, { team_id: r.team_id, date: D, channel: "meta_ad", unit: "전체", metrics: { note: "광고관리자 로그인 풀림" }, status: "login_required" });
  assert.equal(rows("meta_ad", { status: "failed" })[0].metrics.note, "행 없음");
  assert.equal(rows("meta_ad", { status: "failed", note: "x".repeat(300) })[0].metrics.note.length, 200);
  assert.throws(() => rows("meta_ad", { status: "failed", note: "010-1234-5678" }), /개인정보.*: note$/);
  assert.throws(() => rows("meta_ad", { status: "failed", note: 5 }), /note/);
});
test("봉투: 모르는 최상위 키·행 키는 거부 (오타로 조용히 버려지지 않게)", () => {
  assert.throws(() => rows("google_ad", { row: [{ unit: "대구 x", metrics: { clicks: 1 } }], status: "failed" }), /모르는 키: row/);
  assert.throws(() => rows("google_ad", { rows: [{ unit: "대구 x", metrics: { clicks: 1 } }], team_key: "dsr" }), /모르는 키: team_key/);
  assert.throws(() => rows("google_ad", { rows: [{ unit: "대구 x", metric: { clicks: 1 } }] }), /^Error: rows\[0\]: 입력 형식 오류: 모르는 키: metric$/);
});
test("최상위 status(ok|partial)는 자기 status 없는 행의 기본값", () => {
  const out = rows("google_ad", { status: "partial", rows: [{ team_key: "dsr", unit: "a" }, { team_key: "dsr", unit: "b", status: "ok" }, { team_key: "dsr", unit: "c", status: "failed", metrics: { note: "x" } }] });
  assert.deepEqual(out.map((r) => r.status), ["partial", "ok", "failed"]);
  assert.equal(rows("google_ad", { rows: [{ team_key: "dsr", unit: "a" }] })[0].status, "ok");
  assert.throws(() => rows("google_ad", { rows: [{ team_key: "dsr", unit: "a", status: "bad" }] }), /status 는 ok\/partial/);
  assert.throws(() => rows("google_ad", { status: "failed", rows: [{ team_key: "dsr", unit: "a" }] }), /rows 가 있는데/);
});

// ── 지점 ──
test("team_key: 모르는 값은 거부, team_id 는 팀 목록에 있어야", () => {
  assert.throws(() => rows("google_ad", { rows: [{ team_key: "daegu", unit: "a" }] }), /^Error: rows\[0\]: team_key 는 dsr\|jpcn\|ulsan\|gumi: daegu$/);
  assert.throws(() => rows("google_ad", { rows: [{ team_key: "", unit: "a" }] }), /team_key 는 dsr\|jpcn\|ulsan\|gumi/);
  assert.throws(() => rows("google_ad", { rows: [{ team_id: 99, unit: "a" }] }), /team_id/);
  assert.throws(() => rows("google_ad", { rows: [{ team_id: 1, team_key: "ulsan", unit: "a" }] }), /team_id.*team_key/);
  assert.equal(rows("google_ad", { rows: [{ team_id: 3, unit: "a" }] })[0].team_id, 3);
  assert.equal(rows("google_ad", { rows: [{ team_id: 3, team_key: "ulsan", unit: "a" }] })[0].team_id, 3);
  for (const [k, id] of [["dsr", 1], ["jpcn", 2], ["ulsan", 3], ["gumi", 4]]) assert.equal(rows("blog", { rows: [{ team_key: k, unit: "a" }] })[0].team_id, id);
});
test("blog·daangn·jeonsan 은 team 필수, 광고 채널도 unit '전체' 는 team 필수", () => {
  for (const ch of ["blog", "daangn", "jeonsan"]) {
    assert.throws(() => rows(ch, { rows: [{ unit: "대구 영어", metrics: { views: 1 } }] }), /team_key 가 필요해요/, ch);
    assert.throws(() => rows(ch, { rows: [{ unit: "울산", metrics: { views: 1 } }] }), /team_key 가 필요해요/, ch);
    assert.equal(rows(ch, { rows: [{ team_key: "ulsan", unit: "전체", metrics: { views: 1 } }] })[0].team_id, 3, ch);
  }
  for (const ch of ["naver_ad", "google_ad", "meta_ad"]) {
    assert.throws(() => rows(ch, { rows: [{ metrics: { clicks: 1 } }] }), /team_key 가 필요해요/, ch);
    assert.throws(() => rows(ch, { rows: [{ unit: "전체", metrics: { clicks: 1 } }] }), /team_key 가 필요해요/, ch);
    assert.throws(() => rows(ch, { rows: [{ unit: " 전체 ", metrics: { clicks: 1 } }] }), /team_key 가 필요해요/, ch);
    assert.deepEqual(rows(ch, { rows: [{ team_key: "gumi", unit: "전체", metrics: { clicks: 1 } }] }).map((r) => [r.team_id, r.unit]), [[4, "전체"]]);
  }
});
test("광고 채널만 unit 이름으로 지점 추정, 못 하면 dsr + [미분류]", () => {
  const out = rows("google_ad", { rows: [{ unit: "울산_영어(검색광고)_원근" }, { unit: "구미 일본어" }, { unit: "대구 일본어 캠페인" }, { unit: "이름없는캠페인" }, { team_key: "jpcn", unit: "울산 x" }] });
  assert.deepEqual(out.map((r) => [r.team_id, r.unit]), [[3, "울산_영어(검색광고)_원근"], [4, "구미 일본어"], [2, "대구 일본어 캠페인"], [1, "[미분류] 이름없는캠페인"], [2, "울산 x"]]);
});
test("unit: 문자열만(없으면 '전체'), 앞뒤 공백 제거, 접두어를 붙인 뒤 120자로 자름", () => {
  for (const u of [5, true, ["a"], { a: 1 }]) assert.throws(() => rows("google_ad", { rows: [{ team_key: "dsr", unit: u }] }), /unit 은 문자열/, JSON.stringify(u));
  assert.equal(rows("blog", { rows: [{ team_key: "dsr" }] })[0].unit, "전체");
  assert.equal(rows("blog", { rows: [{ team_key: "dsr", unit: "   " }] })[0].unit, "전체");
  assert.equal(rows("google_ad", { rows: [{ team_key: "dsr", unit: "  대구 a  " }] })[0].unit, "대구 a");
  const u = rows("google_ad", { rows: [{ unit: "가".repeat(200) }] })[0].unit;
  assert.equal(u.length, 120); assert.ok(u.startsWith("[미분류] 가"));
  assert.equal(rows("google_ad", { rows: [{ unit: "대구" + "가".repeat(200) }] })[0].unit.length, 120);
});
test("행 결과 모양 {team_id,date,channel,unit,metrics,status}", () => {
  const out = rows("google_ad", { rows: [{ team_key: "dsr", unit: "대구_영어(검색광고)", metrics: { impressions: "1,204", clicks: 31, spend: "₩18,200", conversions: 1, status: "운영 가능", flags: [] } }] });
  assert.deepEqual(out, [{ team_id: 1, date: D, channel: "google_ad", unit: "대구_영어(검색광고)", metrics: { impressions: 1204, clicks: 31, spend: 18200, conversions: 1, status: "운영 가능", flags: [] }, status: "ok" }]);
});
test("팀 목록이 비었거나 dsr 가 없으면 조용히 0행이 되지 않고 오류", () => {
  assert.throws(() => toRowsPure("meta_ad", D, { status: "failed" }, []), /지점 목록/);
  assert.throws(() => toRowsPure("google_ad", D, { rows: [{ unit: "이름없음" }] }, TEAMS.slice(1)), /지점을 못 정했어요/);
});

// ── 중복 ──
test("같은 (지점, unit) 이 두 번 나오면 전부 모아 거부 — 조용히 합치지 않음", () => {
  const msg = errOf(() => rows("google_ad", { rows: [
    { team_key: "dsr", unit: "대구 a", metrics: { clicks: 1 } }, { team_key: "dsr", unit: "대구 a", metrics: { clicks: 2 } }, { team_key: "dsr", unit: "대구 a" },
    { team_key: "ulsan", unit: "울산 b" }, { team_key: "ulsan", unit: "울산 b" }, { team_key: "gumi", unit: "구미 c" }] }));
  assert.equal(msg, "같은 지점·unit 이 여러 번 나왔어요: 1:대구 a ×3, 3:울산 b ×2 — 같은 이름이면 숫자를 더해 한 행으로 보내 주세요");
});
test("중복은 최종 unit 기준 — 같은 이름이라도 다른 지점이면 통과, 추정으로 같아지면 거부", () => {
  assert.equal(rows("google_ad", { rows: [{ team_key: "dsr", unit: "a" }, { team_key: "gumi", unit: "a" }] }).length, 2);
  assert.throws(() => rows("google_ad", { rows: [{ unit: "울산 a" }, { team_key: "ulsan", unit: "울산 a" }] }), /같은 지점·unit 이 여러 번 나왔어요: 3:울산 a ×2/);
  assert.throws(() => rows("google_ad", { rows: [{ unit: "가나" }, { unit: "가나" }] }), /1:\[미분류\] 가나 ×2/);
});

// ── 행의 개인정보 ──
test("unit 에 전화번호가 있으면 광고 채널 밖(전산·블로그·당근)에서는 거부, 메시지에 숫자 안 찍음", () => {
  for (const ch of ["jeonsan", "blog", "daangn"]) for (const u of ["대구 010-1234-5678", "01012345678", "010 1234 5678", "(053) 123-4567"]) {
    const msg = errOf(() => rows(ch, { rows: [{ team_key: "dsr", unit: u }] }));
    assert.equal(msg, "rows[0]: 개인정보(전화번호)처럼 보이는 값이 있어 저장하지 않아요: unit", `${ch} ${u}`);
  }
});
test("광고 채널(naver_ad·google_ad·meta_ad)의 unit 은 캠페인 이름(업무 글)이라 전화번호 모양이면 던지지 않고 숫자 덩어리를 #로 가린다", () => {
  const masked = { "대구 010-1234-5678": "대구 #-#-#", "01012345678": "#", "010 1234 5678": "# # #", "(053) 123-4567": "(#) #-#", "대구_영어 2호점 010-1234-5678": "대구_영어 #호점 #-#-#" };
  for (const ch of ["naver_ad", "google_ad", "meta_ad"]) for (const [u, want] of Object.entries(masked)) {
    const out = rows(ch, { rows: [{ team_key: "dsr", unit: u, metrics: { clicks: 1 } }] });
    assert.equal(out[0].unit, want, `${ch} ${u}`);
    assert.equal(looksPersonal(out[0].unit), false, `${ch} ${u}`);
  }
  assert.equal(rows("google_ad", { rows: [{ team_key: "dsr", unit: "대구 영어 2호점", metrics: {} }] })[0].unit, "대구 영어 2호점"); // 전화번호 모양이 아니면 숫자도 그대로
  // 가린 뒤 같아지는 이름은 중복으로 알린다 (조용히 합치지 않음)
  assert.throws(() => rows("google_ad", { rows: [{ team_key: "dsr", unit: "a 010-1111-2222" }, { team_key: "dsr", unit: "a 010-3333-4444" }] }), /같은 지점·unit 이 여러 번/);
  // note·flags·문자열 지표는 광고 채널에서도 계속 거부 (스킬이 가려서 보낸다)
  assert.throws(() => rows("naver_ad", { rows: [{ team_key: "dsr", unit: "a", metrics: { note: "010-1234-5678" } }] }), /개인정보.*: note$/);
  assert.throws(() => rows("meta_ad", { rows: [{ team_key: "dsr", unit: "a", metrics: { flags: ["010 1234 5678"] } }] }), /개인정보.*: flags$/);
  assert.throws(() => rows("google_ad", { rows: [{ team_key: "dsr", unit: "a", metrics: { status: "(053) 123-4567" } }] }), /개인정보.*: status$/);
});
test("note·flags 의 전화번호도 행 단위로 거부", () => {
  assert.throws(() => rows("google_ad", { rows: [{ team_key: "dsr", unit: "a", metrics: { note: "010-1234-5678" } }] }), /개인정보.*: note$/);
  assert.throws(() => rows("google_ad", { rows: [{ team_key: "dsr", unit: "a", metrics: { flags: ["(053) 123-4567"] } }] }), /개인정보.*: flags$/);
});
test("jeonsan unit 허용 목록: 전체|meta|homepage|기타|gads_*|nad_* 이거나 20자 이하·숫자 3연속 없음", () => {
  const j = (unit) => rows("jeonsan", { rows: [{ team_key: "dsr", unit, metrics: { inquiries: 2 } }] });
  for (const u of ["전체", "meta", "homepage", "기타", "gads_daegu_en_search", "nad_daegu_en_1", "네이버 예약", "인스타그램", "당근", "블로그 A12", "가".repeat(20)]) assert.equal(j(u)[0].unit, u, u);
  // 허용 목록 밖이면서 길거나(21자+) 숫자가 3개 이상 이어진 값만 막는다 — 짧은 이름 정도는 길이·숫자로는 못 막으니 허용
  for (const u of ["홍길동 0101234", "가".repeat(21), "메모 123", "홍길동님 문의 전화 요청 드립니다 감사합니다", "gads_" + "A".repeat(20)]) assert.throws(() => j(u), /jeonsan unit/, u);
  assert.equal(j("홍길동")[0].unit, "홍길동");
  const msg = errOf(() => j("홍길동 0101234"));
  assert.doesNotMatch(msg, /0101234|홍길동/);
});
test("jeonsan 이 아닌 채널은 unit 허용 목록 검사 없음", () => {
  assert.equal(rows("blog", { rows: [{ team_key: "dsr", unit: "대구 영어회화 블로그 글 제목이 아주 길어도 되고 숫자 2026 도 됨" }] }).length, 1);
});

// ── 행 번호 접두어 (Task 4 리뷰) ──
test("행 단위 오류는 rows[i]: 접두어 — 몇 번째 행인지 알려 주고 값은 싣지 않는다", () => {
  const ok = (i) => ({ team_key: "dsr", unit: `대구 ${i}` });
  const at = (i, bad) => ({ rows: [...Array.from({ length: i }, (_, k) => ok(k)), bad] });
  // 지점·unit·metrics·status·개인정보·jeonsan 규칙 — 어디서 던져도 같은 접두어
  assert.equal(errOf(() => rows("google_ad", at(3, { team_key: "daegu", unit: "a" }))), "rows[3]: team_key 는 dsr|jpcn|ulsan|gumi: daegu");
  assert.equal(errOf(() => rows("google_ad", at(1, { team_key: "dsr", unit: "a", metrics: { name: "홍길동" } }))), "rows[1]: 모르는 지표 키: name");
  assert.equal(errOf(() => rows("google_ad", at(2, { team_key: "dsr", unit: "a", metrics: { clicks: "12,3,4" } }))), "rows[2]: clicks 는 숫자여야 해요 (길이 6)");
  assert.equal(errOf(() => rows("google_ad", at(4, { team_key: "dsr", unit: "a", status: "bad" }))), "rows[4]: status 는 ok/partial/failed/login_required: bad");
  assert.equal(errOf(() => rows("blog", at(2, { team_key: "dsr", unit: "대구 010-1234-5678" }))), "rows[2]: 개인정보(전화번호)처럼 보이는 값이 있어 저장하지 않아요: unit");
  assert.equal(errOf(() => rows("google_ad", at(2, { team_key: "dsr", unit: "a", metrics: { note: "010-1234-5678" } }))), "rows[2]: 개인정보(전화번호)처럼 보이는 값이 있어 저장하지 않아요: note");
  assert.match(errOf(() => rows("jeonsan", at(1, { team_key: "dsr", unit: "홍길동 0101234" }))), /^rows\[1\]: jeonsan unit/);
  assert.match(errOf(() => rows("blog", at(5, { unit: "x" }))), /^rows\[5\]: team_key 가 필요해요/);
  assert.match(errOf(() => rows("google_ad", at(1, { team_key: "dsr", unit: 5 }))), /^rows\[1\]: unit 은 문자열/);
});
test("접두어는 행 단위 오류에만 — 봉투·중복 오류는 그대로", () => {
  assert.equal(errOf(() => rows("meta_ad", { rows: [], status: "ok" })), "rows 가 비었는데 status(failed/login_required)가 없어요");
  assert.match(errOf(() => rows("google_ad", { rows: [{ team_key: "dsr", unit: "a" }, { team_key: "dsr", unit: "a" }] })), /^같은 지점·unit 이 여러 번 나왔어요: 1:a ×2/);
  assert.match(errOf(() => rows("google_ad", { rows: [{ team_key: "dsr", unit: "a" }, 5] })), /^입력 형식 오류: rows\[1\] 는 객체여야 해요$/);
});

// ── campaign_id 가 숫자로 온 경우 (크롬에서 읽은 값) ──
test("campaign_id: 유한한 숫자는 문자열로 바꿔 저장, 그 밖의 타입은 거부", () => {
  assert.deepEqual(cleanMetrics({ campaign_id: 12345678 }), { campaign_id: "12345678" });
  assert.deepEqual(cleanMetrics({ campaign_id: 0 }), { campaign_id: "0" });
  assert.deepEqual(cleanMetrics({ campaign_id: "cmp-a001" }), { campaign_id: "cmp-a001" });
  for (const v of [NaN, Infinity, true, [1], { a: 1 }]) assert.throws(() => cleanMetrics({ campaign_id: v }), /campaign_id 는 문자열이어야 해요/, String(v));
  // 다른 문자열 키는 여전히 숫자를 안 받는다
  assert.throws(() => cleanMetrics({ status: 5 }), /status 는 문자열/);
  assert.throws(() => cleanMetrics({ note: 5 }), /note 는 문자열/);
  // 긴 숫자 id 는 전화번호 검사 대상이 아니다
  const out = rows("naver_ad", { rows: [{ team_key: "dsr", unit: "대구 a", metrics: { campaign_id: 1012345678901, clicks: 1 } }] });
  assert.equal(out[0].metrics.campaign_id, "1012345678901");
});

// ── saveRows 의 옛 '전체' 행 정리 계획 (순수 부분 — DB 삭제는 lib.mjs, 로컬 DB 로 따로 확인) ──
const R = (team_id, unit, status = "ok", channel = "naver_ad", date = D) => ({ team_id, date, channel, unit, status, metrics: {} });
test("staleAllPlan: '전체' 행 없이 unit 행(ok/partial)만 쓴 지점 → 그 지점의 옛 '전체' 행(어떤 상태든)을 지운다", () => {
  assert.deepEqual(staleAllPlan([R(1, "a"), R(1, "b", "partial"), R(2, "c")]), [{ channel: "naver_ad", date: D, teamIds: [1, 2] }]);
});
test("staleAllPlan: 이번에 '전체' 행을 쓴 지점은 지우지 않는다 (ok·failed 무엇이든 — 같은 키로 이미 덮어썼다)", () => {
  assert.deepEqual(staleAllPlan([R(1, "전체"), R(1, "a")]), []);
  assert.deepEqual(staleAllPlan([R(1, "전체", "failed"), R(1, "a")]), []);
  assert.deepEqual(staleAllPlan([R(3, "전체", "ok")]), []); // 0 행만 쓴 지점
  assert.deepEqual(staleAllPlan([R(1, "전체", "ok"), R(1, "a"), R(2, "b")]), [{ channel: "naver_ad", date: D, teamIds: [2] }]); // 지점별로 따로
});
test("staleAllPlan: 실패 표시만 쓴 지점·ok 가 아닌 unit 행만 쓴 지점은 지우지 않는다 (옛 값이 쓸 만한 마지막 데이터)", () => {
  assert.deepEqual(staleAllPlan([R(1, "전체", "login_required")]), []);
  assert.deepEqual(staleAllPlan([R(1, "a", "failed"), R(2, "b", "login_required")]), []);
});
test("staleAllPlan: 배치에 없는 지점은 계획에 없다, 채널·날짜마다 따로", () => {
  const plan = staleAllPlan([R(1, "a"), R(1, "a", "ok", "google_ad"), R(1, "a", "ok", "naver_ad", "2026-10-27")]);
  assert.deepEqual(plan.map((p) => [p.channel, p.date, p.teamIds]), [["naver_ad", D, [1]], ["google_ad", D, [1]], ["naver_ad", "2026-10-27", [1]]]);
  assert.deepEqual(staleAllPlan([]), []);
});
test("staleAllPlan: 같은 지점의 unit 행이 여러 개여도 지점은 한 번만", () => {
  assert.deepEqual(staleAllPlan([R(1, "a"), R(1, "b"), R(1, "c")])[0].teamIds, [1]);
});
