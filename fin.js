// 💼 [재무] 탭 — 지점 재무제표(구글 시트 월 탭)를 플래너로 (DB 0070_fin). 시트 '{YYYYMM} 매출(플래너)'·'{YYYYMM} 비용(플래너)' 탭과 양방향 (planner-fin)
// 대표 = 전부 + 📎첨부 열람 / 매니저 = 첨부 열람만 빼고 전부(📎 올리기는 됨) / 조교 = [보기 요청] → 대표 승인 동안 보기만
// 칸을 고치면 바로 저장 → 2.5초 뒤 시트로. 시트에서 고친 건 5분마다 들어옴. 다른 기기 실시간
// index.html 의 sb·myRole·previewTeam·teams·esc·toast·fail·today·view 를 씀 → window.FN
(() => {
const FN = (window.FN = { team: null, month: null, rows: [], cfg: null, access: null, files: new Map(), q: "", shell: "" });
const V = () => document.getElementById("fnView");
const { SALE_H, COST_H, SECTIONS, toNum, normDate, summary, daily } = FNC;
const admin = () => myRole === "admin";
const jo = () => myRole === "assistant";
const canEdit = () => !jo();
const won = (n) => (n < 0 ? "−" : "") + "₩" + Math.abs(Math.round(n)).toLocaleString("ko-KR");
const fmtNum = (v) => { const n = toNum(v); return n === null ? String(v ?? "") : n.toLocaleString("ko-KR"); };
const ymNow = () => today().slice(0, 7);
const ymAdd = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const ymLabel = (m) => `${+m.slice(0, 4)}년 ${+m.slice(5, 7)}월`;
const NUMK = new Set(["매출", "금액", "근무시간"]);
const W_ = { 날짜: 92, 멤버쉽: 120, 매출: 100, 이름: 70, 언어: 56, 거래형태: 84, 결제수단: 74, 카드사: 56, 할부개월: 52, 결제상세: 140, 코멘트: 180, 가입경로: 70, Lv: 40, 전화번호: 110, 상담자: 60, 스포입력: 60, 성별: 40, 나이: 40, 사용처: 200, 금액: 110, 비고: 160, 근무시간: 70 };
const safeKey = (name) => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || ""); const ext = m ? "." + m[1].toLowerCase() : ""; const base = (name || "file").slice(0, 40).replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""); return `${Date.now()}_${base || "file"}${ext}`; }; // Storage 키는 ASCII 만

FN.load = async function () {
  if (admin()) { if (!FN.team) { try { FN.team = +localStorage.getItem("fn-team") || null; } catch {} } if (!teams.some((t) => t.id === FN.team)) FN.team = teams.find((t) => t.name === "대구영어점")?.id ?? teams[0]?.id ?? null; }
  else FN.team = previewTeam ?? (await sb.rpc("my_team")).data ?? (await sb.rpc("assistant_team")).data ?? null;
  if (!FN.month) FN.month = ymNow();
  if (!FN.team) { FN.shell = ""; V().innerHTML = `<div class="fnbar"><h2>💼 재무</h2></div><div class="fnpanel mut">지점이 정해져야 볼 수 있어요 — 대표님께 말씀해 주세요</div>`; return; }
  const t = FN.team, m = FN.month;
  const [r, c, a] = await Promise.all([
    sb.from("fin_rows").select("id, kind, vals, sort, files, updated_by, updated_at").eq("team_id", t).eq("month", m).is("deleted_at", null).order("sort").order("updated_at"),
    sb.from("fin_config").select("*").eq("team_id", t).maybeSingle(),
    sb.from("fin_access").select("*").eq("team_id", t).maybeSingle()]);
  if ([r, c, a].some((x) => fail(x.error)) || t !== FN.team || m !== FN.month) return;
  let files = new Map();
  if (admin() && r.data.some((x) => x.files)) {
    const f = await sb.from("fin_files").select("*").eq("team_id", t).in("row_id", r.data.filter((x) => x.files).map((x) => x.id)).order("created_at");
    if (!f.error) for (const x of f.data) files.set(x.row_id, [...(files.get(x.row_id) ?? []), x]);
  }
  Object.assign(FN, { rows: r.data, cfg: c.data, access: a.data, files });
  render();
  listen();
};

