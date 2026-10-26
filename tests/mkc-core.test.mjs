import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const C = createRequire(import.meta.url)("../mkc-core.js");

const card1 = { libraryId: "2254476755408748", platforms: ["facebook", "instagram", "instagram"], hasVideo: true, imageCount: 0,
  pageHref: "https://www.facebook.com/100064293724571/", landingHref: "https://kessam.com/free",
  lines: ["​", "활성", "라이브러리 ID: 2254476755408748", "2026. 8. 19.에 게재 시작함", "플랫폼", "​", "메뉴", "광고 상세 정보 보기",
    "page 1 페이지는 케쌤영어과(와) 함께합니다", "광고", "💬 (공유) 무료 강의 정보 드립니다", "0원이라고 해서 살짝 의심 반으로 시작했는데…", "", "댓글 남겨주시면 DM으로 링크 보내드릴게요 :)", "0:00 / 0:49", "KESSAM.COM", "page 1", "지금 신청하기"] };

test("parseCard: 제휴 페이지·영상·도메인·CTA", () => {
  const a = C.parseCard(card1);
  assert.equal(a.library_id, "2254476755408748");
  assert.equal(a.start_date, "2026-08-19");
  assert.equal(a.page_name, "케쌤영어");
  assert.equal(a.partner_name, "page 1");
  assert.equal(a.page_id, "100064293724571");
  assert.equal(a.media_type, "video");
  assert.equal(a.duration_s, 49);
  assert.equal(C.parseCard({ ...card1, lines: card1.lines.map((l) => (l === "0:00 / 0:49" ? "0:00 / 0:00" : l)) }).duration_s, null);
  assert.equal(a.landing_domain, "kessam.com");
  assert.equal(a.landing_url, "https://kessam.com/free");
  assert.equal(a.headline, "page 1");
  assert.equal(a.cta, "지금 신청하기");
  assert.deepEqual(a.platforms, ["facebook", "instagram"]);
  assert.match(a.body, /^💬 \(공유\) 무료 강의 정보 드립니다\n0원이라고/);
  assert.ok(!a.body.includes("KESSAM"));
  assert.equal(a.multi_version, false); assert.equal(a.n_ads, 1);
});

test("parseCard: 여러 버전·광고 N개·이미지·제목+설명", () => {
  const a = C.parseCard({ libraryId: "1", platforms: [], hasVideo: false, imageCount: 1, pageHref: "https://www.facebook.com/61560754546821/",
    lines: ["활성", "라이브러리 ID: 1", "2026. 6. 15.에 게재 시작함", "플랫폼", "광고 4개에서 이 크리에이티브 및 문구를 사용합니다", "메뉴", "요약 세부 사항 보기", "컬컴 송도점", "광고",
      "No.1 영어회화 스터디", "👉위치: 인천대입구역 5분 거리", "INSTAGRAM.COM", "내 자리 있나? 확인해보기", "오늘부터 영어 진짜 시작!", "더 알아보기"] });
  assert.equal(a.page_name, "컬컴 송도점"); assert.equal(a.partner_name, "");
  assert.equal(a.n_ads, 4); assert.equal(a.multi_version, true);
  assert.equal(a.media_type, "image");
  assert.equal(a.landing_domain, "instagram.com");
  assert.equal(a.headline, "내 자리 있나? 확인해보기");
  assert.equal(a.description, "오늘부터 영어 진짜 시작!");
  assert.equal(a.cta, "더 알아보기");
  assert.equal(a.body, "No.1 영어회화 스터디\n👉위치: 인천대입구역 5분 거리");
});

test("parseCard: 도메인·CTA 없는 카드는 본문만, 캐러셀", () => {
  const a = C.parseCard({ libraryId: "2", platforms: ["instagram"], hasVideo: false, imageCount: 3, lines: ["활성", "라이브러리 ID: 2", "2026. 9. 1.에 게재 시작함", "광고 상세 정보 보기", "어떤학원", "광고", "한 줄 본문", "두 줄째"] });
  assert.equal(a.body, "한 줄 본문\n두 줄째"); assert.equal(a.cta, ""); assert.equal(a.media_type, "carousel"); assert.equal(a.landing_domain, "");
});

test("text_hash: 같은 페이지·같은 문구(기호·공백 차이)는 같고, 다른 문구는 다르다", () => {
  const mk = (body, page = "P") => C.parseCard({ libraryId: "x", lines: ["활성", "라이브러리 ID: 9", "광고 상세 정보 보기", page, "광고", body] }).text_hash;
  assert.equal(mk("안녕 영어!!"), mk("안녕영어"));
  assert.notEqual(mk("안녕 영어"), mk("잘가 영어"));
  assert.notEqual(mk("안녕 영어", "A"), mk("안녕 영어", "B"));
});

test("parseStartDate · platformOfPath · unwrapLink", () => {
  assert.equal(C.parseStartDate("2026. 8. 19.에 게재 시작함"), "2026-08-19");
  assert.equal(C.parseStartDate("2026. 10. 1.에 게재 시작함"), "2026-10-01");
  assert.equal(C.parseStartDate("없음"), null);
  assert.equal(C.platformOfPath("M12 6.022C12 2.696 9.314 0 6 0S0"), "facebook");
  assert.equal(C.platformOfPath("M0 0"), null);
  assert.equal(C.unwrapLink("https://l.facebook.com/l.php?u=https%3A%2F%2Fkessam.com%2Ffree&h=AUC"), "https://kessam.com/free");
  assert.equal(C.unwrapLink("https://www.facebook.com/x/"), "https://www.facebook.com/x/");
});

