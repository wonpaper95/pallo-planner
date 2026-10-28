// ✅ [조교체크리스트] 탭 (옛 이름 조체) — claude.ai 아티팩트 '조교 체크리스트'를 플래너로 옮김. 지점 공용(매니저·조교 링크·대표), 다른 기기 실시간 (DB 0060_jc)
// 평일오전·평일오후·주말 페이지마다: 할일 × 이번 주(월~일) 칸에 담당 조교 이름표 + 메모장 2개. 지점 공용: 조교 이름(색)·대타 명단·링크 모음
// index.html 의 sb·me·myRole·isBoss·previewTeam·teams·myName·esc·toast·fail·today·W·view 를 씀 → window.JC
(() => {
const JC = (window.JC = { team: null, page: "am", names: [], tasks: [], cells: new Map(), memos: [], subs: [], links: [], shell: "", editSub: null });
const V = () => document.getElementById("jcView");
const PAGES = [["am", "평일오전"], ["pm", "평일오후"], ["we", "주말"], ["links", "링크 모음"]];
const COLORS = ["#ffb3ba", "#ffdfba", "#ffffba", "#d9ffb3", "#baffc9", "#baffe0", "#baf4ff", "#bad7ff", "#c2baff", "#e0baff", "#ffbaf2", "#ffbad4"];
const LANGS = ["일본어", "중국어"];
const SLOTS = ["10:40~13:10", "10:40~16:10(휴게1시간)", "17:40~20:10", "18:40~22:10", "19:40~22:10"];
const KD = ["일", "월", "화", "수", "목", "금", "토"];
const admin = () => myRole === "admin";
const jo = () => myRole === "assistant";
try { JC.page = localStorage.getItem("jc-page") || "am"; } catch {}

// 공휴일: 양력 고정(대체공휴일 규칙 2023~) + 음력·임시는 해마다 손으로 (2027년은 정부 달력 나오면 추가)
const SUB_OK = [[3, 1, "삼일절"], [5, 5, "어린이날"], [8, 15, "광복절"], [10, 3, "개천절"], [10, 9, "한글날"], [12, 25, "성탄절"]];
const NO_SUB = [[1, 1, "신정"], [6, 6, "현충일"]];
const LUNAR = { "2026-02-16": "설 연휴", "2026-02-17": "설날", "2026-02-18": "설 연휴", "2026-05-24": "부처님오신날", "2026-05-25": "부처님오신날 대체공휴일",
  "2026-06-03": "전국동시지방선거(임시공휴일)", "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴", "2026-09-28": "추석 대체공휴일" };
const holiday = (key) => {
  if (LUNAR[key]) return LUNAR[key];
  const y = +key.slice(0, 4), map = {};
  for (const [m, d, n] of NO_SUB) map[W.ymd(new Date(y, m - 1, d))] = n;
  for (const [m, d, n] of SUB_OK) { const dt = new Date(y, m - 1, d), dow = dt.getDay(); map[W.ymd(dt)] = n; if (dow === 0 || dow === 6) map[W.ymd(new Date(y, m - 1, d + (dow === 0 ? 1 : 2)))] = n + " 대체공휴일"; }
  return map[key] ?? null;
};
const week = () => { const mon = W.monday(today()); return Array.from({ length: 7 }, (_, i) => { const k = W.add(mon, i), d = W.parse(k), h = holiday(k); return { k, label: `${d.getMonth() + 1}/${d.getDate()}(${KD[d.getDay()]})`, gray: d.getDay() === 5 || !!h, h }; }); }; // 금 = 공식 휴무 회색
const dLabel = (s) => { const d = W.parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${KD[d.getDay()]})`; };
const ts = (s) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const opts = (list, sel) => list.map((v) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(v)}</option>`).join("");
const chip = (n) => `<span class="jcchip" style="background:${esc(n.color)}">${esc(n.name)}</span>`;
const pinFirst = (a) => a.slice().sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0));

