// 📮 월말 보고 (매출 탭 맨 위): 매니저는 다음 달 목표 2개(지점 매출 목표·내 목표) + 전략(직접 한 칸)을 적고, 그달 매출 계획 [1]·[2]·[5]를 다 채워야 [제출] → 대표에게 푸시+카톡(planner-push).
// 대표는 그달 지점별 제출 현황을 보고 [이 금액을 지점 목표로] = 그달 sales_plans 의 월 목표 순매출로 넣음. DB = month_goals (0068).
(() => {
const MG = window.MG = { month: null, row: null, subscribed: false };
const mgEl = () => document.getElementById("mgCard"); // 매출 탭 맨 위 막대
const mgBody = () => document.getElementById("mgBody"); // 📮 월말 보고 창(#mgDlg) 안
const mgNext = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const mgMon = (ym) => +ym.slice(5) + "월";
const mgHm = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const mgWon = (n) => n == null ? "-" : Math.round(n).toLocaleString("ko-KR") + "원";
const won = (n) => Math.round(n || 0).toLocaleString("ko-KR");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const mgBoss = () => isBoss && !previewTeam && !previewUser;
MG.month = mgNext(todayIso().slice(0, 7)); // 기본 = 다음 달 (매출 탭 [저장] 버튼이 처음부터 이 달을 알게)

MG.load = async function () {
  if (!mgEl() || !me) return;
  MG.month = MG.month ?? mgNext(todayIso().slice(0, 7)); // 기본 = 다음 달
  if (!MG.subscribed) { MG.subscribed = true; sb.channel("mg").on("postgres_changes", { event: "*", schema: "public", table: "month_goals" }, () => { if (view === "sales" && !mgBody().contains(document.activeElement)) MG.load(); }).subscribe(); }
  return mgBoss() ? MG.loadBoss() : MG.loadMine();
};

// ── 매니저: 내 보고 한 장(목표 2개 + 직접 쓰는 전략 한 칸). 그달 매출 계획 [1]·[2]·[5]를 저장하면 체크가 ✅ — 다 ✅ 여야 제출 ──
const GUIDE = "직접 적어 주세요. 이런 내용이면 좋아요 ↓\n· 마케팅 — 지원자를 늘리려고 어떻게 신경 쓸지\n· 회신 관리 — 회신을 어떻게 관리할지\n· 달력 — 하루 최소 상담 몇 명을 잡을지\n· 결제율 — 목표와 올리는 방법\n· 멤버십 비율 — 어떻게 가져갈지";

// 매출 탭 맨 위 눈에 띄는 막대 하나 → 누르면 📮 월말 보고 창
MG.bar = function () {
  if (!mgEl()) return;
  mgEl().innerHTML = `<button class="mgbar" type="button" id="mgOpen"><b>📮 ${mgMon(MG.month)} 월말 보고 ${mgBoss() ? "보기" : "제출하기"}</b><span>${esc(MG.barTxt || "")}</span><i>열기 ›</i></button>`;
};
MG.loadMine = async function () {
  const { data, error } = await sb.from("month_goals").select("*").eq("user_id", me.id).eq("month", MG.month).maybeSingle();
  if (fail(error)) return;
  MG.row = data ?? { team_goal: null, my_goal: null, strategy: "", submitted_at: null, updated_at: null };
  const r = MG.row, ro = !!(previewTeam || previewUser), dis = ro ? "readonly" : "", mon = mgMon(MG.month);
  const now = (() => { try { const x = SL.now(); return x.month === todayIso().slice(0, 7) ? x : null; } catch { return null; } })();
  mgBody().innerHTML = `<section class="mg"><div class="mghead"><h3>📮 월말 보고 — ${mon} 목표</h3><input type="month" id="mgMonth" value="${MG.month}" aria-label="목표 달"><button class="btn ghost" type="button" id="mgClose">닫기</button><span id="mgState" class="mgstate"></span></div>
    <p class="slhint">다음 달 목표 2개와 달성 전략을 적고, 매출 계획 [1]·[2]·[5]를 채워 칸마다 [저장]을 누르면 체크가 ✅ — 모두 ✅ 이면 대표님께 제출해요. 적는 대로 저장돼요.${now ? ` · 참고: 이번 달 목표 ${mgWon(now.goal)} · 지금 순매출 ${mgWon(now.net)}` : ""}</p>
    <div class="mggrid"><label>🏢 지점(팀) 매출 목표<span class="u"><input data-mg="team_goal" inputmode="numeric" placeholder="예) 60,000,000" value="${r.team_goal != null ? won(r.team_goal) : ""}" ${dis}><i>원</i></span></label>
      <label>🙋 내 목표<span class="u"><input data-mg="my_goal" inputmode="numeric" placeholder="예) 20,000,000" value="${r.my_goal != null ? won(r.my_goal) : ""}" ${dis}><i>원</i></span></label></div>
    <label class="mglab">🧭 달성 전략 — 스스로 어떻게 할지</label>
    <textarea data-mg="strategy" class="grow mgstrat" maxlength="5000" ${dis} placeholder="${GUIDE}">${esc(r.strategy)}</textarea>
    <div id="mgChk" class="mgchk"></div>
    <div class="mgfoot">${ro ? `<small class="mut">👀 미리보기 중엔 제출할 수 없어요</small>` : `<button class="btn" id="mgSubmit" type="button"></button>`}</div></section>`;
  MG.state(); MG.recheck();
};
// 제출 전 체크: 목표 2개 · 전략 · 그달 매출 계획 [1]·[2]·[5] (매출 탭 각 칸 맨 아래 [저장]을 누르면 ✅)
MG.recheck = async function () {
  if (mgBoss() || !document.getElementById("mgChk")) return;
  const team = SL.team, mon = mgMon(MG.month);
  const { data } = team ? await sb.from("sales_plans").select("data").eq("team_id", team).eq("month", MG.month).maybeSingle() : { data: null };
  const pc = data ? SL.planCheck(data.data, MG.month) : null, r = MG.row;
  const items = [
    [r.team_goal > 0 && r.my_goal > 0, "목표 2개"],
    [(r.strategy || "").trim().length >= 10, "달성 전략"],
    [pc && !pc.s1.length && !!pc.done.s1, `${mon} [1] 월별 목표`],
    [pc && !pc.s2.length && !!pc.done.s2, `${mon} [2] 목표 객단가 비율`],
    [pc && !pc.s5.length && !!pc.done.s5, `${mon} [5] 일일 실행 목표`],
  ];
  MG.ok = items.every((x) => x[0]);
  const r2 = MG.row, ch = r2.submitted_at && r2.updated_at > r2.submitted_at;
  MG.barTxt = r2.submitted_at && !ch ? `✅ 제출함 ${mgHm(r2.submitted_at)}` : `체크 ${items.filter((x) => x[0]).length}/${items.length} · ${ch ? "고친 내용 다시 제출 필요" : "아직 제출 안 함"}`; MG.bar();
  document.getElementById("mgChk").innerHTML = `<b>제출 전 체크</b>${items.map(([ok, t]) => `<span class="${ok ? "ok" : "no"}">${ok ? "✅" : "⬜"} ${esc(t)}</span>`).join("")}`
    + (pc?.ok && pc.done.s1 && pc.done.s2 && pc.done.s5 ? "" : `<button class="btn ghost" type="button" id="mgGoPlan">📝 ${mon} 매출 계획 ${SL.month === MG.month ? "아래에서" : ""} 채우기</button>`);
};
MG.state = function (msg) {
  const r = MG.row, st = document.getElementById("mgState"), b = document.getElementById("mgSubmit");
  const changed = r.submitted_at && r.updated_at && r.updated_at > r.submitted_at;
  if (st) st.textContent = msg ?? (r.submitted_at ? `✅ 제출 ${mgHm(r.submitted_at)}${changed ? " · 고친 내용은 다시 제출해야 대표님께 가요" : ""}` : r.updated_at ? `임시 저장 ${mgHm(r.updated_at)} · 아직 제출 안 함` : "아직 안 씀");
  if (st) st.classList.toggle("ok", !!r.submitted_at && !changed);
  if (b) b.textContent = r.submitted_at ? (changed ? "📮 고친 내용으로 다시 제출" : "✅ 제출함") : "📮 대표님께 제출";
};
let mgT, chkT;
MG.save = async function (extra = {}) {
  const r = MG.row, { data, error } = await sb.from("month_goals").upsert({ month: MG.month, team_goal: r.team_goal, my_goal: r.my_goal, strategy: r.strategy, updated_at: new Date().toISOString(), ...extra }, { onConflict: "user_id,month" }).select().single();
  if (fail(error)) return false;
  MG.row = data; MG.state(); return true;
};
document.addEventListener("input", (e) => {
  const el = e.target.closest?.("#mgBody [data-mg]"); if (!el || el.readOnly) return;
  const k = el.dataset.mg;
  if (k === "strategy") MG.row.strategy = el.value;
  else { const n = String(el.value).replace(/[^\d]/g, ""); MG.row[k] = n ? +n : null; el.value = n ? won(+n) : ""; }
  MG.state("저장 중…"); clearTimeout(mgT); mgT = setTimeout(() => MG.save(), 700);
  clearTimeout(chkT); chkT = setTimeout(() => MG.recheck(), 400);
});
document.addEventListener("change", (e) => {
  if (e.target.id !== "mgMonth" || !e.target.value) return;
  MG.month = e.target.value; MG.load(); SL.renderSec?.();
});
document.addEventListener("click", async (e) => {
  if (e.target.id === "mgOpen" || e.target.closest?.("#mgOpen")) { document.getElementById("mgDlg").showModal(); return MG.load(); }
  if (e.target.id === "mgClose") return document.getElementById("mgDlg").close();
  if (e.target.id === "mgGoPlan") { // 매출 탭을 목표 달로 바꾸고 [1] 로
    document.getElementById("mgDlg").close();
    if (SL.month !== MG.month) { SL.month = MG.month; SL.day = SL.week = null; await SL.load(); }
    document.querySelector("#salesView .slgrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (e.target.id === "mgSubmit") {
    const r = MG.row;
    if (r.submitted_at && !(r.updated_at > r.submitted_at)) return toast("이미 제출했어요. 고치면 다시 제출할 수 있어요");
    await MG.recheck();
    if (!MG.ok) { document.getElementById("mgChk")?.scrollIntoView({ behavior: "smooth", block: "center" }); return toast("⬜ 남은 칸을 채워야 제출할 수 있어요"); }
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
  const chk = new Map(sp.data.map((x) => [x.team_id, SL.planCheck(x.data, MG.month)])), mark = (c, k) => `${c && !c[k].length && c.done[k] ? "✅" : "⬜"}`; // 그달 매출 계획 [1]·[2]·[5]
  const mgrs = p.data.filter((x) => x.role === "manager" && x.team_id), done = mgrs.filter((m) => by.get(m.user_id)?.submitted_at).length;
  const teamHtml = t.data.map((tm) => {
    const ms = mgrs.filter((m) => m.team_id === tm.id); if (!ms.length) return "";
    const sub = ms.map((m) => by.get(m.user_id)).filter((x) => x?.submitted_at), sumMy = sub.reduce((a, x) => a + (x.my_goal || 0), 0);
    return `<div class="mgteam"><div class="mgth"><b>${esc(tm.name)}</b><small>제출 ${sub.length}/${ms.length} · 내 목표 합 ${mgWon(sumMy)} · 지금 정해진 ${mgMon(MG.month)} 목표 <b>${set.has(tm.id) ? mgWon(set.get(tm.id)) : "없음"}</b></small><span class="mgplan" title="${mgMon(MG.month)} 매출 계획 (매출 탭)">${(() => { const c = chk.get(tm.id); return `[1] 월별 목표 ${mark(c, "s1")} · [2] 객단가 비율 ${mark(c, "s2")} · [5] 일일 실행 ${mark(c, "s5")}`; })()}</span></div>`
      + ms.map((m) => { const x = by.get(m.user_id);
        if (!x?.submitted_at) return `<div class="mgp none"><span class="who">${esc(m.name)}</span><span class="mut">${x?.updated_at ? "쓰는 중 (아직 제출 안 함)" : "아직 안 냄"}</span></div>`;
        return `<details class="mgp"><summary><span class="who">${esc(m.name)}</span><span>🏢 ${mgWon(x.team_goal)}</span><span>🙋 ${mgWon(x.my_goal)}</span><small class="mut">${mgHm(x.submitted_at)}${x.updated_at > x.submitted_at ? " · 이후 고치는 중" : ""}</small>
          ${set.get(tm.id) === x.team_goal ? `<span class="mgset">✓ 지점 목표</span>` : `<button class="btn ghost" type="button" data-mgapply="${tm.id}" data-goal="${x.team_goal}" data-tname="${esc(tm.name)}">이 금액을 지점 목표로</button>`}</summary>
          <div class="mgstr">${esc(x.strategy) || "<span class='mut'>(전략 없음)</span>"}</div></details>`; }).join("") + `</div>`;
  }).join("");
  MG.barTxt = `제출 ${done}/${mgrs.length}명`; MG.bar();
  mgBody().innerHTML = `<section class="mg"><div class="mghead"><h3>📮 월말 보고 — ${mgMon(MG.month)} 목표 (제출 ${done}/${mgrs.length})</h3><input type="month" id="mgMonth" value="${MG.month}" aria-label="목표 달"><button class="btn ghost" type="button" id="mgClose">닫기</button></div>
    <p class="slhint">매니저들이 낸 지점 목표·내 목표·전략이에요. 줄을 누르면 전략 전문, [이 금액을 지점 목표로] 누르면 ${mgMon(MG.month)} 매출 목표에 바로 들어가요.</p>${teamHtml || `<p class="mut">매니저가 없어요</p>`}</section>`;
};
})();
