// 🖼 사진 공용 (블로그·게시물 탭): 읽기 · 자르기·밝기·모자이크 굽기 · 얼굴 자동 찾기 · 편집 창 · 복사 · 번호대로 받기.
// 사진 처리는 이 기기 안에서만 한다 (AI 에는 1024px 사본만). index.html 전역 toast 를 씀 → window.PHOTO
// cropRect 는 Node 테스트(tests/photo.test.mjs)에서도 불러서, 위쪽 코드는 DOM 없이 읽혀야 한다.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.PHOTO = api;
})(typeof self !== "undefined" ? self : globalThis, function () {

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const HEIC = "https://cdn.jsdelivr.net/npm/heic-to@1.6.5/dist/heic-to.js"; // 아이폰 HEIC → JPG (크롬·윈도우는 HEIC를 못 읽음, 사파리는 바로 읽음). 3MB라 HEIC 올 때만 받음
const RATIOS = { orig: 0, "4:5": 4 / 5, "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9 };
const pad = (n) => String(n).padStart(2, "0");
let seq = 0;

const loadScript = (src) => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const blankEdits = () => ({ ratio: "orig", ox: 0.5, oy: 0.5, bright: 0, contrast: 0, blurs: [] });

// ── 읽기 ──
async function fromBlob(blob, name, faced = false) {
  const img = await loadImg(URL.createObjectURL(blob));
  const p = { id: ++seq, name, img, note: "", faced, edits: blankEdits() };
  await bake(p);
  return p;
}
async function fromFiles(files) {
  const out = [];
  for (const f of files) {
    const heic = /hei[cf]/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
    if (!/^image\//.test(f.type) && !heic) continue;
    try { out.push(await fromBlob(f, f.name)); continue; } catch { if (!heic) { toast(`${f.name}: 이 형식은 못 읽어요`); continue; } }
    try { // 이 브라우저가 HEIC를 못 읽음 → JPG로 바꿔서 다시
      toast(`${f.name}: 아이폰 사진(HEIC)을 JPG로 바꾸는 중…`);
      const { heicTo } = await import(HEIC);
      out.push(await fromBlob(await heicTo({ blob: f, type: "image/jpeg", quality: 0.92 }), f.name.replace(/\.hei[cf]$/i, ".jpg")));
    } catch (e) { console.error(e); toast(`${f.name}: HEIC를 바꾸지 못했어요. JPG로 바꿔서 올려 주세요`); }
  }
  return out;
}
// 저장해 둔 공개 주소 → 사진. 이미 모자이크된 사진이라 faced=true. fetch 로 받아서 캔버스 오염(CORS) 없이 처리
async function fromUrls(urls) {
  const out = [];
  for (const u of urls) {
    try {
      const r = await fetch(u); if (!r.ok) throw new Error(String(r.status));
      out.push(await fromBlob(await r.blob(), u.split("/").pop(), true));
    } catch (e) { console.warn("사진 불러오기 실패", u, e); out.push(null); }
  }
  return out;
}

// ── 자르기·모자이크·밝기 ──
function cropRect(p) {
  const W = p.img.naturalWidth, H = p.img.naturalHeight, r = RATIOS[p.edits.ratio];
  if (!r) return { x: 0, y: 0, w: W, h: H };
  let w = W, h = W / r; if (h > H) { h = H; w = H * r; }
  return { x: (W - w) * p.edits.ox, y: (H - h) * p.edits.oy, w, h };
}
function mosaic(ctx, x, y, w, h) {
  if (w < 2 || h < 2) return;
  const cell = Math.max(6, Math.round(Math.max(w, h) / 9), Math.round(Math.max(ctx.canvas.width, ctx.canvas.height) / 120)), t = document.createElement("canvas"); // 작은(먼) 얼굴도 알아보지 못하게: 사진 크기에 맞춘 최소 칸
  t.width = Math.max(1, Math.ceil(w / cell)); t.height = Math.max(1, Math.ceil(h / cell));
  t.getContext("2d").drawImage(ctx.canvas, x, y, w, h, 0, 0, t.width, t.height);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w, h); ctx.restore();
}
function tone(ctx, e) {
  if (!e.bright && !e.contrast) return;
  const { width: w, height: h } = ctx.canvas, d = ctx.getImageData(0, 0, w, h), a = d.data;
  const b = e.bright * 2.2, c = (100 + e.contrast) / 100;
  for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) a[i + k] = Math.max(0, Math.min(255, (a[i + k] - 128) * c + 128 + b));
  ctx.putImageData(d, 0, 0);
}
// 편집 반영한 사진 (crop: 자르기 적용 여부)
function draw(p, maxSide, e = p.edits, crop = true) {
  const W = p.img.naturalWidth, H = p.img.naturalHeight, c = crop ? cropRect({ ...p, edits: e }) : { x: 0, y: 0, w: W, h: H };
  const s = Math.min(1, maxSide / Math.max(c.w, c.h)), cv = document.createElement("canvas");
  cv.width = Math.round(c.w * s); cv.height = Math.round(c.h * s);
  const ctx = cv.getContext("2d"); ctx.drawImage(p.img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  e.blurs.forEach((r) => mosaic(ctx, (r.x - c.x) * s, (r.y - c.y) * s, r.w * s, r.h * s));
  tone(ctx, e);
  return { cv, s, c };
}
async function bake(p) {
  const big = draw(p, 2000).cv;
  p.blob = await new Promise((ok) => big.toBlob(ok, "image/jpeg", 0.9));
  p.w = big.width; p.h = big.height;
  if (p.url) URL.revokeObjectURL(p.url);
  p.url = URL.createObjectURL(p.blob);
  p.ai = draw(p, 1024).cv.toDataURL("image/jpeg", 0.8).split(",")[1];
}
async function setRatio(list, ratio) { for (const p of list) { p.edits.ratio = ratio; await bake(p); } }

// ── 얼굴 찾기: 전체 + 2·3·4·6·8칸 조각으로 확대해서 돌림 (작은·먼 얼굴용) → 겹치는 건 합침 → 헷갈리는 건 다시 확인 ──
// 10-28 시험(공개 단체사진 6장): 예전(전체+2×2) 식당 6명 중 3명·단체 100명 중 0명 → 지금 5명·91명, 술병·잔 같은 헛것은 다시 확인으로 걸러냄.
// 뒤돌아 얼굴이 안 보이는 사람은 못 찾음 → [편집]에서 직접 칠하기
let detector;
async function faceDetector() {
  if (detector) return detector;
  const v = await import(`${MP}/vision_bundle.mjs`);
  const fs = await v.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  detector = await v.FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: "IMAGE", minDetectionConfidence: 0.35 });
  return detector;
}
const GRIDS = [[1, 1], [2, 0.6], [3, 0.42], [4, 0.32], [6, 0.22], [8, 0.16]]; // [n×n 칸, 조각 크기(사진 대비)]
const overlap = (a, b) => { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return x * y / Math.min(a.w * a.h, b.w * b.h); };
async function findFaces(p) {
  const d = await faceDetector(), img = p.img, W = img.naturalWidth, H = img.naturalHeight, boxes = [];
  const run = (sx, sy, sw, sh, n) => {
    const k = Math.min(1, 1024 / Math.max(sw, sh)), cv = document.createElement("canvas");
    cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    cv.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    for (const det of d.detect(cv).detections) { const b = det.boundingBox; boxes.push({ x: sx + b.originX / k, y: sy + b.originY / k, w: b.width / k, h: b.height / k, s: det.categories[0].score, n, tw: sw }); }
  };
  for (const [n, f] of GRIDS) { const tw = W * f, th = H * f; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) run(n === 1 ? 0 : (W - tw) * i / (n - 1), n === 1 ? 0 : (H - th) * j / (n - 1), tw, th, n); }
  const groups = []; // 같은 얼굴끼리 묶음 (점수 높은 것이 대표)
  boxes.sort((a, b) => b.s - a.s).forEach((b) => { const g = groups.find((g) => overlap(g[0], b) > 0.3); g ? g.push(b) : groups.push([b]); });
  const likely = groups.filter((g) => { const b = g[0]; return b.s >= 0.75 || (b.w / b.tw < 0.25 && b.s >= 0.5) || (new Set(g.map((x) => x.n)).size >= 2 && b.s >= 0.55); }).map((g) => g[0]);
  const recheck = (b) => { // 얼굴 둘레를 잘라 다시 찾기: 진짜 얼굴은 또 나오고, 술병·무늬 같은 헛것은 대개 안 나옴
    const side = Math.max(b.w, b.h) * 2.4, cx = b.x + b.w / 2, cy = b.y + b.h / 2, sx = Math.max(0, cx - side / 2), sy = Math.max(0, cy - side / 2), sw = Math.min(W - sx, side), sh = Math.min(H - sy, side);
    const k = 256 / Math.max(sw, sh), cv = document.createElement("canvas"); cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    cv.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    return Math.max(0, ...d.detect(cv).detections.filter((t) => { const q = t.boundingBox; return Math.abs(sx + (q.originX + q.width / 2) / k - cx) < b.w / 2 && Math.abs(sy + (q.originY + q.height / 2) / k - cy) < b.h / 2; }).map((t) => t.categories[0].score));
  };
  return likely.filter((b) => b.s >= 0.85 || recheck(b) >= 0.55)
    .map((b) => ({ x: Math.max(0, b.x - b.w * 0.25), y: Math.max(0, b.y - b.h * 0.35), w: b.w * 1.5, h: b.h * 1.6 })); // 머리카락·턱까지 넉넉히
}
// 이미 칠한 곳과 겹치지 않는 새 얼굴만 더함 → 몇 번 눌러도 중복 안 생김
const addFaces = (e, f) => { const add = f.filter((b) => !e.blurs.some((x) => overlap(x, b) > 0.5)); e.blurs.push(...add); return add.length; };
// again=false(올리기 전 안전 확인): 아직 확인 안 한 사진만 · again=true(버튼): 모든 사진 다시 (놓친 얼굴 더 찾기). onStep(i, 전체) = 진행 표시
async function faceAll(list, again = false, onStep) {
  let n = 0; const todo = again ? list : list.filter((x) => !x.faced);
  for (const [i, p] of todo.entries()) {
    onStep?.(i + 1, todo.length); await new Promise((r) => setTimeout(r)); // 화면에 진행 표시가 그려지게
    n += addFaces(p.edits, await findFaces(p)); await bake(p); p.faced = true; /* 굽기(모자이크) 끝난 뒤에야 확인 완료로 표시 — 그 전에 저장되면 모자이크 전 사진이 올라감 */
  }
  return n;
}

