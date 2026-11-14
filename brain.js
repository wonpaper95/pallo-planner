// 🧠 [뇌] 탭 — 대표 머릿속 지도. 주간 할 일·아이디어 창구·Claude 대화를 매주 분석해(맥미니 pallo-brain-sync) 주제마다 온도(요즘 얼마나 자주 떠올리는지)와 고민 정도를 매기고,
// 나뭇가지(위·아래)와 이어진 생각(연관 선)으로 잇는다. 🌌 입체 지도(3D, 옵시디언 그래프 느낌) / 🌿 나뭇가지 / 🔥 순위 세 가지로 본다. 직접 생각을 더하고 잇고 고칠 수 있다(내용에 [[제목]] 을 쓰면 그 생각과 이어짐).
// 보기·고치기 = 대표 본인만 (brain_nodes·brain_links·brain_runs, RLS user_id). 분석이 만든 점을 지우면 '숨김'이라 다시 분석해도 안 돌아오고, 고친 점은 덮어쓰지 않는다. 설계 docs/brain/README.md
// index.html 의 sb·toast 를 쓴다. 3D 라이브러리(vendor/duty-lib.js, 1.6MB)는 입체 지도를 처음 열 때만 받는다. 화면 틀(.dt*)은 duty.css 와 같이 쓰고, 뇌 전용은 brain.css → window.BRAIN
(() => {
const BRAIN = (window.BRAIN = {});
const LIB = "vendor/duty-lib.js?v=1";
const COLS = "id, parent_id, key, title, state, heat, worry, note, src, stats, origin, edited, color, sort, created_at";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const say = (m) => (typeof toast === "function" ? toast(m) : alert(m));
const bad = (e) => { if (!e) return false; console.error(e); say("저장 실패: " + (e.message || e)); return true; };
const db = () => sb;
const PALETTE = ["#7c9cff", "#ff8fb1", "#ffd166", "#5eead4", "#c4a1ff", "#ff9f6e", "#8be28b", "#6ad4ff", "#f9a8d4", "#fca5a5", "#bef264", "#cbd5e1"];
const STATES = ["관심", "고민", "실행", "루틴", "식음"];
const ST = { "관심": ["💡", "#ffd166", "요즘 궁금해하고 알아보는 것"], "고민": ["😟", "#ff6b6b", "막혀 있거나 걱정이 걸린 것"], "실행": ["🏃", "#5eead4", "지금 밀고 있는 것"], "루틴": ["🔁", "#7c9cff", "늘 돌아가는 일"], "식음": ["💤", "#8b90a8", "예전엔 많이 생각했지만 요즘은 뜸한 것"] };
const SRC = { week: ["✅", "주간 할 일"], claude: ["💬", "Claude 대화"], idea: ["💡", "아이디어 창구"], goal: ["🎯", "월간 목표"], me: ["✍️", "직접 넣음"] };
const SORTS = { heat: ["🔥 관심순", (n) => n.heat], worry: ["😟 고민순", (n) => n.worry], last: ["🕒 최근순", (n) => Date.parse(n.stats.last || n.created_at || 0) || 0], rise: ["📈 뜨는 순", (n) => n.stats.rise ?? 0] };
const FOLD_KEY = "brain-fold", MODE_KEY = "brain-mode", SPIN_KEY = "brain-spin", CB_KEY = "brain-colorby", SORT_KEY = "brain-sort";
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// ── 상태 ──
const S = { el: null, nodes: [], links: [], by: new Map(), kids: new Map(), rel: new Map(), why: new Map(), root: null,
  sel: null, hover: null, state: null, src: null, q: "",
  mode: lsGet(MODE_KEY, "3d"), colorBy: lsGet(CB_KEY, "area"), spin: lsGet(SPIN_KEY, "1") === "1", sort: lsGet(SORT_KEY, "heat"),
  edit: false, fold: new Set(), run: null, prev: null };
if (!["3d", "tree", "rank"].includes(S.mode)) S.mode = "3d";
if (!SORTS[S.sort]) S.sort = "heat";
try { S.fold = new Set(JSON.parse(lsGet(FOLD_KEY, "[]"))); } catch {}
const $ = (q) => S.el.querySelector(q);
const kids = (n) => S.kids.get(n?.id ?? "") ?? [];
const path = (n) => { const out = []; for (let p = n, i = 0; p && i < 40; p = S.by.get(p.parent_id), i++) out.unshift(p); return out; };
const below = (n, out = []) => { for (const c of kids(n)) { out.push(c); below(c, out); } return out; };
const where = (n) => path(n).slice(1, -1).map((p) => p.title).join(" › ");
const pairKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);
const md = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? "")); return m ? `${+m[2]}/${+m[3]}` : ""; };
const ymd = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d ?? "")); return m ? `${m[1]}.${+m[2]}.${+m[3]}` : ""; };
const stChip = (n) => (n.state && ST[n.state] ? `<u class="bnst" style="--oc:${ST[n.state][1]}" title="${ST[n.state][2]}">${ST[n.state][0]} ${n.state}</u>` : "");
const topics = () => S.nodes.filter((n) => n._d >= 2); // 큰 주제 아래의 생각들 (순위·점검 대상)