// ⚡ 실시간: 다른 사람·시트가 바꾸면 다시 읽기 — 칸에 적는 중이면 칸을 떠날 때
let chan = null, dirty = false;
function listen() {
  if (chan) return;
  const soon = () => { clearTimeout(soon.t); soon.t = setTimeout(() => { if (view !== "fn") return; if (V().contains(document.activeElement) && document.activeElement.matches("input")) dirty = true; else FN.load(); }, 400); };
  chan = sb.channel("fn");
  for (const tb of ["fin_rows", "fin_config", "fin_access"]) chan.on("postgres_changes", { event: "*", schema: "public", table: tb }, soon);
  chan.subscribe();
}

// 🔄 고친 뒤 2.5초 모아서 시트로
function queueSync() { clearTimeout(queueSync.t); if (FN.cfg?.sheet_id) queueSync.t = setTimeout(() => syncNow(false), 2500); }
async function syncNow(loud) {
  if (!FN.cfg?.sheet_id) return loud && toast("⚙️ 시트 설정에서 구글 시트 주소부터 넣어 주세요");
  const st = V().querySelector("#fnSync"); if (st) st.textContent = "🔄 시트와 맞추는 중…";
  const { data, error } = await sb.functions.invoke("planner-fin", { body: { action: "sync", team: FN.team, month: FN.month } });
  const err = error?.message ?? data?.error;
  if (err) { if (st) st.textContent = "⚠️ 시트 연동 실패"; return loud && toast("시트 연동 실패: " + err); }
  if (loud) { const n = (k) => (data?.sale?.[k] ?? 0) + (data?.cost?.[k] ?? 0); toast(`🔄 시트 → 플래너 ${n("fromSheet")}줄 · 플래너 → 시트 ${n("toSheet")}줄${n("deleted") ? ` · 시트에서 지운 ${n("deleted")}줄` : ""}`); }
  FN.load();
}

const visible = () => {
  const q = FN.q.trim().toLowerCase();
  return q ? FN.rows.filter((r) => Object.values(r.vals).some((v) => String(v).toLowerCase().includes(q))) : FN.rows;
};
const sorted = (kind) => visible().filter((r) => r.kind === kind).sort((a, b) => a.sort - b.sort || a.updated_at.localeCompare(b.updated_at));

