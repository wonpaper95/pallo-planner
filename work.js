// 🕒 [근무기록] 탭 — 조교 근무기록지 (구글 시트 대구영어·울산·대구일중 이식). 지점 공용(대표·매니저·조교 링크), 다른 기기 실시간 (DB 0064_work)
// 달마다 줄(조교·대타 필요·대타 해준) × 날짜 칸(월~목 오전/오후, 금·토·일 한 칸) = 시간 + 사유 + 🔴빠짐/🟢대타. 총시간·급여(시급) 자동, 계좌·연락처는 대표·매니저만
// 정해진 시간(근무시간 글, work-core.js)과 다르게 적으면 사유 칸이 빨개짐 — 사유 없으면 칸에 '!' 표시
// 줄은 시간대(평일 오전·오후·주말·여러·대타)별로 묶어 색칠. 조교체크리스트 대타 명단 → 🟢/🔴 칸 자동(DB 트리거 0066). 📄 근무계약서 = 비공개 버킷 work-docs
// index.html 의 sb·myRole·previewTeam·teams·myName·esc·toast·fail·today·W·view 를 씀 → window.WR
(() => {
const WR = (window.WR = { team: null, ym: null, month: null, rows: [], cells: new Map(), people: [], docs: [], shifts: [], only: null, shell: "" });
const V = () => document.getElementById("wrView");
const { KD, slotsOf, num, parseShift, off, needReason, planText, DAYSETS, mins, shiftLine } = WRC;
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
// 시간대 묶음: 정해진 칸이 월~목 오전만 = am, 오후만 = pm, 금·토·일만 = we, 섞이면 mix, 정해진 시간 없음(대타·백업) = etc
const GROUPS = [["am", "평일 오전"], ["pm", "평일 오후"], ["mix", "여러 시간대"], ["we", "주말"], ["etc", "대타·기타"]];
const groupOf = (r) => { const ks = Object.keys(planOf(r)); if (!ks.length) return "etc"; const g = new Set(ks.map((k) => (k[0] >= "1" && k[0] <= "4" ? k.slice(1) : "we"))); return g.size === 1 ? [...g][0] : "mix"; };
const ordered = () => { const rank = (r) => (r.kind === "staff" ? GROUPS.findIndex(([g]) => g === groupOf(r)) : 9); return WR.rows.slice().sort((a, b) => rank(a) - rank(b) || a.sort - b.sort || a.id - b.id); };
const safeKey = (name) => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || ""); const ext = m ? "." + m[1].toLowerCase() : ""; const base = (name || "file").slice(0, 40).replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""); return `${Date.now()}_${base || "file"}${ext}`; }; // Storage 키는 ASCII 만

WR.load = async function () {
  if (admin()) { if (!WR.team) { try { WR.team = +localStorage.getItem("wr-team") || null; } catch {} } if (!teams.some((t) => t.id === WR.team)) WR.team = teams[0]?.id ?? null; }
  else WR.team = previewTeam ?? (await sb.rpc("my_team")).data ?? (await sb.rpc("assistant_team")).data ?? null; // 매니저·미리보기: 우리 지점 · 조교: 링크 지점
  if (!WR.ym) WR.ym = ymOf(today());
  if (!WR.team) { WR.shell = ""; V().innerHTML = `<div class="wrbar"><h2>🕒 조교 근무기록</h2></div><div class="wrpanel mut">지점이 정해져야 볼 수 있어요 — 대표님께 말씀해 주세요</div>`; return; }
  const t = WR.team, ym = WR.ym;
  const [m, r, p, dc, sh] = await Promise.all([
    sb.from("work_months").select("*").eq("team_id", t).eq("ym", ym).maybeSingle(),
    sb.from("work_rows").select("*").eq("team_id", t).eq("ym", ym).order("sort").order("id"),
    jo() ? { data: [] } : sb.from("work_people").select("*").eq("team_id", t).order("name"),
    jo() ? { data: [] } : sb.from("work_docs").select("*").eq("team_id", t).order("created_at"),
    sb.from("work_shifts").select("*").eq("team_id", t).order("sort").order("id")]);
  if ([m, r, p].some((x) => fail(x.error))) return;
  if (dc.error) { console.warn(dc.error); dc.data = []; } // 계약서 표 없어도(0066 전) 근무표는 보이게
  if (sh.error) { console.warn(sh.error); sh.data = []; } // 근무시간대 표 없어도(0069 전)
  const c = r.data.length ? await sb.from("work_cells").select("*").in("row_id", r.data.map((x) => x.id)) : { data: [] };
  if (fail(c.error) || t !== WR.team || ym !== WR.ym) return; // 그 사이 지점·달 바꿈
  Object.assign(WR, { month: m.data, rows: r.data, people: p.data, docs: dc.data, shifts: sh.data, cells: new Map(c.data.map((x) => [key(x.row_id, x.day, x.slot), x])) });
  render();
  listen();
};

