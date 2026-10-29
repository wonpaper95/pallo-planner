// 🤖 마케팅 탭 › 에이전트 계산 모음 (브라우저 window.MKACORE · Node require 겸용). 화면·DB와 무관한 순수 함수만 둔다.
// 에이전트(맥북 ad-agent/push_to_planner.py)가 DB 함수 mka_push 로 올린 mka_items 를 화면에서 보여줄 때 쓴다.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.MKACORE = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
const KINDS = ["thread", "proposal", "topad", "control"];
const TOPAD_FRESH_HOURS = 72; // 매일 올리므로, 이보다 오래된 상위 광고 행은 지난 순위라 화면에서 뺀다

// 화면용: 지난 순위(오래된 topad)를 빼고 리드 많은 순으로
function freshTop(rows, now = Date.now()) {
  return rows.filter((r) => r.kind === "topad" && now - new Date(r.updated_at).getTime() <= TOPAD_FRESH_HOURS * 3600e3)
    .sort((a, b) => (b.data?.leads ?? 0) - (a.data?.leads ?? 0) || (a.data?.cpl ?? 0) - (b.data?.cpl ?? 0));
}

// 경쟁사 추천 고르기: 한국어 문구가 있고(해외·계정이름뿐인 광고 제외) 30일 넘게 도는 광고만, 페이지당 1개.
// 순서: 대표가 켠 경쟁사 → 여러 광고로 돌리는 소재(n_ads) → 오래 도는 순. ads 는 우리 지점 페이지를 뺀 mkc_ads 행.
const HANGUL = /[가-힣]/;
const MIN_DAYS = 30, MIN_TEXT = 10;
const adText = (a) => String(a.body || a.headline || "").trim();
function pickCompetitorAds(ads, onIds, today, n = 10) {
  const on = new Set(onIds);
  const days = (a) => (a.start_date ? Math.round((new Date(today + "T00:00:00Z") - new Date(a.start_date + "T00:00:00Z")) / 864e5) : 0);
  const ok = ads.filter((a) => { const t = adText(a); return HANGUL.test(t) && t.length >= MIN_TEXT && t !== a.page_name && days(a) >= MIN_DAYS; })
    .map((a) => ({ ...a, days: days(a), on: on.has(a.competitor_id) }))
    .sort((a, b) => b.on - a.on || (b.n_ads ?? 1) - (a.n_ads ?? 1) || b.days - a.days);
  const seen = new Set();
  return ok.filter((a) => !seen.has(a.page_name) && seen.add(a.page_name)).slice(0, n);
}

// 광고 지점 코드 → 화면 이름
const BRANCH = { DAEGUDSR: "대구 동성로(영어)", DAEGUJPCH: "대구 일본어·중국어", ULSAN: "울산" };
// 링크는 https 만 연다 (DB 값이라도 화면에 넣기 전에 거른다)
const safeUrl = (u) => (typeof u === "string" && /^https:\/\//.test(u) ? u : "");
// 썸네일은 에이전트가 넣은 JPEG data URL 만 (base64 글자만 허용 → 따옴표·태그 끼어들 틈 없음)
const safeImg = (s) => typeof s === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s);

return { KINDS, TOPAD_FRESH_HOURS, freshTop, MIN_DAYS, adText, pickCompetitorAds, BRANCH, safeUrl, safeImg };
});
