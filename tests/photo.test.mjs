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