JC.load = async function () {
  if (admin()) { if (!JC.team) { try { JC.team = +localStorage.getItem("jc-team") || null; } catch {} } if (!teams.some((t) => t.id === JC.team)) JC.team = teams[0]?.id ?? null; }
  else JC.team = previewTeam ?? (await sb.rpc("my_team")).data ?? (await sb.rpc("assistant_team")).data ?? null; // 매니저·미리보기: 우리 지점 · 조교: 링크 지점
  if (!JC.team) { JC.shell = ""; V().innerHTML = `<div class="jcbar"><h2>✅ 조교체크리스트</h2></div><div class="jcpanel mut">지점이 정해져야 볼 수 있어요 — 대표님께 말씀해 주세요</div>`; return; }
  const t = JC.team, mon = W.monday(today());
  const [n, tk, me2, s, l] = await Promise.all([
    sb.from("jc_names").select("*").eq("team_id", t).order("sort").order("id"),
    sb.from("jc_tasks").select("*").eq("team_id", t).order("sort").order("id"),
    sb.from("jc_memos").select("*").eq("team_id", t).order("created_at", { ascending: false }).limit(900),
    sb.from("jc_subs").select("*").eq("team_id", t).order("created_at", { ascending: false }),
    sb.from("jc_links").select("*").eq("team_id", t).order("sort").order("id")]);
  if ([n, tk, me2, s, l].some((r) => fail(r.error))) return;
  const c = tk.data.length ? await sb.from("jc_cells").select("*").in("task_id", tk.data.map((x) => x.id)).gte("day", mon).lte("day", W.add(mon, 6)) : { data: [] };
  if (fail(c.error)) return;
  if (t !== JC.team) return; // 그 사이 지점 바꿈
  Object.assign(JC, { names: n.data, tasks: tk.data, memos: me2.data, subs: s.data, links: l.data, cells: new Map(c.data.map((x) => [`${x.task_id}|${x.day}`, x.names])) });
  render();
  listen();
};

// ⚡ 실시간: 다른 사람이 바꾸면 0.3초 뒤 다시 읽기 (조교체크리스트 탭 보고 있을 때만)
let chan = null;
function listen() {
  if (chan) return;
  const soon = () => { clearTimeout(soon.t); soon.t = setTimeout(() => view === "jc" && JC.load(), 300); };
  chan = sb.channel("jc");
  for (const tb of ["jc_names", "jc_tasks", "jc_cells", "jc_memos", "jc_subs", "jc_links"]) chan.on("postgres_changes", { event: "*", schema: "public", table: tb }, soon);
  chan.subscribe();
}

// 입력칸(폼)은 지점·페이지 바뀔 때만 새로 그림 → 실시간 새로고침에 적던 글자가 안 날아감
function render() {
  const key = `${JC.team}|${JC.page}|${admin()}`;
  if (JC.shell !== key) { JC.shell = key; V().innerHTML = shell(); }
  V().querySelectorAll("[data-pg]").forEach((b) => b.classList.toggle("on", b.dataset.pg === JC.page));
  if (JC.page === "links") return renderLinks();
  renderSubOpts(); renderSubs(); renderMemos(); renderNames(); renderGrid();
}
function shell() {
  const tabs = `<nav class="jctabs">${PAGES.map(([id, label]) => `<button data-pg="${id}">${label}</button>`).join("")}</nav>`;
  const top = `<div class="jcbar"><h2>✅ 조교체크리스트 <small class="mut">지점 공용 · 실시간</small></h2>
    ${admin() ? `<select id="jcTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === JC.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}</div>`;
  if (JC.page === "links") return top + tabs + `<section class="jcpanel"><h3>링크 모음</h3>
    <form class="jcform" data-f="link"><input name="label" maxlength="40" placeholder="제목 (예: 네이버 예약 관리)"><input name="url" maxlength="500" inputmode="url" placeholder="https://..."><button class="btn">추가</button></form>
    <div id="jcLinks" class="jclist"></div></section>`;
  const now = today();
  return top + tabs + `<section class="jcpanel"><h3>조교 대타 명단 <span class="mut">순서: 매니저에게 보고 → 대타 명단 작성 → 단톡에서 대타 부탁 → 대타 가능한 사람 이름 넣기</span></h3>
    <form class="jcform jcsubf" data-f="sub"><select name="out"></select><select name="lang">${opts(LANGS)}</select>
      <span class="mut">시작일</span><input type="date" name="start" value="${now}"><span class="mut">종료일</span><input type="date" name="end" value="${now}">
      <select name="slot">${opts(SLOTS)}</select><select name="in"></select><button class="btn">추가</button></form>
    <div id="jcSubs" class="jclist"></div></section>
  <section class="jcpanel"><h3>메모장</h3><div class="jcmemo">
    <div><h4>매니저 → 조교님 <span class="mut">(체크박스 = 조교 이행 확인)</span></h4>
      <form class="jcform" data-f="memo" data-kind="manager"><textarea name="body" maxlength="600" placeholder="조교님께 전달할 내용을 적어주세요"></textarea><button class="btn">추가</button></form>
      <div id="jcMemoM" class="jclist jcscroll"></div></div>
    <div><h4>조교님 → 매니저</h4>
      <form class="jcform" data-f="memo" data-kind="ta"><textarea name="body" maxlength="600" placeholder="매니저님께 전달할 내용을 적어주세요"></textarea><button class="btn">추가</button></form>
      <div id="jcMemoT" class="jclist jcscroll"></div></div></div></section>
  <section class="jcpanel"><details id="jcNamesBox"><summary>조교 이름 관리 <span class="mut">(여기서 바꾸면 모든 탭 드롭다운에 바로 반영돼요)</span></summary>
    <div id="jcNames" class="jcnames"></div>
    <form class="jcform" data-f="name"><input name="name" maxlength="20" placeholder="조교 이름 입력"><button class="btn">이름 추가</button></form></details></section>
  <section class="jcpanel"><div class="jcgbar"><h3>체크리스트</h3><button type="button" class="btn ghost" data-act="today">오늘로 이동</button></div>
    <form class="jcform" data-f="task"><input name="body" maxlength="120" placeholder="할일 추가 (■ 로 시작하면 구간 제목 줄)"><button class="btn">추가</button></form>
    <div id="jcGrid"></div></section>`;
}

