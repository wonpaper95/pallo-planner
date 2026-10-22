// 맥북 구석에 띄워두는 실시간 위젯: 오늘 고정업무·할 일·팀 업무·데드라인. 체크하면 플래너와 바로 같이 바뀜(로그인 공유)
const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, globalThis.SB_OPTIONS || {}); // 확장: chrome.storage 에 세션
const PLANNER = "https://wonpaper95.github.io/pallo-planner/";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const today = () => W.ymd(new Date());
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const applies = (it, day) => { const d = W.parse(day); return it.days.includes(d.getDay()) && (!it.weeks || it.weeks.includes(Math.floor((d.getDate() - 1) / 7) + 1)); };
const elapsed = (t) => t.spent_sec + (t.started_at ? Math.max(0, (Date.now() - new Date(t.started_at)) / 1000) : 0);
const hms = (s) => { s = Math.floor(s); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
let me = null, role = "manager", day = today(), state = { tasks: [], team: [], routine: [], all: [], carried: [], checks: new Map(), status: [], dues: [] };

// 접어둔 칸은 이 기기에서 기억
const closed = new Set((() => { try { return JSON.parse(localStorage.getItem("widget-closed") || "[]"); } catch { return []; } })());
document.querySelectorAll("section").forEach((s) => s.classList.toggle("closed", closed.has(s.id)));
document.addEventListener("click", (e) => {
  const h = e.target.closest("section h2"); if (!h) return;
  const s = h.parentElement; s.classList.toggle("closed");
  s.classList.contains("closed") ? closed.add(s.id) : closed.delete(s.id);
  try { localStorage.setItem("widget-closed", JSON.stringify([...closed])); } catch {}
});

async function load() {
  day = today();
  const soon = new Date(Date.now() + 48 * 3600000).toISOString();
  const [t, k, r, c, d, cy] = await Promise.all([
    sb.from("tasks").select("*").eq("user_id", me.id).eq("day", day).neq("title", "").order("sort").order("id"),
    role === "admin" ? { data: [] } : sb.rpc("team_tasks_between", { p_from: day, p_to: day }),
    sb.from("routine_items").select("*").order("sort").order("id"),
    role === "admin" ? sb.rpc("routine_status", { p_day: day }) : sb.rpc("team_routine_checks_on", { p_day: day }),
    sb.from("tasks").select("id, title, deadline, day").eq("user_id", me.id).eq("done", false).not("deadline", "is", null).lte("deadline", soon).order("deadline").limit(10),
    role === "admin" ? { data: [] } : sb.rpc("routine_carry", { p_day: day }), // ↪ 전에 못 끝낸 '넘김' 일
  ]);
  if (t.error || k.error || r.error || c.error || d.error || cy.error) { $("#foot").textContent = "불러오지 못했어요 — 잠시 후 다시 시도"; return; }
  state = { tasks: t.data, team: k.data, routine: r.data.filter((it) => applies(it, day)), all: r.data, dues: d.data,
    carried: cy.data.map((x) => ({ it: r.data.find((i) => i.id === x.item_id), from: x.from_day })).filter((x) => x.it),
    checks: new Map(role === "admin" ? [] : c.data.map((x) => [x.item_id, x])), status: role === "admin" ? c.data : [] }; // checks: 지점 공용, 누가 언제
  render();
}

function render() {
  const d = new Date();
  $("#today").textContent = `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
  const { tasks, team, routine, checks, status, dues } = state;
  // 📌 고정업무
  if (role === "admin") {
    $("#rtN").textContent = `${routine.length}개 · 지점별`;
    $("#rtBar").parentElement.classList.add("hidden");
    $("#rtList").innerHTML = status.length ? `<table>${status.map((x) => `<tr><td>${esc(x.team)} <span style="color:var(--sub)">${esc(x.members ?? "매니저 없음")}</span></td><td class="n">${x.done}/${x.total}${x.total && x.done === x.total ? " 🎉" : ""}</td></tr>`).join("")}</table>` : `<div class="empty">지점이 없어요</div>`;
  } else {
    const n = routine.filter((it) => checks.has(it.id)).length;
    $("#sRoutine").classList.toggle("hidden", !routine.length && !state.carried.length);
    $("#rtN").textContent = `${n}/${routine.length}`;
    $("#rtBar").style.width = (routine.length ? (n / routine.length) * 100 : 0) + "%";
    const row = (it, ck, from) => `<label class="it ${it.color} ${ck ? "done" : ""}"><input type="checkbox" data-rt="${it.id}" ${from ? `data-day="${from}"` : ""} ${ck ? "checked" : ""}>`
      + `${ck ? `<b class="who">${esc(ck.done_name ?? "")} ✓ ${hm(ck.done_at)}</b>` : ""}<span class="t">${from ? `<b style="color:var(--orange)">↪ ${from.slice(5).replace("-", "/")} 못 끝낸 일</b> ` : ""}${esc(it.title)}${it.need_link && !ck ? ` <small style="color:var(--sub)">🔗 링크</small>` : ""}</span>`
      + `${ck?.link ? `<a href="${esc(ck.link)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">🔗</a>` : ""}</label>`;
    $("#rtList").innerHTML = state.carried.map((x) => row(x.it, null, x.from)).join("") + routine.map((it) => row(it, checks.get(it.id))).join("")
      + (routine.length && n === routine.length ? `<div class="done-all">🎉 고정업무 끝! 보고하고 퇴근하세요</div>` : "");
  }
  // ✅ 오늘 할 일 (+ 👥 팀): 플래너와 같은 순서 — 끝낸 일 위, 시작시간 없음 → 시간순 (팀 일은 시작시간 없음 취급)
  const rows = [...tasks.map((t) => ({ k: "t", t })), ...team.map((t) => ({ k: "team", t }))]
    .sort((a, b) => W.daySort(a.k === "t" ? a.t : { done: !!a.t.done_by, sort: 1e12, id: a.t.id }, b.k === "t" ? b.t : { done: !!b.t.done_by, sort: 1e12, id: b.t.id }));
  const doneN = rows.filter((x) => (x.k === "t" ? x.t.done : x.t.done_by)).length;
  $("#tdN").textContent = `${doneN}/${rows.length}`;
  $("#tdList").innerHTML = rows.map(({ k, t }) => k === "team"
    ? `<label class="it ${t.done_by ? "done" : ""}"><input type="checkbox" data-team="${t.id}" ${t.done_by ? "checked" : ""}><span class="t">${esc(t.title)}<span class="tag team">👥 ${esc(t.team)}</span>${t.done_by ? `<span class="tag">✅ ${esc(t.done_name ?? "")}</span>` : ""}</span></label>`
    : `<div class="it task ${t.done ? "done" : ""} ${t.must_do ? "hot" : t.important ? "imp" : ""}"><input type="checkbox" id="ck${t.id}" data-task="${t.id}" ${t.done ? "checked" : ""}>`
      + `<div class="t"><label for="ck${t.id}">${t.must_do ? "🔥" : ""}${esc(t.title)}${t.assigned_by && t.assigned_by !== me.id ? `<span class="tag asg">📨</span>` : ""}</label><div class="meta">${qbtns(t)}</div></div>`
      + `<button class="star ${t.important ? "on" : ""}" data-act="star" data-id="${t.id}" title="중요">${t.important ? "★" : "☆"}</button></div>`).join("")
    || `<div class="empty">오늘 할 일이 없어요</div>`;
  // ⏰ 데드라인 48시간 (오늘 것 포함, 지난 것도)
  $("#dueList").innerHTML = dues.map((t) => { const u = W.due(t.deadline); return `<div class="it"><span class="t">${esc(t.title)}</span><span class="tag ${u.cls}">${u.text}</span></div>`; }).join("") || `<div class="empty">48시간 안 마감 없음</div>`;
  // 요약
  const over = dues.filter((t) => W.due(t.deadline).cls === "over").length, must = tasks.filter((t) => t.must_do && !t.done).length;
  const rtLeft = role === "admin" ? 0 : state.routine.filter((it) => !checks.has(it.id)).length;
  $("#sum").innerHTML = [rtLeft ? `<span>📌 ${rtLeft}개 남음</span>` : role === "admin" ? "" : `<span class="ok">📌 고정업무 끝</span>`,
    `<span>✅ ${rows.length - doneN}개 남음</span>`, must ? `<span class="hot">🔥 꼭 ${must}</span>` : "", over ? `<span class="hot">⏰ 지남 ${over}</span>` : ""].join("");
  $("#foot").textContent = `실시간 연결됨 · ${hm(new Date().toISOString())} 갱신`;
  if (globalThis.chrome?.runtime?.id) chrome.runtime.sendMessage("badge").catch(() => {}); // 확장 배지
}

// 줄 버튼: 플래너와 같은 🕐 시작 · ⏳ 예상 · ▶ 타이머 · 📅 데드라인 (끝낸 일은 값 있는 것만)
function qbtns(t) {
  const st = t.start_time?.slice(0, 5), est = t.estimate_min, sec = elapsed(t), run = !!t.started_at;
  const b = (act, on, label, cls = "", extra = "") => t.done && !on ? "" : `<button class="qb ${on ? "" : "empty"} ${cls}" data-act="${act}" data-id="${t.id}" ${extra}>${label}</button>`;
  return b("start", st, `🕐${st ? ` ${st}(시작!)` : ""}`)
    + b("est", est, `⏳${est ? ` ${minLabel(est)} 해결목표` : ""}`)
    + b("timer", sec, run ? `⏸ ${hms(sec)}` : sec ? `${t.done ? "⏱" : "▶"} ${hms(sec)}` : "▶", run ? "run" : "", run ? `data-run="${t.id}"` : "")
    + b("dl", t.deadline, t.deadline ? `📅 ${fmtDl(t.deadline)}${t.done ? "" : " · " + W.due(t.deadline).text}` : "📅", t.deadline && !t.done ? W.due(t.deadline).cls : "");
}
async function save(id, patch) {
  const { error } = await sb.from("tasks").update(patch).eq("id", id);
  if (error) $("#foot").textContent = "저장 실패: " + error.message;
  load();
}
let popFor = null;
const pop = $("#pop"), closePop = () => { pop.classList.add("hidden"); popFor = null; };
document.addEventListener("click", async (e) => {
  const pb = e.target.closest("#pop button");
  if (pb && popFor) { const patch = pickPatch(popFor.t, popFor.kind, pb, pop); if (patch) { const id = popFor.t.id; closePop(); save(id, patch); } return; }
  const b = e.target.closest("#tdList [data-act]"); if (!b) return;
  const t = state.tasks.find((x) => x.id == b.dataset.id), act = b.dataset.act; if (!t) return;
  if (act === "star") return save(t.id, { important: !t.important });
  if (act === "timer") {
    if (t.done) return;
    const { error } = await sb.rpc("timer", { p_id: t.id, p_on: !t.started_at });
    if (error) $("#foot").textContent = "저장 실패: " + error.message;
    return load();
  }
  if (popFor?.t.id === t.id && popFor.kind === act) return closePop();
  pop.innerHTML = pickHtml(t, act, t.assigned_by && t.assigned_by !== me.id);
  pop.classList.toggle("dlpop", act === "dl");
  placePop(pop, b); popFor = { t, kind: act };
});
document.addEventListener("pointerdown", (e) => popFor && !e.target.closest("#pop, #tdList [data-act]") && closePop());
document.addEventListener("keydown", (e) => e.key === "Escape" && popFor && closePop());

// 체크하면 플래너와 같은 DB 에 바로 저장
document.addEventListener("change", async (e) => {
  const el = e.target, on = el.checked; let r;
  if (el.dataset.rt) {
    let link = null;
    if (on && state.all.find((x) => x.id === +el.dataset.rt)?.need_link) { // 🔗 링크를 올려야 완료
      link = (prompt("작성한 글의 링크를 붙여넣어 주세요 (https://...)") || "").trim();
      if (!/^https?:\/\/\S+$/i.test(link)) { el.checked = false; $("#foot").textContent = "링크를 올려야 완료돼요"; return; }
    }
    r = await sb.rpc("set_routine_done", { p_item: +el.dataset.rt, p_day: el.dataset.day || day, p_done: on, p_link: link });
  }
  else if (el.dataset.task) r = await sb.from("tasks").update({ done: on }).eq("id", +el.dataset.task);
  else if (el.dataset.team) r = await sb.rpc("set_team_task_done", { p_id: +el.dataset.team, p_done: on });
  else return;
  if (r.error) { el.checked = !on; $("#foot").textContent = "저장 실패: " + r.error.message; }
  load();
});

// ✚ 위젯에서 바로 오늘 할 일 추가
$("#addForm").onsubmit = async (e) => {
  e.preventDefault();
  const title = $("#addInput").value.trim(); if (!title || !me) return;
  $("#addInput").disabled = true;
  const { error } = await sb.from("tasks").insert({ day, title });
  $("#addInput").disabled = false;
  if (error) { $("#foot").textContent = "추가 실패: " + error.message; return; }
  $("#addInput").value = ""; $("#addInput").focus(); load();
};

let t0;
const soft = () => { clearTimeout(t0); t0 = setTimeout(load, 300); };
setInterval(() => {
  const d = new Date(); $("#clock").textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  document.querySelectorAll("[data-run]").forEach((el) => { const t = state.tasks.find((x) => x.id == el.dataset.run); if (t) el.textContent = `⏸ ${hms(elapsed(t))}`; });
  if (me && today() !== day) load(); // 자정 넘으면 새 날
}, 1000);
setInterval(() => me && load(), 5 * 60000); // 실시간이 끊겨도 5분마다 확인

async function boot() {
  booted = true;
  const { data: { session } } = await sb.auth.getSession();
  me = session?.user ?? null;
  $("#login").classList.toggle("hidden", !!me); $("#main").classList.toggle("hidden", !me);
  if (!me) return;
  const { data: p } = await sb.from("profiles").select("role").eq("user_id", me.id).maybeSingle();
  role = p?.role ?? "manager";
  for (const [k, v] of Object.entries(me.user_metadata?.prefs ?? {})) document.body.classList.toggle("off-" + k, v === false); // 플래너 ⚙️ 보기 설정 그대로
  if (role === "admin") $("#sRoutine h2").firstChild.textContent = "📌 매니저 고정업무 ";
  await load();
  sb.channel("w-tasks").on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${me.id}` }, soft).subscribe();
  sb.channel("w-team").on("postgres_changes", { event: "*", schema: "public", table: "team_tasks" }, soft).subscribe();
  sb.channel("w-rt").on("postgres_changes", { event: "*", schema: "public", table: "team_routine_checks" }, soft).subscribe();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && load());
}
// 콜백 안에서 auth 를 다시 부르면 supabase-js 가 멈춤 → 한 박자 뒤에
let booted = false;
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" || (ev === "SIGNED_IN" && !me && booted)) setTimeout(boot, 0); });
addEventListener("focus", () => !me && boot()); // 플래너에서 로그인하고 돌아오면
if (!globalThis.chrome?.runtime?.id && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
$("#lform").onsubmit = async (e) => {
  e.preventDefault(); $("#lmsg").textContent = "";
  const { error } = await sb.auth.signInWithPassword({ email: $("#lemail").value.trim(), password: $("#lpw").value });
  if (error) $("#lmsg").textContent = "이메일 또는 비밀번호가 맞지 않아요"; else boot();
};
document.querySelectorAll("a.planner").forEach((a) => (a.href = PLANNER));
boot();