// ── 편집 창 (처음 열 때 body 에 붙임) ──
const ED = { p: null, e: null, mode: "blur", s: 1, drag: null, onSave: null };
let dlg = null;
const $e = (s) => dlg.querySelector(s);
function editorDom() {
  if (dlg) return;
  dlg = document.createElement("dialog"); dlg.id = "phEditDlg";
  dlg.innerHTML = `<h3 style="margin:0 0 8px">🖼 사진 편집 <small class="mut" id="phEdNo"></small></h3>
    <div class="tb"><span class="mut">비율</span><span class="blseg" id="phEdRatio">${Object.keys(RATIOS).map((r) => `<button type="button" data-ratio="${r}">${r === "orig" ? "원본" : r}</button>`).join("")}</span></div>
    <div class="tb"><span class="blseg" id="phEdMode"><button type="button" data-emode="blur">🟦 모자이크 그리기</button><button type="button" data-emode="pan">✋ 자르기 위치</button></span>
      <button type="button" class="btn ghost small" id="phEdFace">🙂 얼굴 자동 찾기</button><button type="button" class="btn ghost small" id="phEdClear">모자이크 지우기</button>
      <span class="mut">밝기</span><input type="range" id="phEdBright" min="-40" max="40" value="0"><span class="mut">대비</span><input type="range" id="phEdContrast" min="-40" max="40" value="0"></div>
    <div class="cv"><canvas id="phEdCv"></canvas></div>
    <div class="mut" style="margin-top:6px">모자이크: 끌어서 네모 그리기 · 네모를 누르면 지워져요. 학생 얼굴은 동의가 없으면 꼭 가려 주세요.</div>
    <label>사진 메모 (AI에게 알려줄 내용, 선택)</label><input id="phEdNote" placeholder="예) 토요반 프리토킹 시간, 원어민 강사">
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn ghost" id="phEdCancel">취소</button><button type="button" class="btn" id="phEdSave">적용</button></div>`;
  document.body.append(dlg);
  wireEditor();
}
function edit(p, { title = "", onSave } = {}) {
  editorDom();
  ED.p = p; ED.e = structuredClone(p.edits); ED.mode = "blur"; ED.onSave = onSave;
  $e("#phEdNo").textContent = title;
  $e("#phEdBright").value = ED.e.bright; $e("#phEdContrast").value = ED.e.contrast; $e("#phEdNote").value = p.note;
  dlg.showModal(); edDraw();
}
function edDraw() {
  const { p, e } = ED, maxW = Math.min(940, window.innerWidth - 60), maxH = window.innerHeight * 0.55;
  const s = Math.min(maxW / p.img.naturalWidth, maxH / p.img.naturalHeight, 1); ED.s = s;
  const { cv: src } = draw(p, Math.max(p.img.naturalWidth, p.img.naturalHeight) * s, e, false);
  const cv = $e("#phEdCv"); cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d"); ctx.drawImage(src, 0, 0);
  const c = cropRect({ ...p, edits: e }), cx = c.x * s, cy = c.y * s, cw = c.w * s, ch = c.h * s;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(0, 0, cv.width, cy); ctx.fillRect(0, cy + ch, cv.width, cv.height - cy - ch); ctx.fillRect(0, cy, cx, ch); ctx.fillRect(cx + cw, cy, cv.width - cx - cw, ch);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(cx, cy, cw, ch);
  ctx.setLineDash([5, 4]); ctx.strokeStyle = "#ffd400";
  e.blurs.forEach((r) => ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s));
  if (ED.drag?.rect) { const r = ED.drag.rect; ctx.strokeStyle = "#4dabf7"; ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s); }
  ctx.setLineDash([]);
  dlg.querySelectorAll("[data-ratio]").forEach((b) => b.classList.toggle("on", b.dataset.ratio === e.ratio));
  dlg.querySelectorAll("[data-emode]").forEach((b) => b.classList.toggle("on", b.dataset.emode === ED.mode));
}
function edPoint(ev) { const cv = $e("#phEdCv"), r = cv.getBoundingClientRect(), k = cv.width / r.width; return { x: (ev.clientX - r.left) * k / ED.s, y: (ev.clientY - r.top) * k / ED.s }; }
function wireEditor() {
  const cv = $e("#phEdCv");
  cv.onpointerdown = (ev) => { cv.setPointerCapture(ev.pointerId); const pt = edPoint(ev); ED.drag = { start: pt, last: pt, moved: false }; };
  cv.onpointermove = (ev) => {
    const d = ED.drag; if (!d) return; const pt = edPoint(ev);
    if (Math.abs(pt.x - d.start.x) + Math.abs(pt.y - d.start.y) > 6 / ED.s) d.moved = true;
    if (ED.mode === "blur") d.rect = { x: Math.min(d.start.x, pt.x), y: Math.min(d.start.y, pt.y), w: Math.abs(pt.x - d.start.x), h: Math.abs(pt.y - d.start.y) };
    else {
      const c = cropRect({ ...ED.p, edits: ED.e }), W = ED.p.img.naturalWidth, H = ED.p.img.naturalHeight;
      if (W > c.w) ED.e.ox = Math.max(0, Math.min(1, ED.e.ox + (pt.x - d.last.x) / (W - c.w)));
      if (H > c.h) ED.e.oy = Math.max(0, Math.min(1, ED.e.oy + (pt.y - d.last.y) / (H - c.h)));
    }
    d.last = pt; edDraw();
  };
  cv.onpointerup = () => {
    const d = ED.drag; ED.drag = null; if (!d) return;
    if (ED.mode === "blur") {
      if (d.moved && d.rect.w > 4 && d.rect.h > 4) ED.e.blurs.push(d.rect);
      else if (!d.moved) { const { x, y } = d.start, i = ED.e.blurs.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); if (i >= 0) ED.e.blurs.splice(i, 1); }
    }
    edDraw();
  };
  $e("#phEdRatio").onclick = (ev) => { const r = ev.target.dataset.ratio; if (r) { ED.e.ratio = r; edDraw(); } };
  $e("#phEdMode").onclick = (ev) => { const m = ev.target.dataset.emode; if (m) { ED.mode = m; edDraw(); } };
  $e("#phEdBright").oninput = (ev) => { ED.e.bright = +ev.target.value; edDraw(); };
  $e("#phEdContrast").oninput = (ev) => { ED.e.contrast = +ev.target.value; edDraw(); };
  $e("#phEdClear").onclick = () => { ED.e.blurs = []; edDraw(); };
  $e("#phEdFace").onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = "찾는 중…";
    try { const n = addFaces(ED.e, await findFaces(ED.p)); toast(n ? `얼굴 ${n}개를 더 찾았어요` : "새로 찾은 얼굴이 없어요. 놓친 얼굴은 직접 칠해 주세요"); }
    catch (e) { console.error(e); toast("얼굴 찾기를 불러오지 못했어요"); }
    ev.target.disabled = false; ev.target.textContent = "🙂 얼굴 자동 찾기"; edDraw();
  };
  $e("#phEdCancel").onclick = () => dlg.close();
  $e("#phEdSave").onclick = async () => {
    const p = ED.p; p.edits = ED.e; p.note = $e("#phEdNote").value.trim();
    await bake(p); p.faced = true; // 편집 창에서 직접 봤으면 확인한 것으로. 굽기(모자이크) 끝난 뒤에야 확인 완료로 표시 — 그 전에 저장되면 모자이크 전 사진이 올라감
    dlg.close(); ED.onSave?.(p);
  };
}