test("verdict: 집행 일수·버전·종료", () => {
  const t = "2026-10-26";
  assert.equal(C.verdict({ active: true, start_date: "2026-08-19", first_seen: "2026-10-26" }, t), "core");
  assert.equal(C.verdict({ active: true, start_date: "2026-10-10", first_seen: "2026-10-26" }, t), "proven");
  assert.equal(C.verdict({ active: true, start_date: "2026-10-05", first_seen: "2026-10-26", multi_version: true }, t), "core");
  assert.equal(C.verdict({ active: true, start_date: "2026-10-05", first_seen: "2026-10-26", n_ads: 3 }, t), "core");
  assert.equal(C.verdict({ active: true, start_date: "2026-10-24", first_seen: "2026-10-26" }, t), "new");
  assert.equal(C.verdict({ active: true, start_date: "2026-10-16", first_seen: "2026-10-10" }, t), "watch");
  assert.equal(C.verdict({ active: false, start_date: "2026-01-01" }, t), "ended");
});

test("endedIds: 경쟁사 광고는 이틀, 키워드만 본 광고는 7일 안 보여야 종료, mergeRows: first_seen·keywords 유지", () => {
  const prev = [{ library_id: "a", last_seen: "2026-10-25", competitor_id: 1 }, { library_id: "b", last_seen: "2026-10-24", competitor_id: 1 }, { library_id: "c", last_seen: "2026-10-24", competitor_id: 1 },
    { library_id: "k1", last_seen: "2026-10-20", competitor_id: null }, { library_id: "k2", last_seen: "2026-10-19", competitor_id: null }];
  assert.deepEqual(C.endedIds(prev, ["c"], "2026-10-26"), ["b", "k2"]);
  const rows = C.mergeRows([{ library_id: "c", body: "x" }, { library_id: "d", body: "y" }], [{ library_id: "c", first_seen: "2026-10-01", keywords: ["영어회화"], thumb_path: "en/c.jpg" }], { grp: "en", today: "2026-10-26", keywordsById: { c: ["오픽"], d: ["오픽"] } });
  assert.equal(rows[0].first_seen, "2026-10-01"); assert.deepEqual(rows[0].keywords, ["영어회화", "오픽"]); assert.equal(rows[0].thumb_path, "en/c.jpg");
  assert.equal(rows[1].first_seen, "2026-10-26"); assert.deepEqual(rows[1].keywords, ["오픽"]); assert.equal(rows[1].last_seen, "2026-10-26");
});

test("groupByText · groupOfTeamName · urls", () => {
  const g = C.groupByText([{ page_name: "P", text_hash: "h", start_date: "2026-09-01" }, { page_name: "P", text_hash: "h", start_date: "2026-08-01" }, { page_name: "Q", text_hash: "h" }]);
  assert.equal(g.length, 2); assert.equal(g[0].count, 2); assert.equal(g[0].start_date, "2026-08-01");
  assert.equal(C.groupOfTeamName("대구일중점"), "jpcn"); assert.equal(C.groupOfTeamName("울산점"), "en"); assert.equal(C.groupOfTeamName("대구일본어중국어점"), "jpcn");
  assert.match(C.searchUrl("영어 회화"), /country=KR&q=%EC%98%81%EC%96%B4%20%ED%9A%8C%ED%99%94/);
  assert.equal(C.libraryUrl("12"), "https://www.facebook.com/ads/library/?id=12");
});

test("isOwnPage: 팔로 지점은 우리, 컬컴 타 지점은 아님", () => {
  assert.equal(C.isOwnPage("팔로 대구동성로점"), true); assert.equal(C.isOwnPage("Pallo English"), true);
  assert.equal(C.isOwnPage("컬컴 송도점"), false); assert.equal(C.isOwnPage("케쌤영어"), false);
});

test("pageUrl: 숫자 ID 만, 별명이면 이름 검색", () => {
  assert.match(C.pageUrl("61560754546821"), /view_all_page_id=61560754546821$/);
  assert.equal(C.pageUrl("ringleedu"), null);
  assert.match(C.competitorUrl({ page_id: "ringleedu", page_name: "링글 1:1 화상영어" }), /q=%EB%A7%81%EA%B8%80/);
  assert.match(C.competitorUrl({ page_id: "123", page_name: "x" }), /view_all_page_id=123/);
});

test("checkIdeas: 베끼기·컬컴·과장·가격 경고", () => {
  const comp = [{ library_id: "9", page_name: "컬컴 송도점", body: "No.1 영어회화 스터디\n👉위치: 인천대입구역 5분 거리\n- 한번이라도 영어를 배워보고 싶은 초보자\n- 그동안 배운 영어, 제대로 써먹고 싶은 사람!" }];
  const copied = { title: "A", copy: { body: "No.1 영어회화 스터디\n👉위치: 대구 동성로역 5분 거리\n- 한번이라도 영어를 배워보고 싶은 초보자\n- 그동안 배운 영어, 제대로 써먹고 싶은 사람!" } };
  const fresh = { title: "B", copy: { body: "퇴근 후 2시간, 외국인 친구와 진짜 대화로 영어를 쓰는 동성로 스터디. 첫 주는 무료로 들어와 보세요.", headline: "동성로 영어회화 스터디" } };
  const r = C.checkIdeas([copied, fresh, { title: "C", copy: { body: "컬컴 대구점 100% 환급 15만원" } }], comp);
  assert.ok(r.some((x) => x.idea === 0 && x.level === "warn" && /거의 같아요/.test(x.msg)));
  assert.ok(!r.some((x) => x.idea === 1));
  assert.ok(r.some((x) => x.idea === 2 && x.level === "block"));
  assert.ok(r.some((x) => x.idea === 2 && /과장/.test(x.msg)));
  assert.ok(r.some((x) => x.idea === 2 && /가격/.test(x.msg)));
  assert.ok(C.similarity("안녕하세요 영어회화", "안녕하세요 영어회화") > 0.99);
});
