import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
globalThis.window = globalThis;
createRequire(import.meta.url)("../jo-guide.js");
const { merge } = window.JGUIDE;
const B = {
  PRE: { goal: "g", submit: { q: "s" }, read: [{ t: "r", min: 5, ref: ["a"] }], hw: [{ id: "h", t: "숙제", how: "방법", link: ["https://ted.com", "영상"] }] },
  QUIZ: [{ q: "문제", a: ["가", "나"], ok: 1, why: "이유" }],
  DAYS: [{ day: 1, title: "첫날", files: ["f.pdf"], steps: [], pass: ["통과"] }, { day: 2, title: "둘째", steps: [], pass: [] }],
  REF: [{ id: "a", ch: "c", t: "원본", body: ["x"], img: ["a1"], cap: true, br: "대구" }, { id: "b", ch: "c", t: "그대로", body: ["y"] }],
};

test("수정본 없으면 원본 그대로", () => assert.deepEqual(merge(B, {}), B));

test("고친 칸만 바뀌고 다른 칸은 원본", () => {
  const J = merge(B, { "DAYS.1": { title: "구미 첫날", steps: [], pass: ["a", "b"] }, "REF.a": { ch: "c", t: "구미", body: ["z"] } });
  assert.equal(J.DAYS[0].title, "구미 첫날"); assert.equal(J.DAYS[0].pass.length, 2); assert.equal(J.DAYS[1].title, "둘째");
  assert.equal(J.REF[0].t, "구미"); assert.equal(J.REF[0].br, undefined, "고치면 'OO 기준' 꼬리표 뗌"); assert.equal(J.REF[1].t, "그대로");
  assert.equal(B.DAYS[0].title, "첫날", "원본은 안 건드림");
});

test("🔒 주소·사진·파일·정답은 수정본 값을 안 씀", () => {
  const bad = "javascript:alert(1)";
  const J = merge(B, {
    PRE: { goal: "새 목표", submit: { q: "바꿈" }, read: [{ t: "새", min: 99, ref: ["zz"] }], hw: [{ id: "x", t: "새 숙제", how: "새 방법", link: [bad, "눌러"] }] },
    QUIZ: [{ q: "새 문제", a: ["A", "B"], ok: 0, why: "새 이유" }],
    "DAYS.1": { title: "t", files: [bad], day: 9, steps: [], pass: [] },
    "REF.a": { t: "t", body: [], img: [`"><img src=x>`], cap: false },
    "REF.new1": { ch: "c", t: "새 항목", body: ["n"], img: [bad] },
  });
  assert.equal(J.PRE.goal, "새 목표"); assert.deepEqual(J.PRE.hw[0], { id: "h", t: "새 숙제", how: "새 방법", link: B.PRE.hw[0].link });
  assert.equal(J.PRE.read[0].min, 5); assert.deepEqual(J.PRE.read[0].ref, ["a"]); assert.deepEqual(J.PRE.submit, B.PRE.submit);
  assert.equal(J.QUIZ[0].ok, 1); assert.equal(J.QUIZ[0].q, "새 문제");
  assert.deepEqual(J.DAYS[0].files, ["f.pdf"]); assert.equal(J.DAYS[0].day, 1);
  assert.deepEqual(J.REF[0].img, ["a1"]); assert.equal(J.REF[0].cap, true);
  const n = J.REF.find((r) => r.id === "new1"); assert.equal(n.t, "새 항목"); assert.equal(n.img, undefined);
});

test("빼기: hidden 표시는 화면이 처리, 새 항목은 뒤에 붙음", () => {
  const J = merge(B, { "REF.b": { ch: "c", t: "그대로", body: ["y"], hidden: true }, "REF.n2": { ch: "c", t: "새", body: [] } });
  assert.equal(J.REF.length, 3); assert.equal(J.REF[1].hidden, true); assert.equal(J.REF[2].id, "n2");
});
