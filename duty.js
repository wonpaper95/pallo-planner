// 🌳 [업무분장] 탭 — 팔로 업무를 나뭇가지(위·아래)와 연관 선으로 이은 지도. 🌌 입체 지도(3D, 옵시디언 그래프 느낌) / 🌿 나뭇가지(목록) / 📋 표(업무분장표·인쇄·엑셀) 세 가지로 본다.
// 업무마다 담당(맨 앞이 주담당)·주기·대신할 사람·설명·바로가기. 🔎 점검 = 담당·대신할 사람·주기가 빈 업무 찾기.
// 보기 = 대표는 언제나, 매니저는 대표가 [매니저에게 공개]한 뒤(duty_meta). 고치기 = 대표만(duty_nodes·duty_links). 🔗 공유 링크(duty-share.html?k=) = 로그인 없이 보기만(duty_shared). 설계 docs/duty/README.md
// 플래너에서는 index.html 의 sb·toast·myRole·myName·previewName 을 쓰고, 공유 페이지에서는 DUTY.mountShared 가 따로 연결한다. 3D 라이브러리(vendor/duty-lib.js, 1.6MB)는 입체 지도를 처음 열 때만 받는다. → window.DUTY
(() => {
const DUTY = (window.DUTY = {});
const LIB = "vendor/duty-lib.js?v=1";
const COLS = "id, parent_id, title, owner, note, cycle, backup, link, color, sort, created_at";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const say = (m) => (typeof toast === "function" ? toast(m) : alert(m));
const bad = (e) => { if (!e) return false; console.error(e); say("저장 실패: " + (e.message || e)); return true; };
const db = () => sb; // 플래너의 연결 (공유 페이지에서는 쓰지 않음)
const PALETTE = ["#7c9cff", "#ff8fb1", "#ffd166", "#5eead4", "#c4a1ff", "#ff9f6e", "#8be28b", "#6ad4ff", "#f9a8d4", "#fca5a5", "#bef264", "#cbd5e1"];
const OWNER_ORDER = ["대표", "매니저", "조교", "리더", "AI 자동화"];
const OWNER_COLOR = { "대표": "#ffd166", "매니저": "#7c9cff", "조교": "#5eead4", "리더": "#ff9f6e", "AI 자동화": "#c4a1ff" };
const CYCLES = ["매일", "매주", "매월", "분기", "수시"];
const FOLD_KEY = "duty-fold", MODE_KEY = "duty-mode", SPIN_KEY = "duty-spin", TV_KEY = "duty-tview", CB_KEY = "duty-colorby";
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// ── 상태 ──
const S = { el: null, nodes: [], links: [], by: new Map(), kids: new Map(), rel: new Map(), root: null,
  sel: null, hover: null, owner: null, mine: false, cycle: null, gap: null, q: "",
  mode: lsGet(MODE_KEY, "3d"), tview: lsGet(TV_KEY, "area"), colorBy: lsGet(CB_KEY, "area"), spin: lsGet(SPIN_KEY, "1") === "1",
  edit: false, shared: false, pub: false, token: undefined, shareOpen: false, fold: new Set(), people: [], ownerList: [], ownerCount: new Map() };
if (!["3d", "tree", "table"].includes(S.mode)) S.mode = "3d";
try { S.fold = new Set(JSON.parse(lsGet(FOLD_KEY, "[]"))); } catch {}
const $ = (q) => S.el.querySelector(q);
const kids = (n) => S.kids.get(n?.id ?? "") ?? [];
const owners = (n) => String(n.owner ?? "").split(/[,/]/).map((x) => x.trim()).filter(Boolean);
const ownerColor = (o) => OWNER_COLOR[o] ?? PALETTE[[...o].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
const chips = (list) => list.map((o, i) => `<b style="--oc:${ownerColor(o)}"${i === 0 && list.length > 1 ? ' class="lead" title="주담당"' : ""}>${esc(o)}</b>`).join("");
const path = (n) => { const out = []; for (let p = n, i = 0; p && i < 40; p = S.by.get(p.parent_id), i++) out.unshift(p); return out; };
const below = (n, out = []) => { for (const c of kids(n)) { out.push(c); below(c, out); } return out; };
const leaf = (n) => n._d >= 1 && !kids(n).length; // 실제로 하는 일 (아래 가지가 없는 업무)
const where = (n) => path(n).slice(1, -1).map((p) => p.title).join(" › ");

function index() {
  for (const n of S.nodes) { n.owner ??= ""; n.note ??= ""; n.cycle ??= ""; n.backup ??= ""; n.link ??= ""; }
  S.by = new Map(S.nodes.map((n) => [n.id, n])); S.kids = new Map(); S.rel = new Map();
  for (const n of S.nodes) { const k = n.parent_id && S.by.has(n.parent_id) ? n.parent_id : ""; if (!S.kids.has(k)) S.kids.set(k, []); S.kids.get(k).push(n); }
  for (const l of S.kids.values()) l.sort((a, b) => a.sort - b.sort || String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
  const tops = S.kids.get("") ?? []; S.root = tops[0] ?? null; let i = 0;
  const walk = (n, d, c) => { n._d = d; n._c = n.color || c; n._i = i++; kids(n).forEach((k, j) => walk(k, d + 1, d === 0 ? PALETTE[j % PALETTE.length] : n._c)); };
  tops.forEach((t) => walk(t, 0, "#ffffff"));
  S.links = S.links.filter((l) => S.by.has(l.a) && S.by.has(l.b));
  for (const l of S.links) for (const [x, y] of [[l.a, l.b], [l.b, l.a]]) { if (!S.rel.has(x)) S.rel.set(x, new Set()); S.rel.get(x).add(y); }
  if (S.sel && !S.by.has(S.sel)) S.sel = null;
  if (S.hover && !S.by.has(S.hover)) S.hover = null;
  const count = new Map(); for (const n of S.nodes) for (const o of owners(n)) count.set(o, (count.get(o) ?? 0) + 1);
  S.ownerCount = count;
  S.ownerList = [...count.keys()].sort((a, b) => { const [x, y] = [OWNER_ORDER.indexOf(a), OWNER_ORDER.indexOf(b)]; return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || count.get(b) - count.get(a) || a.localeCompare(b); });
  if (S.owner && !count.has(S.owner)) S.owner = null;
}
// 🙋 내 업무: 내 역할(대표·매니저) 또는 내 이름이 담당인 업무
function mineSet() { const out = new Set(); if (S.shared) return out; try { const r = { admin: "대표", manager: "매니저", assistant: "조교" }[myRole]; if (r) out.add(r); const nm = String(previewName || myName || "").trim(); if (nm) out.add(nm); } catch {} return out; }
// 🔎 점검: 빈 곳 찾기
const GAPS = {
  noowner: ["담당 없는 업무", (n) => leaf(n) && !owners(n).length],
  nobackup: ["대신할 사람 안 정한 업무", (n) => leaf(n) && owners(n).length > 0 && !n.backup.trim()],
  nocycle: ["주기 안 정한 업무", (n) => leaf(n) && !n.cycle],
};
const filtering = () => !!(S.owner || S.mine || S.cycle || S.gap || S.q);
const matches = (n) => {
  if (S.owner && !owners(n).includes(S.owner)) return false;
  if (S.mine) { const m = mineSet(); if (!owners(n).some((o) => m.has(o))) return false; }
  if (S.cycle && n.cycle !== S.cycle) return false;
  if (S.gap && !GAPS[S.gap][1](n)) return false;
  if (S.q) { const q = S.q.toLowerCase(); if (!`${n.title} ${n.owner} ${n.note} ${n.backup} ${n.cycle}`.toLowerCase().includes(q)) return false; }
  return true;
};
// 밝게 둘 점들: 가리키거나 고른 점(+위 가지·아래 가지·연관), 아니면 거르기에 맞는 점. null = 전부 밝게
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
// 로그인 직후 한 번: 탭 단추는 대표이거나 매니저에게 공개됐을 때만 보임. DB 표가 아직 없으면(마이그레이션 전) 아무에게도 안 보임
DUTY.init = async function () {
  let pub = false, ok = false;
  try { const { data, error } = await db().from("duty_meta").select("published").maybeSingle(); ok = !error; pub = !!data?.published; } catch {}
  S.pub = pub;
  document.querySelector('.seg [data-v="duty"]')?.classList.toggle("hidden", !(ok && (document.body.classList.contains("is-admin") || pub)));
};
const blank = (msg) => { teardown(); S.el.innerHTML = `<div class="dtwrap"><h2 class="dtttlbar">🌳 ${S.shared ? "팔로 업무분장" : "업무분장"}</h2><div class="dtmsg">${msg}</div></div>`; };
DUTY.load = async function () {
  S.el = document.getElementById("dutyView"); S.shared = false;
  S.edit = document.body.classList.contains("is-admin"); // '매니저 화면으로 보기' 중이면 보기만
  if (!S.el.querySelector(".dtwrap")) S.el.innerHTML = `<div class="dtwrap"><div class="dtmsg">불러오는 중…</div></div>`;
  const [a, b, m] = await Promise.all([db().from("duty_nodes").select(COLS).order("sort").order("created_at"), db().from("duty_links").select("a, b"), db().from("duty_meta").select("published").maybeSingle()]);
  if (a.error || b.error || m.error) { console.error(a.error || b.error || m.error); return blank("업무분장을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요."); }
  S.pub = !!m.data?.published; S.nodes = a.data ?? []; S.links = b.data ?? [];
  document.querySelector('.seg [data-v="duty"]')?.classList.toggle("hidden", !(S.edit || S.pub));
  if (!S.edit && !S.pub) return blank("아직 준비 중이에요. 대표님이 공개하면 여기서 볼 수 있어요.");
  if (!S.nodes.length && S.edit && window.DUTY_SEED) { if (!(await seed())) return; }
  if (!S.nodes.length) return blank("아직 준비 중이에요. 대표님이 열면 기본 업무분장이 채워져요.");
  if (S.edit && !S.people.length) db().from("profiles").select("name, role").then(({ data }) => { S.people = [...new Set((data ?? []).filter((p) => p.role !== "assistant" && p.name?.trim()).map((p) => p.name.trim()))].slice(0, 60); if (S.sel && S.people.length && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "")) drawPanel(); });
  index(); shell(); draw();
};
// 공유 페이지 (duty-share.html): 주소의 k 로 읽기 전용
DUTY.mountShared = async function (el) {
  S.el = el; S.shared = true; S.edit = false;
  el.innerHTML = `<div class="dtwrap"><div class="dtmsg">불러오는 중…</div></div>`;
  const k = new URLSearchParams(location.search).get("k") ?? "";
  const client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = k ? await client.rpc("duty_shared", { p_token: k }) : { data: null };
  if (error || !data?.nodes?.length) return blank(error ? "지금은 불러올 수 없어요. 잠시 뒤 다시 열어 주세요." : "이 링크는 꺼졌거나 주소가 잘못됐어요. 보내 준 분께 새 링크를 받아 주세요.");
  S.nodes = data.nodes; S.links = data.links ?? [];
  index(); shell(); draw();
};
async function seed() {
  const rows = [], keys = {}, cyc = {}; let i = 0;
  for (const [c, ts] of Object.entries(DUTY_SEED.cycle ?? {})) for (const t of ts) cyc[t] = c;
  const id = () => `d0000000-0000-4000-8000-${String(++i).padStart(12, "0")}`;
  const walk = (t, parent, sort) => { const me = id(); if (t.k) keys[t.k] = me; rows.push({ id: me, parent_id: parent, title: t.t, owner: t.o ?? "", note: t.n ?? "", cycle: cyc[t.t] ?? "", backup: "", link: DUTY_SEED.link?.[t.t] ?? "", sort }); (t.c ?? []).forEach((c, j) => walk(c, me, j)); };
  walk(DUTY_SEED.tree, null, 0);
  const links = DUTY_SEED.rel.map(([x, y]) => [keys[x], keys[y]]).filter(([x, y]) => x && y && x !== y).map(([x, y]) => (x < y ? { a: x, b: y } : { a: y, b: x }));
  const r1 = await db().from("duty_nodes").upsert(rows, { onConflict: "id", ignoreDuplicates: true }); if (bad(r1.error)) return false;
  const r2 = await db().from("duty_links").upsert(links, { onConflict: "a,b", ignoreDuplicates: true }); if (bad(r2.error)) return false;
  const now = new Date().toISOString(); S.nodes = rows.map((r) => ({ color: null, created_at: now, ...r })); S.links = links;
  say("🌳 기본 업무분장을 채웠어요 — 필요한 대로 더하고 지워 주세요");
  return true;
}

// ── 틀 ──
function shell() {
  if (S.el.querySelector(".dtmain")) return;
  teardown();
  S.el.innerHTML = `<div class="dtwrap${S.shared ? " shared" : ""}">
    <div class="dthead"><div><h2 class="dtttlbar">🌳 ${S.shared ? "팔로 업무분장" : "업무분장"}</h2>
      <div class="dtsub">${S.shared ? "팔로의 업무가 어떻게 나뉘고 이어져 있는지 보는 지도예요. 보기 전용이에요." : "누가 어떤 일을 맡는지, 일끼리 어떻게 이어지는지 한눈에 보는 지도예요."}</div></div>
      ${S.shared ? "" : `<div class="dtpub adminonly"></div>`}</div>
    <div class="dtbar">
      <div class="dtseg" data-seg="mode"><button type="button" data-mode="3d">🌌 입체 지도</button><button type="button" data-mode="tree">🌿 나뭇가지</button><button type="button" data-mode="table">📋 표</button></div>
      <input class="dtq" type="search" placeholder="업무 찾기 (예: 환불, 당근)" autocomplete="off" aria-label="업무 찾기">
      <span class="dtgrow"></span>
      ${S.shared ? "" : `<button type="button" class="dtbtn dtsharebtn adminonly" data-share>🔗 공유 링크</button>`}
    </div>
    <div class="dtfilters"></div>
    <div class="dtsharebox" hidden></div>
    <div class="dtmain">
      <div class="dtstage">
        <div class="dtgraph"></div>
        <div class="dttreebox"></div>
        <div class="dttablebox"></div>
        <div class="dthud"><button type="button" data-colorby title="점 색을 가지별 / 담당별로 바꾸기"></button><button type="button" data-spin title="천천히 돌리기 켜기·끄기">⟳ 회전</button><button type="button" data-fit title="전체가 보이게">⤢ 전체 보기</button></div>
        <div class="dtlegend"><span><i class="l1"></i>나뭇가지 (위·아래)</span><span><i class="l2"></i>연관</span><span class="dthelp">끌기 = 돌리기 · 휠·두 손가락 = 확대 · 점 누르기 = 내용</span></div>
        <div class="dtgmsg" hidden></div>
      </div>
      <div class="dtpanel"></div>
    </div></div>`;
  $(".dtseg").addEventListener("click", (e) => { const m = e.target.closest("[data-mode]")?.dataset.mode; if (!m || m === S.mode) return; S.mode = m; lsSet(MODE_KEY, m); draw(); });
  let qt; $(".dtq").addEventListener("input", (e) => { clearTimeout(qt); qt = setTimeout(() => { S.q = e.target.value.trim(); drawStage(); if (S.mode === "3d") relight(); }, 180); });
  $(".dtq").addEventListener("keydown", (e) => { if (e.key !== "Enter" || e.isComposing) return; S.q = e.target.value.trim(); const hit = S.nodes.filter((n) => n._d > 0 && matches(n)).sort((a, b) => a._i - b._i)[0]; if (hit) select(hit.id, true); });
  $(".dtfilters").addEventListener("click", (e) => { const f = e.target.closest("[data-f]")?.dataset.f; if (f) setFilter(f); });
  $("[data-share]")?.addEventListener("click", () => { S.shareOpen = !S.shareOpen; drawShare(); });
  $(".dtpub")?.addEventListener("click", (e) => { if (e.target.closest("[data-pub]")) publish(!S.pub); });
  $("[data-spin]").addEventListener("click", () => { S.spin = !S.spin; lsSet(SPIN_KEY, S.spin ? "1" : "0"); spinSync(); });
  $("[data-fit]").addEventListener("click", () => { select(null); fit(800); });
  $("[data-colorby]").addEventListener("click", () => { S.colorBy = S.colorBy === "owner" ? "area" : "owner"; lsSet(CB_KEY, S.colorBy); drawHud(); if (S.mode === "3d") { syncGraph(); relight(); } });
  $(".dttreebox").addEventListener("click", (e) => {
    const fold = e.target.closest("[data-fold]"); if (fold) { const id = fold.dataset.fold; S.fold.has(id) ? S.fold.delete(id) : S.fold.add(id); lsSet(FOLD_KEY, JSON.stringify([...S.fold].slice(-400))); drawTree(); return; }
    const all = e.target.closest("[data-foldall]"); if (all) { S.fold = all.dataset.foldall === "1" ? new Set(S.nodes.filter((n) => n._d >= 1 && kids(n).length).map((n) => n.id)) : new Set(); lsSet(FOLD_KEY, JSON.stringify([...S.fold])); drawTree(); return; }
    const row = e.target.closest("[data-id]"); if (row) select(row.dataset.id === S.sel ? null : row.dataset.id);
  });
  $(".dttablebox").addEventListener("click", (e) => {
    const tv = e.target.closest("[data-tv]")?.dataset.tv; if (tv) { S.tview = tv; lsSet(TV_KEY, tv); drawTable(); return; }
    if (e.target.closest("[data-print]")) return printDoc();
    if (e.target.closest("[data-csv]")) return csv();
    const row = e.target.closest("[data-id]"); if (row) select(row.dataset.id === S.sel ? null : row.dataset.id);
  });
  if (!shell.keyed) { shell.keyed = true; addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sel && S.el?.isConnected && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "")) select(null); }); }
}
function draw() { $(".dtwrap").dataset.mode = S.mode; S.el.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === S.mode)); drawPub(); drawHud(); drawFilters(); drawShare(); drawStage(); drawPanel(); }
function drawHud() { const b = $("[data-colorby]"); if (b) b.textContent = S.colorBy === "owner" ? "🎨 색: 담당별" : "🎨 색: 가지별"; }
function drawPub() {
  const box = $(".dtpub"); if (!box) return;
  box.innerHTML = S.pub ? `<span class="on">✅ 매니저에게 공개 중</span><button type="button" class="dtbtn" data-pub>다시 숨기기</button>` : `<span>🔒 초안 · 지금은 대표님만 보여요</span><button type="button" class="dtbtn pri" data-pub>매니저에게 공개</button>`;
}
async function publish(want) {
  if (!S.edit) return;
  if (!confirm(want ? "매니저들에게 업무분장 탭을 보여 줄까요?\n지금 내용 그대로 보이고, 고치는 건 계속 대표님만 할 수 있어요." : "매니저 화면에서 업무분장 탭을 다시 숨길까요?\n내용은 그대로 남아 있어요.")) return;
  const { data, error } = await db().from("duty_meta").update({ published: want, updated_at: new Date().toISOString() }).eq("id", true).select("published");
  if (bad(error)) return; if (!data?.length) return say("공개 상태를 바꾸지 못했어요. 새로고침한 뒤 다시 해 주세요.");
  S.pub = want; drawPub(); say(want ? "✅ 이제 매니저도 업무분장 탭을 볼 수 있어요" : "🔒 다시 대표님만 보여요");
}
function setFilter(f) {
  const [k, v] = f.split(/:(.*)/s);
  if (k === "all") { S.owner = null; S.mine = false; S.cycle = null; S.gap = null; }
  else if (k === "mine") { S.mine = !S.mine; if (S.mine) S.owner = null; }
  else if (k === "owner") { S.owner = S.owner === v ? null : v; if (S.owner) S.mine = false; }
  else if (k === "cycle") S.cycle = S.cycle === v ? null : v;
  else if (k === "gap") S.gap = S.gap === v ? null : v;
  drawFilters(); drawStage(); if (!S.sel) drawPanel(); if (S.mode === "3d") relight();
}
function drawFilters() {
  const cyc = CYCLES.filter((c) => S.nodes.some((n) => n.cycle === c)), mine = mineSet(), any = S.owner || S.mine || S.cycle || S.gap;
  $(".dtfilters").innerHTML = `<button type="button" data-f="all" class="${any ? "" : "on"}">전체</button>`
    + (mine.size && S.nodes.some((n) => owners(n).some((o) => mine.has(o))) ? `<button type="button" data-f="mine" class="${S.mine ? "on" : ""}" title="내 역할이나 이름이 담당으로 적힌 업무">🙋 내 업무</button>` : "")
    + S.ownerList.map((o) => `<button type="button" data-f="owner:${esc(o)}" class="${S.owner === o ? "on" : ""}" style="--oc:${ownerColor(o)}"><i></i>${esc(o)}</button>`).join("")
    + (cyc.length ? `<span class="dtfsep">주기</span>` + cyc.map((c) => `<button type="button" data-f="cycle:${c}" class="cy ${S.cycle === c ? "on" : ""}">${c}</button>`).join("") : "")
    + (S.gap ? `<button type="button" data-f="gap:${S.gap}" class="on gap">🔎 ${GAPS[S.gap][0]} ✕</button>` : "");
}
function drawStage() { if (S.mode === "3d") return drawGraph(); pauseGraph(true); S.mode === "tree" ? drawTree() : drawTable(); }

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
      <span class="dtchips">${n.cycle ? `<u>${esc(n.cycle)}</u>` : ""}${chips(owners(n))}${rel ? `<em title="연관 업무 ${rel}개">🔗 ${rel}</em>` : ""}</span></div>
      ${cs.length && !folded ? `<ul>${cs.map(row).join("")}</ul>` : ""}</li>`;
  };
  const body = (S.kids.get("") ?? []).map(row).join("");
  $(".dttreebox").innerHTML = `<div class="dttreebar"><span>${filt ? `맞는 업무 ${S.nodes.filter(matches).length}개` : `업무 ${S.nodes.length - 1}개`}</span>${filt ? "" : `<button type="button" data-foldall="0">모두 펴기</button><button type="button" data-foldall="1">모두 접기</button>`}</div>
    ${body ? `<ul class="dttree">${body}</ul>` : `<div class="dtmsg">맞는 업무가 없어요.</div>`}`;
}

// ── 📋 표 (업무분장표) ──
function tableData() { // 묶음 목록: 가지별(큰 가지마다 아래 업무를 가지 모양 그대로) / 담당별(사람·역할마다 실제로 하는 일)
  const filt = filtering(), keep = new Set(), secs = [];
  if (filt) for (const n of S.nodes) if (matches(n)) path(n).forEach((p) => keep.add(p.id));
  if (S.tview === "owner") {
    for (const o of [...S.ownerList, ""]) {
      if (S.owner && o !== S.owner) continue;
      const rows = S.nodes.filter((n) => leaf(n) && (o ? owners(n).includes(o) : !owners(n).length) && (!filt || matches(n))).sort((a, b) => a._i - b._i)
        .map((n) => ({ n, lead: !!o && owners(n)[0] === o, others: owners(n).filter((x) => x !== o) }));
      if (rows.length) secs.push({ title: o || "담당 없음", color: o ? ownerColor(o) : "#9ca3af", count: rows.length, lead: rows.filter((r) => r.lead).length, load: CYCLES.map((c) => [c, rows.filter((r) => r.n.cycle === c).length]).filter((x) => x[1]).map((x) => `${x[0]} ${x[1]}`).join(" · "), rows });
    }
  } else for (const a of kids(S.root)) {
    if (filt && !keep.has(a.id)) continue;
    const rows = below(a).filter((n) => !filt || keep.has(n.id)).map((n) => ({ n, indent: n._d - 2, group: kids(n).length > 0, faint: filt && !matches(n) }));
    secs.push({ title: a.title, color: a._c, node: a, count: rows.filter((r) => !r.group && !r.faint).length, rows });
  }
  return secs;
}
function drawTable() {
  const secs = tableData(), byOwner = S.tview === "owner", total = secs.reduce((s, x) => s + x.count, 0);
  const head = byOwner ? ["업무", "가지", "주기", "대신할 사람", "설명"] : ["업무", "담당", "주기", "대신할 사람", "설명"];
  const tr = (r) => { const n = r.n; return `<tr data-id="${n.id}" class="${n.id === S.sel ? "sel" : ""}${r.group ? " grp" : ""}${r.faint ? " faint" : ""}">
      <td class="t" style="--c:${n._c};padding-left:${12 + (r.indent ?? 0) * 18}px">${byOwner ? (r.lead ? `<span class="star" title="주담당">★</span>` : `<span class="star off" title="함께 담당">☆</span>`) : `<i class="dtdot"></i>`}${esc(n.title)}${byOwner && r.others.length ? `<small>함께: ${esc(r.others.join(", "))}</small>` : ""}</td>
      <td>${byOwner ? esc(where(n)) : `<span class="dtchips big">${chips(owners(n))}</span>`}</td><td class="c">${esc(n.cycle)}</td><td>${esc(n.backup)}</td><td class="n">${esc(n.note)}</td></tr>`; };
  $(".dttablebox").innerHTML = `<div class="dttbar"><div class="dtseg sm"><button type="button" data-tv="area" class="${byOwner ? "" : "on"}">가지별</button><button type="button" data-tv="owner" class="${byOwner ? "on" : ""}">담당별</button></div>
      <span>${byOwner ? `사람·역할마다 실제로 하는 일 · ★ 주담당 ☆ 함께` : `업무 ${total}개${filtering() ? " (거른 결과)" : ""}`}</span><button type="button" class="dtbtn" data-print>🖨 인쇄·PDF</button><button type="button" class="dtbtn" data-csv>⬇ 엑셀(CSV)</button></div>
    ${secs.length ? `<div class="dttwrap"><table class="dttable"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      ${secs.map((s) => `<tbody><tr class="sec" ${s.node ? `data-id="${s.node.id}"` : ""} style="--c:${s.color}"><td colspan="5"><i class="dtdot"></i><b>${esc(s.title)}</b><span>${byOwner ? `${s.count}개 (주담당 ${s.lead})${s.load ? ` · ${s.load}` : ""}` : `${s.count}개`}</span>${s.node ? `<span class="dtchips">${chips(owners(s.node))}</span>` : ""}</td></tr>${s.rows.map(tr).join("")}</tbody>`).join("")}</table></div>` : `<div class="dtmsg">맞는 업무가 없어요.</div>`}`;
}
function printDoc() { // 새 창에 표만 담아 인쇄 (PDF 로 저장 가능)
  const secs = tableData(), byOwner = S.tview === "owner", day = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const f = [S.mine && "내 업무", S.owner && `담당 ${S.owner}`, S.cycle && `주기 ${S.cycle}`, S.gap && GAPS[S.gap][0], S.q && `'${S.q}'`].filter(Boolean).join(" · ");
  const w = window.open("", "_blank"); if (!w) return say("새 창이 막혀 있어요. 팝업을 허용한 뒤 다시 눌러 주세요.");
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>팔로 업무분장표</title><style>
    @page { size: A4 landscape; margin: 12mm; } body { font: 11px/1.45 -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #111; margin: 16px; }
    h1 { font-size: 20px; margin: 0 0 2px; } .sub { color: #555; margin-bottom: 12px; } h2 { font-size: 14px; margin: 16px 0 5px; padding-left: 8px; border-left: 5px solid var(--c); break-after: avoid; } h2 span { font-weight: 400; color: #666; font-size: 11px; margin-left: 6px; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; } th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; word-break: keep-all; overflow-wrap: anywhere; } th { background: #f0f0f0; }
    tr { break-inside: avoid; } .grp td { font-weight: 700; background: #fafafa; } small { color: #666; } col.a { width: 25%; } col.b { width: 15%; } col.c { width: 7%; } col.d { width: 13%; }
  </style></head><body><h1>팔로 업무분장표${byOwner ? " (담당별)" : ""}</h1><div class="sub">${esc(day)} 기준${f ? ` · 거르기: ${esc(f)}` : ""}${byOwner ? " · ★ 주담당 ☆ 함께 담당" : ""}</div>
  ${secs.map((s) => `<h2 style="--c:${s.color}">${esc(s.title)}<span>${s.count}개${s.node && s.node.owner ? ` · 담당 ${esc(s.node.owner)}` : ""}${s.load ? ` · ${s.load}` : ""}</span></h2><table><colgroup><col class="a"><col class="b"><col class="c"><col class="d"><col></colgroup><thead><tr><th>업무</th><th>${byOwner ? "가지" : "담당"}</th><th>주기</th><th>대신할 사람</th><th>설명</th></tr></thead><tbody>
    ${s.rows.map((r) => `<tr class="${r.group ? "grp" : ""}"><td style="padding-left:${6 + (r.indent ?? 0) * 12}px">${byOwner ? (r.lead ? "★ " : "☆ ") : ""}${esc(r.n.title)}${byOwner && r.others.length ? ` <small>(함께: ${esc(r.others.join(", "))})</small>` : ""}</td><td>${esc(byOwner ? where(r.n) : r.n.owner)}</td><td>${esc(r.n.cycle)}</td><td>${esc(r.n.backup)}</td><td>${esc(r.n.note)}</td></tr>`).join("")}</tbody></table>`).join("")}
  </body></html>`);
  w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch {} }, 400);
}
function csvText() { // 엑셀에서 바로 열리게 (BOM)
  const filt = filtering(), cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = S.nodes.filter((n) => n._d >= 1 && (!filt || matches(n))).sort((a, b) => a._i - b._i).map((n) => [path(n)[1]?.title ?? "", where(n), n.title, n.owner, n.cycle, n.backup, n.note, n.link, [...(S.rel.get(n.id) ?? [])].map((id) => S.by.get(id)?.title).filter(Boolean).join(", ")]);
  return { count: rows.length, text: "﻿" + [["큰 가지", "위치", "업무", "담당", "주기", "대신할 사람", "설명", "바로가기", "연관 업무"], ...rows].map((r) => r.map(cell).join(",")).join("\r\n") };
}
function csv() {
  const { count, text } = csvText();
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = `팔로-업무분장-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  say(`⬇ 업무 ${count}개를 내려받았어요`);
}

// ── 🌌 입체 지도 ──
let G = null, gn = new Map(), raf = 0, lit = null, fitted = false, touched = false, fitD = 900, lblK = 1, mo = null, T = null;
const RAD = [13, 8.5, 5, 3.2], LBL = [15, 11, 6, 4.2];
const rad = (n) => RAD[Math.min(n._d, 3)];
const colorOf = (n) => (n._d === 0 ? "#ffffff" : S.colorBy === "owner" ? (owners(n)[0] ? ownerColor(owners(n)[0]) : "#6b7280") : n._c); // 점 색: 가지별 / 담당별(주담당)
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
  const r = rad(n), d = Math.min(n._d, 3), grp = new T.Group(), col = new T.Color(colorOf(n));
  const ball = new T.Mesh((nodeObject.geo ||= {})[d] ||= new T.SphereGeometry(r, 24, 18), new T.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: d === 0 ? 0.75 : 0.45, transparent: true }));
  const glow = new T.Sprite(new T.SpriteMaterial({ map: halo(), color: col, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
  glow.scale.set(r * 7.5, r * 7.5, 1); glow.raycast = () => {}; // 빛 번짐은 누를 수 없게 (옆 점을 가림)
  const text = new DutyLib.SpriteText(n.title, LBL[d] * lblK, d <= 1 ? "#ffffff" : "#dfe3ff");
  text.fontFace = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Malgun Gothic", "Noto Sans KR", sans-serif';
  text.fontWeight = d <= 1 ? "700" : "500"; text.fontSize = 72;
  if (d <= 1) { text.backgroundColor = "rgba(10,9,28,.62)"; text.padding = 2.2; text.borderRadius = 3; }
  text.material.depthWrite = false; text.material.transparent = true; text.position.set(0, -(r + LBL[d] * lblK * (d <= 1 ? 1.25 : 0.95)), 0); text.renderOrder = 2;
  grp.add(glow, ball, text); g.__ball = ball; g.__glow = glow; g.__text = text; g.__o = g.__o ?? 1;
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
  G.d3Force("link").distance((l) => (l.rel ? 95 : l.td === 1 ? 135 : l.td === 2 ? 62 : 34)).strength((l) => (l.rel ? 0.025 : 0.85));
  G.d3Force("charge").strength((g) => { const d = S.by.get(g.id)?._d ?? 3; return d === 0 ? -320 : d === 1 ? -230 : d === 2 ? -70 : -34; }).distanceMax(420);
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
  if (!S.shared) { mo = new MutationObserver(() => pauseGraph(S.mode !== "3d")); mo.observe(document.body, { attributes: true, attributeFilter: ["class"] }); } // 다른 탭으로 가면 멈춤
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
    g.sig = `${n.title}|${colorOf(n)}|${n._d}`; next.set(n.id, g);
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
  fitD = (R / Math.sin(half)) * 0.8; G.scene().fog.density = 0.5 / fitD;
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
    if (n._d >= 2 && !(lit && on)) { const far = fitD * (n._d === 2 ? 1.02 : 0.55), dist = Math.hypot(cam.x - g.x, cam.y - g.y, cam.z - g.z); t = Math.max(0, Math.min(1, (far - dist) / (far * 0.3))); }
    g.__ball.material.opacity = 0.15 + 0.85 * g.__o; g.__glow.material.opacity = (g.id === focus ? 1 : 0.6) * g.__o; g.__text.material.opacity = t * (on ? g.__o : g.__o * (n._d <= 1 ? 0.9 : 0.4));
    const s = g.id === S.sel ? 1.35 : 1; if (g.__ball.scale.x !== s) g.__ball.scale.setScalar(s);
  }
}
function tip(n) { if (!n) return ""; const os = owners(n); return `<div class="dttip"><b>${esc(n.title)}</b>${os.length || n.cycle ? `<span>${esc([os.join(" · "), n.cycle].filter(Boolean).join("  |  "))}</span>` : ""}${n.note ? `<p>${esc(n.note.length > 90 ? n.note.slice(0, 90) + "…" : n.note)}</p>` : ""}</div>`; }
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
  else if (S.mode === "table") { $(".dttablebox").querySelectorAll("tr.sel").forEach((r) => r.classList.remove("sel")); const r = S.sel && $(`.dttable tr[data-id="${S.sel}"]`); if (r) { r.classList.add("sel"); r.scrollIntoView({ block: "nearest", behavior: "smooth" }); } }
  else { relight(); if (S.sel) fly(S.sel); }
}
const optTree = (skip, cur, deep) => { // 고르기 목록: 가지 모양 그대로 들여쓰기. deep = 뺄 점의 아래 가지도 같이 뺌(옮기기)
  const out = []; const walk = (n) => { if (skip?.has(n.id)) { if (!deep) kids(n).forEach(walk); return; } out.push(`<option value="${n.id}"${n.id === cur ? " selected" : ""}>${"　".repeat(Math.min(n._d, 4))}${esc(n.title)}</option>`); kids(n).forEach(walk); };
  (S.kids.get("") ?? []).forEach(walk); return out.join("");
};
const navTabs = () => [...document.querySelectorAll(".seg [data-v]")].filter((b) => b.dataset.v !== "duty").map((b) => [b.dataset.v, (b.childNodes[0]?.textContent ?? b.textContent).trim()]); // 플래너 탭 목록 (바로가기 고르기)
function linkBtn(n) { // ↗ 바로가기: 플래너 탭(#sales) 은 플래너에서만, 주소는 어디서나
  const l = n.link.trim(); if (!l) return "";
  if (l[0] === "#") { if (S.shared) return ""; const b = document.querySelector(`.seg [data-v="${l.slice(1).replace(/[^\w-]/g, "")}"]`); if (!b || getComputedStyle(b).display === "none") return ""; return `<button type="button" class="dtbtn dtgo" data-tab="${esc(b.dataset.v)}">↗ 플래너 ‘${esc((b.childNodes[0]?.textContent ?? "").trim())}’ 탭 열기</button>`; }
  return /^https?:\/\//i.test(l) ? `<a class="dtbtn dtgo" href="${esc(l)}" target="_blank" rel="noopener noreferrer">↗ 바로가기 열기</a>` : "";
}
function drawPanel() {
  const p = $(".dtpanel"), n = S.sel && S.by.get(S.sel);
  p.classList.toggle("on", !!n); p.onclick = null; $(".dtwrap").classList.toggle("focus", !!n); // 폰: 고르면 위 절반 지도 · 아래 절반 내용
  if (!n) { // 한눈에 보기
    const areas = kids(S.root), total = S.nodes.length - 1, max = Math.max(1, ...S.ownerCount.values());
    const gaps = Object.entries(GAPS).map(([k, [label, f]]) => [k, label, S.nodes.filter(f).length]);
    p.innerHTML = `<h3>한눈에 보기</h3>
      <div class="dtstats"><div><b>${areas.length}</b><span>큰 가지</span></div><div><b>${total}</b><span>업무</span></div><div><b>${S.links.length}</b><span>연관 선</span></div></div>
      <h4>담당별 업무 수</h4>
      <div class="dtbars">${S.ownerList.map((o) => `<button type="button" data-f="owner:${esc(o)}" class="${S.owner === o ? "on" : ""}" style="--oc:${ownerColor(o)}"><span>${esc(o)}</span><i><u style="width:${Math.round((S.ownerCount.get(o) / max) * 100)}%"></u></i><b>${S.ownerCount.get(o)}</b></button>`).join("") || `<div class="dtmut">아직 담당이 적힌 업무가 없어요.</div>`}</div>
      ${S.shared ? "" : `<h4>🔎 점검 <small>빈 곳 찾기</small></h4>
      <div class="dtgaps">${gaps.map(([k, label, c]) => `<button type="button" data-f="gap:${k}" class="${S.gap === k ? "on" : ""}${c ? "" : " ok"}"><span>${label}</span><b>${c ? c : "✓ 없음"}</b></button>`).join("")}</div>`}
      <h4>큰 가지</h4>
      <div class="dtareas">${areas.map((a) => `<button type="button" data-go="${a.id}" style="--c:${a._c}"><i class="dtdot"></i><span>${esc(a.title)}</span><b>${below(a).length}</b></button>`).join("")}</div>
      ${S.edit ? `<form class="dtadd" data-addto="${S.root.id}"><input name="title" maxlength="80" placeholder="새 큰 가지 이름" autocomplete="off" required><button class="dtbtn pri">+ 큰 가지</button></form>
      <div class="dtmut">대표님만 고칠 수 있어요. 점(또는 줄)을 누르면 이름·담당·주기·설명을 바꾸고, 아래 가지를 더하거나 지우고, 다른 업무와 연관 선을 이을 수 있어요.</div>` : `<div class="dtmut">점(또는 줄)을 누르면 담당과 설명, 이어진 업무가 보여요.${S.shared ? "" : " 내용을 바꾸고 싶으면 대표님께 말씀해 주세요."}</div>`}`;
    p.onclick = (e) => { const f = e.target.closest("[data-f]")?.dataset.f; if (f) return setFilter(f); const id = e.target.closest("[data-go]")?.dataset.go; if (id) select(id, true); };
    bindAdd(p); return;
  }
  const ps = path(n), cs = kids(n), rel = [...(S.rel.get(n.id) ?? [])].map((id) => S.by.get(id)).filter(Boolean).sort((a, b) => a._i - b._i), os = owners(n), isRoot = n._d === 0;
  const sibs = S.kids.get(n.parent_id ?? "") ?? [], si = sibs.indexOf(n), sub = below(n);
  const skip = new Set([n.id, ...sub.map((x) => x.id)]), relSkip = new Set([n.id, ...rel.map((x) => x.id), ...(S.root ? [S.root.id] : [])]);
  const pick = [...new Set([...OWNER_ORDER, ...S.ownerList])], ppl = S.people.filter((x) => !pick.includes(x)), tabs = S.edit ? navTabs() : [], isTab = n.link.startsWith("#"), go = linkBtn(n);
  p.innerHTML = `<div class="dtcrumb">${ps.slice(0, -1).map((x) => `<button type="button" data-go="${x.id}">${esc(x.title)}</button>`).join("<i>›</i>") || "<span>맨 위</span>"}<button type="button" class="dtx" data-close aria-label="닫기">✕</button></div>
    <div class="dtphead" style="--c:${n._c}"><i class="dtdot"></i>${S.edit ? `<textarea class="dtptitle" rows="1" maxlength="80" aria-label="업무 이름">${esc(n.title)}</textarea>` : `<h3>${esc(n.title)}</h3>`}</div>
    ${isRoot ? "" : `<h4>담당${S.edit ? " <small>맨 앞이 주담당</small>" : ""}</h4>
    ${S.edit ? `<div class="dtpick">${pick.map((o) => `<button type="button" data-own="${esc(o)}" class="${os.includes(o) ? "on" : ""}" style="--oc:${ownerColor(o)}">${esc(o)}</button>`).join("")}</div>
      <div class="dtrow2"><input class="dtowner" maxlength="120" value="${esc(n.owner)}" placeholder="직접 적기 (쉼표로 여럿)" aria-label="담당 직접 적기">${ppl.length ? `<select class="dtppl" aria-label="사람 이름으로 더하기"><option value="">＋ 사람</option>${ppl.map((x) => `<option>${esc(x)}</option>`).join("")}</select>` : ""}</div>`
      : `<div class="dtchips big">${chips(os) || `<span class="dtmut">정해지지 않았어요</span>`}</div>`}
    ${S.edit ? `<h4>주기</h4><div class="dtpick cyc">${CYCLES.map((c) => `<button type="button" data-cyc="${c}" class="${n.cycle === c ? "on" : ""}">${c}</button>`).join("")}</div>
      <h4>대신할 사람 <small>담당이 빠질 때</small></h4><input class="dtbackup" maxlength="120" value="${esc(n.backup)}" placeholder="예: 다른 매니저, 대표" list="dtpplist" aria-label="대신할 사람"><datalist id="dtpplist">${[...pick, ...ppl].map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`
      : n.cycle || n.backup ? `<div class="dtfacts">${n.cycle ? `<div><span>주기</span><b>${esc(n.cycle)}</b></div>` : ""}${n.backup ? `<div><span>대신할 사람</span><b>${esc(n.backup)}</b></div>` : ""}</div>` : ""}`}
    <h4>설명</h4>
    ${S.edit ? `<textarea class="dtnote" maxlength="4000" placeholder="어떻게 하는 일인지, 규칙·주의할 점을 적어 두세요.">${esc(n.note)}</textarea><div class="dtsave"></div>` : n.note ? `<p class="dtnotev">${esc(n.note)}</p>` : `<div class="dtmut">설명이 아직 없어요.</div>`}
    ${go ? `<div class="dtgobox">${go}</div>` : ""}
    ${S.edit && !isRoot ? `<h4>바로가기 <small>이 일을 하는 곳</small></h4><select class="dtlinktab" aria-label="바로가기"><option value="">없음</option>${tabs.map(([v, t]) => `<option value="#${esc(v)}"${n.link === "#" + v ? " selected" : ""}>플래너 · ${esc(t)}</option>`).join("")}<option value="url"${n.link && !isTab ? " selected" : ""}>직접 주소 넣기…</option></select>
      <input class="dtlinkurl" maxlength="500" value="${isTab ? "" : esc(n.link)}" placeholder="https://…" aria-label="바로가기 주소"${n.link && !isTab ? "" : " hidden"}>` : ""}
    <h4>아래 가지 <small>${cs.length}</small></h4>
    <div class="dtlist">${cs.map((c) => `<button type="button" data-go="${c.id}" style="--c:${c._c}"><i class="dtdot"></i><span>${esc(c.title)}</span>${chips(owners(c))}</button>`).join("") || (S.edit ? "" : `<div class="dtmut">없어요</div>`)}</div>
    ${S.edit ? `<form class="dtadd" data-addto="${n.id}"><input name="title" maxlength="80" placeholder="아래에 더할 업무 이름" autocomplete="off" required><button class="dtbtn pri">+ 더하기</button></form>` : ""}
    ${isRoot ? "" : `<h4>연관 업무 <small>${rel.length}</small></h4>
    <div class="dtrel">${rel.map((r) => `<span style="--c:${r._c}"><button type="button" data-go="${r.id}"><i class="dtdot"></i>${esc(r.title)}<small>${esc(path(r)[1]?.title ?? "")}</small></button>${S.edit ? `<button type="button" class="dtunl" data-unlink="${r.id}" title="연관 끊기" aria-label="연관 끊기">✕</button>` : ""}</span>`).join("") || (S.edit ? "" : `<div class="dtmut">없어요</div>`)}</div>
    ${S.edit ? `<select class="dtlink" aria-label="연관 업무 잇기"><option value="">＋ 연관 업무 잇기…</option>${optTree(relSkip)}</select>` : ""}`}
    ${S.edit ? `<details class="dtmore"><summary>더 보기 (색 · 옮기기 · 순서 · 지우기)</summary>
      <h4>색</h4><div class="dtcolors">${PALETTE.map((c) => `<button type="button" data-color="${c}" class="${(n.color ?? "").toLowerCase() === c ? "on" : ""}" style="background:${c}" aria-label="색 ${c}"></button>`).join("")}<button type="button" data-color="" class="auto${n.color ? "" : " on"}">${isRoot ? "기본" : "위 가지 색"}</button></div>
      ${isRoot ? `<div class="dtmut">맨 위 항목은 옮기거나 지울 수 없어요. 이름은 바꿀 수 있어요.</div>` : `<h4>옮기기</h4><select class="dtmove" aria-label="다른 가지 아래로 옮기기">${optTree(skip, n.parent_id, true)}</select>
      <h4>순서</h4><div class="dtord"><button type="button" class="dtbtn" data-ord="-1" ${si <= 0 ? "disabled" : ""}>↑ 앞으로</button><button type="button" class="dtbtn" data-ord="1" ${si >= sibs.length - 1 ? "disabled" : ""}>↓ 뒤로</button></div>
      <button type="button" class="dtbtn danger" data-del>🗑 이 업무 지우기${sub.length ? ` (아래 ${sub.length}개 포함)` : ""}</button>`}
    </details>` : ""}`;
  p.scrollTop = 0;
  p.onclick = (e) => {
    const go = e.target.closest("[data-go]"); if (go) return select(go.dataset.go, true);
    if (e.target.closest("[data-close]")) return select(null);
    const tab = e.target.closest("[data-tab]"); if (tab) return document.querySelector(`.seg [data-v="${tab.dataset.tab}"]`)?.click();
    if (!S.edit) return;
    const own = e.target.closest("[data-own]"); if (own) { const o = own.dataset.own, cur = owners(n); return save(n, { owner: (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]).join(", ") }, true); }
    const cy = e.target.closest("[data-cyc]"); if (cy) return save(n, { cycle: n.cycle === cy.dataset.cyc ? "" : cy.dataset.cyc }, true);
    const un = e.target.closest("[data-unlink]"); if (un) return unlink(n.id, un.dataset.unlink);
    const col = e.target.closest("[data-color]"); if (col) return save(n, { color: col.dataset.color || null }, true);
    const ord = e.target.closest("[data-ord]"); if (ord) return reorder(n, +ord.dataset.ord);
    if (e.target.closest("[data-del]")) return remove(n);
  };
  if (!S.edit) return;
  const ti = p.querySelector(".dtptitle"), fitT = () => { ti.style.height = "auto"; ti.style.height = ti.scrollHeight + 2 + "px"; };
  fitT(); ti.addEventListener("input", fitT);
  ti.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); ti.blur(); } });
  ti.addEventListener("change", () => { const title = ti.value.replace(/\s+/g, " ").trim(); if (!title) { ti.value = n.title; fitT(); return; } if (title !== n.title) save(n, { title }); });
  const ow = p.querySelector(".dtowner"); ow?.addEventListener("change", () => { const owner = owners({ owner: ow.value }).join(", "); if (owner !== n.owner) save(n, { owner }, true); else ow.value = owner; });
  p.querySelector(".dtppl")?.addEventListener("change", (e) => { const v = e.target.value; if (v && !owners(n).includes(v)) save(n, { owner: [...owners(n), v].join(", ") }, true); });
  const bk = p.querySelector(".dtbackup"); bk?.addEventListener("change", () => { const backup = bk.value.replace(/\s+/g, " ").trim(); if (backup !== n.backup) save(n, { backup }, true); });
  const ta = p.querySelector(".dtnote"), st = p.querySelector(".dtsave"); let t;
  const flush = async () => { clearTimeout(t); if (ta.value === n.note) return; st.textContent = "저장 중…"; const ok = await save(n, { note: ta.value }, false, true); st.textContent = ok ? "✓ 저장됨" : "⚠️ 저장 실패 — 다시 적어 주세요"; };
  ta.addEventListener("input", () => { st.textContent = "…"; clearTimeout(t); t = setTimeout(flush, 800); }); ta.addEventListener("blur", flush);
  const lt = p.querySelector(".dtlinktab"), lu = p.querySelector(".dtlinkurl");
  lt?.addEventListener("change", () => { if (lt.value === "url") { lu.hidden = false; lu.focus(); return; } lu.hidden = true; if (lt.value !== n.link) save(n, { link: lt.value }, true); });
  lu?.addEventListener("change", () => { const link = lu.value.trim(); if (link && !/^https?:\/\//i.test(link)) { say("주소는 https:// 로 시작해야 해요"); return; } if (link !== n.link) save(n, { link }, true); });
  p.querySelector(".dtlink")?.addEventListener("change", (e) => { if (e.target.value) link(n.id, e.target.value); });
  p.querySelector(".dtmove")?.addEventListener("change", (e) => { if (e.target.value && e.target.value !== n.parent_id) move(n, e.target.value); });
  bindAdd(p);
}
function bindAdd(p) {
  p.querySelectorAll(".dtadd").forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault(); const title = f.title.value.replace(/\s+/g, " ").trim(), parent = S.by.get(f.dataset.addto); if (!title || !parent || f.busy) return; f.busy = true;
    const sort = Math.max(-1, ...kids(parent).map((c) => c.sort)) + 1;
    const { data, error } = await db().from("duty_nodes").insert({ parent_id: parent.id, title, sort }).select(COLS).single();
    f.busy = false; if (bad(error)) return;
    S.nodes.push(data); S.fold.delete(parent.id); changed(true); p.querySelector(".dtadd input")?.focus();
  }));
}

// ── 고치기 (대표) ──
function changed(panel) { index(); drawFilters(); drawStage(); if (panel) drawPanel(); if (S.mode === "3d") relight(); }
async function save(n, patch, panel, quiet) {
  const { error } = await db().from("duty_nodes").update(patch).eq("id", n.id);
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
  const rs = await Promise.all(todo.map(([s, k]) => db().from("duty_nodes").update({ sort: k }).eq("id", s.id)));
  if (rs.some((r) => bad(r.error))) return DUTY.load();
  todo.forEach(([s, k]) => (s.sort = k)); changed(true);
}
async function remove(n) {
  const sub = below(n);
  if (!confirm(`'${n.title}' 을(를) 지울까요?${sub.length ? `\n아래 가지 ${sub.length}개도 같이 지워져요.` : ""}\n되돌릴 수 없어요.`)) return;
  const { error } = await db().from("duty_nodes").delete().eq("id", n.id); if (bad(error)) return;
  const gone = new Set([n.id, ...sub.map((x) => x.id)]), parent = n.parent_id;
  S.nodes = S.nodes.filter((x) => !gone.has(x.id)); S.links = S.links.filter((l) => !gone.has(l.a) && !gone.has(l.b));
  S.sel = null; index(); drawFilters(); drawStage(); select(parent, true); say("지웠어요");
}
async function link(x, y) {
  const row = x < y ? { a: x, b: y } : { a: y, b: x };
  const { error } = await db().from("duty_links").upsert(row, { onConflict: "a,b", ignoreDuplicates: true }); if (bad(error)) return drawPanel();
  if (!S.links.some((l) => l.a === row.a && l.b === row.b)) S.links.push(row); changed(true);
}
async function unlink(x, y) {
  const row = x < y ? { a: x, b: y } : { a: y, b: x };
  const { error } = await db().from("duty_links").delete().eq("a", row.a).eq("b", row.b); if (bad(error)) return;
  S.links = S.links.filter((l) => !(l.a === row.a && l.b === row.b)); changed(true);
}
DUTY._dbg = () => ({ G, gn, S, lit, fitD, lblK, csvText, tableData }); // 콘솔 점검용

// ── 🔗 공유 링크 (대표) ──
const shareUrl = (t) => new URL("duty-share.html?k=" + t, document.baseURI.split(/[?#]/)[0]).href;
async function drawShare() {
  const box = $(".dtsharebox"); if (!box) return;
  box.hidden = !(S.shareOpen && S.edit); $("[data-share]")?.classList.toggle("on", !box.hidden); if (box.hidden) return;
  if (S.token === undefined) { box.innerHTML = `<div class="dtmut">확인 중…</div>`; const { data, error } = await db().from("duty_share").select("token").order("created_at", { ascending: false }).limit(1); if (bad(error)) { S.shareOpen = false; box.hidden = true; return; } S.token = data?.[0]?.token ?? null; }
  box.innerHTML = S.token
    ? `<b>🔗 공유 링크가 켜져 있어요</b><div class="dtmut">이 주소를 받은 사람은 로그인 없이 볼 수 있어요. 보기만 되고 고칠 수는 없어요. (매니저 공개 여부와는 따로예요)</div>
       <div class="dtshareurl"><input readonly value="${esc(shareUrl(S.token))}" aria-label="공유 주소"><button type="button" class="dtbtn pri" data-act="copy">복사</button><a class="dtbtn" href="${esc(shareUrl(S.token))}" target="_blank" rel="noopener">열어 보기</a></div>
       <div class="dtshareact"><button type="button" class="dtbtn" data-act="new">새 주소로 바꾸기</button><button type="button" class="dtbtn danger" data-act="off">공유 끄기</button></div>`
    : `<b>🔗 공유 링크가 꺼져 있어요</b><div class="dtmut">링크를 만들면 플래너 계정이 없는 사람도 이 업무분장을 볼 수 있어요. 보기만 되고, 언제든 끌 수 있어요.</div>
       <div class="dtshareact"><button type="button" class="dtbtn pri" data-act="new">링크 만들기</button></div>`;
  box.onclick = async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act; if (!act) return;
    if (act === "copy") { const inp = box.querySelector("input"); try { await navigator.clipboard.writeText(inp.value); } catch { inp.select(); document.execCommand("copy"); } return say("📋 주소를 복사했어요"); }
    if (act === "off" && !confirm("공유를 끌까요? 지금 주소는 바로 안 열리게 돼요.")) return;
    if (act === "new" && S.token && !confirm("새 주소로 바꿀까요? 예전 주소는 바로 안 열리게 돼요.")) return;
    const old = await db().from("duty_share").delete().neq("token", ""); if (bad(old.error)) return;
    S.token = null;
    if (act === "new") { const token = [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join(""); const { error } = await db().from("duty_share").insert({ token }); if (bad(error)) return drawShare(); S.token = token; say("🔗 공유 링크를 만들었어요"); }
    else say("공유를 껐어요");
    drawShare();
  };
}
})();