// ── 복사·받기 ──
// html 은 Promise 로 받는다: Safari 는 클릭 직후 await 없이 clipboard.write 를 불러야 해서 내용은 나중에 채움
async function copy(text, html) {
  try {
    if (html && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ "text/html": html.then((h) => new Blob([h], { type: "text/html" })), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    else await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.warn("clipboard.write 실패 → 글자만 복사", e);
    const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select();
    const ok = document.execCommand("copy"); t.remove(); if (!ok) toast("복사하지 못했어요. 길게 눌러 직접 복사해 주세요"); return ok;
  }
}
// list: [{name: "01.jpg", blob}] — 폰은 공유 시트(사진 앱 저장), 그 외는 JPG 낱장으로 받기 (이름: 앞말_01.jpg)
async function share(list, prefix) {
  const files = list.map((x) => new File([x.blob], `${prefix}_${x.name}`, { type: "image/jpeg" }));
  if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  for (const f of files) { // 크롬은 처음에 "여러 파일 다운로드 허용?"을 한 번 물어봄
    const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000); await new Promise((r) => setTimeout(r, 300));
  }
  toast(`사진 ${files.length}장을 01, 02… 번호대로 받았어요${files.length > 1 ? " (여러 파일 허용을 물으면 '허용'을 눌러 주세요)" : ""}`);
}

return { RATIOS, pad, loadScript, cropRect, fromFiles, fromUrls, bake, setRatio, faceAll, edit, copy, share };
});
