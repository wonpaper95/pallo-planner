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
let me = null, role = "manager", day = today(), state = { tasks: [], team: [], routine: [], checks: new Set(), status: [], dues: [] };

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
  const [t, k, r, c, d] = await Promise.all([
    sb.from("tasks").select("*").eq("user_id", me.id).eq("day", day).neq("title", "").order("sort").order("id"),
    role === "admin" ? { data: [] } : sb.rpc("team_tasks_between", { p_from: day, p_to: day }),
    sb.from("routine_items").select("*").order("sort").order("id"),
    role === "admin" ? sb.rpc("routine_status", { p_day: day }) : sb.from("routine_checks").select("item_id").eq("user_id", me.id).eq("day", day),
    sb.from("tasks").select("id, title, deadline, day").eq("user_id", me.id).eq("done", false).not("deadline", "is", null).lte("deadline", soon).order("deadline").limit(10),
  ]);
  if (t.error || k.error || r.error || c.error || d.error) { $("#foot").textContent = "불러오지 못했어요 — 잠시 후 다시 시도"; return; }
  state = { tasks: t.data, team: k.data, routine: r.data.filter((it) => applies(it, day)), dues: d.data,
    checks: role === "admin" ? new Set() : new Set(c.data.map((x) => x.item_id)), status: role === "admin" ? c.data : [] };
  render();
}

function render() {
  const d = new Date();
  $("#today").textContent = `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`;
  const { tasks, team, routine, checks, status, dues } = state;
  // 📌 고정업무
  if (role === "admin") {
    $("#rtN").textContent = `${routine.length}개 · 매니저별`;
    $("#rtBar").parentElement.classList.add("hidden");
    $("#rtList").innerHTML = status.length ? `<table>${status.map((x) => `<tr><td>${esc(x.name)} <span style="color:var(--sub)">${esc(x.team ?? "")}</span></td><td class="n">${x.done}/${x.total}${x.total && x.done === x.total ? " 🎉" : ""}</td></tr>`).join("")}</table>` : `<div class="empty">가입한 매니저가 없어요</div>`;
  } else {
    const n = routine.filter((it) => checks.has(it.id)).length;
    $("#sRoutine").classList.toggle("hidden", !routine.length);
    $("#rtN").textContent = `${n}/${routine.length}`;
    $("#rtBar").style.width = (routine.length ? (n / routine.length) * 100 : 0) + "%";
    $("#rtList").innerHTML = routine.map((it) => `<label class="it ${it.color} ${checks.has(it.id) ? "done" : ""}"><input type="checkbox" data-rt="${it.id}" ${checks.has(it.id) ? "checked" : ""}><span class="t">${esc(it.title)}</span></label>`).join("")
      + (routine.length && n === routine.length ? `<div class="done-all">🎉 고정업무 끝! 보고하고 퇴근하세요</div>` : "");
  }
  // ✅ 오늘 할 일 (+ 👥 팀): 안 끝난 것 먼저, 그다음 🔥·⭐, 시작시간
  const rows = [...tasks.map((t) => ({ k: "t", t })), ...team.map((t) => ({ k: "team", t }))]
    .sort((a, b) => (a.k === "t" ? a.t.done : !!a.t.done_by) - (b.k === "t" ? b.t.done : !!b.t.done_by)
      || (b.t.must_do || b.t.important ? 1 : 0) - (a.t.must_do || a.t.important ? 1 : 0)
      || (a.t.start_time ?? "99").localeCompare(b.t.start_time ?? "99"));
  const doneN = rows.filter((x) => (x.k === "t" ? x.t.done : x.t.done_by)).length;
  $("#tdN").textContent = `${doneN}/${rows.length}`;
  $("#tdList").innerHTML = rows.map(({ k, t }) => k === "team"
    ? `<label class="it ${t.done_by ? "done" : ""}"><input type="checkbox" data-team="${t.id}" ${t.done_by ? "checked" : ""}><span class="t">${esc(t.title)}<span class="tag team">👥 ${esc(t.team)}</span>${t.done_by ? `<span class="tag">✅ ${esc(t.done_name ?? "")}</span>` : ""}</span></label>`
    : `<label class="it ${t.done ? "done" : ""} ${t.must_do ? "hot" : t.important ? "imp" : ""}"><input type="checkbox" data-task="${t.id}" ${t.done ? "checked" : ""}><span class="t">${t.must_do ? "🔥" : ""}${t.important ? "★" : ""}${t.start_time ? `<b>${t.start_time.slice(0, 5)}</b> ` : ""}${esc(t.title)}`
      + `${t.assigned_by && t.assigned_by !== me.id ? `<span class="tag asg">📨</span>` : ""}${t.started_at ? `<span class="tag run" data-run="${t.id}">⏸ ${hms(elapsed(t))}</span>` : ""}`
      + `${t.estimate_min ? `<span class="tag">⏳${t.estimate_min}분</span>` : ""}${t.deadline && !t.done ? `<span class="tag ${W.due(t.deadline).cls}">${hm(t.deadline)}</span>` : ""}</span></label>`).join("")
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

// 체크하면 플래너와 같은 DB 에 바로 저장
document.addEventListener("change", async (e) => {
  const el = e.target, on = el.checked; let r;
  if (el.dataset.rt) r = on ? await sb.from("routine_checks").insert({ item_id: +el.dataset.rt, day })
    : await sb.from("routine_checks").delete().eq("user_id", me.id).eq("item_id", +el.dataset.rt).eq("day", day);
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
  if (role === "admin") $("#sRoutine h2").firstChild.textContent = "📌 매니저 고정업무 ";
  await load();
  sb.channel("w-tasks").on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${me.id}` }, soft).subscribe();
  sb.channel("w-team").on("postgres_changes", { event: "*", schema: "public", table: "team_tasks" }, soft).subscribe();
  sb.channel("w-rt").on("postgres_changes", { event: "*", schema: "public", table: "routine_checks", ...(role === "admin" ? {} : { filter: `user_id=eq.${me.id}` }) }, soft).subscribe();
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
