import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const PH = createRequire(import.meta.url)("../photo.js");
const P = (W, H, ratio, ox = 0.5, oy = 0.5) => ({ img: { naturalWidth: W, naturalHeight: H }, edits: { ratio, ox, oy } });

test("RATIOS: 인스타용 4:5 가 있다", () => assert.equal(PH.RATIOS["4:5"], 0.8));
test("cropRect: 원본은 전체", () => assert.deepEqual(PH.cropRect(P(4000, 3000, "orig")), { x: 0, y: 0, w: 4000, h: 3000 }));
test("cropRect: 가로 사진 4:5 는 가운데 세로로", () => assert.deepEqual(PH.cropRect(P(4000, 3000, "4:5")), { x: 800, y: 0, w: 2400, h: 3000 }));
test("cropRect: 세로 사진 1:1 위쪽 끝", () => assert.deepEqual(PH.cropRect(P(3000, 4000, "1:1", 0.5, 0)), { x: 0, y: 0, w: 3000, h: 3000 }));
test("cropRect: 16:9 는 위아래를 자름", () => assert.deepEqual(PH.cropRect(P(1600, 1600, "16:9")), { x: 0, y: 350, w: 1600, h: 900 }));
const px = (filter, rgb, bright = 0, contrast = 0) => { const a = new Uint8ClampedArray([...rgb, 255]); PH.toneData(a, { filter, bright, contrast }); return [...a.slice(0, 3)]; };
test("toneData: 원본·밝기 0 이면 그대로", () => assert.deepEqual(px("none", [10, 128, 250]), [10, 128, 250]));
test("toneData: 흑백은 세 값이 같다", () => { const [r, g, b] = px("mono", [200, 80, 30]); assert.ok(r === g && g === b); });
test("toneData: 따뜻하게는 빨강↑ 파랑↓, 시원하게는 반대", () => { const w = px("warm", [128, 128, 128]), c = px("cool", [128, 128, 128]); assert.ok(w[0] > w[2] && c[2] > c[0]); });
test("toneData: 0~255 밖으로 안 나감", () => assert.deepEqual(px("vivid", [255, 0, 255], 40, 40).map((v) => v >= 0 && v <= 255), [true, true, true]));
test("FILTERS: 필터마다 값이 있다", () => Object.keys(PH.FILTERS).filter((k) => k !== "none").forEach((k) => assert.notDeepEqual(px(k, [120, 90, 60]), [120, 90, 60], k)));
// 🌏 언어 꾸미기 세트 (게시물 탭)
const Q = (W, H, ratio, items = []) => ({ img: { naturalWidth: W, naturalHeight: H }, edits: { ratio, ox: 0.5, oy: 0.5, filter: "none", frame: "none", items } });
test("langEdits: 언어마다 테두리·필터·이모지·글자, 둘 다 자르기 칸 안", () => {
  for (const [k, L] of Object.entries(PH.LANGS)) {
    const p = Q(4000, 3000, "4:5"), c = PH.cropRect(p); PH.langEdits(p, k);
    assert.equal(p.edits.frame, L[1]); assert.equal(p.edits.filter, L[2]);
    assert.deepEqual(p.edits.items.map((it) => it.t), [L[3], L[4]], k);
    for (const it of p.edits.items) assert.ok(it.x > c.x && it.x < c.x + c.w && it.y > c.y && it.y < c.y + c.h, `${k} ${it.t} 칸 밖`);
  }
});
test("langEdits: 언어 바꾸면 자동 글자만 바뀌고 직접 넣은 글자는 남음, none = 다 뺌", () => {
  const p = Q(3000, 3000, "1:1", [{ k: "text", t: "내 글자", x: 1, y: 1, size: 5 }]);
  PH.langEdits(p, "en"); PH.langEdits(p, "ja");
  assert.deepEqual(p.edits.items.map((it) => it.t), ["내 글자", "🌸", "日本語"]);
  PH.langEdits(p, "none"); assert.deepEqual(p.edits.items.map((it) => it.t), ["내 글자"]); assert.equal(p.edits.frame, "none");
});
