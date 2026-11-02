// 팀 업무 순서: 날짜 → 끝낸 일 위 → 마감 없음 → 마감 시각순
import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const W = createRequire(import.meta.url)("../week.js");

test("teamSort", () => {
  const tk = [{ id: 1, day: "2026-11-03", deadline: "2026-11-03T09:00:00+00:00" }, { id: 2, day: "2026-11-03", deadline: null }, { id: 3, day: "2026-11-03", deadline: "2026-11-03T01:00:00+00:00" },
    { id: 4, day: "2026-11-03", deadline: null, done_by: "u" }, { id: 5, day: "2026-11-02", deadline: "2026-11-02T09:00:00+00:00" }];
  assert.deepStrictEqual([...tk].sort(W.teamSort).map((k) => k.id), [5, 4, 2, 3, 1]);
});
