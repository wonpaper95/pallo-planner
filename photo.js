// 🖼 사진 공용 (블로그·게시물 탭): 읽기 · 자르기·밝기·모자이크·꾸미기(필터·테두리·글자·이모지) 굽기 · 얼굴 자동 찾기 · 편집 창 · 복사 · 번호대로 받기.
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
const blankEdits = () => ({ ratio: "orig", ox: 0.5, oy: 0.5, bright: 0, contrast: 0, blurs: [], filter: "none", frame: "none", items: [] });
// ── 꾸미기 ── 필터 값 = [채도, R·G·B 배율, 더할 밝기, 대비]
const FILTERS = { none: "원본", warm: "따뜻하게", cool: "시원하게", vivid: "선명하게", soft: "부드럽게", mono: "흑백", vintage: "빈티지" };
const FX = { warm: [1.05, 1.08, 1, 0.88, 6, 1], cool: [1, 0.92, 1, 1.1, 4, 1], vivid: [1.4, 1, 1, 1, 0, 1.08], soft: [0.85, 1, 1, 1, 14, 0.85], mono: [0, 1, 1, 1, 0, 1.05], vintage: [0.55, 1.08, 1, 0.82, 18, 0.88] };
const FRAMES = { none: ["없음"], white: ["흰 테두리", "#fff"], polaroid: ["폴라로이드", "#fff"], purple: ["퍼플", "#493087"], yellow: ["옐로", "#E0D120"] };
const COLORS = { "#ffffff": "흰색", "#111111": "검정", "#493087": "퍼플", "#E0D120": "옐로" };
const EMOJI = ["😊", "😍", "🤣", "👍", "🔥", "✨", "🎉", "❤️", "⭐", "💬", "📚", "☕", "🌸", "🌏"];
const TEXT_FONT = '"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",system-ui,sans-serif', EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

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
// 얼굴 가리기 = 블러 (10-28 모자이크 → 블러). 아주 작게 줄였다가(얼굴 정보 날림) 부드럽게 키움 → 어느 폰에서나 흐릿한 덩어리.
// 캔버스 블러(ctx.filter)를 아는 브라우저는 한 번 더 가우시안으로 문질러 더 매끈하게 (옛 아이폰 사파리는 몰라서 위 방식만으로도 안 보이게)
function mosaic(ctx, x, y, w, h) {
  if (w < 2 || h < 2) return;
  const cell = Math.max(6, Math.round(Math.max(w, h) / 7), Math.round(Math.max(ctx.canvas.width, ctx.canvas.height) / 110)); // 작은(먼) 얼굴도 알아보지 못하게: 사진 크기에 맞춘 최소 크기
  const s = document.createElement("canvas"); s.width = Math.max(2, Math.ceil(w / cell)); s.height = Math.max(2, Math.ceil(h / cell));
  const sc = s.getContext("2d"); sc.imageSmoothingEnabled = true; sc.imageSmoothingQuality = "high"; sc.drawImage(ctx.canvas, x, y, w, h, 0, 0, s.width, s.height);
  const m = document.createElement("canvas"); m.width = s.width * 8; m.height = s.height * 8; // 두 번에 나눠 키워야 네모 자국이 덜 남
  const mc = m.getContext("2d"); mc.imageSmoothingEnabled = true; mc.imageSmoothingQuality = "high"; mc.drawImage(s, 0, 0, m.width, m.height);
  const t = document.createElement("canvas"); t.width = Math.max(1, Math.round(w)); t.height = Math.max(1, Math.round(h));
  const tc = t.getContext("2d"); tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = "high";
  if ("filter" in tc) { const r = Math.max(2, cell * 0.6); tc.filter = `blur(${r}px)`; tc.drawImage(m, -r, -r, t.width + 2 * r, t.height + 2 * r); tc.filter = "none"; } // 가장자리까지 꽉 차게 조금 크게 그림
  else { tc.drawImage(m, 0, 0, t.width, t.height); boxBlur(tc, t.width, t.height, Math.max(2, Math.round(cell * 0.5))); } // 옛 사파리: 직접 문지르기
  ctx.drawImage(t, x, y, w, h);
}
// 상자 블러 3번 = 가우시안과 거의 같음 (가로·세로 따로, 가장자리는 끝 픽셀로 채움). 얼굴 칸만이라 가벼움
function boxBlur(c, w, h, r) {
  const img = c.getImageData(0, 0, w, h), a = img.data, tmp = new Uint8ClampedArray(a.length);
  const pass = (src, dst, horiz) => {
    const n = horiz ? w : h, m = horiz ? h : w, st = horiz ? 4 : w * 4, ln = horiz ? w * 4 : 4;
    for (let j = 0; j < m; j++) for (let ch = 0; ch < 3; ch++) {
      const o = j * ln + ch, at = (i) => src[o + Math.min(n - 1, Math.max(0, i)) * st];
      let sum = 0; for (let i = -r; i <= r; i++) sum += at(i);
      for (let i = 0; i < n; i++) { dst[o + i * st] = sum / (2 * r + 1); sum += at(i + r + 1) - at(i - r); dst[o + i * st + 3 - ch] = 255; }
    }
  };
  for (let k = 0; k < 3; k++) { pass(a, tmp, true); pass(tmp, a, false); }
  c.putImageData(img, 0, 0);
}
// 밝기·대비·필터 (a = RGBA 픽셀 배열, Uint8ClampedArray 라 0~255 로 알아서 잘림). Node 테스트에서도 부름
function toneData(a, e) {
  const [sat, kr, kg, kb, add, con] = FX[e.filter] || [1, 1, 1, 1, 0, 1], k = [kr, kg, kb];
  const c = (100 + e.contrast) / 100 * con, b = e.bright * 2.2 + add;
  for (let i = 0; i < a.length; i += 4) {
    const y = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    for (let j = 0; j < 3; j++) a[i + j] = ((y + (a[i + j] - y) * sat) * k[j] - 128) * c + 128 + b;
  }
}
function tone(ctx, e) {
  if (!e.bright && !e.contrast && !FX[e.filter]) return;
  const { width: w, height: h } = ctx.canvas, d = ctx.getImageData(0, 0, w, h);
  toneData(d.data, e); ctx.putImageData(d, 0, 0);
}
// 테두리는 자르기 칸 안쪽에 칠함 → 고른 비율(인스타 4:5 등)이 그대로 유지됨
function frame(ctx, e, x, y, w, h) {
  const col = FRAMES[e.frame]?.[1]; if (!col) return;
  const t = Math.min(w, h) * 0.035, bot = e.frame === "polaroid" ? Math.min(w, h) * 0.16 : t;
  ctx.fillStyle = col; ctx.beginPath(); ctx.rect(x, y, w, h); ctx.rect(x + t, y + t, w - 2 * t, h - t - bot); ctx.fill("evenodd");
}
// 글자·이모지: x·y 는 원본 사진 좌표(가운데), size 는 사진 긴 변의 % → 비율을 바꿔도 크기·자리가 안 변함
function items(ctx, e, s, ox, oy, long) {
  for (const it of e.items) {
    const fs = it.size / 100 * long * s, lines = it.t.split("\n"), lh = fs * 1.25, x = (it.x - ox) * s, y = (it.y - oy) * s;
    ctx.save(); ctx.font = it.k === "emoji" ? `${fs}px ${EMOJI_FONT}` : `800 ${fs}px ${TEXT_FONT}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)), h = lh * lines.length, dark = it.color === "#111111" || it.color === "#493087";
    if (it.k === "text" && it.band) { ctx.fillStyle = dark ? "rgba(255,255,255,.85)" : "rgba(0,0,0,.5)"; ctx.beginPath(); ctx.roundRect(x - w / 2 - fs * 0.4, y - h / 2 - fs * 0.15, w + fs * 0.8, h + fs * 0.3, fs * 0.3); ctx.fill(); }
    else if (it.k === "text" && !dark) { ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = fs * 0.18; }
    ctx.fillStyle = it.color; lines.forEach((l, i) => ctx.fillText(l, x, y - h / 2 + lh * (i + 0.5)));
    ctx.restore();
    it._box = { x: it.x - w / 2 / s, y: it.y - h / 2 / s, w: w / s, h: h / s }; // 편집 창에서 눌러 고르기용 (사진 좌표)
  }
}
// 편집 반영한 사진 (crop: 자르기 적용 여부)
function draw(p, maxSide, e = p.edits, crop = true) {
  const W = p.img.naturalWidth, H = p.img.naturalHeight, c = crop ? cropRect({ ...p, edits: e }) : { x: 0, y: 0, w: W, h: H };
  const s = Math.min(1, maxSide / Math.max(c.w, c.h)), cv = document.createElement("canvas");
  cv.width = Math.round(c.w * s); cv.height = Math.round(c.h * s);
  const ctx = cv.getContext("2d"); ctx.drawImage(p.img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  e.blurs.forEach((r) => mosaic(ctx, (r.x - c.x) * s, (r.y - c.y) * s, r.w * s, r.h * s));
  tone(ctx, e);
  const k = cropRect({ ...p, edits: e }); frame(ctx, e, (k.x - c.x) * s, (k.y - c.y) * s, k.w * s, k.h * s);
  items(ctx, e, s, c.x, c.y, Math.max(W, H));
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
async function setRatio(list, ratio) { for (const p of list) { p.edits.ratio = ratio; if (LANGS[p.deco]) langEdits(p, p.deco); await bake(p); } } // 언어 꾸미기 글자는 새 자르기 칸에 다시 놓음

// ── 언어별 꾸미기 세트 (게시물 탭, 신고 #3): [이름, 테두리, 필터, 이모지, 글자]. 사진 올리면 자동, [편집]에서 고친 사진(deco=manual)은 안 건드림 ──
const LANGS = { en: ["영어", "purple", "vivid", "💬", "English Talk"], ja: ["일본어", "white", "warm", "🌸", "日本語"], zh: ["중국어", "yellow", "vivid", "🏮", "中文"], es: ["스페인어", "polaroid", "warm", "☀️", "Español"] };
function langEdits(p, lang) {
  const e = p.edits, L = LANGS[lang];
  e.items = e.items.filter((it) => !it.auto);
  if (!L) { e.frame = "none"; e.filter = "none"; return; }
  e.frame = L[1]; e.filter = L[2];
  const c = cropRect(p), long = Math.max(p.img.naturalWidth, p.img.naturalHeight), m = Math.min(c.w, c.h), pol = L[1] === "polaroid";
  e.items.push({ k: "emoji", t: L[3], x: c.x + c.w - m * 0.13, y: c.y + m * 0.13, size: 9 * m / long, color: "#ffffff", band: false, auto: true },
    { k: "text", t: L[4], x: c.x + c.w / 2, y: pol ? c.y + c.h - m * 0.08 : c.y + c.h - m * 0.11, size: 7 * m / long, color: pol ? "#493087" : "#ffffff", band: !pol, auto: true }); // 폴라로이드는 아래 흰 띠 안에 퍼플 글자
}
async function applyLang(list, lang) { for (const p of list) { if (p.deco === "manual") continue; langEdits(p, lang); p.deco = lang; await bake(p); } }

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
const ED = { p: null, e: null, mode: "blur", s: 1, drag: null, onSave: null, sel: null };
let dlg = null;
const $e = (s) => dlg.querySelector(s);
function editorDom() {
  if (dlg) return;
  dlg = document.createElement("dialog"); dlg.id = "phEditDlg";
  dlg.innerHTML = `<h3 style="margin:0 0 8px">🖼 사진 편집 <small class="mut" id="phEdNo"></small></h3>
    <div class="tb"><span class="mut">비율</span><span class="blseg" id="phEdRatio">${Object.keys(RATIOS).map((r) => `<button type="button" data-ratio="${r}">${r === "orig" ? "원본" : r}</button>`).join("")}</span></div>
    <div class="tb"><span class="blseg" id="phEdMode"><button type="button" data-emode="blur">🟦 블러 그리기</button><button type="button" data-emode="pan">✋ 자르기 위치</button></span>
      <button type="button" class="btn ghost small" id="phEdFace">🙂 얼굴 자동 찾기</button><button type="button" class="btn ghost small" id="phEdClear">블러 지우기</button>
      <span class="mut">밝기</span><input type="range" id="phEdBright" min="-40" max="40" value="0"><span class="mut">대비</span><input type="range" id="phEdContrast" min="-40" max="40" value="0"></div>
    <div class="cv"><canvas id="phEdCv"></canvas></div>
    <div class="mut" style="margin-top:6px">블러: 끌어서 네모 그리기 · 네모를 누르면 지워져요. 학생 얼굴은 동의가 없으면 꼭 가려 주세요. 글자·이모지는 눌러서 고르고 끌어서 옮겨요.</div>
    <div class="deco"><b>✨ 꾸미기</b>
      <div class="tb"><span class="mut">필터</span><span class="blseg" id="phEdFilter">${Object.entries(FILTERS).map(([k, v]) => `<button type="button" data-filter="${k}">${v}</button>`).join("")}</span></div>
      <div class="tb"><span class="mut">테두리</span><span class="blseg" id="phEdFrame">${Object.entries(FRAMES).map(([k, v]) => `<button type="button" data-frame="${k}">${v[0]}</button>`).join("")}</span></div>
      <div class="tb"><textarea id="phEdText" rows="1" placeholder="사진에 넣을 글자 (엔터로 줄바꿈)"></textarea><button type="button" class="btn ghost small" id="phEdAddText">✏️ 글자 넣기</button></div>
      <div class="tb" id="phEdEmoji"><span class="mut">이모지</span>${EMOJI.map((x) => `<button type="button" class="emo" data-emo="${x}">${x}</button>`).join("")}</div>
      <div class="tb sel" id="phEdSel" hidden><span class="mut">고른 것</span><span class="mut">크기</span><input type="range" id="phEdSize" min="2" max="30" step="0.5">
        <span class="txo blseg" id="phEdColor">${Object.entries(COLORS).map(([k, v]) => `<button type="button" data-color="${k}" title="${v}"><i style="background:${k}"></i>${v}</button>`).join("")}</span>
        <button type="button" class="txo btn ghost small" id="phEdBand">글자 뒤 띠</button><button type="button" class="btn ghost small" id="phEdDel">🗑 빼기</button></div>
    </div>
    <label>사진 메모 (AI에게 알려줄 내용, 선택)</label><input id="phEdNote" placeholder="예) 토요반 프리토킹 시간, 원어민 강사">
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn ghost" id="phEdCancel">취소</button><button type="button" class="btn" id="phEdSave">적용</button></div>`;
  document.body.append(dlg);
  wireEditor();
}
function edit(p, { title = "", onSave } = {}) {
  editorDom();
  ED.p = p; ED.e = structuredClone(p.edits); ED.mode = "blur"; ED.onSave = onSave; ED.sel = null;
  $e("#phEdNo").textContent = title;
  $e("#phEdBright").value = ED.e.bright; $e("#phEdContrast").value = ED.e.contrast; $e("#phEdNote").value = p.note;
  dlg.showModal(); edDraw();
}
function edDraw() {
  const { p, e } = ED, maxW = Math.min(940, window.innerWidth - 60), maxH = window.innerHeight * 0.5;
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
  if (ED.sel?._box) { const r = ED.sel._box, m = 6 / s; ctx.strokeStyle = "#4dabf7"; ctx.strokeRect((r.x - m) * s, (r.y - m) * s, (r.w + 2 * m) * s, (r.h + 2 * m) * s); }
  ctx.setLineDash([]);
  dlg.querySelectorAll("[data-ratio]").forEach((b) => b.classList.toggle("on", b.dataset.ratio === e.ratio));
  dlg.querySelectorAll("[data-emode]").forEach((b) => b.classList.toggle("on", b.dataset.emode === ED.mode));
  dlg.querySelectorAll("[data-filter]").forEach((b) => b.classList.toggle("on", b.dataset.filter === e.filter));
  dlg.querySelectorAll("[data-frame]").forEach((b) => b.classList.toggle("on", b.dataset.frame === e.frame));
  const it = ED.sel; $e("#phEdSel").hidden = !it;
  if (it) {
    $e("#phEdSize").value = it.size; dlg.querySelectorAll(".txo").forEach((x) => (x.hidden = it.k !== "text"));
    dlg.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("on", b.dataset.color === it.color));
    $e("#phEdBand").classList.toggle("on", it.band);
  }
}
// 고르면 글자 칸에 그 글자를 띄움 → 칸을 고치면 바로 바뀜
function select(it) { ED.sel = it; if (it?.k === "text") $e("#phEdText").value = it.t; }
function addItem(k, t, size) {
  const c = cropRect({ ...ED.p, edits: ED.e }), it = { k, t, x: c.x + c.w / 2, y: c.y + c.h / 2, size, color: "#ffffff", band: false };
  ED.e.items.push(it); select(it); edDraw();
}
function edPoint(ev) { const cv = $e("#phEdCv"), r = cv.getBoundingClientRect(), k = cv.width / r.width; return { x: (ev.clientX - r.left) * k / ED.s, y: (ev.clientY - r.top) * k / ED.s }; }
function wireEditor() {
  const cv = $e("#phEdCv");
  cv.onpointerdown = (ev) => {
    cv.setPointerCapture(ev.pointerId); const pt = edPoint(ev), m = 10 / ED.s; // 손가락으로도 잡히게 둘레 여유
    const item = ED.e.items.findLast((it) => it._box && pt.x >= it._box.x - m && pt.x <= it._box.x + it._box.w + m && pt.y >= it._box.y - m && pt.y <= it._box.y + it._box.h + m);
    if (item) select(item);
    ED.drag = { start: pt, last: pt, moved: false, item }; edDraw();
  };
  cv.onpointermove = (ev) => {
    const d = ED.drag; if (!d) return; const pt = edPoint(ev);
    if (Math.abs(pt.x - d.start.x) + Math.abs(pt.y - d.start.y) > 6 / ED.s) d.moved = true;
    if (d.item) { d.item.x += pt.x - d.last.x; d.item.y += pt.y - d.last.y; }
    else if (ED.mode === "blur") d.rect = { x: Math.min(d.start.x, pt.x), y: Math.min(d.start.y, pt.y), w: Math.abs(pt.x - d.start.x), h: Math.abs(pt.y - d.start.y) };
    else {
      const c = cropRect({ ...ED.p, edits: ED.e }), W = ED.p.img.naturalWidth, H = ED.p.img.naturalHeight;
      if (W > c.w) ED.e.ox = Math.max(0, Math.min(1, ED.e.ox + (pt.x - d.last.x) / (W - c.w)));
      if (H > c.h) ED.e.oy = Math.max(0, Math.min(1, ED.e.oy + (pt.y - d.last.y) / (H - c.h)));
    }
    d.last = pt; edDraw();
  };
  cv.onpointerup = () => {
    const d = ED.drag; ED.drag = null; if (!d) return;
    if (!d.item && !d.moved) select(null);
    if (!d.item && ED.mode === "blur") {
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
  $e("#phEdFilter").onclick = (ev) => { const f = ev.target.closest("[data-filter]")?.dataset.filter; if (f) { ED.e.filter = f; edDraw(); } };
  $e("#phEdFrame").onclick = (ev) => { const f = ev.target.closest("[data-frame]")?.dataset.frame; if (f) { ED.e.frame = f; edDraw(); } };
  $e("#phEdAddText").onclick = () => { const t = $e("#phEdText").value.trim(); if (!t) return toast("넣을 글자를 먼저 써 주세요"); addItem("text", t, 7); };
  $e("#phEdEmoji").onclick = (ev) => { const t = ev.target.closest("[data-emo]")?.dataset.emo; if (t) addItem("emoji", t, 10); };
  $e("#phEdText").oninput = (ev) => { if (ED.sel?.k === "text") { ED.sel.t = ev.target.value; edDraw(); } };
  $e("#phEdSize").oninput = (ev) => { if (ED.sel) { ED.sel.size = +ev.target.value; edDraw(); } };
  $e("#phEdColor").onclick = (ev) => { const c = ev.target.closest("[data-color]")?.dataset.color; if (c && ED.sel) { ED.sel.color = c; edDraw(); } };
  $e("#phEdBand").onclick = () => { if (ED.sel) { ED.sel.band = !ED.sel.band; edDraw(); } };
  $e("#phEdDel").onclick = () => { ED.e.items.splice(ED.e.items.indexOf(ED.sel), 1); ED.sel = null; edDraw(); };
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

return { RATIOS, FILTERS, LANGS, applyLang, langEdits, pad, loadScript, cropRect, toneData, fromFiles, fromUrls, bake, setRatio, faceAll, edit, copy, share };
});
