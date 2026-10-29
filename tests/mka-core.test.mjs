import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const C = createRequire(import.meta.url)("../mka-core.js");

test("splitFeed: 이미 있는 광고 제안은 status 를 빼서 대표 승인 상태를 지킨다", () => {
  const items = [
    { kind: "proposal", key: "a1", status: "proposed", data: { hook: "x" } },
    { kind: "proposal", key: "a2", status: "proposed", data: { hook: "y" } },
    { kind: "thread", key: "t1", status: "posted", data: {} },
    { kind: "bogus", key: "z", data: {} },
    { kind: "topad", data: {} },
  ];
  const r = C.splitFeed(items, ["a1"], "2026-10-30T00:00:00Z");
  assert.deepEqual(r.contentOnly.map((x) => x.key), ["a1"]);
  assert.ok(!("status" in r.contentOnly[0]));
  assert.deepEqual(r.withStatus.map((x) => [x.key, x.status]), [["a2", "proposed"], ["t1", "posted"]]);
});

test("stateOf: 킬스위치·승인·반려", () => {
  const rows = [
    { kind: "control", key: "kill", status: "on" },
    { kind: "proposal", key: "b", status: "approved" },
    { kind: "proposal", key: "a", status: "approved" },
    { kind: "proposal", key: "c", status: "rejected" },
    { kind: "proposal", key: "d", status: "proposed" },
  ];
  assert.deepEqual(C.stateOf(rows), { kill: true, approved: ["a", "b"], rejected: ["c"] });
  assert.equal(C.stateOf([]).kill, false);
  assert.equal(C.stateOf([{ kind: "control", key: "kill", status: "off" }]).kill, false);
});

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