function index() {
  for (const n of S.nodes) { n.note ??= ""; n.state ??= ""; n.heat = +n.heat || 0; n.worry = +n.worry || 0; n.src = Array.isArray(n.src) ? n.src : []; n.stats = n.stats && typeof n.stats === "object" ? n.stats : {}; }
  S.by = new Map(S.nodes.map((n) => [n.id, n])); S.kids = new Map(); S.rel = new Map(); S.why = new Map();
  for (const n of S.nodes) { const k = n.parent_id && S.by.has(n.parent_id) ? n.parent_id : ""; if (!S.kids.has(k)) S.kids.set(k, []); S.kids.get(k).push(n); }
  for (const l of S.kids.values()) l.sort((a, b) => a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
  const tops = S.kids.get("") ?? []; S.root = tops[0] ?? null; let i = 0;
  const walk = (n, d, c) => { n._d = d; n._c = n.color || c; n._i = i++; kids(n).forEach((k, j) => walk(k, d + 1, d === 0 ? PALETTE[j % PALETTE.length] : n._c)); };
  tops.forEach((t) => walk(t, 0, "#ffffff"));
  S.links = S.links.filter((l) => S.by.has(l.a) && S.by.has(l.b));
  for (const l of S.links) { S.why.set(pairKey(l.a, l.b), l.why ?? ""); for (const [x, y] of [[l.a, l.b], [l.b, l.a]]) { if (!S.rel.has(x)) S.rel.set(x, new Set()); S.rel.get(x).add(y); } }
  if (S.sel && !S.by.has(S.sel)) S.sel = null;
  if (S.hover && !S.by.has(S.hover)) S.hover = null;
}
const filtering = () => !!(S.state || S.src || S.q);
const matches = (n) => {
  if (S.state && n.state !== S.state) return false;
  if (S.src && !(S.src === "me" ? n.origin === "me" : (n.stats.by?.[S.src] ?? 0) > 0)) return false;
  if (S.q) { const q = S.q.toLowerCase(); if (!`${n.title} ${n.note} ${n.src.map((x) => x.t).join(" ")}`.toLowerCase().includes(q)) return false; }
  return true;
};
// 밝게 둘 점들: 가리키거나 고른 점(+위 가지·아래 가지·이어진 생각), 아니면 거르기에 맞는 점. null = 전부 밝게
function litSet() {
  const id = S.hover ?? S.sel, n = id && S.by.get(id);
  if (n) {
    const s = new Set([n.id]); (S.rel.get(n.id) ?? []).forEach((x) => s.add(x));
    if (S.hover) { if (n.parent_id) s.add(n.parent_id); kids(n).forEach((c) => s.add(c.id)); }
    else { path(n).forEach((p) => s.add(p.id)); below(n).forEach((c) => s.add(c.id)); }
    return s;
  }
  if (filtering()) return new Set(S.nodes.filter(matches).map((x) => x.id));
  return null;
}

// ── 불러오기 ──
// 로그인 직후 한 번: 탭 단추는 대표에게만(adminonly), DB 표가 있을 때만 보임 (마이그레이션 전에는 아무에게도 안 보임)
BRAIN.init = async function () {
  let ok = false;
  try { const { error } = await db().from("brain_nodes").select("id", { count: "exact", head: true }); ok = !error; } catch {}
  document.querySelector('.seg [data-v="brain"]')?.classList.toggle("hidden", !ok);
};
const blank = (msg) => { teardown(); S.el.innerHTML = `<div class="dtwrap"><h2 class="dtttlbar">🧠 뇌</h2><div class="dtmsg">${msg}</div></div>`; };
BRAIN.load = async function () {
  S.el = document.getElementById("brainView");
  S.edit = document.body.classList.contains("is-admin");
  if (!S.edit) return blank("대표님만 보는 탭이에요.");
  if (!S.el.querySelector(".dtwrap")) S.el.innerHTML = `<div class="dtwrap"><div class="dtmsg">불러오는 중…</div></div>`;
  const [a, b, r] = await Promise.all([db().from("brain_nodes").select(COLS).eq("hidden", false).order("sort").order("created_at"), db().from("brain_links").select("a, b, why, origin"), db().from("brain_runs").select("ran_at, summary").order("ran_at", { ascending: false }).limit(2)]);
  if (a.error || b.error) { console.error(a.error || b.error); return blank("뇌 지도를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요."); }
  let rows = a.data ?? [];
  if (!rows.some((n) => !n.parent_id)) { // 처음: 가운데 점 하나
    const { data, error } = await db().from("brain_nodes").insert({ parent_id: null, title: "나", sort: 0 }).select(COLS).single();
    if (error) { console.error(error); return blank("뇌 지도를 준비하지 못했어요. 잠시 뒤 다시 열어 주세요."); }
    rows = [data];
  }
  // 숨긴 점 아래에 남은 점은 같이 안 보이게: 가운데에서 닿는 점만
  const by = new Map(rows.map((n) => [n.id, n])), ok = new Set(), reach = (n) => { for (let p = n, i = 0; p && i < 40; p = by.get(p.parent_id), i++) { if (!p.parent_id) return true; if (!by.has(p.parent_id)) return false; } return false; };
  for (const n of rows) if (reach(n)) ok.add(n.id);
  S.nodes = rows.filter((n) => ok.has(n.id)); S.links = b.data ?? [];
  S.run = r.data?.[0] ?? null; S.prev = r.data?.[1] ?? null;
  index(); shell(); draw();
};

// ── 틀 ──
function shell() {
  if (S.el.querySelector(".dtmain")) return;
  teardown();
  S.el.innerHTML = `<div class="dtwrap bn">
    <div class="dthead"><div><h2 class="dtttlbar">🧠 뇌</h2>
      <div class="dtsub">내가 요즘 무엇을 많이 생각하고 어디에 고민이 걸려 있는지 보는 지도예요. 주간 할 일·아이디어 창구·Claude 대화를 매주 읽어 새로 그려요. 나만 볼 수 있어요.</div></div>
      <div class="bnwhen"></div></div>
    <div class="dtbar">
      <div class="dtseg" data-seg="mode"><button type="button" data-mode="3d">🌌 입체 지도</button><button type="button" data-mode="tree">🌿 나뭇가지</button><button type="button" data-mode="rank">🔥 순위</button></div>
      <input class="dtq" type="search" placeholder="생각 찾기 (예: 광고, 채용)" autocomplete="off" aria-label="생각 찾기">
    </div>
    <div class="dtfilters"></div>
    <div class="dtmain">
      <div class="dtstage">
        <div class="dtgraph"></div>
        <div class="dttreebox"></div>
        <div class="bnrankbox"></div>
        <div class="dthud"><button type="button" data-colorby title="점 색을 주제별 / 상태별로 바꾸기"></button><button type="button" data-spin title="천천히 돌리기 켜기·끄기">⟳ 회전</button><button type="button" data-fit title="전체가 보이게">⤢ 전체 보기</button></div>
        <div class="dtlegend"><span><i class="l1"></i>나뭇가지 (위·아래)</span><span><i class="l2"></i>이어진 생각</span><span>점이 클수록 요즘 자주 떠올린 생각 · 붉은 빛 = 고민</span><span class="dthelp">끌기 = 돌리기 · 휠·두 손가락 = 확대 · 점 누르기 = 내용</span></div>
        <div class="dtgmsg" hidden></div>
      </div>
      <div class="dtpanel"></div>
    </div></div>`;
  $(".dtseg").addEventListener("click", (e) => { const m = e.target.closest("[data-mode]")?.dataset.mode; if (!m || m === S.mode) return; S.mode = m; lsSet(MODE_KEY, m); draw(); });
  let qt; $(".dtq").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { S.q = e.target.value.trim(); drawStage(); if (S.mode === "3d") relight(); }, 180); });
  $(".dtq").addEventListener("keydown", (e) => { if (e.key !== "Enter" || e.isComposing) return; S.q = e.target.value.trim(); const hit = S.nodes.filter((n) => n._d > 0 && matches(n)).sort((a, b) => b.heat - a.heat || a._i - b._i)[0]; if (hit) select(hit.id, true); });
  $(".dtfilters").addEventListener("click", (e) => { const f = e.target.closest("[data-f]")?.dataset.f; if (f) setFilter(f); });
  $("[data-spin]").addEventListener("click", () => { S.spin = !S.spin; lsSet(SPIN_KEY, S.spin ? "1" : "0"); spinSync(); });
  $("[data-fit]").addEventListener("click", () => { select(null); fit(800); });
  $("[data-colorby]").addEventListener("click", () => { S.colorBy = S.colorBy === "state" ? "area" : "state"; lsSet(CB_KEY, S.colorBy); drawHud(); if (S.mode === "3d") { syncGraph(); relight(); } else drawStage(); });
  $(".dttreebox").addEventListener("click", (e) => {
    const fold = e.target.closest("[data-fold]"); if (fold) { const id = fold.dataset.fold; S.fold.has(id) ? S.fold.delete(id) : S.fold.add(id); lsSet(FOLD_KEY, JSON.stringify([...S.fold].slice(-400))); drawTree(); return; }
    const all = e.target.closest("[data-foldall]"); if (all) { S.fold = all.dataset.foldall === "1" ? new Set(S.nodes.filter((n) => n._d >= 1 && kids(n).length).map((n) => n.id)) : new Set(); lsSet(FOLD_KEY, JSON.stringify([...S.fold])); drawTree(); return; }
    const row = e.target.closest("[data-id]"); if (row) select(row.dataset.id === S.sel ? null : row.dataset.id);
  });
  $(".bnrankbox").addEventListener("click", (e) => {
    const so = e.target.closest("[data-sort]")?.dataset.sort; if (so) { S.sort = so; lsSet(SORT_KEY, so); drawRank(); return; }
    const row = e.target.closest("[data-id]"); if (row) select(row.dataset.id === S.sel ? null : row.dataset.id);
  });
  if (!shell.keyed) { shell.keyed = true; addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sel && S.el?.isConnected && S.el.offsetParent !== null && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "")) select(null); }); }
}
function draw() { $(".dtwrap").dataset.mode = S.mode; S.el.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === S.mode)); drawWhen(); drawHud(); drawFilters(); drawStage(); drawPanel(); }
function drawHud() { const b = $("[data-colorby]"); if (b) b.textContent = S.colorBy === "state" ? "🎨 색: 상태별" : "🎨 색: 주제별"; }
function drawWhen() { const w = $(".bnwhen"); if (!w) return; w.innerHTML = S.run ? `<span title="매주 월요일 새벽에 새로 분석해요">🗓 ${esc(ymd(new Date(new Date(S.run.ran_at).getTime() + 9 * 3600e3).toISOString()))} 분석</span>` : `<span>아직 분석 전이에요</span>`; }
function setFilter(f) {
  const [k, v] = f.split(/:(.*)/s);
  if (k === "all") { S.state = null; S.src = null; }
  else if (k === "state") S.state = S.state === v ? null : v;
  else if (k === "src") S.src = S.src === v ? null : v;
  drawFilters(); drawStage(); if (!S.sel) drawPanel(); if (S.mode === "3d") relight();
}
function drawFilters() {
  const any = S.state || S.src, cnt = (f) => S.nodes.filter((n) => n._d >= 1 && f(n)).length;
  const srcs = ["week", "claude", "idea", "me"].filter((w) => cnt((n) => (w === "me" ? n.origin === "me" : (n.stats.by?.[w] ?? 0) > 0)));
  $(".dtfilters").innerHTML = `<button type="button" data-f="all" class="${any ? "" : "on"}">전체</button>`
    + STATES.filter((s) => cnt((n) => n.state === s)).map((s) => `<button type="button" data-f="state:${s}" class="${S.state === s ? "on" : ""}" style="--oc:${ST[s][1]}" title="${ST[s][2]}">${ST[s][0]} ${s} <small>${cnt((n) => n.state === s)}</small></button>`).join("")
    + (srcs.length ? `<span class="dtfsep">어디서 나온 생각</span>` + srcs.map((w) => `<button type="button" data-f="src:${w}" class="cy ${S.src === w ? "on" : ""}">${SRC[w][0]} ${SRC[w][1]}</button>`).join("") : "");
}
function drawStage() { if (S.mode === "3d") return drawGraph(); pauseGraph(true); S.mode === "tree" ? drawTree() : drawRank(); }
const heatBar = (v, c) => `<i class="bnbar"><u style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></u></i>`;

