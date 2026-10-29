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

// 광고 지점 코드 → 화면 이름
const BRANCH = { DAEGUDSR: "대구 동성로(영어)", DAEGUJPCH: "대구 일본어·중국어", ULSAN: "울산" };
// 링크는 https 만 연다 (DB 값이라도 화면에 넣기 전에 거른다)
const safeUrl = (u) => (typeof u === "string" && /^https:\/\//.test(u) ? u : "");

return { KINDS, TOPAD_FRESH_HOURS, freshTop, BRANCH, safeUrl };
});
