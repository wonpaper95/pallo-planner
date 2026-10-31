import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const C = createRequire(import.meta.url)("../sns-core.js");

const tags = (n) => Array.from({ length: n }, (_, i) => `태그${i + 1}`);
const lv = (L, re) => L.find((x) => re.test(x.txt))?.lv;

test("CHANNELS: 네 채널 순서, 1단계는 전부 수동", () => {
  assert.deepEqual(C.CHANNELS.map((c) => c.key), ["instagram", "google", "naver"]);
  assert.ok(C.CHANNELS.every((c) => c.auto === false && /^https:\/\//.test(c.open)));
});

test("parseTags: # 떼기·쉼표·중복 제거", () => {
  assert.deepEqual(C.parseTags("#대구영어 ##동성로, 대구영어\n#팔로"), ["대구영어", "동성로", "팔로"]);
  assert.deepEqual(C.parseTags(""), []);
});

test("tagLine: # 붙여 한 줄", () => {
  assert.equal(C.tagLine(["대구영어", "#팔로"]), "#대구영어 #팔로");
  assert.equal(C.tagLine([]), "");
});

test("normalizeChannels: 빠진 값 채우고 모르는 구글 종류·버튼은 기본값", () => {
  const n = C.normalizeChannels({ instagram: { caption: "a", hashtags: ["#x", "y"] }, google: { body: "b", type: "toString", button: "zzz" } });
  assert.deepEqual(n, {
    instagram: { caption: "a", hashtags: ["x", "y"] },
    google: { body: "b", type: "standard", button: "none" },
    naver: { title: "", body: "" },
    daangn: { title: "", body: "" },
  });
  assert.equal(C.normalizeChannels({ instagram: { hashtags: "문자열" } }).instagram.hashtags.length, 0);
});

test("normalizeAi: draft·self_review·channels", () => {
  const r = C.normalizeAi({ draft: "원고", self_review: "점검", google: { body: "g", type: "event", button: "call" } });
  assert.equal(r.draft, "원고"); assert.equal(r.self_review, "점검");
  assert.deepEqual(r.channels.google, { body: "g", type: "event", button: "call" });
});

test("channelText: 채널별 복사 글", () => {
  assert.equal(C.channelText("instagram", { caption: "훅\n본문 ", hashtags: ["a", "b"] }), "훅\n본문\n\n#a #b");
  assert.equal(C.channelText("instagram", { caption: "훅", hashtags: [] }), "훅");
  assert.equal(C.channelText("google", { body: " 구글 본문 " }), "구글 본문");
  assert.equal(C.channelText("naver", { title: "제목", body: "본문" }), "제목\n\n본문");
  assert.equal(C.channelText("daangn", { title: "", body: "본문" }), "본문");
});

test("checkChannel 인스타: 정상 캐러셀", () => {
  const L = C.checkChannel("instagram", { caption: "훅\n본문", hashtags: tags(16) }, { photos: 3, unfaced: 0 });
  assert.ok(L.every((x) => x.lv === "ok"), JSON.stringify(L));
  assert.equal(lv(L, /사진 3장 \(캐러셀\)/), "ok");
});

test("checkChannel 인스타: 사진 없음·해시태그 31개는 막힘", () => {
  const L = C.checkChannel("instagram", { caption: "x", hashtags: tags(31) }, { photos: 0, unfaced: 0 });
  assert.equal(lv(L, /1장 이상/), "bad");
  assert.equal(lv(L, /해시태그 31개/), "bad");
});

test("checkChannel 인스타: 해시태그 10개는 경고, 11장은 막힘", () => {
  const L = C.checkChannel("instagram", { caption: "x", hashtags: tags(10) }, { photos: 11, unfaced: 2 });
  assert.equal(lv(L, /해시태그 10개/), "warn");
  assert.equal(lv(L, /10장까지/), "bad");
  assert.equal(lv(L, /얼굴 확인 안 한 사진 2장/), "warn");
});

test("checkChannel: 컬컴·[확인 필요]는 막힘, 과장 표현은 경고", () => {
  assert.equal(C.checkChannel("naver", { title: "소식", body: "컬컴 시절부터" }, {})[0].lv, "bad");
  assert.equal(C.checkChannel("daangn", { title: "소식", body: "최고의 수업" }, {})[0].lv, "warn");
  assert.equal(lv(C.checkChannel("daangn", { title: "t", body: "[확인 필요: 시간] 시작" }, {}), /\[확인 필요\] 1곳/), "bad");
});

test("checkChannel: 대소문자 섞인 Culcom 도 막힘", () => {
  const L = C.checkChannel("daangn", { title: "소식", body: "예전 CulCom 시절" }, {});
  assert.equal(L[0].lv, "bad");
  assert.match(L[0].txt, /CULCOM/);
  assert.doesNotMatch(L[0].txt, /CULCOM, culcom/);
});

test("checkChannel 구글: 1,500자 넘으면 막힘, 사진 여러 장은 안내", () => {
  const L = C.checkChannel("google", { body: "가".repeat(1600), type: "standard", button: "none" }, { photos: 3 });
  assert.equal(lv(L, /본문 1,600자/), "bad");
  assert.equal(lv(L, /첫 번째 사진 1장만/), "info");
});

test("checkChannel 네이버: 제목 25자는 경고, 빈 제목도 경고", () => {
  assert.equal(lv(C.checkChannel("naver", { title: "가".repeat(25), body: "b" }, {}), /제목 25자/), "warn");
  assert.equal(lv(C.checkChannel("naver", { title: "", body: "b" }, {}), /제목이 비어/), "warn");
  assert.equal(lv(C.checkChannel("naver", { title: "11월 토요반 모집", body: "b" }, {}), /제목 10자/), "ok");
});

test("jobRows: 고른 채널마다 수동 작업", () => {
  assert.deepEqual(C.jobRows({ id: 7, team_id: 1 }, ["naver", "daangn"]), [
    { post_id: 7, team_id: 1, channel: "naver", method: "manual", status: "waiting_copy" },
    { post_id: 7, team_id: 1, channel: "daangn", method: "manual", status: "waiting_copy" },
  ]);
});

test("fmtKst: UTC → 한국 시간", () => {
  assert.equal(C.fmtKst("2026-10-27T10:00:00Z"), "10/27 19:00");
  assert.equal(C.fmtKst("2026-12-31T15:30:00Z"), "01/01 00:30");
});

test("fmtKst: 잘못된 값은 -", () => {
  assert.equal(C.fmtKst(undefined), "-");
  assert.equal(C.fmtKst("abc"), "-");
  assert.deepEqual(C.badge({ status: "queued" }), { cls: "", text: "예약됨 -" });
});

test("badge: 상태별 뱃지", () => {
  assert.deepEqual(C.badge({ status: "queued", run_at: "2026-10-27T10:00:00Z" }), { cls: "", text: "예약됨 10/27 19:00" });
  assert.deepEqual(C.badge({ status: "running" }), { cls: "", text: "올리는 중…" });
  assert.deepEqual(C.badge({ status: "posted" }), { cls: "pub", text: "게시됨" });
  assert.deepEqual(C.badge({ status: "failed", error_ko: "토큰 만료" }), { cls: "bad", text: "실패 — 토큰 만료" });
  assert.deepEqual(C.badge({ status: "failed" }), { cls: "bad", text: "실패" });
  assert.deepEqual(C.badge({ status: "waiting_copy" }), { cls: "", text: "복사 대기" });
  assert.deepEqual(C.badge({ status: "done_manual" }), { cls: "pub", text: "올렸어요" });
});

test("titleOf: 주제 → 없으면 원고 첫 줄 → 40자 자르기", () => {
  assert.equal(C.titleOf({ topic: " 토요반 ", draft: "x" }), "토요반");
  assert.equal(C.titleOf({ topic: "", draft: "\n첫 줄입니다\n둘째" }), "첫 줄입니다");
  assert.equal(C.titleOf({ topic: "가".repeat(45) }), "가".repeat(40) + "…");
  assert.equal(C.titleOf({}), "(제목 없음)");
});