function renderSubOpts() {
  const list = ["미정", ...JC.names.map((n) => n.name)];
  V().querySelectorAll(".jcsubf select[name=out], .jcsubf select[name=in]").forEach((s) => { const cur = s.value; s.innerHTML = opts(list, list.includes(cur) ? cur : "미정"); });
}
function renderSubs() {
  if (JC.editSub && JC.subs.some((s) => s.id === JC.editSub) && V().querySelector(".jcsub.editing")) return; // 고치는 중이면 그대로
  const names = ["미정", ...JC.names.map((n) => n.name)];
  V().querySelector("#jcSubs").innerHTML = JC.subs.length ? JC.subs.map((s) => s.id === JC.editSub
    ? `<div class="jcsub editing" data-id="${s.id}"><span><b>${esc(s.out_name)}</b> <span class="mut">(이름은 수정 후 고정)</span></span>
        <span class="jcrow"><select name="lang">${opts(LANGS, s.lang)}</select><span class="mut">시작일</span><input type="date" name="start" value="${s.start_day}"><span class="mut">종료일</span><input type="date" name="end" value="${s.end_day}">
        <select name="slot">${opts(SLOTS.includes(s.slot) ? SLOTS : [s.slot, ...SLOTS], s.slot)}</select><select name="in">${opts(names.includes(s.in_name) ? names : [s.in_name, ...names], s.in_name)}</select>
        <button class="btn" data-act="subsave">저장</button><button class="btn ghost" data-act="subcancel">취소</button></span></div>`
    : `<div class="jcsub" data-id="${s.id}"><span class="jcgrow"><b>${esc(s.out_name)}</b> → <b>${esc(s.in_name)}</b> · ${esc(s.start_day === s.end_day ? dLabel(s.start_day) : `${dLabel(s.start_day)} ~ ${dLabel(s.end_day)}`)} · ${esc(s.slot)} · ${esc(s.lang)}</span>
        <button class="jcicon" data-act="subedit" title="수정">✏️</button>${jo() ? "" : `<button class="jcicon" data-del="sub" title="삭제 (매니저만)">✕</button>`}</div>`).join("")
    : `<div class="mut jcempty">등록된 대타가 없어요.</div>`;
}
function renderMemos() {
  const pg = JC.memos.filter((m) => m.page === JC.page);
  for (const [id, kind] of [["#jcMemoM", "manager"], ["#jcMemoT", "ta"]]) {
    const list = pinFirst(pg.filter((m) => m.kind === kind).slice(0, 150));
    V().querySelector(id).innerHTML = list.length ? list.map((m) => `<div class="jcmi ${m.done ? "done" : ""} ${m.pinned ? "pinned" : ""}" data-id="${m.id}">
        ${kind === "manager" ? `<input type="checkbox" data-act="memodone" ${m.done ? "checked" : ""}>` : ""}
        <div class="jcgrow"><div class="jcmt">${esc(m.body)}</div><div class="jcts">${ts(m.created_at)}${m.by_name ? ` · ${esc(m.by_name)}` : ""}</div></div>
        <button class="jcicon jcpin ${m.pinned ? "on" : ""}" data-act="memopin" title="${m.pinned ? "고정 해제" : "고정"}">📌</button><button class="jcicon" data-del="memo" title="삭제">✕</button></div>`).join("")
      : `<div class="mut jcempty">아직 작성된 메모가 없어요.</div>`;
  }
}
function renderNames() {
  const box = V().querySelector("#jcNames");
  if (box.querySelector(".jcname-in")) return; // 이름 고치는 중
  box.innerHTML = JC.names.length ? JC.names.map((n) => `<span class="jcname" data-id="${n.id}"><button class="jcchip" data-act="rename" style="background:${esc(n.color)}" title="눌러서 이름 고치기">${esc(n.name)}</button>
      <button class="jcdot" data-act="color" style="background:${esc(n.color)}" title="색상 변경"></button><button class="jcicon" data-del="name" title="삭제">✕</button></span>`).join("")
    : `<div class="mut jcempty">등록된 조교 이름이 없어요. 아래에서 추가해주세요.</div>`;
}
function renderGrid(toToday) {
  const box = V().querySelector("#jcGrid"), tasks = JC.tasks.filter((t) => t.page === JC.page);
  if (!tasks.length) { box.innerHTML = `<div class="mut jcempty jccenter">아직 등록된 할일이 없어요. 위 입력창에서 추가해보세요.</div>`; return; }
  const days = week(), tk = today(), keep = box.querySelector(".jcscrollx")?.scrollLeft ?? null;
  const cell = (t, d) => {
    const ids = JC.cells.get(`${t.id}|${d.k}`) ?? [], ns = ids.map((id) => JC.names.find((n) => n.id === id)).filter(Boolean);
    return `<td class="jccell ${d.gray ? "gray" : ""} ${d.k === tk ? "today" : ""}"><button class="jccb" data-act="cell" data-task="${t.id}" data-day="${d.k}">${ns.slice(0, 2).map(chip).join("")}${ns.length > 2 ? `<span class="jcmore">+${ns.length - 2}</span>` : ""}${ns.length ? "" : `<span class="jcplus">+</span>`}</button></td>`;
  };
  box.innerHTML = `<div class="jcscrollx"><table class="jcgrid"><thead><tr><th class="jctask">할일</th>${days.map((d) => `<th class="jcday ${d.gray ? "gray" : ""} ${d.k === tk ? "today" : ""}" ${d.h ? `title="${esc(d.h)}"` : ""}>${d.label}</th>`).join("")}</tr></thead>
    <tbody>${tasks.map((t) => t.body.startsWith("■") ? `<tr data-task="${t.id}" class="jcsec"><td colspan="8"><div class="jcrow"><span class="jcdrag" draggable="true" title="드래그해서 순서 바꾸기 (PC)">⠿</span><b>${esc(t.body.slice(1).trim())}</b><button class="jcicon" data-del="task" title="삭제">✕</button></div></td></tr>` // ■ 로 시작 = 구간 제목 줄 (칸 없음)
      : `<tr data-task="${t.id}"><td class="jctask"><div class="jcrow"><span class="jcdrag" draggable="true" title="드래그해서 순서 바꾸기 (PC)">⠿</span><span class="jcgrow">${esc(t.body)}</span><button class="jcicon" data-del="task" title="삭제">✕</button></div></td>${days.map((d) => cell(t, d)).join("")}</tr>`).join("")}</tbody></table></div>`;
  const sc = box.querySelector(".jcscrollx");
  if (toToday || keep === null) setTimeout(() => scrollToday(V().querySelector(".jcscrollx"), false)); else sc.scrollLeft = keep; // 그 사이 다시 그렸으면 새 표 기준
}
function scrollToday(sc, smooth) {
  const el = sc?.querySelector("th.today"); if (!el) return;
  const fix = sc.querySelector("th.jctask").offsetWidth, left = Math.max(0, el.offsetLeft - fix - (sc.clientWidth - fix - el.clientWidth) / 2); // 왼쪽 고정 칸에 안 가리게
  smooth ? sc.scrollTo({ left, behavior: "smooth" }) : (sc.scrollLeft = left);
}
function renderLinks() {
  const box = V().querySelector("#jcLinks");
  box.innerHTML = JC.links.length ? pinFirst(JC.links).map((l) => `<div class="jclink ${l.pinned ? "pinned" : ""}" data-link="${l.id}"><span class="jcdrag" draggable="true" title="드래그해서 순서 바꾸기 (PC)">⠿</span>
      <a class="jcgrow" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>
      <button class="jcicon jcpin ${l.pinned ? "on" : ""}" data-act="linkpin" title="${l.pinned ? "고정 해제" : "고정"}">📌</button><button class="jcicon" data-del="link" title="삭제">✕</button></div>`).join("")
    : `<div class="mut jcempty">저장된 링크가 없어요. 위에서 추가해주세요.</div>`;
}