// ── 🌿 나뭇가지 ──
function drawTree() {
  const filt = filtering(), keep = new Set();
  if (filt) for (const n of S.nodes) if (matches(n)) path(n).forEach((p) => keep.add(p.id));
  const row = (n) => {
    if (filt && !keep.has(n.id)) return "";
    const cs = kids(n), folded = !filt && S.fold.has(n.id) && n._d >= 1, rel = S.rel.get(n.id)?.size ?? 0, hit = filt && matches(n);
    return `<li><div class="dtrow d${Math.min(n._d, 3)}${n.id === S.sel ? " sel" : ""}${filt && !hit ? " faint" : ""}" data-id="${n.id}" style="--c:${n._c}">
      ${cs.length && n._d >= 1 ? `<button type="button" class="dtfold" data-fold="${n.id}" aria-label="${folded ? "펴기" : "접기"}">${folded ? "▸" : "▾"}</button>` : `<span class="dtfold"></span>`}
      <i class="dtdot"></i><span class="dtname">${esc(n.title)}</span>${folded ? `<span class="dtcnt">${below(n).length}</span>` : ""}
      <span class="dtchips">${n._d >= 1 && n.heat ? `<em class="bnheat" title="온도 ${n.heat}">🔥 ${n.heat}</em>` : ""}${stChip(n)}${n.origin === "me" && n._d >= 1 ? `<em title="직접 넣은 생각">✍️</em>` : ""}${rel ? `<em title="이어진 생각 ${rel}개">🔗 ${rel}</em>` : ""}</span></div>
      ${cs.length && !folded ? `<ul>${cs.map(row).join("")}</ul>` : ""}</li>`;
  };
  const body = (S.kids.get("") ?? []).map(row).join("");
  $(".dttreebox").innerHTML = `<div class="dttreebar"><span>${filt ? `맞는 생각 ${S.nodes.filter(matches).length}개` : `생각 ${S.nodes.length - 1}개`}</span>${filt ? "" : `<button type="button" data-foldall="0">모두 펴기</button><button type="button" data-foldall="1">모두 접기</button>`}</div>
    ${body ? `<ul class="dttree">${body}</ul>` : `<div class="dtmsg">맞는 생각이 없어요.</div>`}`;
}

