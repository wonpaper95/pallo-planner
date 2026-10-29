// 📮 월말 보고 (매출 탭 맨 위): 매니저는 다음 달 목표 2개(지점 매출 목표·내 목표) + 전략 글을 적어 [제출] → 대표에게 푸시+카톡(planner-push).
// 대표는 그달 지점별 제출 현황을 보고 [이 금액을 지점 목표로] = 그달 sales_plans 의 월 목표 순매출로 넣음. DB = month_goals (0068).
(() => {
const MG = window.MG = { month: null, row: null, subscribed: false };
const mgEl = () => document.getElementById("mgCard");
const mgNext = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const mgMon = (ym) => +ym.slice(5) + "월";
const mgHm = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const mgWon = (n) => n == null ? "-" : Math.round(n).toLocaleString("ko-KR") + "원";
const won = (n) => Math.round(n || 0).toLocaleString("ko-KR");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const mgBoss = () => isBoss && !previewTeam && !previewUser;

MG.load = async function () {
  if (!mgEl() || !me) return;
  MG.month = MG.month ?? mgNext(todayIso().slice(0, 7)); // 기본 = 다음 달
  if (!MG.subscribed) { MG.subscribed = true; sb.channel("mg").on("postgres_changes", { event: "*", schema: "public", table: "month_goals" }, () => { if (view === "sales" && !mgEl().contains(document.activeElement)) MG.load(); }).subscribe(); }
  return mgBoss() ? MG.loadBoss() : MG.loadMine();
};

// ── 매니저: 내 보고 한 장 ──
MG.loadMine = async function () {
  const { data, error } = await sb.from("month_goals").select("*").eq("user_id", me.id).eq("month", MG.month).maybeSingle();
  if (fail(error)) return;
  MG.row = data ?? { team_goal: null, my_goal: null, strategy: "", submitted_at: null, updated_at: null };
  const r = MG.row, ro = !!(previewTeam || previewUser), now = (() => { try { const x = SL.now(); return x.month === todayIso().slice(0, 7) ? x : null; } catch { return null; } })();
  mgEl().innerHTML = `<section class="slcard mg"><div class="mghead"><h3>📮 월말 보고 — ${mgMon(MG.month)} 목표</h3><input type="month" id="mgMonth" value="${MG.month}" aria-label="목표 달"><span id="mgState" class="mgstate"></span></div>
    <p class="slhint">매달 말, 다음 달 목표 2개와 어떻게 달성할지 적어서 대표님께 제출해요. 적는 대로 저장되고, [제출]을 눌러야 대표님께 알림이 가요.${now ? ` · 참고: 이번 달 목표 ${mgWon(now.goal)} · 지금 순매출 ${mgWon(now.net)}` : ""}</p>
    <div class="mggrid"><label>🏢 지점(팀) 매출 목표<span class="u"><input data-mg="team_goal" inputmode="numeric" placeholder="예) 60,000,000" value="${r.team_goal != null ? won(r.team_goal) : ""}" ${ro ? "readonly" : ""}><i>원</i></span></label>
      <label>🙋 내 목표<span class="u"><input data-mg="my_goal" inputmode="numeric" placeholder="예) 20,000,000" value="${r.my_goal != null ? won(r.my_goal) : ""}" ${ro ? "readonly" : ""}><i>원</i></span></label></div>
    <label class="mglab">🧭 달성 전략 — 스스로 어떻게 할지</label>
    <textarea data-mg="strategy" class="grow" maxlength="5000" ${ro ? "readonly" : ""} placeholder="예) 회신은 지원 30분 안에 · 상담 슬롯 하루 4개 확보 · 결제율 40% 목표 (상담 후 당일 클로징 멘트 연습) · 프리미엄 비율 25%로 · 매주 월요일 지난주 숫자 점검">${esc(r.strategy)}</textarea>
    <div class="mgfoot">${ro ? `<small class="mut">👀 미리보기 중엔 제출할 수 없어요</small>` : `<button class="btn" id="mgSubmit" type="button"></button>`}</div></section>`;
  MG.state();
};
MG.state = function (msg) {
  const r = MG.row, st = document.getElementById("mgState"), b = document.getElementById("mgSubmit");
  const changed = r.submitted_at && r.updated_at && r.updated_at > r.submitted_at;
  if (st) st.textContent = msg ?? (r.submitted_at ? `✅ 제출 ${mgHm(r.submitted_at)}${changed ? " · 고친 내용은 다시 제출해야 대표님께 가요" : ""}` : r.updated_at ? `임시 저장 ${mgHm(r.updated_at)} · 아직 제출 안 함` : "아직 안 씀");
  if (st) st.classList.toggle("ok", !!r.submitted_at && !changed);
  if (b) b.textContent = r.submitted_at ? (changed ? "📮 고친 내용으로 다시 제출" : "✅ 제출함") : "📮 대표님께 제출";
};
let mgT;
MG.save = async function (extra = {}) {
  const r = MG.row, { data, error } = await sb.from("month_goals").upsert({ month: MG.month, team_goal: r.team_goal, my_goal: r.my_goal, strategy: r.strategy, updated_at: new Date().toISOString(), ...extra }, { onConflict: "user_id,month" }).select().single();
  if (fail(error)) return false;
  MG.row = data; MG.state(); return true;
};
document.addEventListener("input", (e) => {
  const el = e.target.closest?.("#mgCard [data-mg]"); if (!el || el.readOnly) return;
  const k = el.dataset.mg;
  if (k === "strategy") MG.row.strategy = el.value;
  else { const n = String(el.value).replace(/[^\d]/g, ""); MG.row[k] = n ? +n : null; el.value = n ? won(+n) : ""; }
  MG.state("저장 중…"); clearTimeout(mgT); mgT = setTimeout(() => MG.save(), 700);
});
document.addEventListener("change", (e) => {
  if (e.target.id !== "mgMonth" || !e.target.value) return;
  MG.month = e.target.value; MG.load();
});
document.addEventListener("click", async (e) => {
  if (e.target.id === "mgSubmit") {
    const r = MG.row;
    if (r.submitted_at && !(r.updated_at > r.submitted_at)) return toast("이미 제출했어요. 고치면 다시 제출할 수 있어요");
    if (!r.team_goal || !r.my_goal) return toast("지점 목표와 내 목표를 둘 다 적어 주세요");
    if ((r.strategy || "").trim().length < 10) return toast("전략을 조금 더 적어 주세요 (10자 이상)");
    clearTimeout(mgT);
    const ts = new Date().toISOString();
    if (await MG.save({ submitted_at: ts, updated_at: ts })) toast("📮 제출했어요. 대표님께 알림이 가요");
    return;
  }
  const ap = e.target.closest?.("[data-mgapply]"); if (!ap) return; // 대표: 이 금액을 그달 지점 목표로
  const team = +ap.dataset.mgapply, goal = +ap.dataset.goal, tn = ap.dataset.tname;
  if (!confirm(`${tn} ${mgMon(MG.month)} 월 목표 순매출을 ${mgWon(goal)}으로 정할까요?\n(매출 탭 ${mgMon(MG.month)} [1] 월 목표에 들어가요)`)) return;
  const [p, prev] = await Promise.all([sb.from("sales_plans").select("data").eq("team_id", team).eq("month", MG.month).maybeSingle(),
    sb.from("sales_plans").select("data").eq("team_id", team).lt("month", MG.month).order("month", { ascending: false }).limit(1).maybeSingle()]);
  if (fail(p.error || prev.error)) return;
  const base = p.data ? p.data.data : (() => { const x = SL.newPlan(MG.month, prev.data?.data); delete x.month; return x; })();
  const { error } = await sb.from("sales_plans").upsert({ team_id: team, month: MG.month, data: { ...base, goal } });
  if (fail(error)) return;
  toast(`✅ ${tn} ${mgMon(MG.month)} 목표 ${mgWon(goal)}`); MG.load();
});

// ── 대표: 그달 지점별 제출 현황 ──
MG.loadBoss = async function () {
  const [t, p, g, sp] = await Promise.all([sb.from("teams").select("id, name, sort").order("sort"), sb.rpc("team_people"),
    sb.from("month_goals").select("*").eq("month", MG.month), sb.from("sales_plans").select("team_id, data").eq("month", MG.month)]);
  if (fail(t.error || p.error || g.error || sp.error)) return;
  const by = new Map(g.data.map((x) => [x.user_id, x])), set = new Map(sp.data.map((x) => [x.team_id, x.data?.goal]));
  const mgrs = p.data.filter((x) => x.role === "manager" && x.team_id), done = mgrs.filter((m) => by.get(m.user_id)?.submitted_at).length;
  const teamHtml = t.data.map((tm) => {
    const ms = mgrs.filter((m) => m.team_id === tm.id); if (!ms.length) return "";
    const sub = ms.map((m) => by.get(m.user_id)).filter((x) => x?.submitted_at), sumMy = sub.reduce((a, x) => a + (x.my_goal || 0), 0);
    return `<div class="mgteam"><div class="mgth"><b>${esc(tm.name)}</b><small>제출 ${sub.length}/${ms.length} · 내 목표 합 ${mgWon(sumMy)} · 지금 정해진 ${mgMon(MG.month)} 목표 <b>${set.has(tm.id) ? mgWon(set.get(tm.id)) : "없음"}</b></small></div>`
      + ms.map((m) => { const x = by.get(m.user_id);
        if (!x?.submitted_at) return `<div class="mgp none"><span class="who">${esc(m.name)}</span><span class="mut">${x?.updated_at ? "쓰는 중 (아직 제출 안 함)" : "아직 안 냄"}</span></div>`;
        return `<details class="mgp"><summary><span class="who">${esc(m.name)}</span><span>🏢 ${mgWon(x.team_goal)}</span><span>🙋 ${mgWon(x.my_goal)}</span><small class="mut">${mgHm(x.submitted_at)}${x.updated_at > x.submitted_at ? " · 이후 고치는 중" : ""}</small>
          ${set.get(tm.id) === x.team_goal ? `<span class="mgset">✓ 지점 목표</span>` : `<button class="btn ghost" type="button" data-mgapply="${tm.id}" data-goal="${x.team_goal}" data-tname="${esc(tm.name)}">이 금액을 지점 목표로</button>`}</summary>
          <div class="mgstr">${esc(x.strategy) || "<span class='mut'>(전략 없음)</span>"}</div></details>`; }).join("") + `</div>`;
  }).join("");
  mgEl().innerHTML = `<section class="slcard mg"><div class="mghead"><h3>📮 월말 보고 — ${mgMon(MG.month)} 목표 (제출 ${done}/${mgrs.length})</h3><input type="month" id="mgMonth" value="${MG.month}" aria-label="목표 달"></div>
    <p class="slhint">매니저들이 낸 지점 목표·내 목표·전략이에요. 줄을 누르면 전략 전문, [이 금액을 지점 목표로] 누르면 ${mgMon(MG.month)} 매출 목표에 바로 들어가요.</p>${teamHtml || `<p class="mut">매니저가 없어요</p>`}</section>`;
};
})();