function render() {
  const sk = `${FN.team}|${FN.month}|${myRole}`;
  if (FN.shell !== sk) { FN.shell = sk; V().innerHTML = shell(); }
  const box = V().querySelector("#fnBody");
  const gate = jo() && FN.access?.status !== "open";
  V().querySelector("#fnQ")?.classList.toggle("hidden", gate);
  if (gate) { box.innerHTML = joGate(); return renderStatus(); }
  const keepX = [...V().querySelectorAll(".fnscroll")].map((x) => x.scrollLeft);
  box.innerHTML = summaryHtml() + (admin() ? accessHtml() : "") + saleHtml() + costHtml() + dailyHtml();
  V().querySelectorAll(".fnscroll").forEach((x, i) => { if (keepX[i]) x.scrollLeft = keepX[i]; });
  renderStatus();
}
function renderStatus() {
  const st = V().querySelector("#fnSync"); if (!st) return;
  const c = FN.cfg;
  st.innerHTML = !c?.sheet_id ? (admin() ? "시트 연동 꺼짐 — ⚙️ 시트 설정" : "시트 연동 전")
    : c.last_error ? `<span class="fnerr" title="${esc(c.last_error)}">⚠️ 시트 연동 문제 — ${esc(c.last_error.slice(0, 60))}</span>`
    : `🔗 <a href="https://docs.google.com/spreadsheets/d/${esc(c.sheet_id)}/edit" target="_blank" rel="noopener">구글 시트</a> ${c.last_sync ? new Date(c.last_sync).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) + " 맞춤" : ""}`;
}
function shell() {
  return `<div class="fnbar"><h2>💼 재무 <small class="mut">${jo() ? "보기만 (대표님 승인)" : "대표·매니저 · 구글 시트와 자동 연동"}</small></h2>
    <div class="fnrow">${admin() ? `<select id="fnTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === FN.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}
      <button class="btn ghost" data-act="prev">‹</button><b class="fnym">${ymLabel(FN.month)}</b><button class="btn ghost" data-act="next">›</button>
      ${FN.month !== ymNow() ? `<button class="btn ghost" data-act="now">이번 달</button>` : ""}</div></div>
  <div class="fnrow fntools"><span id="fnSync" class="mut"></span>${jo() ? "" : `<button class="btn ghost" data-act="sync" title="시트에서 고친 걸 바로 가져오고, 플래너 것도 보내요">🔄 지금 맞추기</button>`}${admin() ? `<button class="btn ghost" data-act="cfg">⚙️ 시트 설정</button>` : ""}
    <input id="fnQ" type="search" placeholder="🔍 이름·전화번호·사용처 찾기" value="${esc(FN.q)}"></div>
  <div id="fnBody"></div>`;
}
function joGate() {
  const s = FN.access?.status;
  return `<section class="fnpanel fngate"><div style="font-size:34px">🔒</div><b>재무는 대표님이 승인해야 볼 수 있어요</b>
    ${s === "requested" ? `<div class="mut">요청을 보냈어요 — 대표님 승인을 기다리는 중이에요</div>` : `<button class="btn" data-act="request">재무 보기 요청</button><div class="mut">승인되면 이 지점 조교 링크로 볼 수 있어요 (보기만)</div>`}</section>`;
}
function summaryHtml() {
  const s = summary(visible(), FN.cfg?.fee_pct ?? 5);
  const card = (k, v, cls = "") => `<div class="fncard ${cls}"><small>${k}</small><b>${won(v)}</b></div>`;
  return `<section class="fncards">${card("매출 (+)", s.plus)}${card("환불 (−)", s.minus, "neg")}${card("순매출", s.net)}${card("비용 합계", s.cost)}${card(`결제수수료 ${FN.cfg?.fee_pct ?? 5}%`, s.fee)}${card("수익", s.profit, s.profit < 0 ? "neg" : "pos")}</section>`;
}
function accessHtml() {
  const s = FN.access?.status ?? "closed", name = teams.find((t) => t.id === FN.team)?.name ?? "";
  const lab = { closed: "🔒 꺼짐", requested: "🙋 보기 요청 왔어요", open: "🔓 보는 중" }[s];
  return `<section class="fnpanel fnacc ${s}"><b>🧑‍🎓 ${esc(name)} 조교 보기</b><span>${lab}${s === "requested" && FN.access.requested_at ? ` <small class="mut">${new Date(FN.access.requested_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>` : ""}</span>
    ${s !== "open" ? `<button class="btn" data-act="acc" data-s="open">${s === "requested" ? "승인" : "열어 주기"}</button>` : ""}${s !== "closed" ? `<button class="btn ghost" data-act="acc" data-s="closed">${s === "requested" ? "거절" : "닫기"}</button>` : ""}
    <small class="mut">열면 이 지점 조교 링크로 매출·비용을 볼 수 있어요 (고치기·📎 첨부는 안 됨)</small></section>`;
}
const clip = (r) => jo() ? "" : `<td class="fnclip"><button data-act="files" data-id="${r.id}" title="${admin() ? "📎 첨부 보기·올리기" : "📎 올리기 (열람은 대표님만)"}">📎${r.files ? `<i>${r.files}</i>` : ""}</button></td>`;
const del = (r) => canEdit() ? `<td class="fndel"><button data-act="del" data-id="${r.id}" title="줄 지우기">🗑</button></td>` : "";
function cellIn(r, k) {
  const v = r.vals[k] ?? "", show = NUMK.has(k) ? fmtNum(v) : String(v), neg = NUMK.has(k) && (toNum(v) ?? 0) < 0;
  if (!canEdit()) return `<td class="${NUMK.has(k) ? "num" : ""} ${neg ? "neg" : ""}">${esc(show)}</td>`;
  return `<td><input data-id="${r.id}" data-k="${k}" value="${esc(show)}" style="width:${W_[k] ?? 80}px" class="${NUMK.has(k) ? "num" : ""} ${neg ? "neg" : ""}" ${NUMK.has(k) ? 'inputmode="decimal"' : ""} ${k === "날짜" ? 'title="10/6 처럼 적어도 돼요"' : ""}></td>`;
}
function saleHtml() {
  const rows = sorted("sale"), s = summary(rows, 0);
  return `<section class="fnpanel"><div class="fngbar"><h3>매출 <small class="mut">${rows.length}건 · ${won(s.net)}</small></h3>${canEdit() ? `<button class="btn" data-act="add" data-kind="sale">+ 매출 줄</button>` : ""}</div>
    <div class="fnscroll"><table class="fntbl"><thead><tr>${SALE_H.map((k) => `<th>${k}</th>`).join("")}${jo() ? "" : "<th>📎</th>"}${canEdit() ? "<th></th>" : ""}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${SALE_H.map((k) => cellIn(r, k)).join("")}${clip(r)}${del(r)}</tr>`).join("") || `<tr><td colspan="${SALE_H.length + 2}" class="mut fnnone">${FN.q ? "찾는 줄이 없어요" : "아직 없어요"}</td></tr>`}</tbody></table></div></section>`;
}
function costHtml() {
  const rows = sorted("cost"), s = summary(rows, 0), fee = summary(visible(), FN.cfg?.fee_pct ?? 5).fee;
  const secs = [...SECTIONS, ...new Set(rows.map((r) => (r.vals.구분 || "").trim() || "기타").filter((x) => !SECTIONS.includes(x)))];
  const cols = COST_H.filter((k) => k !== "구분");
  const body = secs.map((sec) => {
    const rs = rows.filter((r) => ((r.vals.구분 || "").trim() || "기타") === sec);
    if (!rs.length && !canEdit()) return "";
    const tot = (s.bySec[sec] ?? 0) + (sec === "고정비" ? fee : 0);
    return `<tbody class="fnsec"><tr class="fnsech"><th colspan="${cols.length + 2}"><span>${esc(sec)}</span><b>${won(tot)}</b>${canEdit() ? `<button class="btn ghost" data-act="add" data-kind="cost" data-sec="${esc(sec)}">+ 줄</button>` : ""}</th></tr>
      ${rs.map((r) => `<tr>${cols.map((k) => k === "근무시간" && sec !== "행정조교" ? "<td></td>" : cellIn(r, k)).join("")}${clip(r)}${del(r)}</tr>`).join("")}
      ${sec === "고정비" ? `<tr class="fnauto"><td></td><td>결제수수료 (순매출 × ${FN.cfg?.fee_pct ?? 5}%) <small class="mut">자동</small></td><td class="num">${fee.toLocaleString("ko-KR")}</td><td colspan="${cols.length - 1}"></td></tr>` : ""}</tbody>`;
  }).join("");
  return `<section class="fnpanel"><div class="fngbar"><h3>비용 <small class="mut">${rows.length}건 · ${won(s.cost + fee)} (수수료 포함)</small></h3><small class="mut">행정조교는 근무시간을 적으면 금액 = 시급 ${(FN.cfg?.rate ?? 10320).toLocaleString("ko-KR")}원 × 시간</small></div>
    <div class="fnscroll"><table class="fntbl fncost"><thead><tr>${cols.map((k) => `<th>${k}</th>`).join("")}${jo() ? "" : "<th>📎</th>"}${canEdit() ? "<th></th>" : ""}</tr></thead>${body}</table></div></section>`;
}
function dailyHtml() {
  const d = daily(visible());
  return `<section class="fnpanel"><details><summary>📅 관리자 체크 <span class="mut">날짜별 매출 · 비용 · 수익 · 누적</span></summary>
    <div class="fnscroll"><table class="fntbl fnday"><thead><tr><th>날짜</th><th>매출</th><th>비용</th><th>수익</th><th>누적수익</th></tr></thead>
    <tbody>${d.map((x) => `<tr><td>${x.day || "날짜 없음"}</td><td class="num">${x.sale.toLocaleString("ko-KR")}</td><td class="num">${x.cost.toLocaleString("ko-KR")}</td><td class="num ${x.profit < 0 ? "neg" : ""}">${x.profit.toLocaleString("ko-KR")}</td><td class="num ${x.acc < 0 ? "neg" : ""}">${x.acc.toLocaleString("ko-KR")}</td></tr>`).join("")}</tbody></table></div></details></section>`;
}