// ⚡ 실시간: 다른 사람이 바꾸면 0.3초 뒤 다시 읽기 (근무기록 탭 보고 있을 때만)
let chan = null;
function listen() {
  if (chan) return;
  const soon = () => { clearTimeout(soon.t); soon.t = setTimeout(() => view === "wr" && WR.load(), 300); };
  chan = sb.channel("wr");
  for (const tb of ["work_months", "work_rows", "work_cells", "work_docs", "work_shifts"]) chan.on("postgres_changes", { event: "*", schema: "public", table: tb }, soon);
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
  renderGrid(); renderPeople(); fillPick();
}
function shell() {
  return `<div class="wrbar"><h2>🕒 조교 근무기록 <small class="mut">지점 공용 · 실시간</small></h2>
    <div class="wrrow">${admin() ? `<select id="wrTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === WR.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}
      <button class="btn ghost" data-act="prev">‹</button><b class="wrym">${ymLabel(WR.ym)}</b><button class="btn ghost" data-act="next">›</button>
      ${WR.ym !== ymOf(today()) ? `<button class="btn ghost" data-act="now">이번 달</button>` : ""}</div></div>
  <section class="wrpanel"><details id="wrNoticeBox"><summary>📌 안내 <span class="mut">시간 적는 법 · 추가근무 사유 규칙 (누구나 고칠 수 있어요)</span></summary>
    <textarea id="wrNotice" maxlength="4000" placeholder="예) 추가근무는 사유를 적지 않으면 인정하지 않아요"></textarea></details>
    <div class="wrhow mut">칸을 누르면 시간을 적어요. <b>정해진 시간과 다르면 사유</b>를 적어 주세요 — 사유가 없으면 칸에 <span class="wrneed-dot">!</span> 표시가 남아요. 🔴 빠짐 = 대타 필요 · 🟢 대타 근무 · 모서리 ◥ = 사유 있음 · 색칠된 칸 = 그 사람의 정해진 근무 칸.<br>
      ✅ 조교체크리스트 <b>대타 명단</b>에 대타 이름을 넣으면 여기에 🟢(대타한 사람·시간)·🔴(빠진 사람)이 자동으로 들어가요.</div></section>
  <section class="wrpanel"><div class="wrgbar"><h3>근무표</h3><span id="wrSum" class="mut"></span><span id="wrLegend" class="wrlegend"></span>
    <span class="wrrow"><span class="mut">시급</span><input id="wrRate" type="number" min="1000" max="100000" step="10" inputmode="numeric"><span class="mut">원</span>
    <button class="btn ghost" data-act="today">오늘로</button></span></div>
    <div id="wrGrid"></div>
    <form class="wrform" data-f="row"><input name="name" maxlength="40" placeholder="조교 이름"><select name="shiftPick"></select><button type="button" class="btn ghost" data-act="shtoggle" title="근무시간대 추가·지우기">⚙️ 근무시간대</button><button class="btn">조교 추가</button></form>
    <div class="wrshbox" hidden><div class="wrgbar"><h3>⚙️ 근무시간대</h3><span class="mut">지점 공용 · 여기 추가하면 다음 달에도 고르기 목록에 계속 보여요</span><button type="button" class="btn ghost" data-act="shtoggle">닫기</button></div>
      <div id="wrShList" class="wrshlist"></div>
      <h4>➕ 요일·시간으로 추가</h4><div class="wrbuild">${slLine()}<button type="button" class="btn ghost" data-act="sladd">+ 다른 요일·시간</button><span class="wrprev mut"></span><button type="button" class="btn" data-act="shsave">이 근무시간대 추가</button></div>
      <h4>✏️ 직접 적기 <span class="mut">특이한 경우 그대로 — 요일과 (몇h)가 있으면 정해진 시간으로 읽고, 없으면 사유를 안 물어요</span></h4>
      <div class="wrrow"><input name="sfree" maxlength="300" placeholder="예) 월 목 스페인어 20:00~22:00 (2h) · 연휴 오전 (11:00~13:00)(2h)"><button type="button" class="btn" data-act="shfree">추가</button></div><div class="wrfreeprev mut"></div></div></section>
  ${jo() ? "" : `<section class="wrpanel"><details id="wrPeopleBox"><summary>💳 계좌 · 연락처 · 📄 근무계약서 <span class="mut">대표·매니저만 보여요 (조교 링크엔 안 보임)</span></summary>
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
    return `<td class="wrc ${planned ? "plan" : ""} ${d.dw === 5 ? "fri" : ""} ${d.out ? "om" : ""} ${d.k === tk ? "today" : ""} ${c?.mark ? "mk-" + c.mark : ""} ${nr ? "need" : ""} ${c?.reason ? "has" : ""} ${s === "am" || d.slots.length === 1 ? "l" : ""} ${d.dw === 1 && s === "am" ? "wrwk" : ""}"
      ${tip ? `title="${esc(tip)}"` : ""}><button data-act="cell" data-row="${r.id}" data-day="${d.k}" data-slot="${s}">${esc(c?.val ?? "")}${o ? `<i class="${o > 0 ? "up" : "dn"}">${o > 0 ? "+" : ""}${o}</i>` : ""}</button></td>`;
  };
  const head1 = ds.map((d) => `<th colspan="${d.slots.length}" class="wrd ${d.dw === 1 ? "wrwk" : ""} ${d.dw === 0 || d.dw === 6 ? "wrwe" : ""} ${d.dw === 5 ? "fri" : ""} ${d.out ? "om" : ""} ${d.k === tk ? "today" : ""}" data-day="${d.k}">${+d.k.slice(5, 7)}/${+d.k.slice(8)}<br><small>${KD[d.dw]}</small></th>`).join("");
  const head2 = ds.map((d) => d.slots.map((s) => `<th class="wrs ${s === "am" || d.slots.length === 1 ? "l" : ""} ${d.dw === 1 && s === "am" ? "wrwk" : ""} ${d.k === tk ? "today" : ""}">${SL[s]}</th>`).join("")).join("");
  const ncol = ds.reduce((n, d) => n + d.slots.length, 0), list = ordered();
  let body = "", lastG = null;
  for (const r of list) {
    const g = r.kind === "staff" ? groupOf(r) : r.kind;
    if (r.kind === "staff" && WR.only && g !== WR.only) continue;
    if (r.kind === "staff" && g !== lastG) { // 묶음 머리줄
      const rs = list.filter((x) => x.kind === "staff" && groupOf(x) === g), gh = rs.reduce((n, x) => n + rowHours(x), 0);
      body += `<tr class="wrgrp g-${g}"><th class="wrname"><span><i></i>${GROUPS.find(([k]) => k === g)[1]} <small>${rs.length}명 · ${hrs(gh)}</small></span></th><td colspan="${ncol}"></td></tr>`;
    }
    lastG = g;
    let lab;
    if (r.kind === "staff") { const h = rowHours(r); totH += h; const pt = planText(planOf(r));
      lab = `<span class="wrn1"><b>${esc(r.name)}</b>${r.memo ? `<span class="wrmemo" title="${esc(r.memo)}">📝</span>` : ""}<span class="wrtot">${hrs(h)}</span></span>
        <span class="wrshift" title="${esc(r.shift + (pt ? "\n정해진 시간: " + pt : ""))}">${esc(r.shift.split("\n").join(" / ")) || "근무시간 없음"}</span><span class="wrpay">${won(h * rate())}</span>`; }
    else lab = `<b class="wrk">${esc(r.name || KIND[r.kind])}</b>`;
    body += `<tr class="${r.kind} g-${g}" data-row="${r.id}"><th class="wrname"><button data-act="row">${lab}</button></th>${ds.map((d) => d.slots.map((s) => cell(r, d, s)).join("")).join("")}</tr>`;
  }
  if (WR.only) for (const r of WR.rows) if (r.kind === "staff" && groupOf(r) !== WR.only) totH += rowHours(r); // 합계는 그대로 전체
  box.innerHTML = `<div class="wrscroll"><table class="wrgrid"><thead><tr><th class="wrname" rowspan="2">이름 · 근무시간</th>${head1}</tr><tr>${head2}</tr></thead><tbody>${body}</tbody>
    <tfoot><tr><th class="wrname"><b>합계</b><span class="wrtot">${hrs(totH)} · ${won(totH * rate())}</span></th><td colspan="${ncol}"></td></tr></tfoot></table></div>`;
  V().querySelector("#wrLegend").innerHTML = GROUPS.filter(([g]) => staff.some((r) => groupOf(r) === g)).map(([g, l]) => `<button class="g-${g} ${WR.only === g ? "on" : ""} ${WR.only && WR.only !== g ? "dim" : ""}" data-act="only" data-g="${g}" title="눌러서 이 시간대만 보기"><i></i>${l}</button>`).join("");
  V().querySelector("#wrSum").innerHTML = `조교 ${staff.length}명 · 총 ${hrs(totH)} · ${won(totH * rate())}${need ? ` · <b class="wrneedtxt">사유 필요 ${need}칸</b>` : ""}`;
  const sc = box.querySelector(".wrscroll");
  if (keep === null) setTimeout(() => scrollToday(false)); else sc.scrollLeft = keep;
}
function scrollToday(smooth) {
  const sc = V().querySelector(".wrscroll"), el = sc?.querySelector("th.wrd.today"); if (!el) return;
  const fix = sc.querySelector("th.wrname").offsetWidth, left = Math.max(0, sc.scrollLeft + el.getBoundingClientRect().left - sc.getBoundingClientRect().left - fix - 40); // 고정 칸 때문에 offsetLeft 는 body 기준
  smooth ? sc.scrollTo({ left, behavior: "smooth" }) : (sc.scrollLeft = left);
}
function renderPeople() {
  const box = V().querySelector("#wrPeople"); if (!box || box.contains(document.activeElement)) return; // 고치는 중
  const docs = (n) => WR.docs.filter((d) => d.name === n).map((d) => `<span class="wrdoc" data-doc="${d.id}"><button data-act="dopen" title="${esc(d.file_name)} · ${esc(d.by_name)} ${d.created_at.slice(0, 10)}">📄 ${esc(d.file_name)}</button><button class="wricon" data-act="ddel" title="파일 지우기">✕</button></span>`).join("");
  box.innerHTML = WR.people.length ? `<div class="wrppl">${WR.people.map((p) => `<div class="wrp" data-name="${esc(p.name)}"><b>${esc(p.name)}</b>
      <input name="phone" value="${esc(p.phone)}" maxlength="40" placeholder="연락처"><input name="bank" value="${esc(p.bank)}" maxlength="200" placeholder="은행 계좌번호">
      <label class="btn ghost wrup" title="근무계약서 올리기 (PDF·사진, 20MB까지)">📎 계약서<input type="file" accept=".pdf,image/*,.doc,.docx,.hwp" hidden></label>
      <button class="wricon" data-act="pdel" title="지우기">✕</button>
      <div class="wrdocs">${docs(p.name)}</div></div>`).join("")}</div>` : `<div class="mut">아직 없어요.</div>`;
}
async function upload(file, name) {
  if (file.size > 20 * 1024 * 1024) return toast("20MB 넘는 파일은 못 올려요");
  const path = `${WR.team}/${safeKey(file.name)}`;
  toast("올리는 중…");
  if (fail((await sb.storage.from("work-docs").upload(path, file)).error)) return;
  const r = await sb.from("work_docs").insert({ team_id: WR.team, name, path, file_name: file.name.slice(0, 200), by_name: myName || "" }).select().single();
  if (fail(r.error)) return;
  WR.docs.push(r.data); document.activeElement?.blur(); renderPeople(); toast("📄 올렸어요");
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
  const list = ordered(), i = list.findIndex((x) => x.id === ctx.row), j = i + dir; if (j < 0 || j >= list.length) return;
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

// ⏰ 근무시간 고르기: 지점 근무시간대(work_shifts, 0069) + 이 달에만 있는 근무시간 / 정해진 시간 없음(대타·백업)
// ⚙️ 근무시간대: 요일·시작·끝·시간·메모로 만들기 또는 직접 적기(특이한 경우) → 지점 목록에 저장, ✕ 지우기는 매니저·대표
const pad2 = (n) => String(n).padStart(2, "0");
const TIMES = Array.from({ length: 181 }, (_, i) => { const m = 8 * 60 + i * 5; return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`; }); // 08:00~23:00, 5분 단위
const HOURS = Array.from({ length: 39 }, (_, i) => 0.5 + i * 0.25); // 0.5~10h (휴게 빼고 고칠 수 있게 따로)
const optList = (list, sel) => list.map(([v, l]) => `<option value="${esc(v)}" ${v == sel ? "selected" : ""}>${esc(l)}</option>`).join("");
const slLine = () => `<span class="wrsl"><select name="sd">${optList(DAYSETS, "평일")}</select><select name="ss">${optList(TIMES.map((t) => [t, t]), "19:00")}</select>~<select name="se">${optList(TIMES.map((t) => [t, t]), "22:00")}</select>
  <select name="sh" title="근무 시간 (휴게 빼고)">${optList(HOURS.map((h) => [h, h + "시간"]), 3)}</select><input name="sm" maxlength="20" placeholder="메모 (예: 일어·상담)" class="wrsm"><button type="button" class="wrx" data-act="sldel" title="이 줄 빼기">✕</button></span>`;
