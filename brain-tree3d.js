// 🌳 뇌 탭 · 3D 나무 (나뭇가지 보기 중 하나): 유리 화분(테라리움) 속 진짜 나무. 줄기·굵은 가지(큰 주제)·잔가지(생각)·잎 무리(생각마다) — 잎 크기 = 온도, 색 = 주제/상태, 붉은 빛 = 고민.
// 끌면 돌리고, 휠·두 손가락으로 확대, 잎을 누르면 내용(오른쪽 칸). 고르면 그 생각으로 다가가고 뿌리까지 이어진 가지가 주황으로 빛남.
// 3D 라이브러리(three, vendor/duty-lib.js)는 입체 지도와 같은 것을 씀. brain.js 가 BRAIN3D.mount(칸, 연결 도구들)로 부름 → window.BRAIN3D
(() => {
const B3 = (window.BRAIN3D = {});
let st = null; // 지금 떠 있는 장면 (없으면 null)

const rng = (seed) => { let a = 0; for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FONT = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", "Noto Sans KR", sans-serif';

B3.mount = async function (stage, X) {
  if (st && st.stage === stage && st.rev === X.S.rev) return true;
  B3.unmount();
  await X.loadLib();
  const T = DutyLib.THREE, S = X.S, root = S.root; if (!root || !stage.isConnected) return false;
  let renderer; try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); if (!renderer.getContext()) throw new Error("gl"); } catch (e) { console.error(e); return false; }
  const coarse = matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.6 : 2)); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.setClearColor(0x000000, 0);
  const cv = renderer.domElement; cv.className = "bn3cv"; cv.style.touchAction = "none"; stage.append(cv);
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(36, 1, 20, 7000), disposables = [];
  const track = (o) => (disposables.push(o), o);

  // ── 빛과 반사 ──
  { // 반사용 가짜 방: 따뜻한 천장 + 밝은 창
    const pm = new T.PMREMGenerator(renderer), env = new T.Scene(), g = new T.SphereGeometry(50, 24, 16), c = document.createElement("canvas"); c.width = 4; c.height = 256; const x = c.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#fff6e2"); gr.addColorStop(0.5, "#f1dcb4"); gr.addColorStop(1, "#7d6a4e"); x.fillStyle = gr; x.fillRect(0, 0, 4, 256);
    env.add(new T.Mesh(g, new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), side: T.BackSide })));
    for (const [px, py, pz, w, h] of [[-30, 20, 18, 22, 30], [28, 14, -20, 14, 26], [0, 46, 0, 40, 10]]) { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide })); m.position.set(px, py, pz); m.lookAt(0, 0, 0); m.material.color.multiplyScalar(6); env.add(m); }
    scene.environment = pm.fromScene(env, 0.04).texture; scene.environmentIntensity = 0.7; pm.dispose();
  }
  scene.add(new T.HemisphereLight(0xfff1d6, 0x8a6a45, 1.0));
  const sun = new T.DirectionalLight(0xffe0b0, 2.4); sun.position.set(520, 980, 420); scene.add(sun);
  const fill = new T.DirectionalLight(0xc9dcff, 0.55); fill.position.set(-650, 320, -300); scene.add(fill);

  // ── 재료 ──
  const barkTex = (() => { const c = document.createElement("canvas"); c.width = 256; c.height = 512; const x = c.getContext("2d"); x.fillStyle = "#6e4d31"; x.fillRect(0, 0, 256, 512); const r = rng("bark");
    for (let i = 0; i < 420; i++) { const px = r() * 256, w = 1 + r() * 4, dark = r() < 0.6; x.strokeStyle = dark ? `rgba(40,24,12,${0.16 + r() * 0.3})` : `rgba(190,150,100,${0.08 + r() * 0.16})`; x.lineWidth = w; x.beginPath(); x.moveTo(px, 0); for (let y = 0; y <= 512; y += 64) x.lineTo(px + (r() - 0.5) * 14, y); x.stroke(); }
    for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(30,18,8,${0.1 + r() * 0.2})`; x.lineWidth = 1; const y = r() * 512, px = r() * 256; x.beginPath(); x.moveTo(px, y); x.lineTo(px + 10 + r() * 40, y + (r() - 0.5) * 6); x.stroke(); }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return track(t); })();
  const barkMat = track(new T.MeshStandardMaterial({ map: barkTex, bumpMap: barkTex, bumpScale: 3.2, roughness: 0.92, metalness: 0 }));
  const hlMat = track(new T.MeshStandardMaterial({ color: 0xffa83a, emissive: 0xff8a1f, emissiveIntensity: 0.55, roughness: 0.5 }));
  const leafGeo = (() => { const sh = new T.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(0.55, 0.22, 0.5, 0.78, 0, 1); sh.bezierCurveTo(-0.5, 0.78, -0.55, 0.22, 0, 0); const g = new T.ShapeGeometry(sh, 6); g.computeVertexNormals(); return track(g); })();
  const leafMat = track(new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, side: T.DoubleSide }));

  // ── 나무 만들기 ──
  const lc = new Map(), cnt = (n) => { const ks = X.kids(n), v = ks.length ? ks.reduce((t, k) => t + cnt(k), 0) : 1; lc.set(n.id, v); return v; }; cnt(root);
  const tree = new T.Group(); scene.add(tree);
  const branch = new Map(), pos = new Map(), ent = new Map(), picks = [], labels = new T.Group(); tree.add(labels);
  const V = (x, y, z) => new T.Vector3(x, y, z);
  function tube(curve, rad0, rad1, segs, around, flare) { // 굵기가 변하는 가지 (밑동은 넓게)
    const fr = curve.computeFrenetFrames(segs, false), P = [], N = [], U = [], I = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs, p = curve.getPointAt(t), r = (rad0 + (rad1 - rad0) * Math.pow(t, 0.85)) * (1 + (flare ? flare * Math.pow(1 - t, 6) : 0));
      for (let j = 0; j <= around; j++) { const a = (j / around) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), nx = fr.normals[i].x * c + fr.binormals[i].x * s, ny = fr.normals[i].y * c + fr.binormals[i].y * s, nz = fr.normals[i].z * c + fr.binormals[i].z * s;
        P.push(p.x + nx * r, p.y + ny * r, p.z + nz * r); N.push(nx, ny, nz); U.push(j / around, t * (curve.getLength() / 120)); } }
    for (let i = 0; i < segs; i++) for (let j = 0; j < around; j++) { const a = i * (around + 1) + j, b = a + around + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(P, 3)); g.setAttribute("normal", new T.Float32BufferAttribute(N, 3)); g.setAttribute("uv", new T.Float32BufferAttribute(U, 2)); g.setIndex(I); track(g); return g;
  }
  const addBranch = (id, curve, r0, r1, segs, around) => { const m = new T.Mesh(tube(curve, r0, r1, segs, around), barkMat); m.userData.id = id; tree.add(m); branch.set(id, m); return m; };
  // 줄기
  const trunkCurve = new T.CatmullRomCurve3([V(0, -24, 0), V(7, 90, -5), V(-9, 195, 7), V(0, 310, 0)]);
  { const m = new T.Mesh(tube(trunkCurve, 40, 17, 36, 18, 1.1), barkMat); tree.add(m); }
  // 큰 주제 = 굵은 가지, 부채꼴(잎 많은 가지가 더 넓게) 둘레로 퍼짐
  const areas = X.kids(root), tot = areas.reduce((t, a) => t + lc.get(a.id) + 3, 0); let cum = 0;
  const leafSlots = []; // [노드, 중심, 반지름, 잎 수]
  const fib = (i, m) => { const y = 1 - (2 * (i + 0.5)) / m, rr = Math.sqrt(Math.max(0, 1 - y * y)), th = i * 2.399963; return [Math.cos(th) * rr, y, Math.sin(th) * rr]; };
  function cloud(parent, C, rho, pcurve, t0) { // 부모 가지 끝 둘레에 자식 생각들을 흩어 놓고 잔가지로 잇는다
    const ks = X.kids(parent), m = ks.length; if (!m) return;
    ks.forEach((k, i) => {
      const r = rng(k.id), [fx, fy, fz] = fib(i, m), f = 0.62 + 0.38 * r(), q = V(C.x + fx * rho * f, C.y + fy * rho * 0.78 * f + (r() - 0.5) * 10, C.z + fz * rho * f);
      const a = pcurve.getPointAt(clamp(t0 + 0.42 * (i / m) + r() * 0.06, 0.05, 0.98)), mid = a.clone().lerp(q, 0.5).add(V((r() - 0.5) * 14, 8 + r() * 12, (r() - 0.5) * 14));
      const cur = new T.CatmullRomCurve3([a, mid, q]), sub = X.kids(k).length;
      addBranch(k.id, cur, sub ? 3.4 : 2.1, sub ? 1.5 : 0.7, 8, 5); pos.set(k.id, q);
      if (sub) { cloud(k, q, 24 + 11 * Math.sqrt(lc.get(k.id)), cur, 0.35); leafSlots.push([k, q, 18, 8]); }
      else leafSlots.push([k, q, 15 + (k.heat || 0) * 0.14, 20 + Math.round(((k.heat || 0) / 100) * 14)]);
    });
  }
  areas.forEach((a, k) => {
    const w = lc.get(a.id) + 3, phi = 2 * Math.PI * ((cum + w / 2) / tot) + 0.35, tier = k % 3, L = 205 + 28 * (k % 2); cum += w; const r = rng(a.id);
    const P0 = trunkCurve.getPointAt(0.56 + 0.4 * ((k * 0.37) % 1)), cx = Math.cos(phi), cz = Math.sin(phi), E = V(cx * L, 330 + tier * 70 + (k % 2) * 28, cz * L);
    const curve = new T.CatmullRomCurve3([P0, P0.clone().add(V(cx * 60, 56, cz * 60)), V(cx * L * 0.68 + (r() - 0.5) * 30, E.y - 70, cz * L * 0.68 + (r() - 0.5) * 30), E]);
    addBranch(a.id, curve, 8 + Math.sqrt(lc.get(a.id) / 45) * 7, 3.2, 20, 8);
    const C = E.clone().add(V(cx * 38, 34, cz * 38)), rho = 44 + 16 * Math.sqrt(lc.get(a.id)); pos.set(a.id, C); a._c3 = { C, rho };
    cloud(a, C, rho, curve, 0.46);
    const pk = new T.Mesh(track(new T.SphereGeometry(1, 12, 8)), track(new T.MeshBasicMaterial({ visible: false }))); pk.scale.setScalar(Math.min(60, rho * 0.4)); pk.position.copy(C); pk.userData.id = a.id; tree.add(pk); picks.push(pk);
  });
  // 잎 무리 (생각마다 잎이 모여 있음)
  const total = leafSlots.reduce((t, s) => t + s[3], 0) + leafSlots.length, inst = new T.InstancedMesh(leafGeo, leafMat, total); inst.frustumCulled = false; tree.add(inst);
  const M = new T.Matrix4(), Q = new T.Quaternion(), E3 = new T.Euler(), Sc = new T.Vector3(), Pp = new T.Vector3(), colTmp = new T.Color(), beige = new T.Color(0xd9c8a6);
  let ix = 0;
  for (const [n, C, rc, num] of leafSlots) {
    const r = rng("l" + n.id), items = [], size = 21 + (n.heat || 0) * 0.13;
    for (let i = 0; i < num; i++) { const u = r() * 2 - 1, th = r() * 6.2832, rr = Math.cbrt(r()) * rc, s = Math.sqrt(1 - u * u); items.push({ p: V(C.x + s * Math.cos(th) * rr, C.y + u * rr * 0.8, C.z + s * Math.sin(th) * rr), e: [r() * 6.28, r() * 6.28, r() * 6.28], s: size * (0.7 + r() * 0.5), h: (r() - 0.5) * 0.07, l: (r() - 0.5) * 0.16 }); }
    if ((n.heat || 0) >= 70) items.push({ p: V(C.x, C.y + 6, C.z), e: [r() * 6.28, r() * 6.28, r() * 6.28], s: size * 2.1, h: 0, l: 0.1, big: 1 }); // 요즘 가장 자주 떠올린 생각: 큰 잎 하나
    const e = { n, start: ix, items, tint: items.map(() => r()) }; for (let i = 0; i < items.length; i++) ix++;
    ent.set(n.id, e);
    const pk = new T.Mesh(track(new T.SphereGeometry(1, 10, 8)), track(new T.MeshBasicMaterial({ visible: false }))); pk.scale.setScalar(Math.max(15, rc * 0.95)); pk.position.copy(C); pk.userData.id = n.id; tree.add(pk); picks.push(pk);
  }
  inst.count = ix;
  const halo = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, "rgba(255,176,70,.45)"); g.addColorStop(0.45, "rgba(255,160,50,.2)"); g.addColorStop(1, "rgba(255,170,60,0)"); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const sp = new T.Sprite(new T.SpriteMaterial({ map: track(new T.CanvasTexture(c)), blending: T.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true })); sp.visible = false; sp.renderOrder = 8; sp.raycast = () => {}; tree.add(sp); return sp; })();

  // ── 유리 화분과 바닥 ──
  const stand = new T.Group(); scene.add(stand);
  { const glass = new T.Mesh(track(new T.SphereGeometry(520, 72, 54, 0, Math.PI * 2, 0, Math.PI * 0.72)), track(new T.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.2, side: T.DoubleSide, depthWrite: false })));
    glass.position.set(0, 311, 0); glass.renderOrder = 5; stand.add(glass);
    const rim = new T.Mesh(track(new T.TorusGeometry(401, 3.2, 10, 96)), track(new T.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1 }))); rim.rotation.x = Math.PI / 2; rim.position.y = -20; stand.add(rim);
    const plate = new T.Mesh(track(new T.CylinderGeometry(418, 430, 30, 80)), track(new T.MeshStandardMaterial({ color: 0x8b6a45, roughness: 0.55 }))); plate.position.y = -48; stand.add(plate);
    const soil = new T.Mesh(track(new T.SphereGeometry(1, 48, 20)), track(new T.MeshStandardMaterial({ color: 0x5a4430, roughness: 1 }))); soil.scale.set(398, 46, 398); soil.position.y = -30; stand.add(soil);
    const r = rng("ground"), rockM = track(new T.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.85, flatShading: true })), mossM = [0x5d8a3a, 0x6f9c45, 0x49753a].map((c) => track(new T.MeshStandardMaterial({ color: c, roughness: 1 }))), pebM = [0xe3d6bd, 0xb9ab92, 0xcdbfa6, 0x8e8472].map((c) => track(new T.MeshStandardMaterial({ color: c, roughness: 0.7 })));
    const sg = track(new T.SphereGeometry(1, 10, 8)), dg = track(new T.DodecahedronGeometry(1, 0));
    for (let i = 0; i < 420; i++) { const a = r() * 6.2832, rd = Math.sqrt(r()) * 372, m = new T.Mesh(sg, mossM[i % 3]); m.scale.set(5 + r() * 8, 3 + r() * 4, 5 + r() * 8); m.position.set(Math.cos(a) * rd, 8 + r() * 6, Math.sin(a) * rd); if (Math.hypot(m.position.x, m.position.z) < 60) m.position.y += 6; stand.add(m); }
    for (let i = 0; i < 9; i++) { const a = r() * 6.2832, rd = 90 + r() * 250, m = new T.Mesh(dg, rockM); m.scale.set(22 + r() * 36, 14 + r() * 22, 20 + r() * 30); m.rotation.set(r() * 3, r() * 3, r() * 3); m.position.set(Math.cos(a) * rd, 12, Math.sin(a) * rd); stand.add(m); }
    for (let i = 0; i < 150; i++) { const a = (i / 150) * 6.2832 + r() * 0.1, rd = 345 + r() * 40, m = new T.Mesh(sg, pebM[i % 4]); const s = 5 + r() * 9; m.scale.set(s, s * 0.7, s); m.position.set(Math.cos(a) * rd, 4 + r() * 5, Math.sin(a) * rd); stand.add(m); }
    const sc = document.createElement("canvas"); sc.width = sc.height = 128; const sx = sc.getContext("2d"), sgd = sx.createRadialGradient(64, 64, 8, 64, 64, 64); sgd.addColorStop(0, "rgba(60,40,20,.55)"); sgd.addColorStop(1, "rgba(60,40,20,0)"); sx.fillStyle = sgd; sx.fillRect(0, 0, 128, 128);
    const sh = new T.Mesh(track(new T.PlaneGeometry(1250, 1250)), track(new T.MeshBasicMaterial({ map: track(new T.CanvasTexture(sc)), transparent: true, depthWrite: false }))); sh.rotation.x = -Math.PI / 2; sh.position.y = -66; stand.add(sh);
  }

  // ── 이름표 ──
  const mkLabel = (text, h, strong) => { const s = new DutyLib.SpriteText(text, h, "#3a2a1a"); s.fontFace = FONT; s.fontWeight = strong ? "800" : "600"; s.fontSize = 72; s.backgroundColor = strong ? "rgba(255,250,238,.94)" : "rgba(255,250,238,.82)"; s.padding = strong ? 3 : 2; s.borderRadius = 3; s.material.depthTest = false; s.material.depthWrite = false; s.material.transparent = true; s.renderOrder = 10; s.raycast = () => {}; return s; };
  const hov = mkLabel(" ", 15, true); hov.visible = false; hov.renderOrder = 12; tree.add(hov);

  // ── 카메라(돌리기·확대) ──
  const home = { tx: 0, ty: 335, tz: 0, r: 1230 }, cam = { az: 0.55, pol: 1.46, r: home.r, tx: home.tx, ty: home.ty, tz: home.tz }, goal = { ...home };
  st = { hlMat, barkMat, red: new T.Color(0xff5a4d), lastSel: undefined, stage, T, X, renderer, scene, camera, cv, tree, branch, pos, ent, inst, halo, hov, labels, picks, mkLabel, disposables, cam, goal, home, rev: S.rev, raf: 0, paused: false, lastTouch: 0, lblSig: "", lc, M, Q, E3, Sc, Pp, colTmp, beige };
  const place = () => { const sp = Math.sin(cam.pol); camera.position.set(cam.tx + cam.r * sp * Math.sin(cam.az), cam.ty + cam.r * Math.cos(cam.pol), cam.tz + cam.r * sp * Math.cos(cam.az)); camera.lookAt(cam.tx, cam.ty, cam.tz); };
  const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  st.ro = new ResizeObserver(resize); st.ro.observe(stage); resize();
  // 포인터: 끌기 = 돌리기, 휠·두 손가락 = 확대, 짧게 누르기 = 고르기
  const ray = new T.Raycaster(), nd = new T.Vector2(), ptrs = new Map(); let down = null, moved = 0, pinch = 0, hoverAt = 0;
  const pick = (ev) => { const b = cv.getBoundingClientRect(); nd.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1); ray.setFromCamera(nd, camera); const h = ray.intersectObjects(picks, false)[0]; return h?.object.userData.id ?? null; };
  const hover = (id) => { const e = id && ent.get(id), n = id && S.by.get(id), p = id && pos.get(id); if (!n || !p) { hov.visible = false; cv.style.cursor = ""; return; } hov.text = n.title; hov.position.set(p.x, p.y + 34, p.z); hov.visible = true; cv.style.cursor = "pointer"; };
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); down = [e.clientX, e.clientY]; moved = 0; pinch = 0; st.lastTouch = performance.now(); });
  cv.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) { if (performance.now() - hoverAt > 60) { hoverAt = performance.now(); hover(pick(e)); } return; }
    if (ptrs.size === 2) { ptrs.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) cam.r = goal.r = clamp(cam.r * (pinch / d), 450, 2800); pinch = d; moved = 99; return; }
    const dx = e.clientX - p[0], dy = e.clientY - p[1]; ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved += Math.abs(dx) + Math.abs(dy); cam.az -= dx * 0.0062; cam.pol = clamp(cam.pol - dy * 0.0048, 0.45, 1.68); st.lastTouch = performance.now();
  });
  const up = (e) => { const had = ptrs.delete(e.pointerId); if (!had) return; if (moved < 6 && ptrs.size === 0) { const id = pick(e); X.select(id && id === S.sel ? null : id); } pinch = 0; st.lastTouch = performance.now(); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up); cv.addEventListener("pointerleave", () => hover(null));
  cv.addEventListener("wheel", (e) => { e.preventDefault(); cam.r = goal.r = clamp(cam.r * Math.exp(e.deltaY * 0.0011), 450, 2800); st.lastTouch = performance.now(); }, { passive: false });
  // 그리기 반복
  const loop = () => {
    st.raf = requestAnimationFrame(loop); if (st.paused) return; if (!stage.isConnected) return B3.unmount();
    if (X.S.spin && !ptrs.size && performance.now() - st.lastTouch > 1800) cam.az += 0.0024;
    for (const k of ["tx", "ty", "tz", "r"]) cam[k] += (goal[k] - cam[k]) * 0.07;
    place(); renderer.render(scene, camera);
  };
  place(); loop();
  B3.update();
  return true;
};

// 고름·거르기·색 기준이 바뀌었을 때: 잎 색·크기, 빛나는 가지, 이름표, 다가가기
B3.update = function () {
  if (!st) return; const { T, X, inst, ent, branch, pos, halo, labels, M, Q, E3, Sc, Pp, colTmp, beige } = st, S = X.S, lit = X.litSet(), sel = S.sel && S.by.has(S.sel) ? S.sel : null;
  for (const [id, e] of ent) {
    const n = e.n, faint = lit ? !lit.has(id) : false, base = new T.Color(X.colorOf(n)), worry = (n.worry || 0) >= 55, k = id === sel ? 1.3 : faint ? 0.55 : 1;
    e.items.forEach((it, i) => {
      Pp.copy(it.p); Q.setFromEuler(E3.set(it.e[0], it.e[1], it.e[2])); Sc.setScalar(it.s * k * (it.big ? 1 : 1)); M.compose(Pp, Q, Sc); inst.setMatrixAt(e.start + i, M);
      colTmp.copy(base).offsetHSL(it.h, 0, it.l); if (worry && e.tint[i] < 0.3) colTmp.lerp(st.red, 0.65); if (it.big) colTmp.offsetHSL(0, 0.04, 0.04); if (faint) colTmp.lerp(beige, 0.78); inst.setColorAt(e.start + i, colTmp);
    });
  }
  inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  const hl = new Set(sel ? X.path(S.by.get(sel)).map((p) => p.id) : []); for (const [id, m] of branch) m.material = hl.has(id) ? st.hlMat : st.barkMat;
  st.rev = S.rev;
  // 이름표: 큰 주제 이름 + (고른 것·찾은 것·뜨거운 것)
  const filt = X.filtering(), want = new Map();
  for (const a of X.kids(S.root)) want.set(a.id, [a.title, true]);
  const cand = [...ent.values()].map((e) => e.n).sort((a, b) => (b.id === sel) - (a.id === sel) || (filt ? X.matches(b) - X.matches(a) : 0) || b.heat - a.heat);
  let c = 0; for (const n of cand) { if (c >= (filt ? 30 : 8) && n.id !== sel) break; if (filt && !X.matches(n) && n.id !== sel) continue; if (!want.has(n.id)) { want.set(n.id, [n.title, false]); c++; } }
  const sig = [...want.keys()].join("|") + "~" + (lit ? lit.size : "-"); if (sig !== st.lblSig) {
    st.lblSig = sig; for (const ch of [...labels.children]) { labels.remove(ch); ch.material?.map?.dispose?.(); ch.material?.dispose?.(); }
    for (const [id, [t, strong]] of want) { const p = pos.get(id), n = S.by.get(id); if (!p || !n) continue; const s = st.mkLabel(t, strong ? 19 : 11, strong), up = strong ? (n._c3?.rho ?? 80) * 0.9 + 22 : 28; s.position.set(p.x, p.y + up, p.z); if (lit && !lit.has(id)) s.material.opacity = 0.35; labels.add(s); }
  }
  if (sel && pos.has(sel)) { const p = pos.get(sel); halo.position.copy(p); halo.scale.setScalar(S.by.get(sel)._d === 1 ? 190 : 85); halo.visible = true; if (sel !== st.lastSel) { st.goal.tx = p.x * 0.7; st.goal.ty = p.y; st.goal.tz = p.z * 0.7; st.goal.r = S.by.get(sel)._d === 1 ? 950 : 780; } }
  else { halo.visible = false; if (sel !== st.lastSel) Object.assign(st.goal, st.home); }
  st.lastSel = sel;
};
B3.pause = (f) => { if (st) st.paused = !!f; };
B3.reset = () => { if (st) { Object.assign(st.goal, st.home); st.cam.az = 0.55; st.cam.pol = 1.46; } };
B3.alive = () => !!st;
B3.project = (id) => { if (!st || !st.pos.has(id)) return null; const v = st.pos.get(id).clone().project(st.camera), b = st.cv.getBoundingClientRect(); return { x: b.left + ((v.x + 1) / 2) * b.width, y: b.top + ((1 - v.y) / 2) * b.height }; }; // 시험용: 그 생각이 화면 어디인지
B3.rev = () => st?.rev ?? -1;
B3.unmount = function () {
  if (!st) return; const s = st; st = null; cancelAnimationFrame(s.raf); s.ro?.disconnect();
  try { s.scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); }); s.disposables.forEach((d) => d.dispose?.()); s.renderer.dispose(); s.renderer.forceContextLoss?.(); s.cv.remove(); } catch {}
};
})();