let save = Promise.resolve();
// ✏️ 칸 저장: 날짜는 YYYY-MM-DD 로, 숫자 칸은 숫자로. 행정조교 근무시간 → 금액 = 시급 × 시간 (금액이 비었거나 전에 자동으로 넣은 값일 때)
async function saveCell(inp) {
  const r = FN.rows.find((x) => x.id === inp.dataset.id); if (!r) return;
  const k = inp.dataset.k, raw = inp.value.trim();
  const v = k === "날짜" ? normDate(raw, FN.month) : NUMK.has(k) ? (raw === "" ? "" : toNum(raw) ?? raw) : raw;
  if (String(v) === String(r.vals[k] ?? "")) { inp.value = NUMK.has(k) ? fmtNum(v) : v; return; }
  const vals = { ...r.vals, [k]: v }, rate = FN.cfg?.rate ?? 10320;
  if (k === "근무시간" && r.vals.구분 === "행정조교" && typeof v === "number") {
    const was = toNum(r.vals.금액), auto = toNum(r.vals.근무시간) !== null ? Math.round(rate * toNum(r.vals.근무시간)) : null;
    if (was === null || was === 0 || was === auto) vals.금액 = Math.round(rate * v);
  }
  r.vals = vals;
  inp.value = NUMK.has(k) ? fmtNum(v) : v;
  // 저장은 차례로, 보낼 때의 최신 vals 로 (빨리 여러 칸 고쳐도 서로 덮어쓰지 않게)
  const { error } = await (save = save.then(() => sb.from("fin_rows").update({ vals: r.vals }).eq("id", r.id)));
  if (fail(error)) return;
  if (k === "근무시간" || NUMK.has(k)) render();
  queueSync();
}
async function addRow(kind, sec) {
  const d = FN.month === ymNow() ? today() : "";
  const vals = kind === "sale" ? { 날짜: d } : { 구분: sec, 날짜: ["본사지출", "지점기타지출"].includes(sec) ? d : "" };
  const sort = Math.max(0, ...FN.rows.filter((r) => r.kind === kind).map((r) => r.sort)) + 1;
  const { data, error } = await sb.from("fin_rows").insert({ team_id: FN.team, month: FN.month, kind, vals, sort }).select("id, kind, vals, sort, files, updated_by, updated_at").single();
  if (fail(error)) return;
  FN.rows.push(data); FN.q = ""; render();
  V().querySelector(`input[data-id="${data.id}"][data-k="${kind === "sale" ? "멤버쉽" : "사용처"}"]`)?.focus();
  queueSync();
}
async function delRow(id) {
  const r = FN.rows.find((x) => x.id === id); if (!r) return;
  const what = r.kind === "sale" ? [r.vals.날짜, r.vals.이름, r.vals.매출].filter(Boolean).join(" · ") : [r.vals.사용처, r.vals.금액].filter(Boolean).join(" · ");
  if (!confirm(`이 줄을 지울까요? 구글 시트에서도 지워져요.\n${what || "(빈 줄)"}`)) return;
  const { error } = await sb.from("fin_rows").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (fail(error)) return;
  FN.rows = FN.rows.filter((x) => x.id !== id); render(); queueSync();
}