const oneLine = (x) => x.split("\n").join(" / ");
const readOf = (v) => { const p = planText(parseShift(v)); return p ? `정해진 시간: ${p}` : /\d\s*(h|시간)/i.test(v) ? "요일이 없어 정해진 시간 없음 — 칸마다 사유를 묻지 않아요" : "⚠️ 시간을 못 읽었어요 — 끝에 (2h) 처럼 적으면 정해진 시간으로 읽어요"; };
function fillPick(pick) {
  const s = V().querySelector("[name=shiftPick]"); if (!s) return;
  const saved = WR.shifts.map((x) => x.body), extra = [...new Set(WR.rows.filter((r) => r.kind === "staff" && r.shift.trim() && Object.keys(planOf(r)).length).map((r) => r.shift))].filter((x) => !saved.includes(x)).sort((a, b) => a.localeCompare(b, "ko"));
  const cur = pick ?? s.value;
  s.innerHTML = `<option value="">근무시간 고르기</option>${saved.length ? `<optgroup label="지점 근무시간대">${optList(saved.map((x) => [x, oneLine(x)]))}</optgroup>` : ""}
    ${extra.length ? `<optgroup label="이 달에만 있는 근무시간">${optList(extra.map((x) => [x, oneLine(x)]))}</optgroup>` : ""}
    <option value="__add">⚙️ 근무시간대 추가하기…</option><option value="__none">정해진 시간 없음 (대타·백업)</option>`;
  s.value = [...s.options].some((o) => o.value === cur) ? cur : "";
  const list = V().querySelector("#wrShList");
  list.innerHTML = WR.shifts.length ? WR.shifts.map((x) => `<div class="wrsh" data-sh="${x.id}"><span class="wrgrow">${esc(oneLine(x.body))} <small class="mut">${esc(readOf(x.body))}</small></span>${jo() ? "" : `<button type="button" class="wrx" data-act="shdel" title="지우기 (매니저·대표)">✕</button>`}</div>`).join("")
    : `<div class="mut">아직 저장된 근무시간대가 없어요. 아래에서 추가해 주세요.</div>`;
  updBuild();
}
function updBuild(el) {
  const b = V().querySelector(".wrbuild"), l = el?.closest(".wrsl"), q = (n) => l.querySelector(`[name=${n}]`);
  if (l && (el.name === "ss" || el.name === "se")) { const d = (mins(q("se").value) - mins(q("ss").value)) / 60; if (d > 0) q("sh").value = HOURS.reduce((a, h) => (Math.abs(h - d) < Math.abs(a - d) ? h : a)); } // 시각 바꾸면 시간 자동 (휴게 있으면 직접 줄이기)
  const v = [...b.querySelectorAll(".wrsl")].map((x) => shiftLine(...["sd", "ss", "se", "sh", "sm"].map((n) => x.querySelector(`[name=${n}]`).value))).join("\n");
  b.querySelector(".wrprev").textContent = `→ ${oneLine(v)} · ${readOf(v)}`;
  return v;
}
async function addShift(body) {
  body = body.trim(); if (!body) return toast("근무시간을 적어 주세요");
  const had = WR.shifts.find((x) => x.body === body);
  if (!had) {
    const { data, error } = await sb.from("work_shifts").insert({ team_id: WR.team, body, sort: WR.shifts.reduce((m, x) => Math.max(m, x.sort), 0) + 1 }).select().single();
    if (fail(error)) return false;
    WR.shifts.push(data);
  }
  fillPick(body); toast(had ? "이미 있는 근무시간대예요 — 골라 뒀어요" : "추가했어요 — 조교 추가 칸에 골라 뒀어요");
  return true;
}