// ── 담당자 고르기·색 고르기 작은 창 (body 에 하나씩, 다시 그려도 안 닫힘) ──
const pop = (id) => document.getElementById(id) ?? document.body.appendChild(Object.assign(document.createElement("div"), { id, className: "jcpop", hidden: true }));
const place = (el, btn, w, h) => { const r = btn.getBoundingClientRect(); el.style.left = Math.max(16, Math.min(r.left, innerWidth - w - 16)) + "px"; el.style.top = (r.bottom + 6 + h > innerHeight ? Math.max(16, r.top - h - 6) : r.bottom + 6) + "px"; };
let cellCtx = null, colorId = null;
function openCell(btn) {
  cellCtx = { task: +btn.dataset.task, day: btn.dataset.day };
  const sel = JC.cells.get(`${cellCtx.task}|${cellCtx.day}`) ?? [], el = pop("jcCellPop");
  el.innerHTML = `<div class="jcpt">담당자 선택</div><div class="jcplist">${JC.names.length ? JC.names.map((n) => `<label><input type="checkbox" value="${n.id}" ${sel.includes(n.id) ? "checked" : ""}>${chip(n)}</label>`).join("")
    : `<div class="mut">등록된 조교가 없어요. "조교 이름 관리"에서 먼저 추가해주세요.</div>`}</div><button class="btn ghost jcclose">닫기</button>`;
  el.hidden = false; el.style.width = "220px"; place(el, btn, 220, 260);
}
function openColor(btn, id) {
  colorId = id; const cur = JC.names.find((n) => n.id === id)?.color, el = pop("jcColorPop");
  el.innerHTML = `<div class="jcsw">${COLORS.map((c) => `<button data-color="${c}" class="${c === cur ? "on" : ""}" style="background:${c}"></button>`).join("")}</div>`;
  el.hidden = false; el.style.width = ""; place(el, btn, 142, 150);
}
const closePops = () => { for (const id of ["jcCellPop", "jcColorPop"]) { const el = document.getElementById(id); if (el) el.hidden = true; } cellCtx = colorId = null; };
document.addEventListener("change", async (e) => {
  if (!e.target.closest("#jcCellPop") || !cellCtx) return;
  const { task, day } = cellCtx, ids = [...document.querySelectorAll("#jcCellPop input:checked")].map((c) => +c.value);
  JC.cells.set(`${task}|${day}`, ids); renderGrid();
  fail((await sb.from("jc_cells").upsert({ task_id: task, day, names: ids })).error);
});
document.addEventListener("click", async (e) => {
  if (e.target.closest(".jcclose")) return closePops();
  const sw = e.target.closest("#jcColorPop [data-color]");
  if (sw) { const id = colorId; closePops(); if (id) { JC.names.find((n) => n.id === id).color = sw.dataset.color; render(); fail((await sb.from("jc_names").update({ color: sw.dataset.color }).eq("id", id)).error); } return; }
  if (!e.target.closest(".jcpop") && !e.target.closest("[data-act=cell]") && !e.target.closest("[data-act=color]")) closePops();
});

