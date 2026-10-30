import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const C = createRequire(import.meta.url)("../mka-core.js");

test("freshTop: 지난 순위는 빼고 리드 많은 순", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");
  const rows = [
    { kind: "topad", key: "1", updated_at: "2026-10-30T05:00:00Z", data: { leads: 5, cpl: 9 } },
    { kind: "topad", key: "2", updated_at: "2026-10-30T05:00:00Z", data: { leads: 9, cpl: 12 } },
    { kind: "topad", key: "3", updated_at: "2026-10-30T05:00:00Z", data: { leads: 9, cpl: 4 } },
    { kind: "topad", key: "old", updated_at: "2026-10-20T05:00:00Z", data: { leads: 99, cpl: 1 } },
    { kind: "thread", key: "t", updated_at: "2026-10-30T05:00:00Z", data: {} },
  ];
  assert.deepEqual(C.freshTop(rows, now).map((r) => r.key), ["3", "2", "1"]);
});

test("safeUrl: https 만", () => {
  assert.equal(C.safeUrl("https://fb.me/x"), "https://fb.me/x");
  assert.equal(C.safeUrl("javascript:alert(1)"), "");
  assert.equal(C.safeUrl("http://x"), "");
  assert.equal(C.safeUrl(null), "");
});

test("safeImg: JPEG data URL 만", () => {
  assert.equal(C.safeImg("data:image/jpeg;base64,/9j/4AAQ+/="), true);
  assert.equal(C.safeImg('data:image/jpeg;base64,abc" onerror="x'), false);
  assert.equal(C.safeImg("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(C.safeImg("https://x/y.jpg"), false);
  assert.equal(C.safeImg(null), false);
});

test("pickCompetitorAds: 한국어·문구 있음·30일+·페이지당 1개, 켠 경쟁사 먼저", () => {
  const today = "2026-10-30";
  const ads = [
    { library_id: "vn", page_name: "Tiếng Trung Molii", body: "Đừng bỏ qua cuốn sách này", start_date: "2022-09-01" },     // 해외
    { library_id: "nm", page_name: "jimenglish__jim", body: "", headline: "jimenglish__jim", start_date: "2025-01-01" },   // 계정 이름뿐
    { library_id: "en", page_name: "엘존", headline: "Request Time", start_date: "2024-01-01" },                             // 영어 버튼 문구
    { library_id: "new", page_name: "신규", body: "이번 주 새로 시작한 영어회화 광고예요", start_date: "2026-10-20" },      // 30일 미만
    { library_id: "a1", page_name: "로라", body: "배움을 재밌게, 탈잉! 회화 문법 수업", start_date: "2025-12-01", n_ads: 1 },
    { library_id: "a2", page_name: "로라", body: "배움을 재밌게, 탈잉! 회화 문법 수업", start_date: "2025-12-01", n_ads: 1 }, // 같은 페이지
    { library_id: "b", page_name: "케쌤", body: "무료 강의 정보 드립니다 댓글 남겨주세요", start_date: "2026-08-19", n_ads: 5 },
    { library_id: "c", page_name: "동네학원", body: "대구 동성로 성인 영어회화 소그룹 모집", start_date: "2026-09-01", n_ads: 1, competitor_id: 7 },
  ];
  assert.deepEqual(C.pickCompetitorAds(ads, [7], today).map((a) => a.library_id), ["c", "b", "a1"]);
  assert.equal(C.pickCompetitorAds(ads, [], today, 1)[0].library_id, "b");
});

test("propStage: 승인 → 초안 → 켜줘 → 게재", () => {
  assert.deepEqual(C.propStage("proposed", {}), { label: "🟡 승인 대기", act: "decide" });
  assert.equal(C.propStage("approved", {}).act, null); // 초안 만들기 전엔 누를 것 없음
  assert.equal(C.propStage("approved", { stage: "drafted" }).act, "activate");
  assert.equal(C.propStage("activate", { stage: "drafted" }).act, "cancel");
  assert.equal(C.propStage("activate", { stage: "live" }).label, "🟢 게재 중");
  assert.equal(C.propStage("rejected", { stage: "drafted" }).act, null);
});