function bind() {
  const v = V(); if (v.dataset.bound) return; v.dataset.bound = 1;
  v.addEventListener("change", async (e) => {
    const id = e.target.id;
    if (id === "wrTeam") { WR.team = +e.target.value; try { localStorage.setItem("wr-team", WR.team); } catch {} closePop(); return WR.load(); }
    if (id === "wrRate") { const n = Math.round(+e.target.value); if (!(n >= 1000 && n <= 100000)) { e.target.value = rate(); return toast("시급은 1,000~100,000원"); } await saveMonth({ rate: n }); return renderGrid(); }
    if (id === "wrNotice") return saveMonth({ notice: e.target.value });
    if (e.target.closest(".wrbuild")) return updBuild(e.target);
    if (e.target.name === "shiftPick" && e.target.value === "__add") { e.target.value = ""; v.querySelector(".wrshbox").hidden = false; return v.querySelector(".wrshbox").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
    const p = e.target.closest(".wrp");
    if (p && e.target.type === "file") { const f = e.target.files[0]; e.target.value = ""; return f && upload(f, p.dataset.name); }
    if (p) return fail((await sb.from("work_people").update({ [e.target.name]: e.target.value.trim() }).eq("team_id", WR.team).eq("name", p.dataset.name)).error);
  });
  v.addEventListener("input", (e) => {
    if (e.target.name === "sfree") v.querySelector(".wrfreeprev").textContent = e.target.value.trim() ? `→ ${readOf(e.target.value)}` : "";
    if (e.target.name === "sm") updBuild();
  });
  v.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = e.target, t = WR.team; let r;
    if (f.dataset.f === "row") {
      const name = f.name.value.trim(); if (!name) return toast("이름을 넣어 주세요");
      if (!f.shiftPick.value) return toast("근무시간을 골라 주세요");
      if (!WR.month) await saveMonth({});
      const at = WR.rows.findIndex((x) => x.kind !== "staff"), sort = at < 0 ? WR.rows.length + 1 : WR.rows[at].sort; // 대타 줄 위에
      if (at >= 0) await Promise.all(WR.rows.slice(at).map((x) => sb.from("work_rows").update({ sort: x.sort + 1 }).eq("id", x.id)));
      r = await sb.from("work_rows").insert({ team_id: t, ym: WR.ym, kind: "staff", name, shift: f.shiftPick.value === "__none" ? "" : f.shiftPick.value, sort });
      if (!r.error) f.name.value = f.shiftPick.value = "";
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
    if (act === "sladd") { b.insertAdjacentHTML("beforebegin", slLine()); return updBuild(); }
    if (act === "sldel") { if (v.querySelectorAll(".wrbuild .wrsl").length > 1) b.closest(".wrsl").remove(); return updBuild(); }
    if (act === "shtoggle") { const x = v.querySelector(".wrshbox"); x.hidden = !x.hidden; return; }
    if (act === "shsave") { if (await addShift(updBuild())) { v.querySelectorAll(".wrbuild .wrsl").forEach((x) => x.remove()); v.querySelector("[data-act=sladd]").insertAdjacentHTML("beforebegin", slLine()); updBuild(); } return; }
    if (act === "shfree") { const i = v.querySelector("[name=sfree]"); if (await addShift(i.value)) { i.value = ""; v.querySelector(".wrfreeprev").textContent = ""; } return; }
    if (act === "shdel") { const id = +b.closest("[data-sh]").dataset.sh, x = WR.shifts.find((y) => y.id === id); if (!confirm(`근무시간대 '${oneLine(x.body)}' 를 목록에서 지울까요? (이미 추가한 조교 줄은 그대로예요)`)) return;
      if (fail((await sb.from("work_shifts").delete().eq("id", id)).error)) return; WR.shifts = WR.shifts.filter((y) => y.id !== id); return fillPick(); }
    if (act === "cell") return openCell(b);
    if (act === "row") return openRow(b);
    if (act === "today") return scrollToday(true);
    if (act === "newmonth") return newMonth();
    if (act === "only") { WR.only = WR.only === b.dataset.g ? null : b.dataset.g; return renderGrid(); }
    if (act === "dopen") { const d = WR.docs.find((x) => x.id === +b.closest("[data-doc]").dataset.doc), w = window.open("", "_blank"); const { data, error } = await sb.storage.from("work-docs").createSignedUrl(d.path, 600); if (fail(error)) return w?.close(); if (w) w.location = data.signedUrl; else location.href = data.signedUrl; return; }
    if (act === "ddel") { const d = WR.docs.find((x) => x.id === +b.closest("[data-doc]").dataset.doc); if (!confirm(`${d.file_name} 파일을 지울까요?`)) return; await sb.storage.from("work-docs").remove([d.path]); if (!fail((await sb.from("work_docs").delete().eq("id", d.id)).error)) { WR.docs = WR.docs.filter((x) => x.id !== d.id); renderPeople(); } return; }
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