// ── 🔥 순위 ──
function drawRank() {
  const f = SORTS[S.sort][1], rows = topics().filter((n) => !filtering() || matches(n)).sort((a, b) => f(b) - f(a) || b.heat - a.heat || a._i - b._i).slice(0, 120);
  $(".bnrankbox").innerHTML = `<div class="dttbar"><div class="dtseg sm">${Object.entries(SORTS).map(([k, [label]]) => `<button type="button" data-sort="${k}" class="${S.sort === k ? "on" : ""}">${label}</button>`).join("")}</div><span>생각 ${rows.length}개${filtering() ? " (거른 결과)" : ""}</span></div>
    ${rows.length ? `<div class="dttwrap"><table class="dttable bnrank"><thead><tr><th>#</th><th>생각</th><th>상태</th><th>🔥 온도</th><th>😟 고민</th><th>최근 30일</th><th>마지막</th></tr></thead><tbody>
      ${rows.map((n, i) => `<tr data-id="${n.id}" class="${n.id === S.sel ? "sel" : ""}"><td class="r">${i + 1}</td><td class="t" style="--c:${n._c}"><i class="dtdot"></i>${esc(n.title)}<small>${esc(where(n) || path(n)[1]?.title || "")}</small></td><td>${stChip(n)}</td>
        <td class="m">${heatBar(n.heat, "#ffb347")}<b>${n.heat}</b></td><td class="m">${heatBar(n.worry, "#ff6b6b")}<b>${n.worry}</b></td><td class="c">${n.stats.n30 ?? 0}번${(n.stats.rise ?? 0) > 1 ? ` <span class="up">▲</span>` : (n.stats.rise ?? 0) < -1 ? ` <span class="dn">▼</span>` : ""}</td><td class="c">${esc(md(n.stats.last))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="dtmsg">${S.nodes.length > 1 ? "맞는 생각이 없어요." : "아직 생각이 없어요. 오른쪽에서 큰 주제를 넣거나, 첫 분석을 기다려 주세요."}</div>`}`;
}

// ── 🌌 입체 지도 ──
let G = null, gn = new Map(), raf = 0, lit = null, fitted = false, touched = false, fitD = 900, lblK = 1, mo = null, T = null;
const RAD = [15, 9, 5.2, 3.3], LBL = [15, 11, 6, 4.2];
const rad = (n) => (n._d === 0 ? RAD[0] : RAD[Math.min(n._d, 3)] * (0.7 + (0.9 * (n.heat || 0)) / 100)); // 자주 떠올릴수록 큰 점
const colorOf = (n) => (n._d === 0 ? "#ffffff" : S.colorBy === "state" ? (ST[n.state]?.[1] ?? "#6b7280") : n._c);
function loadLib() { return (loadLib.p ||= new Promise((ok, no) => { if (window.DutyLib) return ok(); const s = document.createElement("script"); s.src = LIB; s.onload = ok; s.onerror = () => { loadLib.p = null; no(new Error("lib")); }; document.head.append(s); })); }
const gmsg = (t) => { const m = $(".dtgmsg"); if (!m) return; m.hidden = !t; m.textContent = t ?? ""; };
async function drawGraph() {
  const box = $(".dtgraph");
  if (!G) {
    gmsg("입체 지도를 준비하는 중…");
    try { await loadLib(); if (!S.el?.isConnected || !box.isConnected) return; if (!G) makeGraph(box); gmsg(""); }
    catch (e) { console.error(e); G = null; gmsg(""); say("이 기기에서는 입체 지도를 못 그려서 나뭇가지로 보여 드려요"); S.mode = "tree"; draw(); return; }
  }
  if (S.mode !== "3d") return;
  syncGraph(); pauseGraph(false); relight();
}
function halo() { // 점 둘레 빛 번짐 (한 장을 같이 씀)
  if (halo.t) return halo.t;
  const c = document.createElement("canvas"); c.width = c.height = 128; const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(0.22, "rgba(255,255,255,.35)"); g.addColorStop(0.55, "rgba(255,255,255,.08)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (halo.t = new T.CanvasTexture(c));
}
function nodeObject(g) {
  const n = S.by.get(g.id); if (!n) return new T.Object3D();
  const r = rad(n), d = Math.min(n._d, 3), grp = new T.Group(), col = new T.Color(colorOf(n)), hot = n.state === "고민" && n._d >= 1;
  const ball = new T.Mesh((nodeObject.geo ||= new T.SphereGeometry(1, 24, 18)), new T.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: d === 0 ? 0.75 : 0.45, transparent: true }));
  ball.scale.setScalar(r);
  const glow = new T.Sprite(new T.SpriteMaterial({ map: halo(), color: hot ? new T.Color("#ff4d4d") : col, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  glow.scale.set(r * (hot ? 9.5 : 7.5), r * (hot ? 9.5 : 7.5), 1); glow.raycast = () => {}; // 빛 번짐은 누를 수 없게 (옆 점을 가림)
  const text = new DutyLib.SpriteText(n.title, LBL[d] * lblK, d <= 1 ? "#ffffff" : "#dfe3ff");
  text.fontFace = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", "Noto Sans KR", sans-serif';
  text.fontWeight = d <= 1 ? "700" : "500"; text.fontSize = 72;
  if (d <= 1) { text.backgroundColor = "rgba(10,9,28,.62)"; text.padding = 2.2; text.borderRadius = 3; }
  text.material.depthWrite = false; text.material.transparent = true; text.position.set(0, -(r + LBL[d] * lblK * (d <= 1 ? 1.25 : 0.95)), 0); text.renderOrder = 2;
  grp.add(glow, ball, text); g.__ball = ball; g.__glow = glow; g.__text = text; g.__r = r; g.__o = g.__o ?? 1;
  return grp;
}
function makeGraph(box) {
  T = DutyLib.THREE;
  const coarse = matchMedia("(pointer: coarse)").matches;
  G = new DutyLib.ForceGraph3D(box, { controlType: "orbit", rendererConfig: { antialias: true, alpha: false, powerPreference: "high-performance" } })
    .backgroundColor("#080716").showNavInfo(false).enableNodeDrag(!coarse)
    .nodeThreeObject(nodeObject).nodeLabel((g) => tip(S.by.get(g.id)))
    .linkCurvature((l) => (l.rel ? 0.16 : 0)).linkCurveRotation((l) => l.rot ?? 0)
    .linkWidth((l) => (l.rel ? 0.3 : l.td === 1 ? 1.5 : l.td === 2 ? 0.8 : 0.45)).linkOpacity(1).linkResolution(6)
    .linkColor(linkColor)
    .linkDirectionalParticles((l) => (l.rel ? 1 : 0)).linkDirectionalParticleWidth(1.3).linkDirectionalParticleSpeed(0.0045).linkDirectionalParticleColor(() => "#ffe9a8")
    .warmupTicks(90).cooldownTime(9000).d3VelocityDecay(0.32)
    .onNodeClick((g) => select(g.id === S.sel ? null : g.id))
    .onNodeHover((g) => { const id = g?.id ?? null; box.style.cursor = g ? "pointer" : ""; if (id === S.hover) return; S.hover = id; relight(); })
    .onBackgroundClick(() => select(null))
    .onNodeDragEnd((g) => { g.fx = g.x; g.fy = g.y; g.fz = g.z; setTimeout(() => { g.fx = g.fy = g.fz = undefined; }, 1500); })
    .onEngineTick(() => { if (!fitted) { fitted = true; fit(0); } })
    .onEngineStop(() => { if (!touched && !S.sel) fit(900); });
  G.d3Force("link").distance((l) => (l.rel ? 95 : l.td === 1 ? 140 : l.td === 2 ? 66 : 36)).strength((l) => (l.rel ? 0.025 : 0.85));
  G.d3Force("charge").strength((g) => { const d = S.by.get(g.id)?._d ?? 3; return d === 0 ? -320 : d === 1 ? -240 : d === 2 ? -80 : -36; }).distanceMax(420);
  G.cameraPosition({ x: 0, y: 40, z: 560 });
  const scene = G.scene(); scene.fog = new T.FogExp2(0x080716, 0.0005);
  { // 멀리 깔린 별: 돌릴 때 깊이감
    const N = 900, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const r = 900 + Math.random() * 1300, a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1); pos.set([r * Math.sin(b) * Math.cos(a), r * Math.sin(b) * Math.sin(a), r * Math.cos(b)], i * 3); }
    const geo = new T.BufferGeometry(); geo.setAttribute("position", new T.BufferAttribute(pos, 3));
    scene.add(new T.Points(geo, new T.PointsMaterial({ color: 0xaab4ff, size: 2.4, sizeAttenuation: true, transparent: true, opacity: 0.55, fog: false, depthWrite: false })));
  }
  const c = G.controls(); c.enableDamping = true; c.dampingFactor = 0.12; c.autoRotateSpeed = 0.55; c.minDistance = 40; c.maxDistance = 2600;
  box.addEventListener("pointerdown", () => { touched = true; c.autoRotate = false; clearTimeout(spinSync.t); spinSync.t = setTimeout(spinSync, 6000); }); // 만지는 동안은 멈췄다가 다시 돎
  const size = () => { if (box.clientWidth && box.clientHeight) G.width(box.clientWidth).height(box.clientHeight); };
  size(); new ResizeObserver(size).observe(box);
  mo = new MutationObserver(() => pauseGraph(S.mode !== "3d")); mo.observe(document.body, { attributes: true, attributeFilter: ["class"] }); // 다른 탭으로 가면 멈춤
  spinSync();
}
const visible = () => S.el?.isConnected && S.el.offsetParent !== null;
function pauseGraph(off) {
  if (!G) return;
  if (off || !visible()) { G.pauseAnimation(); cancelAnimationFrame(raf); raf = 0; }
  else { G.resumeAnimation(); if (!raf) raf = requestAnimationFrame(frame); }
}
function spinSync() { const b = S.el?.querySelector("[data-spin]"); b?.classList.toggle("on", S.spin); if (G) G.controls().autoRotate = S.spin && !S.sel; }
function syncGraph() { // 화면의 점·선을 상태에 맞춤 — 있던 점은 자리 그대로
  if (!G) return;
  const next = new Map();
  for (const n of S.nodes) {
    let g = gn.get(n.id);
    if (!g) { g = { id: n.id }; const p = gn.get(n.parent_id) ?? next.get(n.parent_id); if (p && p.x != null) { g.x = p.x + (Math.random() - 0.5) * 30; g.y = p.y + (Math.random() - 0.5) * 30; g.z = p.z + (Math.random() - 0.5) * 30; } }
    g.sig = `${n.title}|${colorOf(n)}|${n._d}|${n.heat}|${n.state}`; next.set(n.id, g);
  }
  const sig = [...next.values()].map((g) => g.sig).join("\n") + "\n" + S.nodes.map((n) => n.parent_id).join() + "\n" + S.links.map((l) => l.a + l.b).join();
  gn = next; if (sig === syncGraph.sig) return; syncGraph.sig = sig;
  const links = [];
  for (const n of S.nodes) if (n.parent_id && next.has(n.parent_id)) links.push({ source: n.parent_id, target: n.id, td: n._d, c: colorOf(n) });
  S.links.forEach((l, i) => links.push({ source: l.a, target: l.b, rel: true, rot: (i * 2.399) % (Math.PI * 2) }));
  G.nodeThreeObject(nodeObject).graphData({ nodes: [...next.values()], links });
}
const rgba = (hex, a) => { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`; };
function linkColor(l) {
  const a = l.source?.id ?? l.source, b = l.target?.id ?? l.target, on = !lit || (lit.has(a) && lit.has(b));
  if (l.rel) return lit && on ? "rgba(255,221,140,.95)" : on ? "rgba(255,221,140,.3)" : "rgba(255,221,140,.04)";
  return rgba(/^#[0-9a-f]{6}$/i.test(l.c ?? "") ? l.c : "#ffffff", on ? 0.6 : 0.07);
}
function relight() { lit = litSet(); if (!G) return; const on = (l) => l.rel && (!lit || (lit.has(l.source?.id ?? l.source) && lit.has(l.target?.id ?? l.target))); G.linkColor(linkColor).linkDirectionalParticles((l) => (on(l) ? (lit ? 3 : 1) : 0)); }
function fit(ms) { // 전체가 칸에 차게: 점들을 감싸는 공이 화면에 들어오는 거리로
  const ns = [...gn.values()].filter((g) => g.x != null); if (!G || !ns.length) return;
  const c = ns.reduce((a, g) => [a[0] + g.x, a[1] + g.y, a[2] + g.z], [0, 0, 0]).map((v) => v / ns.length);
  const R = Math.max(80, ...ns.map((g) => Math.hypot(g.x - c[0], g.y - c[1], g.z - c[2]))) + 25;
  const cam = G.camera(), half = Math.min((cam.fov * Math.PI) / 360, Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect));
  fitD = (R / Math.sin(half)) * 0.93; G.scene().fog.density = 0.5 / fitD; // 업무분장 때(0.8)보다 넉넉히: 뜨거운 점이 커서 가장자리가 잘리지 않게
  const k = Math.min(1.7, Math.max(1, fitD / (G.height() || 700) / 1.1)); // 작은 화면(폰)은 같은 지도를 더 작게 보게 되니 글자를 그만큼 키움
  if (Math.abs(k - lblK) > 0.05) { lblK = k; for (const g of gn.values()) { const n = S.by.get(g.id); if (!n || !g.__text) continue; const d = Math.min(n._d, 3); g.__text.textHeight = LBL[d] * k; g.__text.position.y = -(rad(n) + LBL[d] * k * (d <= 1 ? 1.25 : 0.95)); } }
  const p = cam.position, v = [p.x - c[0], p.y - c[1], p.z - c[2]], l = Math.hypot(...v) || 1;
  G.cameraPosition({ x: c[0] + (v[0] / l) * fitD, y: c[1] + (v[1] / l) * fitD, z: c[2] + (v[2] / l) * fitD }, { x: c[0], y: c[1], z: c[2] }, ms);
}
function frame() { // 글자: 가까운 것만 또렷하게, 밝게 둔 점만 선명하게 (부드럽게 바뀜)
  raf = requestAnimationFrame(frame);
  if (!G) return; const cam = G.camera().position, focus = S.hover ?? S.sel;
  for (const g of gn.values()) {
    if (!g.__ball || g.x == null) continue;
    const n = S.by.get(g.id); if (!n) continue;
    const on = !lit || lit.has(g.id), target = on ? 1 : 0.1; g.__o += (target - g.__o) * 0.18;
    let t = 1;
    if (n._d >= 2 && !(lit && on)) { const far = fitD * (n._d === 2 ? 1.02 : 0.55) * (0.85 + n.heat / 300), dist = Math.hypot(cam.x - g.x, cam.y - g.y, cam.z - g.z); t = Math.max(0, Math.min(1, (far - dist) / (far * 0.3))); }
    g.__ball.material.opacity = 0.15 + 0.85 * g.__o; g.__glow.material.opacity = (g.id === focus ? 1 : 0.6) * g.__o; g.__text.material.opacity = t * (on ? g.__o : g.__o * (n._d <= 1 ? 0.9 : 0.4));
    const s = g.__r * (g.id === S.sel ? 1.35 : 1); if (g.__ball.scale.x !== s) g.__ball.scale.setScalar(s);
  }
}
function tip(n) { if (!n) return ""; const bits = [n.state && ST[n.state] ? `${ST[n.state][0]} ${n.state}` : "", n._d >= 1 && n.heat ? `🔥 ${n.heat}` : "", n.worry >= 40 ? `😟 ${n.worry}` : ""].filter(Boolean); return `<div class="dttip"><b>${esc(n.title)}</b>${bits.length ? `<span>${esc(bits.join("  |  "))}</span>` : ""}${n.note ? `<p>${esc(n.note.length > 90 ? n.note.slice(0, 90) + "…" : n.note)}</p>` : ""}</div>`; }
function fly(id) { // 보던 방향 그대로 그 점 앞으로 다가감
  const g = gn.get(id), n = S.by.get(id); if (!G || !g || g.x == null) return;
  const span = n._d === 0 ? fitD * 0.85 : n._d === 1 ? 430 : n._d === 2 ? 270 : 200;
  const cam = G.camera().position, t = G.controls().target, v = [cam.x - t.x, cam.y - t.y, cam.z - t.z], l = Math.hypot(...v) || 1;
  G.cameraPosition({ x: g.x + (v[0] / l) * span, y: g.y + (v[1] / l) * span, z: g.z + (v[2] / l) * span }, { x: g.x, y: g.y, z: g.z }, 900);
}
function teardown() { cancelAnimationFrame(raf); raf = 0; mo?.disconnect(); mo = null; try { G?._destructor?.(); } catch {} G = null; gn = new Map(); syncGraph.sig = null; fitted = false; touched = false; lblK = 1; }

// ── 고르기 · 오른쪽 칸 ──
function select(id, reveal) {
  S.sel = id && S.by.has(id) ? id : null; S.hover = null;
  if (S.sel && reveal) { let open = false; for (const p of path(S.by.get(S.sel)).slice(0, -1)) if (S.fold.delete(p.id)) open = true; if (open) lsSet(FOLD_KEY, JSON.stringify([...S.fold])); }
  spinSync(); drawPanel();
  if (S.mode === "tree") { drawTree(); if (S.sel) $(`.dtrow[data-id="${S.sel}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  else if (S.mode === "rank") { $(".bnrankbox").querySelectorAll("tr.sel").forEach((r) => r.classList.remove("sel")); const r = S.sel && $(`.bnrank tr[data-id="${S.sel}"]`); if (r) { r.classList.add("sel"); r.scrollIntoView({ block: "nearest", behavior: "smooth" }); } }
  else { relight(); if (S.sel) fly(S.sel); }
}
const optTree = (skip, cur, deep) => { // 고르기 목록: 가지 모양 그대로 들여쓰기. deep = 뺄 점의 아래 가지도 같이 뺌(옮기기)
  const out = []; const walk = (n) => { if (skip?.has(n.id)) { if (!deep) kids(n).forEach(walk); return; } out.push(`<option value="${n.id}"${n.id === cur ? " selected" : ""}>${"　".repeat(Math.min(n._d, 4))}${esc(n.title)}</option>`); kids(n).forEach(walk); };
  (S.kids.get("") ?? []).forEach(walk); return out.join("");
};
function spark(n) { // 달마다 몇 번 떠올렸는지 (최근 12달)
  const m = n.stats.m; if (!m || typeof m !== "object") return "";
  const now = new Date(Date.now() + 9 * 3600e3), keys = []; for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); keys.push(d.toISOString().slice(0, 7)); }
  const vals = keys.map((k) => +m[k] || 0), max = Math.max(1, ...vals); if (!vals.some(Boolean)) return "";
  return `<div class="bnspark" title="달마다 이 생각이 나온 횟수 (최근 12달)">${keys.map((k, i) => `<span title="${k} · ${vals[i]}번"><i style="height:${Math.round((vals[i] / max) * 100)}%"></i><em>${+k.slice(5)}</em></span>`).join("")}</div>`;
}
const pickTop = (f, min, k = 6) => topics().filter((n) => f(n) >= min).sort((a, b) => f(b) - f(a) || b.heat - a.heat).slice(0, k);
function drawPanel() {
  const p = $(".dtpanel"), n = S.sel && S.by.get(S.sel);
  p.classList.toggle("on", !!n); p.onclick = null; $(".dtwrap").classList.toggle("focus", !!n); // 폰: 고르면 위 절반 지도 · 아래 절반 내용
  if (!n) { // 지금 내 머릿속
    const areas = kids(S.root), total = S.nodes.length - 1, sm = S.run?.summary ?? {}, c = sm.counts ?? {};
    const hot = pickTop((x) => x.heat, 1), wor = pickTop((x) => x.worry, 40), up = pickTop((x) => x.stats.rise ?? 0, 2, 5), cold = topics().filter((x) => x.state === "식음").sort((a, b) => (b.stats.n ?? 0) - (a.stats.n ?? 0)).slice(0, 5);
    const bars = (list, f, col) => `<div class="dtbars bnbars">${list.map((x) => `<button type="button" data-go="${x.id}" style="--oc:${col}"><span>${esc(x.title)}</span><i><u style="width:${Math.max(4, f(x))}%"></u></i><b>${f(x)}</b></button>`).join("")}</div>`;
    const list = (arr) => `<div class="dtlist">${arr.map((x) => `<button type="button" data-go="${x.id}" style="--c:${x._c}"><i class="dtdot"></i><span>${esc(x.title)}</span>${stChip(x)}</button>`).join("")}</div>`;
    p.innerHTML = `<h3>지금 내 머릿속</h3>
      ${sm.headline ? `<p class="bnheadline">${esc(sm.headline)}</p>` : ""}
      <div class="dtstats"><div><b>${areas.length}</b><span>큰 주제</span></div><div><b>${total}</b><span>생각</span></div><div><b>${S.links.length}</b><span>이어진 선</span></div></div>
      ${hot.length ? `<h4>🔥 요즘 가장 많이 생각하는 것</h4>${bars(hot, (x) => x.heat, "#ffb347")}` : ""}
      ${wor.length ? `<h4>😟 고민이 걸려 있는 것</h4>${bars(wor, (x) => x.worry, "#ff6b6b")}` : ""}
      ${up.length ? `<h4>📈 요즘 새로 떠오른 것</h4>${list(up)}` : ""}
      ${cold.length ? `<h4>💤 예전보다 식은 것</h4>${list(cold)}` : ""}
      ${Array.isArray(sm.insights) && sm.insights.length ? `<h4>🔍 눈에 띄는 점</h4><ul class="bnnotes">${sm.insights.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${Array.isArray(sm.changes) && sm.changes.length ? `<h4>🆕 지난 분석과 달라진 점</h4><ul class="bnnotes">${sm.changes.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      <h4>큰 주제</h4>
      <div class="dtareas">${areas.map((a) => `<button type="button" data-go="${a.id}" style="--c:${a._c}"><i class="dtdot"></i><span>${esc(a.title)}</span>${a.heat ? `<em class="bnheat">🔥 ${a.heat}</em>` : ""}<b>${below(a).length}</b></button>`).join("") || `<div class="dtmut">아직 없어요.</div>`}</div>
      <form class="dtadd" data-addto="${S.root.id}"><input name="title" maxlength="80" placeholder="새 큰 주제 이름" autocomplete="off" required><button class="dtbtn pri">+ 큰 주제</button></form>
      <div class="dtmut">${S.run ? `주간 할 일 ${c.week ?? 0}개 · Claude 대화 ${c.claude ?? 0}마디${c.idea ? ` · 아이디어 ${c.idea}개` : ""}를 읽고 그렸어요${sm.period?.from ? ` (${esc(ymd(sm.period.from))}~${esc(ymd(sm.period.to))})` : ""}. ` : "첫 분석이 끝나면 여기에 주제와 온도가 채워져요. "}매주 월요일 새벽에 새로 분석해요. 직접 넣거나 고친 생각은 다시 분석해도 그대로 둬요.</div>`;
    p.onclick = (e) => { const id = e.target.closest("[data-go]")?.dataset.go; if (id) select(id, true); };
    bindAdd(p); return;
  }
  const ps = path(n), cs = kids(n), rel = [...(S.rel.get(n.id) ?? [])].map((id) => S.by.get(id)).filter(Boolean).sort((a, b) => b.heat - a.heat || a._i - b._i), isRoot = n._d === 0;
  const sibs = S.kids.get(n.parent_id ?? "") ?? [], si = sibs.indexOf(n), sub = below(n), st = n.stats;
  const skip = new Set([n.id, ...sub.map((x) => x.id)]), relSkip = new Set([n.id, ...rel.map((x) => x.id), ...(S.root ? [S.root.id] : [])]);
  const by = st.by ?? {}, from = ["week", "claude", "idea", "goal"].filter((w) => by[w]).map((w) => `${SRC[w][1]} ${by[w]}`).join(" · ");
  p.innerHTML = `<div class="dtcrumb">${ps.slice(0, -1).map((x) => `<button type="button" data-go="${x.id}">${esc(x.title)}</button>`).join("<i>›</i>") || "<span>가운데</span>"}<button type="button" class="dtx" data-close aria-label="닫기">✕</button></div>
    <div class="dtphead" style="--c:${n._c}"><i class="dtdot"></i><textarea class="dtptitle" rows="1" maxlength="80" aria-label="생각 이름">${esc(n.title)}</textarea></div>
    ${isRoot ? "" : `<div class="bnmeters"><div title="요즘 얼마나 자주 떠올리는지 (0~100)"><span>🔥 온도</span>${heatBar(n.heat, "#ffb347")}<b>${n.heat}</b></div><div title="막힘·미룸·걱정이 얼마나 드러나는지 (0~100)"><span>😟 고민</span>${heatBar(n.worry, "#ff6b6b")}<b>${n.worry}</b></div></div>
    ${st.n ? `<div class="bnfacts">최근 30일 <b>${st.n30 ?? 0}</b>번 · 전체 <b>${st.n}</b>번${st.first ? ` · 처음 ${esc(ymd(st.first))}` : ""}${st.last ? ` · 마지막 ${esc(ymd(st.last))}` : ""}${from ? `<br><span>${esc(from)}</span>` : ""}</div>${spark(n)}` : n.origin === "me" ? `<div class="bnfacts">✍️ 직접 넣은 생각이에요. 다음 분석 때 비슷한 글이 있으면 온도가 매겨져요.</div>` : ""}
    <h4>상태</h4><div class="dtpick">${STATES.map((s) => `<button type="button" data-state="${s}" class="${n.state === s ? "on" : ""}" style="--oc:${ST[s][1]}" title="${ST[s][2]}">${ST[s][0]} ${s}</button>`).join("")}</div>`}
    <h4>내용 <small>[[다른 생각 이름]] 을 쓰면 그 생각과 이어져요</small></h4>
    <textarea class="dtnote" maxlength="6000" placeholder="이 생각에 대해 적어 두세요.">${esc(n.note)}</textarea><div class="dtsave"></div>
    ${n.src.length ? `<h4>근거 <small>이 생각이 나온 곳</small></h4><ul class="bnsrc">${n.src.map((x) => `<li><span title="${esc(SRC[x.w]?.[1] ?? "")}">${SRC[x.w]?.[0] ?? "•"}</span><time>${esc(md(x.d))}</time><p>${esc(x.t)}</p></li>`).join("")}</ul>` : ""}
    <h4>아래 생각 <small>${cs.length}</small></h4>
    <div class="dtlist">${cs.map((c) => `<button type="button" data-go="${c.id}" style="--c:${c._c}"><i class="dtdot"></i><span>${esc(c.title)}</span>${c.heat ? `<em class="bnheat">🔥 ${c.heat}</em>` : ""}${stChip(c)}</button>`).join("")}</div>
    <form class="dtadd" data-addto="${n.id}"><input name="title" maxlength="80" placeholder="아래에 더할 생각" autocomplete="off" required><button class="dtbtn pri">+ 더하기</button></form>
    ${isRoot ? "" : `<h4>이어진 생각 <small>${rel.length}</small></h4>
    <div class="dtrel">${rel.map((r) => { const why = S.why.get(pairKey(n.id, r.id)); return `<span style="--c:${r._c}"><button type="button" data-go="${r.id}"><i class="dtdot"></i>${esc(r.title)}<small>${esc(path(r)[1]?.title ?? "")}</small>${why ? `<em>${esc(why)}</em>` : ""}</button><button type="button" class="dtunl" data-unlink="${r.id}" title="잇기 끊기" aria-label="잇기 끊기">✕</button></span>`; }).join("")}</div>
    <select class="dtlink" aria-label="다른 생각과 잇기"><option value="">＋ 다른 생각과 잇기…</option>${optTree(relSkip)}</select>`}
    <details class="dtmore"><summary>더 보기 (색 · 옮기기 · 순서 · 지우기)</summary>
      <h4>색</h4><div class="dtcolors">${PALETTE.map((c) => `<button type="button" data-color="${c}" class="${(n.color ?? "").toLowerCase() === c ? "on" : ""}" style="background:${c}" aria-label="색 ${c}"></button>`).join("")}<button type="button" data-color="" class="auto${n.color ? "" : " on"}">${isRoot ? "기본" : "위 가지 색"}</button></div>
      ${isRoot ? `<div class="dtmut">가운데 점은 옮기거나 지울 수 없어요. 이름은 바꿀 수 있어요.</div>` : `<h4>옮기기</h4><select class="dtmove" aria-label="다른 생각 아래로 옮기기">${optTree(skip, n.parent_id, true)}</select>
      <h4>순서</h4><div class="dtord"><button type="button" class="dtbtn" data-ord="-1" ${si <= 0 ? "disabled" : ""}>↑ 앞으로</button><button type="button" class="dtbtn" data-ord="1" ${si >= sibs.length - 1 ? "disabled" : ""}>↓ 뒤로</button></div>
      <button type="button" class="dtbtn danger" data-del>🗑 이 생각 지우기${sub.length ? ` (아래 ${sub.length}개 포함)` : ""}</button>`}
    </details>`;
  p.scrollTop = 0;
  p.onclick = (e) => {
    const go = e.target.closest("[data-go]"); if (go) return select(go.dataset.go, true);
    if (e.target.closest("[data-close]")) return select(null);
    const stb = e.target.closest("[data-state]"); if (stb) return save(n, { state: n.state === stb.dataset.state ? "" : stb.dataset.state }, true);
    const un = e.target.closest("[data-unlink]"); if (un) return unlink(n.id, un.dataset.unlink);
    const col = e.target.closest("[data-color]"); if (col) return save(n, { color: col.dataset.color || null }, true);
    const ord = e.target.closest("[data-ord]"); if (ord) return reorder(n, +ord.dataset.ord);
    if (e.target.closest("[data-del]")) return remove(n);
  };
  const ti = p.querySelector(".dtptitle"), fitT = () => { ti.style.height = "auto"; ti.style.height = ti.scrollHeight + 2 + "px"; };
  fitT(); ti.addEventListener("input", fitT);
  ti.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); ti.blur(); } });
  ti.addEventListener("change", () => { const title = ti.value.replace(/\s+/g, " ").trim(); if (!title) { ti.value = n.title; fitT(); return; } if (title !== n.title) save(n, { title }); });
  const ta = p.querySelector(".dtnote"), sv = p.querySelector(".dtsave"); let t;
  const fitN = () => { ta.style.height = "auto"; ta.style.height = Math.min(420, Math.max(110, ta.scrollHeight + 2)) + "px"; }; fitN(); // 내용이 길면 칸을 키워 한눈에 읽히게
  const flush = async () => { clearTimeout(t); if (ta.value === n.note) return; sv.textContent = "저장 중…"; const ok = await save(n, { note: ta.value }, false, true); sv.textContent = ok ? "✓ 저장됨" : "⚠️ 저장 실패 — 다시 적어 주세요"; if (ok) wikiLinks(n); };
  ta.addEventListener("input", () => { fitN(); sv.textContent = "…"; clearTimeout(t); t = setTimeout(flush, 800); }); ta.addEventListener("blur", flush);
  p.querySelector(".dtlink")?.addEventListener("change", (e) => { if (e.target.value) link(n.id, e.target.value); });
  p.querySelector(".dtmove")?.addEventListener("change", (e) => { if (e.target.value && e.target.value !== n.parent_id) move(n, e.target.value); });
  bindAdd(p);
}
function bindAdd(p) {
  p.querySelectorAll(".dtadd").forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault(); const title = f.title.value.replace(/\s+/g, " ").trim(), parent = S.by.get(f.dataset.addto); if (!title || !parent || f.busy) return; f.busy = true;
    const sort = Math.max(-1, ...kids(parent).map((c) => c.sort)) + 1;
    const { data, error } = await db().from("brain_nodes").insert({ parent_id: parent.id, title, sort }).select(COLS).single();
    f.busy = false; if (bad(error)) return;
    S.nodes.push(data); S.fold.delete(parent.id); changed(true); p.querySelector(".dtadd input")?.focus();
  }));
}

// ── 고치기 ──
function changed(panel) { index(); drawFilters(); drawStage(); if (panel) drawPanel(); if (S.mode === "3d") relight(); }
async function save(n, patch, panel, quiet) {
  const { error } = await db().from("brain_nodes").update(patch).eq("id", n.id);
  if (error) { if (!quiet) bad(error); else console.error(error); if (panel !== false || !quiet) drawPanel(); return false; }
  Object.assign(n, patch); if (quiet) index(); else changed(panel ?? true); return true;
}
async function move(n, parentId) {
  const sort = Math.max(-1, ...(S.kids.get(parentId) ?? []).map((c) => c.sort)) + 1;
  if (await save(n, { parent_id: parentId, sort })) say(`'${n.title}' 을(를) '${S.by.get(parentId)?.title}' 아래로 옮겼어요`);
}
async function reorder(n, step) {
  const sibs = [...(S.kids.get(n.parent_id ?? "") ?? [])], i = sibs.indexOf(n), j = i + step; if (j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  const todo = sibs.map((s, k) => [s, k]).filter(([s, k]) => s.sort !== k);
  const rs = await Promise.all(todo.map(([s, k]) => db().from("brain_nodes").update({ sort: k }).eq("id", s.id)));
  if (rs.some((r) => bad(r.error))) return BRAIN.load();
  todo.forEach(([s, k]) => (s.sort = k)); changed(true);
}
async function remove(n) { // 분석이 만든 점(또는 그 아래에 그런 점이 있으면)은 숨김 — 다시 분석해도 안 돌아옴. 직접 넣은 점만 있으면 완전히 지움
  const sub = below(n), ai = n.origin === "ai" || sub.some((x) => x.origin === "ai");
  if (!confirm(`'${n.title}' 을(를) 지울까요?${sub.length ? `\n아래 생각 ${sub.length}개도 같이 사라져요.` : ""}${ai ? "\n다시 분석해도 이 생각은 다시 나타나지 않아요." : "\n되돌릴 수 없어요."}`)) return;
  const { error } = ai ? await db().from("brain_nodes").update({ hidden: true }).eq("id", n.id) : await db().from("brain_nodes").delete().eq("id", n.id); if (bad(error)) return;
  const gone = new Set([n.id, ...sub.map((x) => x.id)]), parent = n.parent_id;
  S.nodes = S.nodes.filter((x) => !gone.has(x.id)); S.links = S.links.filter((l) => !gone.has(l.a) && !gone.has(l.b));
  S.sel = null; index(); drawFilters(); drawStage(); select(parent, true); say("지웠어요");
}
async function link(x, y, quiet) {
  const row = x < y ? { a: x, b: y } : { a: y, b: x };
  const { error } = await db().from("brain_links").upsert(row, { onConflict: "a,b", ignoreDuplicates: true }); if (bad(error)) { if (!quiet) drawPanel(); return false; }
  if (!S.links.some((l) => l.a === row.a && l.b === row.b)) S.links.push({ ...row, why: "", origin: "me" }); if (!quiet) changed(true); return true;
}
async function unlink(x, y) {
  const row = x < y ? { a: x, b: y } : { a: y, b: x };
  const { error } = await db().from("brain_links").delete().eq("a", row.a).eq("b", row.b); if (bad(error)) return;
  S.links = S.links.filter((l) => !(l.a === row.a && l.b === row.b)); changed(true);
}
async function wikiLinks(n) { // 내용에 [[제목]] 을 쓰면 그 생각과 잇는다 (옵시디언처럼)
  const names = [...n.note.matchAll(/\[\[([^\[\]\n]{1,80})\]\]/g)].map((m) => m[1].trim().toLowerCase()); if (!names.length) return;
  const have = S.rel.get(n.id) ?? new Set(); let made = 0;
  for (const name of new Set(names)) { const t = S.nodes.find((x) => x.id !== n.id && x._d >= 1 && x.title.trim().toLowerCase() === name); if (t && !have.has(t.id) && (await link(n.id, t.id, true))) made++; }
  if (made) { index(); drawStage(); if (S.mode === "3d") relight(); say(`🔗 생각 ${made}개와 이었어요`); if (S.sel === n.id && !/TEXTAREA|INPUT/.test(document.activeElement?.tagName ?? "")) drawPanel(); }
}
BRAIN._dbg = () => ({ G, gn, S, lit, fitD, lblK }); // 콘솔 점검용
})();