// ── 지우기: 한 번 누르면 '확인?' 3초, 한 번 더 = 지움 ──
const armed = {};
const DEL = { task: "jc_tasks", name: "jc_names", memo: "jc_memos", link: "jc_links", sub: "jc_subs" };
async function del(btn) {
  const row = btn.closest("[data-id],[data-task],[data-link]"), kind = btn.dataset.del, id = +(row.dataset.id ?? row.dataset.task ?? row.dataset.link), k = kind + id;
  if (!armed[k]) { const t = btn.textContent; btn.textContent = "확인?"; btn.classList.add("arm"); armed[k] = setTimeout(() => { delete armed[k]; btn.textContent = t; btn.classList.remove("arm"); }, 3000); return; }
  clearTimeout(armed[k]); delete armed[k];
  if (fail((await sb.from(DEL[kind]).delete().eq("id", id)).error)) return;
  JC.load();
}
const nextSort = (list) => list.reduce((m, x) => Math.max(m, x.sort ?? 0), 0) + 1;
async function reorder(table, list, from, to) {
  const ids = list.map((x) => x.id), a = ids.indexOf(from), b = ids.indexOf(to); if (a < 0 || b < 0 || a === b) return;
  const next = list.slice(); next.splice(b, 0, ...next.splice(a, 1));
  next.forEach((x, i) => (x.sort = i + 1)); for (const a of [JC.tasks, JC.links]) a.sort((x, y) => x.sort - y.sort); render();
  const errs = await Promise.all(next.map((x, i) => sb.from(table).update({ sort: i + 1 }).eq("id", x.id)));
  errs.some((r) => fail(r.error)); JC.load();
}