// 📎 첨부: 대표 = 목록·열기·올리기·지우기 / 매니저 = 올리기만 (올린 뒤에도 못 엶)
function filesDlg(id) {
  const r = FN.rows.find((x) => x.id === id); if (!r) return;
  const dlg = document.getElementById("fnFiles") ?? document.body.appendChild(Object.assign(document.createElement("dialog"), { id: "fnFiles", className: "fndlg" }));
  const list = FN.files.get(id) ?? [];
  dlg.innerHTML = `<form method="dialog"><h3>📎 첨부 <small class="mut">${esc(r.vals.사용처 || r.vals.이름 || r.vals.멤버쉽 || "")}</small></h3>
    ${admin() ? (list.length ? `<ul class="fnflist">${list.map((f) => `<li><a href="#" data-path="${esc(f.path)}">${esc(f.file_name)}</a> <small class="mut">${esc(f.by_name)} · ${new Date(f.created_at).toLocaleDateString("ko-KR")}</small> <button type="button" data-rm="${f.id}" data-path="${esc(f.path)}">🗑</button></li>`).join("")}</ul>` : `<p class="mut">아직 없어요</p>`)
      : `<p class="mut">영수증·증빙을 올릴 수 있어요. <b>올린 파일은 대표님만 열어볼 수 있어요.</b>${r.files ? ` (지금 ${r.files}개)` : ""}</p>`}
    <label class="btn">📤 파일 올리기<input type="file" multiple hidden></label>
    <menu><button class="btn ghost">닫기</button></menu></form>`;
  dlg.querySelector("input[type=file]").onchange = async (e) => {
    for (const f of e.target.files) {
      if (f.size > 20 * 1024 * 1024) { toast(`${f.name}: 20MB 넘어요`); continue; }
      const path = `${FN.team}/${id}/${safeKey(f.name)}`;
      const up = await sb.storage.from("fin-files").upload(path, f, { contentType: f.type || undefined });
      if (fail(up.error)) return;
      const ins = await sb.from("fin_files").insert({ row_id: id, team_id: FN.team, path, file_name: f.name.slice(0, 200), by_name: myName ?? "" });
      if (fail(ins.error)) return;
    }
    toast("📎 올렸어요"); dlg.close(); FN.load();
  };
  dlg.onclick = async (e) => {
    const a = e.target.closest("a[data-path]");
    if (a) { e.preventDefault(); const { data, error } = await sb.storage.from("fin-files").createSignedUrl(a.dataset.path, 600); if (!fail(error)) window.open(data.signedUrl, "_blank", "noopener"); return; }
    const rm = e.target.closest("button[data-rm]");
    if (rm && confirm("이 첨부를 지울까요?")) {
      await sb.storage.from("fin-files").remove([rm.dataset.path]);
      if (!fail((await sb.from("fin_files").delete().eq("id", +rm.dataset.rm)).error)) { dlg.close(); FN.load(); }
    }
  };
  dlg.showModal();
}

