// 🌏 [언어교환] 탭 — 옛 외국인 회원 사이트(culcom-global admin.html)를 플래너로 옮김. 대표·매니저·조교 누구나 전 지점 보기·매칭 (DB 0075_gx)
// 외국인(4개 프로그램 신청) · 한국인(1:1 언어교환) · 매칭 추천(스케줄→언어→지점→온/오프, 동점 멤버십) · 이벤트 · 공개 신청 링크·QR · CSV
// 공개 신청폼 = site/gx/ (로그인 없음). 지우기는 조교 빼고(서버도 막음)
// index.html 의 sb·myRole·previewTeam·teams·esc·toast·fail 을 씀 → window.GX
(() => {
const GX = (window.GX = { sub: "db", fp: "", fs: "", br: null, q: "", kq: "", members: [], koreans: [], events: [], sel: null, ksel: null });
const V = () => document.getElementById("gxView");
const BR = { "daegu-en": "대구영어점", "daegu-jpcn": "대구일중점", ulsan: "울산점" }; // 공개폼 지점 id ↔ 플래너 지점 이름 (gx/config.js BRANCHES)
const PROG = { korean_class: "한국어 수업", language_exchange: "1:1 언어교환", socializing: "소셜(스터디)", event: "이벤트" };
const APP_ST = { applied: "신청", confirmed: "확정", matched: "매칭됨", attended: "참석", cancelled: "취소" };
const M_ST = { new: "새 회원", active: "활동 중", inactive: "쉬는 중" };
const K_ST = { new: "대기", matched: "매칭됨", inactive: "쉬는 중" };
const KEY = { available_days: "요일", available_times: "시간", days: "요일", times: "시간", mode: "방식", frequency: "횟수", exchange_style: "교환 스타일", other_language_level: "언어 레벨", preferred_partner: "원하는 상대", level: "반", message: "메시지", note: "메모" }; // 신청폼 답 이름 → 한국어
const answers = (a, sep) => Object.entries(a.data || {}).filter(([, v]) => v && v.length).map(([k, v]) => `${KEY[k] || k}: ${Array.isArray(v) ? v.join("/") : v}`).join(sep);
const TIER = { "VVIP+": 0, VVIP: 1, Basic: 2, Lite: 3 };
const SUBS = [["db", "📊 현황"], ["fm", "🌍 외국인"], ["kr", "🇰🇷 한국인"], ["ev", "🎉 이벤트"], ["ln", "🔗 신청 링크·QR"], ["help", "📖 사용법"]];
const jo = () => myRole === "assistant";
const day = (s) => (s ? new Date(s).toLocaleDateString("sv-SE") : ""); // 한국 시간 YYYY-MM-DD
const when = (s) => (s ? new Date(s).toLocaleString("sv-SE").slice(0, 16) : "");
const opts = (map, sel) => Object.entries(map).map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`).join("");
const brOpts = (sel) => `<option value="">전 지점</option>${opts(BR, sel)}`;
const active = (k) => (k.gx_matches || []).filter((x) => !x.ended_at);
const since = (d) => { const n = Math.floor((Date.now() - new Date(d)) / 864e5); return n < 7 ? `${n}일째` : `${Math.floor(n / 7)}주째`; };
const dash = (v) => (v == null || v === "" ? `<span class="mut">—</span>` : esc(v));
try { GX.sub = localStorage.getItem("gx-sub") || "db"; } catch {}

GX.load = async function () {
  if (GX.br === null) { // 처음 한 번: 우리 지점 기본 (대표는 지난번 고른 것, 없으면 전 지점)
    let br = "";
    if (myRole === "admin" && !previewTeam) { try { br = localStorage.getItem("gx-br") || ""; } catch {} }
    else { const tid = previewTeam ?? (await sb.rpc("my_team")).data ?? (await sb.rpc("assistant_team")).data; const name = tid && (await sb.from("teams").select("name").eq("id", tid).maybeSingle()).data?.name; /* teams 배열은 대표만 채워짐 */ br = Object.keys(BR).find((k) => BR[k] === name) || ""; }
    GX.br = br;
  }
  const [m, k, e] = await Promise.all([
    sb.from("gx_members").select("*, gx_applications(*, gx_events(title), gx_matches(*, gx_koreans(name, membership)))").order("created_at", { ascending: false }),
    sb.from("gx_koreans").select("*, gx_matches(*, gx_members(name))").order("created_at", { ascending: false }),
    sb.from("gx_events").select("*, gx_applications(id)").order("event_date", { ascending: false })]);
  if ([m, k, e].some((r) => fail(r.error))) return;
  GX.members = m.data; GX.koreans = k.data; GX.events = e.data;
  if (GX.sel) GX.sel = GX.members.find((x) => x.id === GX.sel.id) || null;
  if (GX.ksel) GX.ksel = GX.koreans.find((x) => x.id === GX.ksel.id) || null;
  render();
};

// ---- 매칭 추천: 점수 높을수록 잘 맞음
const LANG_HINT = { 영어: ["english"], 일본어: ["japanese", "japan", "日本"], 중국어: ["chinese", "china", "mandarin", "taiwan", "中文"] };
const ENG = { Native: 3, Advanced: 3, Intermediate: 1, Beginner: 0, None: -2 };
function score(m, a, k) {
  const d = a.data || {}, why = [];
  const days = (d.available_days || []).filter((x) => (k.available_days || []).includes(x));
  const times = (d.available_times || []).filter((x) => (k.available_times || []).includes(x));
  let s = days.length * 2 + times.length * 2;
  if (days.length) why.push("요일 " + days.join("/")); if (times.length) why.push("시간 " + times.join("/"));
  if (!days.length && !times.length) why.push("스케줄 안 겹침");
  const spoken = ((m.languages_spoken || "") + " " + (m.nationality || "")).toLowerCase(), hints = LANG_HINT[k.target_language];
  if (hints) {
    if (hints.some((h) => spoken.includes(h))) { s += 3; why.push(k.target_language + " 가능"); }
    else if (k.target_language === "영어" && m.english_level in ENG) { s += ENG[m.english_level]; why.push("영어 " + m.english_level); }
    else { s -= 2; why.push("언어 맞는지 모름"); }
  }
  if (m.branch && k.branch) { if (m.branch === k.branch) { s += 2; why.push("같은 지점"); } else { s -= 1; why.push("다른 지점: " + (BR[k.branch] || k.branch)); } }
  const fm = d.mode || "", km = k.mode || "", fOn = fm.startsWith("Online"), fOff = fm.startsWith("Offline"), kOn = km.startsWith("온라인"), kOff = km.startsWith("오프라인");
  if ((fOn && kOff) || (fOff && kOn)) { s -= 3; why.push("온/오프라인 다름"); } else if (fm && km) s += 1;
  return { k, s, why };
}
const free = () => GX.koreans.filter((k) => k.status !== "inactive" && !active(k).length); // 한국인 = 동시에 1명
const recommend = (m, a) => free().map((k) => score(m, a, k)).sort((x, y) => y.s - x.s || (TIER[x.k.membership] ?? 9) - (TIER[y.k.membership] ?? 9)).slice(0, 5);
async function match(a, m, k) {
  if (!k || !confirm(`${m.name} ↔ ${k.name} 매칭할까요?`)) return;
  const { error } = await sb.from("gx_matches").insert({ application_id: a.id, member_id: m.id, korean_id: k.id });
  if (fail(error)) return;
  await Promise.all([sb.from("gx_applications").update({ status: "matched" }).eq("id", a.id), sb.from("gx_koreans").update({ status: "matched" }).eq("id", k.id)]);
  toast("매칭했어요"); GX.load();
}
async function endMatch(x) {
  if (!confirm("이 매칭을 끝낼까요?")) return;
  const { error } = await sb.from("gx_matches").update({ ended_at: new Date().toISOString().slice(0, 10) }).eq("id", x.id);
  if (fail(error)) return;
  await sb.from("gx_koreans").update({ status: "new" }).eq("id", x.korean_id);
  toast("매칭 끝냈어요"); GX.load();
}

// ---- 화면
function render() {
  const v = V(), n = { fm: GX.members.filter(inBr).length, kr: GX.koreans.filter(inBr).length };
  v.innerHTML = `<div class="gxbar"><h2>🌏 언어교환</h2><select id="gxBr">${brOpts(GX.br)}</select>
      <nav class="gxsub">${SUBS.map(([id, l]) => `<button data-s="${id}" class="${GX.sub === id ? "on" : ""}">${l}${n[id] != null ? ` <span class="mut">${n[id]}</span>` : ""}</button>`).join("")}</nav>
      <button class="btn ghost" id="gxCsv" title="외국인 + 신청 한 줄씩">⬇️ CSV</button></div>
    <div id="gxBody"></div>`;
  v.querySelector("#gxBr").onchange = (e) => { GX.br = e.target.value; try { if (myRole === "admin") localStorage.setItem("gx-br", GX.br); } catch {} render(); };
  v.querySelectorAll(".gxsub button").forEach((b) => (b.onclick = () => { GX.sub = b.dataset.s; try { localStorage.setItem("gx-sub", GX.sub); } catch {} render(); }));
  v.querySelector("#gxCsv").onclick = csv;
  ({ help: renderHelp, db: renderDash, fm: renderMembers, kr: renderKoreans, ev: renderEvents, ln: renderLinks })[GX.sub]?.();
}
const inBr = (x) => !GX.br || x.branch === GX.br;
const body = () => V().querySelector("#gxBody");
const openMember = (id) => { GX.sel = GX.members.find((m) => m.id === id) || null; GX.sub = "fm"; render(); showPanel(); };
const openKorean = (id) => { GX.ksel = GX.koreans.find((k) => k.id === id) || null; GX.sub = "kr"; render(); showPanel(); };
const apps = () => GX.members.filter(inBr).flatMap((m) => m.gx_applications.map((a) => ({ a, m }))).sort((x, y) => y.a.created_at.localeCompare(x.a.created_at));
const appTag = (a) => `<span class="gxtag ${a.status}">${esc(APP_ST[a.status] || a.status)}</span>`;
const evApps = (e) => GX.members.flatMap((m) => m.gx_applications.filter((a) => a.event_id === e.id).map((a) => ({ a, m }))); // 이벤트는 전 지점 공용

// ---- 📊 현황: 숫자 · 프로그램별 신청 · 매칭 대기(+1순위 추천) · 최근 신청 · 다가오는 이벤트 · 어디서 뭘 보나
function renderDash() {
  const ms = GX.members.filter(inBr), ks = GX.koreans.filter(inBr), all = apps(), ym = new Date().toLocaleDateString("sv-SE").slice(0, 7);
  const nowMatch = all.reduce((n, { a }) => n + active(a).length, 0);
  const waiting = all.filter(({ a }) => a.program === "language_exchange" && !active(a).length && a.status !== "cancelled");
  const todo = all.filter(({ a }) => a.status === "applied").length;
  const card = (n, l, sub, go) => `<button class="card gxnum" data-go="${go}"><b>${n}</b><span>${l}</span><small class="mut">${sub}</small></button>`;
  const prow = (p) => { const xs = all.filter(({ a }) => a.program === p); return `<tr data-p="${p}"><td><b>${PROG[p]}</b></td><td><b>${xs.length}</b></td>${Object.keys(APP_ST).map((st) => `<td>${xs.filter(({ a }) => a.status === st).length || `<span class="mut">0</span>`}</td>`).join("")}</tr>`; };
  const list = all.filter(({ a }) => (!GX.fp || a.program === GX.fp) && (!GX.fs || a.status === GX.fs));
  const today = new Date().toLocaleDateString("sv-SE"), evs = GX.events.filter((e) => e.is_active && (!e.event_date || e.event_date >= today)).sort((x, y) => (x.event_date || "9").localeCompare(y.event_date || "9"));
  body().innerHTML = `<div class="gxnums">
      ${card(ms.length, "외국인 회원", `이번 달 +${ms.filter((m) => day(m.created_at).startsWith(ym)).length}`, "fm")}
      ${card(ks.length, "한국인 회원", `매칭 기다림 ${free().filter(inBr).length}`, "kr")}
      ${card(all.length, "신청", `처리 안 됨 ${todo}`, "list")}
      ${card(nowMatch, "진행 중 매칭", `매칭 기다리는 외국인 ${waiting.length}`, "wait")}
    </div>
    <div class="gxdash">
      <section class="card"><h3>📋 프로그램별 신청 <small class="mut">줄을 누르면 아래 목록이 그 프로그램만</small></h3>
        <table class="gxt"><thead><tr><th>프로그램</th><th>전체</th>${Object.values(APP_ST).map((l) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${Object.keys(PROG).map(prow).join("")}</tbody></table></section>
      <section class="card" id="gxWait"><h3>🤝 매칭 기다리는 외국인 <small class="mut">1:1 언어교환 신청 · 1순위 추천</small></h3>
        ${waiting.map(({ a, m }) => { const r = recommend(m, a)[0]; return `<div class="gxmrow"><span><a href="#" data-m="${m.id}"><b>${esc(m.name)}</b></a> <small class="mut">${esc(BR[m.branch] || "")} · ${day(a.created_at)} · ${((a.data || {}).available_days || []).join("/")} ${((a.data || {}).available_times || []).join("/")}</small><br>
          ${r ? `<small>추천 → <b>${esc(r.k.name)}</b> <span class="gxtag ${r.s >= 4 ? "confirmed" : ""}">${r.s}점</span> <span class="mut">${esc(r.why.join(" · "))}</span></small>` : `<small class="mut">비어 있는 한국인 회원이 없어요</small>`}</span>
          ${r ? `<button class="btn d-match" data-a="${a.id}" data-k="${r.k.id}">매칭</button>` : ""}<button class="btn ghost" data-m="${m.id}">추천 더 보기</button></div>`; }).join("") || `<div class="mut">기다리는 사람 없어요</div>`}</section>
      <section class="card gxwide"><h3>📝 신청 목록 <select id="gxFp"><option value="">모든 프로그램</option>${opts(PROG, GX.fp)}</select><select id="gxFs"><option value="">모든 상태</option>${opts(APP_ST, GX.fs)}</select> <small class="mut">${list.length}건 · 이름을 누르면 회원 상세(상태·메모 저장)</small></h3>
        <div class="gxscroll"><table class="gxt"><thead><tr><th>신청일</th><th>이름</th><th>지점</th><th>프로그램</th><th>상태</th><th>내용</th></tr></thead><tbody>
        ${list.slice(0, 200).map(({ a, m }) => `<tr data-m="${m.id}"><td>${day(a.created_at)}</td><td><b>${esc(m.name)}</b><br><small class="mut">${esc(m.phone)}</small></td><td>${esc(BR[m.branch] || "")}</td><td>${PROG[a.program]}${a.gx_events ? ": " + esc(a.gx_events.title) : ""}</td><td>${appTag(a)}${active(a).map((x) => `<br><small>↔ ${esc(x.gx_koreans?.name)}</small>`).join("")}</td>
          <td><small class="mut">${esc(answers(a, " · ").slice(0, 140))}</small></td></tr>`).join("") || `<tr><td colspan="6" class="mut">신청 없음 — [🔗 신청 링크·QR] 의 링크·QR 을 외국인에게 보내면 여기에 쌓여요</td></tr>`}
        </tbody></table></div></section>
      <section class="card"><h3>🎉 다가오는 이벤트 <small class="mut">공개 중 · 전 지점</small></h3>
        ${evs.map((e) => { const xs = evApps(e); return `<div class="gxev"><b>${esc(e.title)}</b> <small class="mut">${esc(e.event_date ?? "날짜 미정")} ${esc(e.event_time ?? "")} · ${esc(e.location)}</small> <span class="gxtag">${xs.length}명</span>
          <div>${xs.map(({ a, m }) => `<a href="#" data-m="${m.id}">${esc(m.name)}</a>${appTag(a)}`).join(" ") || `<small class="mut">아직 신청 없음</small>`}</div></div>`; }).join("") || `<div class="mut">공개 중인 이벤트 없음 — [🎉 이벤트] 에서 추가</div>`}</section>
      <section class="card"><h3>📍 어디서 뭘 보나요</h3><ul class="gxhelp">
        <li><b>📊 현황</b> — 숫자·신청 목록·매칭 대기·이벤트 한눈에 (지금 화면)</li>
        <li><b>🌍 외국인</b> — 외국인 회원 전체 정보 · 신청별 상태·메모 · <b>매칭 추천 5명</b>·매칭 끝내기 · 지우기</li>
        <li><b>🇰🇷 한국인</b> — 한국인 언어교환 회원 · 멤버십(VVIP+·VVIP·Basic·Lite) · 지금 누구랑 매칭됐는지</li>
        <li><b>🎉 이벤트</b> — 이벤트 만들기 · [공개] 켜면 외국인 신청폼에 보임 · 이벤트별 신청자</li>
        <li><b>🔗 신청 링크·QR</b> — 외국인·한국인에게 보낼 링크 (지점 미리 골라진 것 포함)</li>
        <li><b>⬇️ CSV</b> — 외국인 + 신청 엑셀로 내려받기 · 위 지점 고르기가 모든 화면에 적용</li></ul>
        <button class="btn ghost" id="gxHelpGo">📖 자세한 사용법 보기</button></section>
    </div>`;
  const B = body();
  B.querySelectorAll(".gxnum").forEach((b) => (b.onclick = () => { const g = b.dataset.go; if (g === "list") B.querySelector(".gxwide").scrollIntoView({ behavior: "smooth" }); else if (g === "wait") B.querySelector("#gxWait").scrollIntoView({ behavior: "smooth" }); else { GX.sub = g; render(); } }));
  B.querySelectorAll("tr[data-p]").forEach((tr) => (tr.onclick = () => { GX.fp = GX.fp === tr.dataset.p ? "" : tr.dataset.p; renderDash(); B.querySelector(".gxwide").scrollIntoView({ behavior: "smooth" }); }));
  B.querySelector("#gxHelpGo").onclick = () => { GX.sub = "help"; try { localStorage.setItem("gx-sub", "help"); } catch {} render(); };
  B.querySelector("#gxFp").onchange = (e) => { GX.fp = e.target.value; renderDash(); };
  B.querySelector("#gxFs").onchange = (e) => { GX.fs = e.target.value; renderDash(); };
  B.querySelectorAll("[data-m]").forEach((el) => (el.onclick = (ev) => { ev.preventDefault(); openMember(el.dataset.m); }));
  B.querySelectorAll(".d-match").forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); const { a, m } = all.find((x) => x.a.id === b.dataset.a); match(a, m, GX.koreans.find((k) => k.id === b.dataset.k)); }));
}
const showPanel = () => { if (innerWidth < 1300) body().querySelector("#gxPanel")?.scrollIntoView({ behavior: "smooth", block: "start" }); }; // 한 줄 화면이면 밑의 상세로

function renderMembers() {
  const q = GX.q.trim().toLowerCase();
  const list = GX.members.filter((m) => inBr(m) && (!q || [m.name, m.phone, m.email, m.nationality].join(" ").toLowerCase().includes(q)));
  body().innerHTML = `<div class="gxlay"><div class="gxlist">
      <input id="gxQ" placeholder="이름·번호·이메일·국적 검색" value="${esc(GX.q)}">
      <div class="card"><table class="gxt"><thead><tr><th>이름</th><th>지점</th><th>연락처</th><th>국적</th><th>가입</th><th>신청</th><th>상태</th></tr></thead><tbody>
      ${list.map((m) => `<tr data-id="${m.id}" class="${GX.sel?.id === m.id ? "on" : ""}"><td><b>${esc(m.name)}</b></td><td>${esc(BR[m.branch] || m.branch || "")}</td>
        <td>${esc(m.phone)}<br><small class="mut">${esc(m.email)}</small></td><td>${esc(m.nationality)}</td><td>${day(m.created_at)}</td>
        <td>${m.gx_applications.map((a) => { const on = active(a).length; return `<span class="gxtag ${a.status}" title="${APP_ST[a.status] || a.status}">${PROG[a.program]}${a.gx_events ? ": " + esc(a.gx_events.title) : ""}${on ? " ×" + on : ""}</span>`; }).join("") || `<span class="mut">—</span>`}</td>
        <td>${esc(M_ST[m.status] || m.status)}</td></tr>`).join("") || `<tr><td colspan="7" class="mut">아직 없어요 — [🔗 신청 링크·QR] 에서 외국인 신청 링크를 보내 주세요</td></tr>`}
      </tbody></table></div></div><div id="gxPanel"></div></div>`;
  const qi = body().querySelector("#gxQ"); qi.oninput = () => { GX.q = qi.value; const at = qi.selectionStart; renderMembers(); const n = body().querySelector("#gxQ"); n.focus(); n.setSelectionRange(at, at); };
  body().querySelectorAll("tbody tr[data-id]").forEach((tr) => (tr.onclick = () => { GX.sel = GX.members.find((m) => m.id === tr.dataset.id); renderMembers(); showPanel(); }));
  memberPanel();
}
function matchBlock(m, a) {
  const cur = active(a), past = (a.gx_matches || []).filter((x) => x.ended_at), rec = recommend(m, a);
  return `<div class="gxmt"><b class="gxh">지금 매칭 (${cur.length})</b>
    ${cur.map((x) => `<div class="gxmrow"><span><b>${esc(x.gx_koreans?.name)}</b> <span class="gxtag">${esc(x.gx_koreans?.membership)}</span> · ${x.started_at}부터 · <b>${since(x.started_at)}</b></span><button class="btn ghost m-end" data-id="${x.id}">끝내기</button></div>`).join("") || `<div class="mut">아직 없어요</div>`}
    ${past.length ? `<small class="mut">지난 매칭: ${past.map((x) => esc(x.gx_koreans?.name) + " (" + x.started_at + "→" + x.ended_at + ")").join(", ")}</small>` : ""}
    <b class="gxh">추천 · 스케줄 겹침 → 언어 → 지점 → 온/오프라인, 같으면 멤버십 순</b>
    ${rec.map((r) => `<div class="gxmrow"><span><b>${esc(r.k.name)}</b> <span class="gxtag">${esc(r.k.membership)}</span> <span class="gxtag ${r.s >= 4 ? "confirmed" : ""}">${r.s}점</span><br><small class="mut">${esc(r.why.join(" · "))} · ${(r.k.available_days || []).join("/")} ${(r.k.available_times || []).join("/")}</small></span><button class="btn m-add" data-id="${r.k.id}">매칭</button></div>`).join("") || `<div class="mut">비어 있는 한국인 회원이 없어요</div>`}
    <select class="m-any"><option value="">…또는 직접 고르기 (매칭 안 된 한국인)</option>${free().map((k) => `<option value="${k.id}">${esc(k.name)} · ${esc(k.membership)} · ${esc(k.target_language)} · ${(k.available_days || []).join("/")}</option>`).join("")}</select></div>`;
}
function memberPanel() {
  const m = GX.sel, p = body().querySelector("#gxPanel");
  if (!m) { p.innerHTML = `<div class="card mut gxempty">왼쪽에서 회원을 누르면 자세히 보여요</div>`; return; }
  const F = [["지점", BR[m.branch] || m.branch], ["전화", m.phone], ["이메일", m.email], ["국적", m.nationality], ["성별", m.gender], ["나이", m.age_range],
    ["한국 거주", m.lives_in_korea == null ? "" : m.lives_in_korea ? "예" : "아니오"], ["거주 기간", m.korea_duration], ["한국어", m.korean_level], ["영어", m.english_level],
    ["쓰는 언어", m.languages_spoken], ["배우는 언어", m.languages_learning], ["알게 된 곳", m.referral_source], ["가입", when(m.created_at)]];
  const apps = m.gx_applications.slice().sort((x, y) => y.created_at.localeCompare(x.created_at));
  p.innerHTML = `<div class="card gxpanel"><h3>${esc(m.name)} <button class="btn ghost" id="gxClose">✕</button></h3>
    <dl>${F.map(([k, v]) => `<dt>${k}</dt><dd>${dash(v)}</dd>`).join("")}</dl>
    <div class="gxctl"><select id="mSt">${opts(M_ST, m.status)}</select><textarea id="mNote" placeholder="메모">${esc(m.admin_note)}</textarea><button class="btn" id="mSave">저장</button></div>
    <h3>신청 (${apps.length})</h3>
    ${apps.map((a) => `<div class="gxapp" data-id="${a.id}"><b>${PROG[a.program]}${a.gx_events ? " · " + esc(a.gx_events.title) : ""}</b> <small class="mut">${day(a.created_at)}</small>
      ${a.program === "language_exchange" ? matchBlock(m, a) : ""}
      <pre>${esc(answers(a, "\n")) || "(자세한 내용 없음)"}</pre>
      <div class="gxctl"><select class="aSt">${opts(APP_ST, a.status)}</select><textarea class="aNote" placeholder="메모 (예: 김민수와 매칭)">${esc(a.admin_note)}</textarea><button class="btn ghost aSave">저장</button></div></div>`).join("") || `<div class="mut">신청 없음</div>`}
    ${jo() ? "" : `<button class="btn ghost gxdel" id="mDel">🗑 회원 지우기</button>`}</div>`;
  p.querySelector("#gxClose").onclick = () => { GX.sel = null; renderMembers(); };
  p.querySelector("#mSave").onclick = async () => { const { error } = await sb.from("gx_members").update({ status: p.querySelector("#mSt").value, admin_note: p.querySelector("#mNote").value }).eq("id", m.id); if (!fail(error)) { toast("저장했어요"); GX.load(); } };
  p.querySelector("#mDel")?.addEventListener("click", async () => {
    if (!confirm(`${m.name} 회원과 신청 기록을 전부 지울까요? 되돌릴 수 없어요.`)) return;
    const { error } = await sb.from("gx_members").delete().eq("id", m.id); if (fail(error)) return; GX.sel = null; GX.load();
  });
  p.querySelectorAll(".gxapp").forEach((el) => {
    const a = m.gx_applications.find((x) => x.id === el.dataset.id);
    el.querySelector(".aSave").onclick = async () => { const { error } = await sb.from("gx_applications").update({ status: el.querySelector(".aSt").value, admin_note: el.querySelector(".aNote").value }).eq("id", a.id); if (!fail(error)) { toast("저장했어요"); GX.load(); } };
    el.querySelectorAll(".m-add").forEach((b) => (b.onclick = () => match(a, m, GX.koreans.find((k) => k.id === b.dataset.id))));
    el.querySelectorAll(".m-end").forEach((b) => (b.onclick = () => endMatch(a.gx_matches.find((x) => x.id === b.dataset.id))));
    const any = el.querySelector(".m-any"); if (any) any.onchange = () => any.value && match(a, m, GX.koreans.find((k) => k.id === any.value));
  });
}

function renderKoreans() {
  const q = GX.kq.trim().toLowerCase();
  const list = GX.koreans.filter((k) => inBr(k) && (!q || (k.name + " " + k.phone).toLowerCase().includes(q))).sort((x, y) => (TIER[x.membership] ?? 9) - (TIER[y.membership] ?? 9));
  body().innerHTML = `<div class="gxlay"><div class="gxlist">
      <input id="gxKQ" placeholder="이름·번호 검색" value="${esc(GX.kq)}">
      <div class="card"><table class="gxt"><thead><tr><th>이름</th><th>멤버십</th><th>번호</th><th>배우고 싶은 언어</th><th>지점</th><th>가능 요일·시간</th><th>가입</th><th>상태</th></tr></thead><tbody>
      ${list.map((k) => `<tr data-id="${k.id}" class="${GX.ksel?.id === k.id ? "on" : ""}"><td><b>${esc(k.name)}</b></td><td><span class="gxtag">${esc(k.membership)}</span></td><td>${esc(k.phone)}</td>
        <td>${esc(k.target_language)} <small class="mut">(${esc(k.target_level)})</small></td><td>${esc(BR[k.branch] || k.branch || "")}</td>
        <td>${(k.available_days || []).join(",")}<br><small class="mut">${(k.available_times || []).join(",")}</small></td><td>${day(k.created_at)}</td>
        <td>${esc(K_ST[k.status] || k.status)}${active(k).map((x) => `<br><span class="gxtag matched">${esc(x.gx_members?.name)} · ${since(x.started_at)}</span>`).join("")}</td></tr>`).join("") || `<tr><td colspan="8" class="mut">아직 없어요 — [🔗 신청 링크·QR] 의 한국인 신청 링크를 보내 주세요</td></tr>`}
      </tbody></table></div></div><div id="gxPanel"></div></div>`;
  const qi = body().querySelector("#gxKQ"); qi.oninput = () => { GX.kq = qi.value; const at = qi.selectionStart; renderKoreans(); const n = body().querySelector("#gxKQ"); n.focus(); n.setSelectionRange(at, at); };
  body().querySelectorAll("tbody tr[data-id]").forEach((tr) => (tr.onclick = () => { GX.ksel = GX.koreans.find((k) => k.id === tr.dataset.id); renderKoreans(); showPanel(); }));
  const k = GX.ksel, p = body().querySelector("#gxPanel");
  if (!k) { p.innerHTML = `<div class="card mut gxempty">왼쪽에서 회원을 누르면 자세히 보여요</div>`; return; }
  const F = [["번호", k.phone], ["성별", k.gender], ["나이", k.age_range], ["지점", BR[k.branch] || k.branch], ["배우고 싶은 언어", k.target_language], ["레벨", k.target_level],
    ["교환 방식", k.exchange_style], ["원하는 상대", k.preferred_partner], ["요일", (k.available_days || []).join(", ")], ["시간", (k.available_times || []).join(", ")],
    ["횟수", k.frequency], ["온/오프", k.mode], ["메모(본인)", k.note], ["매칭 상대", active(k).map((x) => `${x.gx_members?.name} (${x.started_at}부터, ${since(x.started_at)})`).join(", ")], ["가입", when(k.created_at)]];
  p.innerHTML = `<div class="card gxpanel"><h3>${esc(k.name)} <button class="btn ghost" id="gxClose">✕</button></h3>
    <dl>${F.map(([l, v]) => `<dt>${l}</dt><dd>${dash(v)}</dd>`).join("")}</dl>
    <div class="gxctl"><select id="kSt">${opts(K_ST, k.status)}</select><select id="kTier">${Object.keys(TIER).map((t) => `<option ${t === k.membership ? "selected" : ""}>${t}</option>`).join("")}</select>
      <textarea id="kNote" placeholder="메모">${esc(k.admin_note)}</textarea><button class="btn" id="kSave">저장</button></div>
    <small class="mut">매칭은 [🌍 외국인] 에서 그 외국인의 1:1 언어교환 신청을 열면 추천에 나와요 (스케줄 겹칠 때)</small>
    ${jo() ? "" : `<br><button class="btn ghost gxdel" id="kDel">🗑 지우기</button>`}</div>`;
  p.querySelector("#gxClose").onclick = () => { GX.ksel = null; renderKoreans(); };
  p.querySelector("#kSave").onclick = async () => { const { error } = await sb.from("gx_koreans").update({ status: p.querySelector("#kSt").value, membership: p.querySelector("#kTier").value, admin_note: p.querySelector("#kNote").value }).eq("id", k.id); if (!fail(error)) { toast("저장했어요"); GX.load(); } };
  p.querySelector("#kDel")?.addEventListener("click", async () => {
    if (!confirm(`${k.name} 회원을 지울까요? 되돌릴 수 없어요.`)) return;
    const { error } = await sb.from("gx_koreans").delete().eq("id", k.id); if (fail(error)) return; GX.ksel = null; GX.load();
  });
}

function renderEvents() {
  body().innerHTML = `<form id="gxEv" class="card gxevf">
      <input name="title" placeholder="이벤트 이름 (영어로 — 외국인에게 보여요)" required maxlength="80"><input name="event_date" type="date"><input name="event_time" placeholder="시간 (예: 19:00)">
      <input name="location" placeholder="장소"><input name="fee" placeholder="참가비"><input name="description" placeholder="설명"><button class="btn">추가</button></form>
    <div class="card"><table class="gxt"><thead><tr><th>이벤트</th><th>날짜</th><th>장소</th><th>참가비</th><th>신청자</th><th>공개</th></tr></thead><tbody>
    ${GX.events.map((e) => `<tr><td><b>${esc(e.title)}</b><br><small class="mut">${esc(e.description)}</small></td><td>${esc(e.event_date ?? "")} ${esc(e.event_time ?? "")}</td><td>${esc(e.location)}</td><td>${esc(e.fee)}</td><td>${evApps(e).map(({ a, m }) => `<a href="#" data-m="${m.id}">${esc(m.name)}</a>${appTag(a)}`).join(" ") || `<span class="mut">0</span>`}</td>
      <td><input type="checkbox" data-id="${e.id}" ${e.is_active ? "checked" : ""} title="켜면 외국인 신청폼에 보여요"></td></tr>`).join("") || `<tr><td colspan="6" class="mut">이벤트 없음</td></tr>`}
    </tbody></table></div>`;
  const f = body().querySelector("#gxEv");
  f.onsubmit = async (ev) => {
    ev.preventDefault(); const row = Object.fromEntries(new FormData(f)); if (!row.event_date) row.event_date = null;
    const { error } = await sb.from("gx_events").insert(row); if (!fail(error)) { toast("추가했어요"); GX.load(); }
  };
  body().querySelectorAll("a[data-m]").forEach((el) => (el.onclick = (ev) => { ev.preventDefault(); openMember(el.dataset.m); }));
  body().querySelectorAll("[data-id]").forEach((cb) => (cb.onchange = async () => { const { error } = await sb.from("gx_events").update({ is_active: cb.checked }).eq("id", cb.dataset.id); fail(error); }));
}

// ---- 📖 사용법 (글만, DB 없음)
function renderHelp() {
  const step = (n, t, body) => `<section class="card gxstep"><h3><span class="gxn">${n}</span>${t}</h3>${body}</section>`;
  const st = (m) => `<table class="gxt gxst">${Object.entries(m).map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table>`;
  body().innerHTML = `<div class="gxhelpv">
    <section class="card"><h3>🌏 언어교환 탭은 이런 곳이에요</h3>
      <p>외국인 회원이 <b>신청폼</b>으로 들어오면 여기에 쌓여요. 한국인 회원도 언어교환 신청폼으로 들어와요. 직원은 여기서 <b>확인 → 연락 → 상태 바꾸기 → 1:1 매칭</b>을 해요.</p>
      <p class="mut">대표·매니저·조교 누구나 전 지점을 볼 수 있어요. 위 <b>지점 고르기</b>는 모든 화면(숫자·목록·CSV)에 같이 적용돼요. 처음엔 우리 지점이 골라져 있어요.</p>
      <div class="gxflow"><span>① 링크·QR 보내기</span>→<span>② 📊 현황에서 새 신청 확인</span>→<span>③ 연락하고 상태 바꾸기</span>→<span>④ 언어교환은 매칭</span>→<span>⑤ 끝나면 매칭 끝내기</span></div></section>
    ${step(1, "신청 받기 — 🔗 신청 링크·QR", `<ul>
      <li>외국인용 링크 5개(처음부터 · 한국어 수업 · 1:1 언어교환 · 소셜 · 이벤트)와 한국인용 링크 1개가 있어요.</li>
      <li><b>지점 이름이 붙은 링크</b>를 쓰면 신청폼에 우리 지점이 미리 골라져 있어요 → 지점 구분이 정확해져요.</li>
      <li>[링크 복사] → 카톡·인스타 DM·문자로 보내기, 또는 QR을 데스크에 띄워서 폰으로 찍게 하기.</li>
      <li>외국인 폼은 영어, 한국인 폼은 한국어예요. 같은 전화번호로 다시 신청하면 새 사람이 아니라 정보만 고쳐져요.</li></ul>`)}
    ${step(2, "새 신청 확인 — 📊 현황", `<ul>
      <li>맨 위 숫자 4개: <b>외국인 회원 · 한국인 회원 · 신청(처리 안 됨) · 진행 중 매칭</b>. 숫자를 누르면 그 화면으로 가요.</li>
      <li><b>📋 프로그램별 신청</b>: 줄을 누르면 아래 <b>📝 신청 목록</b>이 그 프로그램만 보여요.</li>
      <li><b>📝 신청 목록</b>: 최신순. [모든 상태]에서 <b>신청</b>만 고르면 아직 처리 안 한 것만 남아요 — 매일 이걸 0으로 만드는 게 목표예요.</li>
      <li>이름을 누르면 그 회원 상세(🌍 외국인 탭)로 가요.</li></ul>`)}
    ${step(3, "연락하고 상태 바꾸기 — 🌍 외국인", `<ul>
      <li>회원을 누르면 오른쪽(좁은 화면은 아래)에 전체 정보 · 신청한 프로그램 · 신청할 때 적은 답이 나와요.</li>
      <li>전화·메일로 연락한 뒤 <b>신청마다</b> 상태를 바꾸고 [저장]. 메모 칸에 "10/30 통화, 화목반 등록" 처럼 적어 두면 다른 직원도 알아요.</li>
      <li>회원 자체 상태(새 회원 · 활동 중 · 쉬는 중)는 이름 밑 칸에서 따로 바꿔요.</li></ul>
      <h4>신청 상태 뜻</h4>${st({ 신청: "방금 들어옴, 아직 연락 전", 확정: "연락 끝, 참여 확정 (수업 등록·이벤트 자리 확보)", 매칭됨: "언어교환 상대 연결됨 (매칭하면 자동)", 참석: "실제로 왔음", 취소: "안 하기로 함 (목록엔 줄 그어 보여요)" })}`)}
    ${step(4, "1:1 매칭하기", `<ul>
      <li>가장 빠른 길: <b>📊 현황 › 🤝 매칭 기다리는 외국인</b> — 사람마다 1순위 추천이 붙어 있어요. 괜찮으면 [매칭].</li>
      <li>다른 후보를 보고 싶으면 [추천 더 보기] → 외국인 상세의 <b>추천 5명</b>, 또는 맨 아래 <b>직접 고르기</b>에서 아무나.</li>
      <li>매칭하면 외국인 신청은 <b>매칭됨</b>, 한국인은 <b>매칭됨</b>으로 자동으로 바뀌어요. 매칭 후 두 사람에게 연락해서 첫 만남을 잡아 주세요.</li>
      <li><b>한국인은 한 번에 한 명</b>만 매칭돼요(매칭 중이면 추천에서 빠짐). 외국인은 여러 명과 매칭할 수 있어요.</li></ul>
      <h4>추천 점수는 이렇게 매겨요</h4>${st({ "요일·시간 겹침": "겹치는 요일 1개당 +2, 시간대 1개당 +2 (가장 중요)", "언어": "한국인이 배우고 싶은 언어를 외국인이 쓰면 +3 · 영어는 영어 레벨로(Native/Advanced +3, Intermediate +1, None -2) · 모르면 -2", "지점": "같은 지점 +2, 다른 지점 -1", "온/오프라인": "한쪽은 온라인만·한쪽은 오프라인만이면 -3, 둘 다 적었고 맞으면 +1", "점수 같으면": "멤버십 높은 순 (VVIP+ → VVIP → Basic → Lite)" })}
      <p class="mut">노란 점수 = 4점 이상(잘 맞음). 점수는 참고용 — 실제로는 나이·성격·목적도 보고 직원이 정해요.</p>`)}
    ${step(5, "매칭 끝내기", `<ul>
      <li>그만두거나 상대를 바꿀 때: 외국인 상세 › 지금 매칭 › [끝내기].</li>
      <li>끝낸 매칭은 "지난 매칭"에 기간과 함께 남고, 한국인은 다시 <b>대기</b>가 되어 추천에 나와요.</li>
      <li>"n주째"가 길게 이어지는 짝은 잘 되는 짝이에요 — 후기·사진 부탁하기 좋아요.</li></ul>`)}
    ${step(6, "한국인 회원 — 🇰🇷 한국인", `<ul>
      <li>멤버십 높은 순으로 보여요. 누르면 신청 내용 · 지금 매칭 상대(며칠째)가 나와요.</li>
      <li>멤버십(VVIP+·VVIP·Basic·Lite)은 본인이 고른 것 — 실제 등급과 다르면 여기서 고치고 [저장].</li>
      <li>한동안 못 하는 사람은 상태를 <b>쉬는 중</b>으로 → 추천에서 빠져요.</li></ul>`)}
    ${step(7, "이벤트 — 🎉 이벤트", `<ul>
      <li>위 칸에 이름(영어로 — 외국인이 봐요)·날짜·시간·장소·참가비·설명 → [추가].</li>
      <li><b>[공개]</b> 체크가 켜져 있어야 외국인 신청폼 이벤트 목록에 보여요. 끝난 이벤트는 체크를 끄세요.</li>
      <li>신청자 이름이 이벤트마다 보이고, 누르면 그 회원 상세로 가요. 참석 확인은 그 신청의 상태를 <b>참석</b>으로.</li>
      <li>이벤트는 전 지점 공용이에요 (지점 고르기와 상관없이 다 보임).</li></ul>`)}
    ${step(8, "엑셀로 받기 — ⬇️ CSV", `<ul><li>지금 고른 지점의 외국인 + 신청을 한 줄씩 내려받아요. 엑셀·구글 시트에서 바로 열려요.</li></ul>`)}
    <section class="card"><h3>👥 누가 무엇을 할 수 있나요</h3>${st({ "대표·매니저": "전부 보기 · 상태·메모·멤버십 바꾸기 · 매칭 · 이벤트 · 지우기", 조교: "전부 보기 · 상태·메모 바꾸기 · 매칭 · 이벤트 (지우기만 안 됨)", "외국인·한국인": "신청폼만 (다른 사람 정보는 못 봄)" })}
      <p class="mut">지우기는 되돌릴 수 없어요. 그만둔 사람은 지우지 말고 <b>쉬는 중</b>으로 바꾸는 걸 추천해요.</p></section>
    <section class="card"><h3>❓ 자주 묻는 것</h3><ul>
      <li><b>신청했다는데 안 보여요</b> → 위 지점 고르기를 <b>전 지점</b>으로. 신청자가 다른 지점을 골랐을 수 있어요.</li>
      <li><b>같은 사람이 두 번 보여요</b> → 전화번호가 다르게 들어간 경우예요. 하나는 쉬는 중으로 두거나 대표·매니저가 지워요.</li>
      <li><b>추천에 아무도 없어요</b> → 비어 있는 한국인이 없다는 뜻(다 매칭 중이거나 쉬는 중). 🔗 한국인 신청 링크를 더 돌려 주세요.</li>
      <li><b>점수가 낮은데 매칭해도 되나요</b> → 네. 점수는 참고용이에요. 스케줄만 맞으면 대부분 괜찮아요.</li></ul></section>
  </div>`;
}

// ---- 공개 신청 링크 + QR (qrcodejs 는 이 화면 열 때만 불러옴)
function renderLinks() {
  const B = new URL("gx/", location.href.split("#")[0].split("?")[0].replace(/[^/]*$/, "")).href;
  const L = [["외국인 · 처음부터", "환영 → 기본정보 → 프로그램 고르기", B], ["외국인 · 한국어 수업", "기본정보 뒤 바로 한국어 수업", B + "?p=korean_class"],
    ["외국인 · 1:1 언어교환", "바로 언어교환 신청", B + "?p=language_exchange"], ["외국인 · 소셜(스터디)", "바로 스터디 예약", B + "?p=socializing"],
    ["외국인 · 이벤트", "바로 이벤트 목록", B + "?p=events"], ["한국인 · 1:1 언어교환 신청", "한국인 회원용 (한국어)", B + "korean.html"],
    ...Object.entries(BR).flatMap(([id, ko]) => [[`${ko} · 외국인 신청`, "지점 미리 골라져 있음", B + "?b=" + id], [`${ko} · 한국인 신청`, "지점 미리 골라져 있음", B + "korean.html?b=" + id]])];
  body().innerHTML = `<div class="gxlinks">${L.map(([t, s, u], i) => `<div class="card gxlc"><div class="gxqr" id="gxqr${i}"></div><div><b>${esc(t)}</b><small class="mut">${esc(s)}</small><code>${esc(u)}</code>
    <button class="btn ghost" data-copy="${esc(u)}">링크 복사</button> <a class="btn ghost" href="${esc(u)}" target="_blank" rel="noopener">열기</a></div></div>`).join("")}</div>`;
  body().querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast("복사했어요"); } catch { prompt("복사:", b.dataset.copy); } }));
  const draw = () => L.forEach(([, , u], i) => { const el = document.getElementById("gxqr" + i); if (el && !el.childElementCount) new QRCode(el, { text: u, width: 110, height: 110, colorDark: "#493087", correctLevel: QRCode.CorrectLevel.M }); });
  if (window.QRCode) return draw();
  const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"; s.onload = draw; document.head.appendChild(s);
}

// ---- CSV (외국인 + 신청 한 줄씩, 지금 고른 지점만)
function csv() {
  const cols = ["name", "branch", "phone", "email", "nationality", "gender", "age_range", "lives_in_korea", "korea_duration", "korean_level", "english_level", "languages_spoken", "languages_learning", "referral_source", "status", "admin_note", "created_at"];
  const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"', lines = [[...cols, "program", "app_status", "app_note", "app_date", "app_data"].join(",")];
  GX.members.filter(inBr).forEach((m) => {
    const base = cols.map((c) => q(c === "branch" ? BR[m.branch] || m.branch : m[c]));
    if (!m.gx_applications.length) lines.push([...base, "", "", "", "", ""].join(","));
    m.gx_applications.forEach((a) => lines.push([...base, q(PROG[a.program] + (a.gx_events ? ": " + a.gx_events.title : "")), q(APP_ST[a.status] || a.status), q(a.admin_note), q(day(a.created_at)), q(JSON.stringify(a.data))].join(",")));
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
  a.download = `언어교환_외국인_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}
})();