function bind() {
  const v = V(); if (v.dataset.bound) return; v.dataset.bound = 1;
  v.addEventListener("change", (e) => {
    if (e.target.id === "jcTeam") { JC.team = +e.target.value; try { localStorage.setItem("jc-team", JC.team); } catch {} closePops(); JC.load(); }
    const f = e.target.closest(".jcsubf"); if (f && e.target.name === "start" && (!f.end.value || f.end.value < f.start.value)) f.end.value = f.start.value;
  });
  v.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, t = JC.team; let r;
    if (f.dataset.f === "task") { const body = f.body.value.trim(); if (!body) return; f.body.value = ""; r = await sb.from("jc_tasks").insert({ team_id: t, page: JC.page, body, sort: nextSort(JC.tasks.filter((x) => x.page === JC.page)) }); }
    if (f.dataset.f === "name") { const name = f.name.value.trim(); if (!name) return; f.name.value = ""; r = await sb.from("jc_names").insert({ team_id: t, name, color: COLORS[JC.names.length % COLORS.length], sort: JC.names.length }); }
    if (f.dataset.f === "memo") { const body = f.body.value.trim(); if (!body) return; f.body.value = ""; r = await sb.from("jc_memos").insert({ team_id: t, page: JC.page, kind: f.dataset.kind, body, by_name: myName ?? "" }); }
    if (f.dataset.f === "link") {
      const label = f.label.value.trim(); let url = f.url.value.trim(); if (!label || !url) return toast("제목과 주소를 넣어 주세요");
      if (!/^https?:\/\//i.test(url)) url = "https://" + url; f.label.value = f.url.value = "";
      r = await sb.from("jc_links").insert({ team_id: t, label, url, sort: nextSort(JC.links) });
    }
    if (f.dataset.f === "sub") {
      r = await sb.from("jc_subs").insert({ team_id: t, out_name: f.out.value, lang: f.lang.value, start_day: f.start.value, end_day: f.end.value < f.start.value ? f.start.value : f.end.value, slot: f.slot.value, in_name: f.in.value });
      if (!r.error) f.start.value = f.end.value = today();
    }
    if (r && !fail(r.error)) JC.load();
  });
  v.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.target.matches(".jcform textarea")) { e.preventDefault(); e.target.form.requestSubmit(); } }); // 메모: Enter = 추가, Shift+Enter = 줄바꿈
  v.addEventListener("click", async (e) => {
    const pg = e.target.closest("[data-pg]");
    if (pg) { JC.page = pg.dataset.pg; try { localStorage.setItem("jc-page", JC.page); } catch {} closePops(); render(); if (JC.page !== "links") renderGrid(true); return; }
    const d = e.target.closest("[data-del]"); if (d) return del(d);
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act, id = +b.closest("[data-id]")?.dataset.id;
    if (act === "today") return scrollToday(v.querySelector(".jcscrollx"), true);
    if (act === "cell") return openCell(b);
    if (act === "color") return openColor(b, id);
    if (act === "memodone") { const m = JC.memos.find((x) => x.id === id); m.done = b.checked; renderMemos(); return fail((await sb.from("jc_memos").update({ done: b.checked }).eq("id", id)).error); }
    if (act === "memopin" || act === "linkpin") {
      const lid = act === "linkpin" ? +b.closest("[data-link]").dataset.link : id, table = act === "linkpin" ? "jc_links" : "jc_memos", x = (act === "linkpin" ? JC.links : JC.memos).find((y) => y.id === lid);
      x.pinned = !x.pinned; render(); return fail((await sb.from(table).update({ pinned: x.pinned }).eq("id", lid)).error);
    }
    if (act === "subedit") { JC.editSub = id; v.querySelector(".jcsub.editing")?.classList.remove("editing"); renderSubs(); return; }
    if (act === "subcancel") { JC.editSub = null; v.querySelector(".jcsub.editing")?.classList.remove("editing"); return renderSubs(); }
    if (act === "subsave") {
      const row = b.closest(".jcsub"), q = (n) => row.querySelector(`[name=${n}]`).value, start = q("start"), end = q("end");
      JC.editSub = null; row.classList.remove("editing");
      if (!fail((await sb.from("jc_subs").update({ lang: q("lang"), start_day: start, end_day: end < start ? start : end, slot: q("slot"), in_name: q("in") }).eq("id", id)).error)) JC.load();
      return;
    }
    if (act === "rename") {
      const n = JC.names.find((x) => x.id === id), inp = Object.assign(document.createElement("input"), { className: "jcname-in", value: n.name, maxLength: 20 });
      b.replaceWith(inp); inp.focus(); inp.select(); let done = false;
      const commit = async () => { if (done) return; done = true; const name = inp.value.trim() || n.name; inp.remove(); n.name = name; renderNames(); renderSubOpts(); renderGrid();
        if (!fail((await sb.from("jc_names").update({ name }).eq("id", id)).error)) JC.load(); };
      inp.onblur = commit; inp.onkeydown = (ev) => { if (ev.key === "Enter" && !ev.isComposing) inp.blur(); };
    }
  });
  // ⠿ 끌어서 순서 바꾸기 (PC): 할일 줄 · 링크 줄
  let drag = null;
  const target = (el) => drag && el.closest(drag.sel);
  v.addEventListener("dragstart", (e) => {
    const h = e.target.closest?.(".jcdrag"); if (!h) return;
    const row = h.closest("[data-task],[data-link]"), task = row.dataset.task;
    drag = task ? { sel: "tr[data-task]", attr: "task", id: +task } : { sel: "[data-link]", attr: "link", id: +row.dataset.link };
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(drag.id)); row.classList.add("jcdragging");
  });
  v.addEventListener("dragover", (e) => { const row = target(e.target); if (!row) return; e.preventDefault(); v.querySelectorAll(".jcover").forEach((x) => x.classList.remove("jcover")); if (+row.dataset[drag.attr] !== drag.id) row.classList.add("jcover"); });
  v.addEventListener("drop", (e) => {
    const row = target(e.target); if (!row) return; e.preventDefault();
    const to = +row.dataset[drag.attr], { attr, id } = drag; drag = null;
    if (attr === "task") reorder("jc_tasks", JC.tasks.filter((t) => t.page === JC.page), id, to); else reorder("jc_links", pinFirst(JC.links), id, to);
  });
  v.addEventListener("dragend", () => { drag = null; v.querySelectorAll(".jcdragging,.jcover").forEach((x) => x.classList.remove("jcdragging", "jcover")); });
}
const load0 = JC.load;
JC.load = async () => { bind(); return load0(); };
})();
