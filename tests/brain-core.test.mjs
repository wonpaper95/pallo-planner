// 🧠 뇌 탭 계산(brain-core.js) 점검: 낱말 걸기·횟수 세기·온도·근거·정의 오류·달라진 점
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const C = createRequire(import.meta.url)("../brain-core.js");

const T = "2026-11-14";
const it = (w, d, text, extra = {}) => ({ w, d, text, ...extra });
const corpus = (items) => ({ today: T, items });

test("낱말 걸기: 글자 그대로·대소문자 무시·정규식·빼기", () => {
  const f = C.matcher(["메타 광고", "/insta(gram)?/"], ["메타버스"]);
  assert.equal(f("오늘 메타 광고 소재 올리기"), true);
  assert.equal(f("instagram 게시"), true);
  assert.equal(f("메타버스 메타 광고"), false);
  assert.equal(f("네이버 광고"), false);
  assert.equal(C.matcher([], [])("아무거나"), false);
  assert.equal(C.matcher(["/(/"])("깨진 정규식은 안 걸림"), false);
});

test("횟수: Claude 대화는 같은 대화·같은 날 3번까지만", () => {
  const items = [1, 2, 3, 4, 5].map(() => it("claude", "2026-11-10", "블로그 써줘", { sid: "a" })).concat([it("claude", "2026-11-11", "블로그", { sid: "a" }), it("week", "2026-11-10", "블로그")]);
  assert.equal(C.units(items).length, 5);
});

test("통계: 최근 30일·달별·처음·마지막, 앞으로 잡아 둔 할 일은 오늘로 친다", () => {
  const s = C.stats([it("week", "2026-06-01", "a", { done: true }), it("week", "2026-11-01", "a", { done: false }), it("week", "2026-12-01", "a"), it("idea", "2026-10-30", "a")], T);
  assert.equal(s.n, 4); assert.equal(s.n30, 3); assert.equal(s.first, "2026-06-01"); assert.equal(s.last, T);
  assert.deepEqual(s.by, { week: 3, idea: 1 }); assert.equal(s.m["2026-11"], 2); assert.equal(s.open, 1);
  assert.ok(s.raw > 0);
});

test("온도: 요즘 자주 나온 생각이 더 뜨겁고 0~100 안", () => {
  const def = { nodes: [{ key: "a", title: "A" }, { key: "a.hot", parent: "a", title: "뜨거움", state: "실행", match: ["당근"] }, { key: "a.old", parent: "a", title: "옛날", state: "관심", match: ["크로스핏"] }, { key: "a.none", parent: "a", title: "없음", match: ["없는낱말"] }], links: [["a.hot", "a.old", "이유"]] };
  const B = C.build(def, corpus([it("week", "2026-11-10", "당근 광고"), it("week", "2026-11-12", "당근 소식"), it("claude", "2026-11-13", "당근 광고 하루 5천원으로", { sid: "s" }), it("week", "2026-02-01", "크로스핏 박스"), it("week", "2026-02-03", "크로스핏 박스 임장")]));
  assert.deepEqual(B.errors, []);
  const r = Object.fromEntries(B.rows.map((x) => [x.key, x]));
  assert.equal(r["a.hot"].heat, 100); assert.ok(r["a.old"].heat > 0 && r["a.old"].heat < 40); assert.equal(r["a.none"].heat, 0);
  assert.equal(r["a.old"].state, "식음"); // 두 달 반 넘게 안 나온 관심은 식음
  assert.equal(r["a"].stats.n, 5); assert.equal(r["a"].depth, 1); assert.equal(r["a.hot"].src.length, 3);
  assert.equal(B.links.length, 1); assert.equal(B.coverage.matched, 5);
});

test("근거: 고른 것 먼저, 같은 글은 한 번, 최대 개수", () => {
  const ev = C.evidence([it("week", "2026-11-01", "가"), it("week", "2026-11-02", "가"), it("claude", "2026-11-03", "이건 충분히 긴 말이에요 정말로"), it("claude", "2026-11-04", "A", { ans: 1 })], [{ d: "2026-10-01", w: "week", t: "고른 근거" }], 3);
  assert.equal(ev.length, 3); assert.ok(ev.some((e) => e.t === "고른 근거")); assert.ok(!ev.some((e) => e.t === "A"));
});

test("정의 오류를 잡는다: 겹친 key·없는 위 가지·이상한 상태·없는 선", () => {
  const B = C.build({ nodes: [{ key: "a", title: "A" }, { key: "a", title: "또 A" }, { key: "b", parent: "zz", title: "B", state: "이상" }, { key: "Bad Key", title: "x" }], links: [["a", "nope"]] }, corpus([]));
  assert.ok(B.errors.length >= 5);
});

test("달라진 점: 새 생각·뜨거워짐·식음", () => {
  const after = [{ key: "x", depth: 2, title: "새것", heat: 50, worry: 0 }, { key: "y", depth: 2, title: "오름", heat: 80, worry: 10 }, { key: "z", depth: 2, title: "내림", heat: 10, worry: 70 }];
  const ch = C.changes([{ key: "y", heat: 40, worry: 10 }, { key: "z", heat: 60, worry: 20 }], after);
  assert.ok(ch.some((t) => t.includes("새것"))); assert.ok(ch.some((t) => t.includes("오름(40→80)"))); assert.ok(ch.some((t) => t.includes("내림(60→10)"))); assert.ok(ch.some((t) => t.startsWith("고민이 커진")));
  assert.deepEqual(C.changes([], after), []); // 첫 분석은 비교할 것이 없다
});