// ⚙️ 시트 설정 (대표): 시트 주소·탭 이름·시급·수수료율 → 저장하면 이번 달 바로 맞춤
function cfgDlg() {
  const c = FN.cfg ?? {}, name = teams.find((t) => t.id === FN.team)?.name ?? "";
  const dlg = document.getElementById("fnCfg") ?? document.body.appendChild(Object.assign(document.createElement("dialog"), { id: "fnCfg", className: "fndlg" }));
  dlg.innerHTML = `<form method="dialog"><h3>⚙️ ${esc(name)} 시트 설정</h3>
    <label>구글 시트 주소 <small class="mut">비우면 연동 끔 · 다른 시트로 바꾸면 플래너 내용이 새 시트에 다시 써져요</small><input name="sheet" value="${c.sheet_id ? `https://docs.google.com/spreadsheets/d/${esc(c.sheet_id)}/edit` : ""}" placeholder="https://docs.google.com/spreadsheets/d/…"></label>
    <label>매출 탭 이름 <small class="mut">{YYYYMM} = 202610 처럼 달로 바뀜</small><input name="sale_tab" value="${esc(c.sale_tab ?? "{YYYYMM} 매출(플래너)")}"></label>
    <label>비용 탭 이름<input name="cost_tab" value="${esc(c.cost_tab ?? "{YYYYMM} 비용(플래너)")}"></label>
    <div class="fnrow"><label>조교 시급<input name="rate" type="number" min="1000" max="100000" value="${c.rate ?? 10320}"></label><label>결제수수료 %<input name="fee_pct" type="number" min="0" max="30" step="0.1" value="${c.fee_pct ?? 5}"></label></div>
    <p class="mut">시트의 플래너 탭은 열 순서를 바꿔도 되고, 다른 열을 더 붙여도 그 열은 안 건드려요. <b>플래너ID 칸</b>만 지우지 마세요. 처음 대표 계정 Apps Script 에 FIN_KEY 가 있어야 해요.</p>
    <menu><button class="btn ghost" value="cancel">취소</button><button class="btn" value="ok">저장하고 맞추기</button></menu></form>`;
  dlg.onclose = async () => {
    if (dlg.returnValue !== "ok") return;
    const f = new FormData(dlg.querySelector("form"));
    toast("🔄 저장하고 시트와 맞추는 중…");
    const { data, error } = await sb.functions.invoke("planner-fin", { body: { action: "setup", team: FN.team, month: FN.month, ...Object.fromEntries(f) } });
    const err = error?.message ?? data?.error;
    toast(err ? "⚠️ " + err : "✅ 저장했어요"); FN.load();
  };
  dlg.showModal();
}

document.addEventListener("click", async (e) => {
  const b = e.target.closest("#fnView [data-act]"); if (!b) return;
  const a = b.dataset.act;
  if (a === "prev" || a === "next" || a === "now") { FN.month = a === "now" ? ymNow() : ymAdd(FN.month, a === "prev" ? -1 : 1); FN.shell = ""; return FN.load(); }
  if (a === "sync") return syncNow(true);
  if (a === "cfg") return cfgDlg();
  if (a === "add") return addRow(b.dataset.kind, b.dataset.sec);
  if (a === "del") return delRow(b.dataset.id);
  if (a === "files") return filesDlg(b.dataset.id);
  if (a === "acc") { if (!fail((await sb.from("fin_access").upsert({ team_id: FN.team, status: b.dataset.s })).error)) { toast(b.dataset.s === "open" ? "🔓 조교 링크로 볼 수 있어요" : "🔒 닫았어요"); FN.load(); } return; }
  if (a === "request") {
    const q = FN.access ? sb.from("fin_access").update({ status: "requested" }).eq("team_id", FN.team) : sb.from("fin_access").insert({ team_id: FN.team, status: "requested" });
    if (!fail((await q).error)) { toast("🙋 대표님께 요청했어요"); FN.load(); }
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "fnTeam") { FN.team = +e.target.value; try { localStorage.setItem("fn-team", FN.team); } catch {} FN.shell = ""; return FN.load(); }
  if (e.target.matches("#fnView input[data-id]")) saveCell(e.target);
});
document.addEventListener("input", (e) => { if (e.target.id === "fnQ") { FN.q = e.target.value; clearTimeout(FN.qt); FN.qt = setTimeout(render, 200); } });
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("#fnView input[data-id]")) e.target.blur(); });
document.addEventListener("focusout", (e) => { if (dirty && e.target.matches("#fnView input")) setTimeout(() => { if (dirty && !V().contains(document.activeElement)) { dirty = false; FN.load(); } }, 300); });
})();
