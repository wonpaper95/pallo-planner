// 🌳 업무분장 기본값(duty-seed.js) 점검: 제목 겹침·연관 이름표·주기/바로가기 제목·플래너 탭 이름이 맞는지
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const window = {};
new Function("window", readFileSync(root + "duty-seed.js", "utf8"))(window);
const S = window.DUTY_SEED, titles = [], keys = [];
const walk = (t, d) => { titles.push(t.t); if (t.k) keys.push(t.k); assert.ok(t.t.length >= 1 && t.t.length <= 80, t.t); assert.ok((t.o ?? "").length <= 120); (t.c ?? []).forEach((c) => walk(c, d + 1)); };
walk(S.tree, 0);

test("제목은 겹치지 않는다 (주기·바로가기를 제목으로 찾음)", () => assert.deepEqual(titles.filter((t, i) => titles.indexOf(t) !== i), []));
test("연관 이름표는 겹치지 않고 모두 있다", () => {
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
  assert.deepEqual(S.rel.flat().filter((k) => !keys.includes(k)), []);
  const pairs = S.rel.map(([a, b]) => [a, b].sort().join("|"));
  assert.deepEqual(pairs.filter((p, i) => pairs.indexOf(p) !== i), []);
  assert.ok(S.rel.every(([a, b]) => a !== b));
});
test("주기·바로가기에 적힌 제목은 모두 있는 업무다", () => {
  const cy = Object.values(S.cycle).flat();
  assert.deepEqual(cy.filter((t) => !titles.includes(t)), []);
  assert.deepEqual(cy.filter((t, i) => cy.indexOf(t) !== i), []);
  assert.deepEqual(Object.keys(S.cycle).filter((c) => !["매일", "매주", "매월", "분기", "수시"].includes(c)), []);
  assert.deepEqual(Object.keys(S.link).filter((t) => !titles.includes(t)), []);
});
test("바로가기는 플래너에 있는 탭이다", () => {
  const html = readFileSync(root + "index.html", "utf8"), tabs = [...html.matchAll(/data-v="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(Object.values(S.link).filter((l) => !tabs.includes(l.slice(1))), []);
  assert.ok(tabs.includes("duty"));
});
