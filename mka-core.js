// 🤖 마케팅 탭 › 에이전트 계산 모음 (브라우저 window.MKACORE · Node require 겸용). 화면·DB와 무관한 순수 함수만 둔다.
// 에이전트(맥북 ad-agent/)가 만든 planner_feed.json 항목을 DB(mka_items)에 올릴 때와, 화면에서 보여줄 때 쓴다.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.MKACORE = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
const KINDS = ["thread", "proposal", "topad", "control"];
const TOPAD_FRESH_HOURS = 72; // 맥미니가 매일 올리므로, 이보다 오래된 상위 광고 행은 지난 순위라 화면에서 뺀다

// 올릴 행 나누기: 광고 제안(proposal)은 대표가 승인/반려한 상태를 덮어쓰면 안 되므로, 이미 있는 키는 status 없이 내용만 갱신한다.
function splitFeed(items, existingProposalKeys, now = new Date().toISOString()) {
  const known = new Set(existingProposalKeys);
  const withStatus = [], contentOnly = [];
  for (const it of items) {
    if (!KINDS.includes(it.kind) || !it.key) continue;
    const row = { kind: it.kind, key: String(it.key), data: it.data ?? {}, updated_at: now };
    if (it.kind === "proposal" && known.has(row.key)) contentOnly.push(row);
    else withStatus.push({ ...row, status: it.status ?? "" });
  }
  return { withStatus, contentOnly };
}

// DB 에서 읽은 행 → 맥북이 읽을 상태 파일(킬스위치·승인·반려). 킬스위치 행이 없으면 꺼진 걸로 본다.
function stateOf(rows) {
  const kill = rows.some((r) => r.kind === "control" && r.key === "kill" && r.status === "on");
  const pick = (st) => rows.filter((r) => r.kind === "proposal" && r.status === st).map((r) => r.key).sort();
  return { kill, approved: pick("approved"), rejected: pick("rejected") };
}

// 화면용: 지난 순위(오래된 topad)를 빼고 리드 많은 순으로
function freshTop(rows, now = Date.now()) {
  return rows.filter((r) => r.kind === "topad" && now - new Date(r.updated_at).getTime() <= TOPAD_FRESH_HOURS * 3600e3)
    .sort((a, b) => (b.data?.leads ?? 0) - (a.data?.leads ?? 0) || (a.data?.cpl ?? 0) - (b.data?.cpl ?? 0));
}

// 광고 지점 코드 → 화면 이름
const BRANCH = { DAEGUDSR: "대구 동성로(영어)", DAEGUJPCH: "대구 일본어·중국어", ULSAN: "울산" };
// 링크는 https 만 연다 (DB 값이라도 화면에 넣기 전에 거른다)
const safeUrl = (u) => (typeof u === "string" && /^https:\/\//.test(u) ? u : "");

return { KINDS, TOPAD_FRESH_HOURS, splitFeed, stateOf, freshTop, BRANCH, safeUrl };
});
