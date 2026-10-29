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
