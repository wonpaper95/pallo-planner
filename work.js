// 🕒 [근무기록] 탭 — 조교 근무기록지 (구글 시트 대구영어·울산·대구일중 이식). 지점 공용(대표·매니저·조교 링크), 다른 기기 실시간 (DB 0064_work)
// 달마다 줄(조교·대타 필요·대타 해준) × 날짜 칸(월~목 오전/오후, 금·토·일 한 칸) = 시간 + 사유 + 🔴빠짐/🟢대타. 총시간·급여(시급) 자동, 계좌·연락처는 대표·매니저만
// 정해진 시간(근무시간 글, work-core.js)과 다르게 적으면 사유 칸이 빨개짐 — 사유 없으면 칸에 '!' 표시
// index.html 의 sb·myRole·previewTeam·teams·myName·esc·toast·fail·today·W·view 를 씀 → window.WR
(() => {
const WR = (window.WR = { team: null, ym: null, month: null, rows: [], cells: new Map(), people: [], shell: "" });
const V = () => document.getElementById("wrView");
const { KD, slotsOf, num, parseShift, off, needReason, planText } = WRC;
const SL = { am: "오전", pm: "오후", d: "" };
const KIND = { need: "대타 필요한 사람", done: "대타 해준 사람" };
const admin = () => myRole === "admin";
const jo = () => myRole === "assistant";
const ymOf = (s) => s.slice(0, 7) + "-01";
const ymAdd = (ym, n) => { const d = W.parse(ym); d.setMonth(d.getMonth() + n, 1); return W.ymd(d); };
const ymLabel = (ym) => `${+ym.slice(0, 4)}년 ${+ym.slice(5, 7)}월`;
const won = (n) => Math.round(n).toLocaleString("ko-KR") + "원";
const hrs = (n) => `${Math.round(n * 100) / 100}h`;
const key = (row, day, slot) => `${row}|${day}|${slot}`;
const plans = new Map(); // 근무시간 글 → 정해진 시간 (같은 글 다시 안 읽음)
const planOf = (r) => { if (r.kind !== "staff") return {}; if (!plans.has(r.shift)) plans.set(r.shift, parseShift(r.shift)); return plans.get(r.shift); };
const dowOf = (k) => W.parse(k).getDay();

WR.load = async function () {
  if (admin()) { if (!WR.team) { try { WR.team = +localStorage.getItem("wr-team") || null; } catch {} } if (!teams.some((t) => t.id === WR.team)) WR.team = teams[0]?.id ?? null; }
  else WR.team = previewTeam ?? (await sb.rpc("my_team")).data ?? (await sb.rpc("assistant_team")).data ?? null; // 매니저·미리보기: 우리 지점 · 조교: 링크 지점
  if (!WR.ym) WR.ym = ymOf(today());
  if (!WR.team) { WR.shell = ""; V().innerHTML = `<div class="wrbar"><h2>🕒 조교 근무기록</h2></div><div class="wrpanel mut">지점이 정해져야 볼 수 있어요 — 대표님께 말씀해 주세요</div>`; return; }
  const t = WR.team, ym = WR.ym;
  const [m, r, p] = await Promise.all([
    sb.from("work_months").select("*").eq("team_id", t).eq("ym", ym).maybeSingle(),
    sb.from("work_rows").select("*").eq("team_id", t).eq("ym", ym).order("sort").order("id"),
    jo() ? { data: [] } : sb.from("work_people").select("*").eq("team_id", t).order("name")]);
  if ([m, r, p].some((x) => fail(x.error))) return;
  const c = r.data.length ? await sb.from("work_cells").select("*").in("row_id", r.data.map((x) => x.id)) : { data: [] };
  if (fail(c.error) || t !== WR.team || ym !== WR.ym) return; // 그 사이 지점·달 바꿈
  Object.assign(WR, { month: m.data, rows: r.data, people: p.data, cells: new Map(c.data.map((x) => [key(x.row_id, x.day, x.slot), x])) });
  render();
  listen();
};

// ⚡ 실시간: 다른 사람이 바꾸면 0.3초 뒤 다시 읽기 (근무기록 탭 보고 있을 때만)
let chan = null;
function listen() {
  if (chan) return;
  const soon = () => { clearTimeout(soon.t); soon.t = setTimeout(() => view === "wr" && WR.load(), 300); };
  chan = sb.channel("wr");
  for (const tb of ["work_months", "work_rows", "work_cells"]) chan.on("postgres_changes", { event: "*", schema: "public", table: tb }, soon);
  chan.subscribe();
}

// 이 달 날짜 + (시트에서 옮겨 온) 달 밖 날짜 중 기록 있는 날
function days() {
  const ks = new Set(), d = W.parse(WR.ym);
  for (const x = new Date(d); x.getMonth() === d.getMonth(); x.setDate(x.getDate() + 1)) ks.add(W.ymd(x));
  for (const c of WR.cells.values()) ks.add(c.day);
  return [...ks].sort().map((k) => { const dw = dowOf(k); return { k, dw, slots: slotsOf(dw), out: ymOf(k) !== WR.ym }; });
}
const rowCells = (r) => [...WR.cells.values()].filter((c) => c.row_id === r.id);
const rowHours = (r) => rowCells(r).reduce((s, c) => s + (num(c.val) ?? 0), 0);
const rate = () => WR.month?.rate ?? 10320;

// 입력칸(시급·안내·계좌)은 지점·달 바뀔 때만 새로 그림 → 실시간 새로고침에 적던 글자가 안 날아감
function render() {
  const sk = `${WR.team}|${WR.ym}|${admin()}|${jo()}`;
  if (WR.shell !== sk) { WR.shell = sk; V().innerHTML = shell(); }
  const n = V().querySelector("#wrNotice"); if (n && document.activeElement !== n) n.value = WR.month?.notice ?? "";
  const ra = V().querySelector("#wrRate"); if (ra && document.activeElement !== ra) ra.value = rate();
  renderGrid(); renderPeople();
}
function shell() {
  return `<div class="wrbar"><h2>🕒 조교 근무기록 <small class="mut">지점 공용 · 실시간</small></h2>
    <div class="wrrow">${admin() ? `<select id="wrTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === WR.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}
      <button class="btn ghost" data-act="prev">‹</button><b class="wrym">${ymLabel(WR.ym)}</b><button class="btn ghost" data-act="next">›</button>
      ${WR.ym !== ymOf(today()) ? `<button class="btn ghost" data-act="now">이번 달</button>` : ""}</div></div>
  <section class="wrpanel"><details id="wrNoticeBox"><summary>📌 안내 <span class="mut">시간 적는 법 · 추가근무 사유 규칙 (누구나 고칠 수 있어요)</span></summary>
    <textarea id="wrNotice" maxlength="4000" placeholder="예) 추가근무는 사유를 적지 않으면 인정하지 않아요"></textarea></details>
    <div class="wrhow mut">칸을 누르면 시간을 적어요. <b>정해진 시간과 다르면 사유</b>를 적어 주세요 — 사유가 없으면 칸에 <span class="wrneed-dot">!</span> 표시가 남아요. 🔴 빠짐 = 대타 필요 · 🟢 대타 근무 · 모서리 ◥ = 사유 있음</div></section>
  <section class="wrpanel"><div class="wrgbar"><h3>근무표</h3><span id="wrSum" class="mut"></span>
    <span class="wrrow"><span class="mut">시급</span><input id="wrRate" type="number" min="1000" max="100000" step="10" inputmode="numeric"><span class="mut">원</span>
    <button class="btn ghost" data-act="today">오늘로</button></span></div>
    <div id="wrGrid"></div>
    <form class="wrform" data-f="row"><input name="name" maxlength="40" placeholder="조교 이름"><input name="shift" maxlength="300" placeholder="근무시간 (예: 월수 오후 (19:00~22:00)(3h))"><button class="btn">조교 추가</button></form></section>
  ${jo() ? "" : `<section class="wrpanel"><details id="wrPeopleBox"><summary>💳 계좌 · 연락처 <span class="mut">대표·매니저만 보여요 (조교 링크엔 안 보임)</span></summary>
    <div id="wrPeople"></div>
    <form class="wrform" data-f="person"><input name="name" maxlength="40" placeholder="이름"><input name="phone" maxlength="40" placeholder="연락처"><input name="bank" maxlength="200" placeholder="은행 계좌번호"><button class="btn">추가</button></form></details></section>`}`;
}

function renderGrid() {
  const box = V().querySelector("#wrGrid");
  if (!WR.rows.length) {
    box.innerHTML = `<div class="wrempty"><div class="mut">${ymLabel(WR.ym)} 근무표가 아직 없어요.</div><button class="btn" data-act="newmonth">지난달 명단으로 ${ymLabel(WR.ym)} 근무표 만들기</button></div>`;
    V().querySelector("#wrSum").textContent = ""; return;
  }
  const ds = days(), tk = today(), keep = box.querySelector(".wrscroll")?.scrollLeft ?? null;
  let need = 0, totH = 0;
  const staff = WR.rows.filter((r) => r.kind === "staff");
  const cell = (r, d, s) => {
    const c = WR.cells.get(key(r.id, d.k, s)), plan = planOf(r), planned = plan[d.dw + s];
    const nr = r.kind === "staff" && needReason(plan, d.dw, s, c); if (nr) need++;
    const o = r.kind === "staff" && c ? off(plan, d.dw, s, c.val) : 0;
    const tip = [planned ? `정해진 시간 ${planned}h` : "", c?.reason ? `사유: ${c.reason}` : "", nr ? "⚠️ 정해진 시간과 달라요 — 사유를 적어 주세요" : "", c?.by_name ? `입력: ${c.by_name}` : ""].filter(Boolean).join("\n");
    return `<td class="wrc ${planned ? "plan" : ""} ${d.dw === 5 ? "fri" : ""} ${d.out ? "om" : ""} ${d.k === tk ? "today" : ""} ${c?.mark ? "mk-" + c.mark : ""} ${nr ? "need" : ""} ${c?.reason ? "has" : ""} ${s === "am" ? "l" : ""}"
      ${tip ? `title="${esc(tip)}"` : ""}><button data-act="cell" data-row="${r.id}" data-day="${d.k}" data-slot="${s}">${esc(c?.val ?? "")}${o ? `<i class="${o > 0 ? "up" : "dn"}">${o > 0 ? "+" : ""}${o}</i>` : ""}</button></td>`;
  };
  const head1 = ds.map((d) => `<th colspan="${d.slots.length}" class="wrd ${d.dw === 5 ? "fri" : ""} ${d.out ? "om" : ""} ${d.k === tk ? "today" : ""}" data-day="${d.k}">${+d.k.slice(5, 7)}/${+d.k.slice(8)}<br><small>${KD[d.dw]}</small></th>`).join("");
  const head2 = ds.map((d) => d.slots.map((s) => `<th class="wrs ${s === "am" ? "l" : ""} ${d.k === tk ? "today" : ""}">${SL[s]}</th>`).join("")).join("");
  const body = WR.rows.map((r) => {
    let lab;
    if (r.kind === "staff") { const h = rowHours(r); totH += h; const pt = planText(planOf(r));
      lab = `<b>${esc(r.name)}</b><span class="wrshift">${esc(r.shift).replace(/\n/g, "<br>")}</span>${pt ? `<span class="wrplan" title="정해진 시간 (근무시간 글에서 읽음)">${esc(pt)}</span>` : ""}${r.memo ? `<span class="wrmemo">📝 ${esc(r.memo)}</span>` : ""}<span class="wrtot">${hrs(h)} · ${won(h * rate())}</span>`; }
    else lab = `<b class="wrk">${esc(r.name || KIND[r.kind])}</b>`;
    return `<tr class="${r.kind}" data-row="${r.id}"><th class="wrname"><button data-act="row">${lab}</button></th>${ds.map((d) => d.slots.map((s) => cell(r, d, s)).join("")).join("")}</tr>`;
  }).join("");
  box.innerHTML = `<div class="wrscroll"><table class="wrgrid"><thead><tr><th class="wrname" rowspan="2">이름 · 근무시간</th>${head1}</tr><tr>${head2}</tr></thead><tbody>${body}</tbody>
    <tfoot><tr><th class="wrname"><b>합계</b><span class="wrtot">${hrs(totH)} · ${won(totH * rate())}</span></th><td colspan="${ds.reduce((s, d) => s + d.slots.length, 0)}"></td></tr></tfoot></table></div>`;
  V().querySelector("#wrSum").innerHTML = `조교 ${staff.length}명 · 총 ${hrs(totH)} · ${won(totH * rate())}${need ? ` · <b class="wrneedtxt">사유 필요 ${need}칸</b>` : ""}`;
  const sc = box.querySelector(".wrscroll");
  if (keep === null) setTimeout(() => scrollToday(false)); else sc.scrollLeft = keep;
}
function scrollToday(smooth) {
  const sc = V().querySelector(".wrscroll"), el = sc?.querySelector("th.wrd.today"); if (!el) return;
  const fix = sc.querySelector("th.wrname").offsetWidth, left = Math.max(0, el.offsetLeft - fix - 40);
  smooth ? sc.scrollTo({ left, behavior: "smooth" }) : (sc.scrollLeft = left);
}
function renderPeople() {
  const box = V().querySelector("#wrPeople"); if (!box || box.contains(document.activeElement)) return; // 고치는 중
  box.innerHTML = WR.people.length ? `<div class="wrppl">${WR.people.map((p) => `<div class="wrp" data-name="${esc(p.name)}"><b>${esc(p.name)}</b>
      <input name="phone" value="${esc(p.phone)}" maxlength="40" placeholder="연락처"><input name="bank" value="${esc(p.bank)}" maxlength="200" placeholder="은행 계좌번호">
      <button class="wricon" data-act="pdel" title="지우기">✕</button></div>`).join("")}</div>` : `<div class="mut">아직 없어요.</div>`;
}

// ── 칸·줄 고치는 작은 창 (body 에 하나, 다시 그려도 안 닫힘) ──
const pop = () => document.getElementById("wrPop") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "wrPop", className: "wrpop", hidden: true }));
const place = (el, btn) => { const r = btn.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight; el.style.left = Math.max(16, Math.min(r.left, innerWidth - w - 16)) + "px"; el.style.top = (r.bottom + 6 + h > innerHeight ? Math.max(16, r.top - h - 6) : r.bottom + 6) + "px"; };
let ctx = null;
const closePop = () => { const el = document.getElementById("wrPop"); if (el) el.hidden = true; ctx = null; };
function openCell(btn) {
  const r = WR.rows.find((x) => x.id === +btn.dataset.row), { day, slot } = btn.dataset, c = WR.cells.get(key(r.id, day, slot)) ?? {};
  const dw = dowOf(day), plan = planOf(r), planned = plan[dw + slot], staff = r.kind === "staff";
  ctx = { kind: "cell", row: r.id, day, slot, warned: false };
  const el = pop();
  el.innerHTML = `<div class="wrpt">${esc(r.name || KIND[r.kind])} · ${+day.slice(5, 7)}/${+day.slice(8)}(${KD[dw]})${SL[slot] ? " " + SL[slot] : ""}</div>
    ${staff ? `<div class="mut wrpl">${Object.keys(plan).length ? (planned ? `정해진 시간 <b>${planned}h</b>` : "정해진 근무가 없는 칸 (적으면 전부 추가근무)") : "정해진 시간 없음 (대타·백업)"}</div>
      <div class="wrrow"><input name="val" inputmode="decimal" maxlength="60" value="${esc(c.val ?? "")}" placeholder="시간 (예: 2.5)">${planned ? `<button type="button" class="btn ghost" data-pick="${planned}">${planned}h 그대로</button>` : ""}</div>
      <div class="wrmk">${[["", "표시 없음"], ["out", "🔴 빠짐 (대타 필요)"], ["sub", "🟢 대타 근무"]].map(([v, l]) => `<label><input type="radio" name="mark" value="${v}" ${(c.mark ?? "") === v ? "checked" : ""}>${l}</label>`).join("")}</div>
      <label class="wrrl">사유 <span class="mut">(정해진 시간보다 적거나 많을 때)</span><textarea name="reason" maxlength="500" placeholder="예) 리딩 들어가서 전화 회신 마무리하느라 30분 연장">${esc(c.reason ?? "")}</textarea></label>
      <div class="wrwarn" hidden></div>`
    : `<input name="val" maxlength="60" value="${esc(c.val ?? "")}" placeholder="이름 (예: 유림 대타)">`}
    <div class="wrrow wrbtns"><button class="btn" data-pop="save">저장</button>${c.row_id ? `<button class="btn ghost" data-pop="clear">칸 비우기</button>` : ""}<button class="btn ghost" data-pop="close">닫기</button></div>`;
  el.hidden = false; place(el, btn); warn(); el.querySelector("[name=val]").focus();
}
function warn() { // 정해진 시간과 다르면 사유 칸 빨갛게 + 몇 시간 차이인지
  if (ctx?.kind !== "cell") return;
  const el = pop(), r = WR.rows.find((x) => x.id === ctx.row), w = el.querySelector(".wrwarn"); if (!w) return;
  const o = off(planOf(r), dowOf(ctx.day), ctx.slot, el.querySelector("[name=val]").value), sub = el.querySelector("[name=mark]:checked")?.value === "sub", rs = el.querySelector("[name=reason]");
  const need = o !== 0 && !sub && !rs.value.trim();
  w.hidden = o === 0 || sub; w.textContent = `정해진 시간보다 ${Math.abs(o)}시간 ${o > 0 ? "많아요" : "적어요"} — 사유를 적어 주세요${ctx.warned && need ? " (그래도 저장하려면 저장 한 번 더)" : ""}`;
  rs.classList.toggle("req", need);
}
function openRow(btn) {
  const r = WR.rows.find((x) => x.id === +btn.closest("[data-row]").dataset.row), el = pop();
  ctx = { kind: "row", row: r.id };
  el.innerHTML = r.kind === "staff" ? `<div class="wrpt">조교 줄 고치기</div>
      <label class="wrrl">이름<input name="name" maxlength="40" value="${esc(r.name)}"></label>
      <label class="wrrl">근무시간 <span class="mut">(정해진 시간을 여기서 읽어요)</span><textarea name="shift" maxlength="300">${esc(r.shift)}</textarea></label>
      <div class="mut wrpl" id="wrPlanPrev"></div>
      <label class="wrrl">특이사항<input name="memo" maxlength="500" value="${esc(r.memo)}"></label>
      <div class="wrrow wrbtns"><button class="btn" data-pop="rsave">저장</button><button class="btn ghost" data-pop="up">▲</button><button class="btn ghost" data-pop="down">▼</button>${jo() ? "" : `<button class="btn ghost danger" data-pop="rdel">줄 지우기</button>`}<button class="btn ghost" data-pop="close">닫기</button></div>`
    : `<div class="wrpt">줄 이름</div><input name="name" maxlength="40" value="${esc(r.name)}">
      <div class="wrrow wrbtns"><button class="btn" data-pop="rsave">저장</button><button class="btn ghost" data-pop="up">▲</button><button class="btn ghost" data-pop="down">▼</button><button class="btn ghost" data-pop="close">닫기</button></div>`;
  el.hidden = false; place(el, btn); planPrev();
}
function planPrev() { const p = document.getElementById("wrPlanPrev"), s = pop().querySelector("[name=shift]"); if (p && s) p.textContent = "정해진 시간: " + (planText(parseShift(s.value)) || "없음 (대타·백업 — 사유 안 물어요)"); }

async function saveCell(force) {
  const el = pop(), q = (n) => el.querySelector(`[name=${n}]`), r = WR.rows.find((x) => x.id === ctx.row);
  const val = q("val").value.trim(), reason = q("reason")?.value.trim() ?? "", mark = el.querySelector("[name=mark]:checked")?.value || null;
  if (r.kind === "staff" && val && num(val) == null && !confirm(`'${val}' 은 숫자가 아니라 총시간에 안 들어가요. 그대로 저장할까요?`)) return;
  if (!force && r.kind === "staff" && needReason(planOf(r), dowOf(ctx.day), ctx.slot, { val, reason, mark }) && !ctx.warned) { ctx.warned = true; warn(); q("reason").focus(); return; }
  const { row, day, slot } = ctx, k = key(row, day, slot); closePop();
  if (!val && !reason && !mark) { WR.cells.delete(k); renderGrid(); return fail((await sb.from("work_cells").delete().match({ row_id: row, day, slot })).error); }
  const c = { row_id: row, day, slot, val, reason, mark, by_name: myName || (jo() ? "조교" : ""), updated_at: new Date().toISOString() };
  WR.cells.set(k, c); renderGrid();
  fail((await sb.from("work_cells").upsert(c)).error);
}
async function move(dir) {
  const list = WR.rows.slice(), i = list.findIndex((x) => x.id === ctx.row), j = i + dir; if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]]; list.forEach((x, n) => (x.sort = n + 1)); WR.rows = list; renderGrid();
  const rs = await Promise.all(list.map((x) => sb.from("work_rows").update({ sort: x.sort }).eq("id", x.id))); rs.some((x) => fail(x.error));
}
async function newMonth() { // 이 달이 비었으면: 기록 있는 가장 최근 달의 줄(이름·근무시간·특이사항)·시급·안내를 복사
  const t = WR.team, ym = WR.ym;
  const last = await sb.from("work_rows").select("ym").eq("team_id", t).lt("ym", ym).order("ym", { ascending: false }).limit(1);
  if (fail(last.error)) return;
  const from = last.data[0]?.ym;
  const [rs, mo] = from ? await Promise.all([sb.from("work_rows").select("kind,name,shift,memo,sort").eq("team_id", t).eq("ym", from).order("sort").order("id"), sb.from("work_months").select("rate,notice").eq("team_id", t).eq("ym", from).maybeSingle()]) : [{ data: [] }, { data: null }];
  if (fail(rs.error) || fail(mo.error)) return;
  const rows = rs.data.length ? rs.data : [{ kind: "need", name: KIND.need, shift: "", memo: "", sort: 1 }, { kind: "done", name: KIND.done, shift: "", memo: "", sort: 2 }];
  if (fail((await sb.from("work_months").upsert({ team_id: t, ym, rate: mo.data?.rate ?? 10320, notice: mo.data?.notice ?? "" })).error)) return;
  if (fail((await sb.from("work_rows").insert(rows.map((x) => ({ ...x, team_id: t, ym })))).error)) return;
  toast(from ? `${ymLabel(from)} 명단으로 만들었어요` : "새 근무표를 만들었어요");
  WR.load();
}
const saveMonth = (patch) => sb.from("work_months").upsert({ team_id: WR.team, ym: WR.ym, rate: rate(), notice: WR.month?.notice ?? "", ...patch }).then((r) => { if (!fail(r.error)) WR.month = { ...(WR.month ?? {}), ...patch }; });

document.addEventListener("input", (e) => { if (e.target.closest("#wrPop")) { if (e.target.name === "shift") planPrev(); else warn(); } });
document.addEventListener("change", (e) => { if (e.target.closest("#wrPop") && e.target.name === "mark") warn(); });
document.addEventListener("keydown", (e) => { if (!e.target.closest?.("#wrPop")) return; if (e.key === "Escape") closePop(); if (e.key === "Enter" && !e.isComposing && e.target.tagName === "INPUT" && ctx?.kind === "cell") { e.preventDefault(); saveCell(ctx.warned); } });
document.addEventListener("click", async (e) => {
  const pk = e.target.closest("#wrPop [data-pick]"); if (pk) { pop().querySelector("[name=val]").value = pk.dataset.pick; return warn(); }
  const b = e.target.closest("#wrPop [data-pop]");
  if (b) {
    const a = b.dataset.pop, el = pop(), q = (n) => el.querySelector(`[name=${n}]`)?.value.trim();
    if (a === "close") return closePop();
    if (a === "save") return saveCell(ctx.warned);
    if (a === "clear") { el.querySelector("[name=val]").value = ""; const rs = el.querySelector("[name=reason]"); if (rs) rs.value = ""; el.querySelectorAll("[name=mark]").forEach((m) => (m.checked = !m.value)); return saveCell(true); }
    if (a === "up" || a === "down") return move(a === "up" ? -1 : 1);
    const id = ctx.row;
    if (a === "rsave") { const p = { name: q("name") ?? "" }; if (el.querySelector("[name=shift]")) Object.assign(p, { shift: q("shift"), memo: q("memo") }); closePop(); Object.assign(WR.rows.find((x) => x.id === id), p); renderGrid(); return fail((await sb.from("work_rows").update(p).eq("id", id)).error); }
    if (a === "rdel") { const r = WR.rows.find((x) => x.id === id); if (!confirm(`${r.name} 줄을 지울까요? 이 달 기록(${rowCells(r).length}칸)도 같이 지워져요.`)) return; closePop(); if (!fail((await sb.from("work_rows").delete().eq("id", id)).error)) WR.load(); return; }
  }
  if (!e.target.closest("#wrPop") && !e.target.closest("#wrView [data-act=cell], #wrView [data-act=row]")) closePop();
});

function bind() {
  const v = V(); if (v.dataset.bound) return; v.dataset.bound = 1;
  v.addEventListener("change", async (e) => {
    const id = e.target.id;
    if (id === "wrTeam") { WR.team = +e.target.value; try { localStorage.setItem("wr-team", WR.team); } catch {} closePop(); return WR.load(); }
    if (id === "wrRate") { const n = Math.round(+e.target.value); if (!(n >= 1000 && n <= 100000)) { e.target.value = rate(); return toast("시급은 1,000~100,000원"); } await saveMonth({ rate: n }); return renderGrid(); }
    if (id === "wrNotice") return saveMonth({ notice: e.target.value });
    const p = e.target.closest(".wrp"); if (p) return fail((await sb.from("work_people").update({ [e.target.name]: e.target.value.trim() }).eq("team_id", WR.team).eq("name", p.dataset.name)).error);
  });
  v.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, t = WR.team; let r;
    if (f.dataset.f === "row") {
      const name = f.name.value.trim(); if (!name) return toast("이름을 넣어 주세요");
      if (!WR.month) await saveMonth({});
      const at = WR.rows.findIndex((x) => x.kind !== "staff"), sort = at < 0 ? WR.rows.length + 1 : WR.rows[at].sort; // 대타 줄 위에
      if (at >= 0) await Promise.all(WR.rows.slice(at).map((x) => sb.from("work_rows").update({ sort: x.sort + 1 }).eq("id", x.id)));
      r = await sb.from("work_rows").insert({ team_id: t, ym: WR.ym, kind: "staff", name, shift: f.shift.value.trim(), sort });
      if (!r.error) f.name.value = f.shift.value = "";
    }
    if (f.dataset.f === "person") {
      const name = f.name.value.trim(); if (!name) return toast("이름을 넣어 주세요");
      r = await sb.from("work_people").upsert({ team_id: t, name, phone: f.phone.value.trim(), bank: f.bank.value.trim() });
      if (!r.error) { f.name.value = f.phone.value = f.bank.value = ""; document.activeElement?.blur(); }
    }
    if (r && !fail(r.error)) WR.load();
  });
  v.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "cell") return openCell(b);
    if (act === "row") return openRow(b);
    if (act === "today") return scrollToday(true);
    if (act === "newmonth") return newMonth();
    if (act === "prev" || act === "next" || act === "now") {
      WR.ym = act === "now" ? ymOf(today()) : ymAdd(WR.ym, act === "prev" ? -1 : 1);
      closePop(); WR.rows = []; WR.cells = new Map(); WR.month = null; return WR.load();
    }
    if (act === "pdel") { const name = b.closest(".wrp").dataset.name; if (!confirm(`${name} 계좌·연락처를 지울까요?`)) return; if (!fail((await sb.from("work_people").delete().eq("team_id", WR.team).eq("name", name)).error)) { WR.people = WR.people.filter((p) => p.name !== name); renderPeople(); } }
  });
}
const load0 = WR.load;
WR.load = async () => { bind(); return load0(); };
})();
