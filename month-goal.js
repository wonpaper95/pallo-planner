// 📮 월말 보고 (매출 탭 맨 위 막대 → 창): 팀 목표 = 그달 매출 계획 [1] 월 목표(지점에 하나, 자동), 매니저는 내 목표 + 전략(직접 한 칸).
// 같은 지점 매니저 내 목표 합 vs 팀 목표 → ✅ 일치 / ⚠ 부족·초과 (제출은 막지 않음, B안). 그달 [1]·[2]·[5] 칸별 [저장] 다 ✅ 여야 [제출] → 대표 푸시+카톡.
// DB = month_goals (0068), 동료 합계 = team_goal_sum (0071), 내 폼 = my_plan (0089), 제출 순간 폼 = plan_snapshot (0088, 트리거가 저장).
// 보고 달 = 매출 탭에서 보는 달(11월 탭 = 11월 목표 보고). 그달에 들어와서 내면 ⏰ 월초 제출, 지난 달은 보기만. 말일 7일 전부터 이번 달 탭에 다음 달 보고 입구.
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
const mgPast = () => MG.month < todayIso().slice(0, 7);
MG.late = (month, t) => !!t && new Date(t) >= new Date(`${month}-01T00:00:00+09:00`); // 목표 달에 들어와서 제출 (한국 시간)
// 내 폼 칸: 비율은 합계 100%, 환불율만 0 가능
MG.myOk = (p) => { const ms = p?.members; if (!ms?.length) return false; const pos = (k) => p[k] > 0, sum = ms.reduce((t, m) => t + (typeof m.p === "number" ? m.p : NaN), 0);
  return pos("reply") && pos("consult") && pos("pay") && pos("arpu") && pos("firstContact") && typeof p.refundRate === "number" && p.refundRate >= 0 && Math.abs(sum - 100) <= 0.05; };
MG.nextDue = (today) => { const [y, m, d] = today.split("-").map(Number); return d > new Date(y, m, 0).getDate() - 7 ? mgNext(today.slice(0, 7)) : null; }; // 말일 포함 마지막 7일
const LATE = "⏰ 월초 제출";

MG.load = async function () {
  if (!mgEl() || !me) return;
  if (MG.month !== SL.month) { MG.month = SL.month; MG.barTxt = ""; MG.bar(); } // 탭에서 달을 바꾸면 보고도 그 달로
  if (!MG.subscribed) { MG.subscribed = true; sb.channel("mg").on("postgres_changes", { event: "*", schema: "public", table: "month_goals" }, () => { if (view === "sales" && !mgBody().contains(document.activeElement)) MG.load(); }).subscribe(); }
  return mgBoss() ? MG.loadBoss() : MG.loadMine();
};

// ── 매니저: 내 보고 한 장(목표 2개 + 직접 쓰는 전략 한 칸). 그달 매출 계획 [1]·[2]·[5]를 저장하면 체크가 ✅ — 다 ✅ 여야 제출 ──
const GUIDE = "직접 적어 주세요. 이런 내용이면 좋아요 ↓\n· 마케팅 — 지원자를 늘리려고 어떻게 신경 쓸지\n· 회신 관리 — 회신을 어떻게 관리할지\n· 달력 — 하루 최소 상담 몇 명을 잡을지\n· 결제율 — 목표와 올리는 방법\n· 멤버십 비율 — 어떻게 가져갈지";

// 매출 탭 맨 위 눈에 띄는 막대 하나 → 누르면 📮 월말 보고 창
MG.bar = function () {
  if (!mgEl()) return;
  const nx = MG.month === todayIso().slice(0, 7) ? MG.nextDue(todayIso()) : null;
  mgEl().innerHTML = `<button class="mgbar" type="button" id="mgOpen"><b>📮 ${mgMon(MG.month)} 월말 보고 ${mgBoss() || mgPast() ? "보기" : "제출하기"}</b><span>${esc(MG.barTxt || "")}</span><i>열기 ›</i></button>`
    + (nx ? `<button class="mgnext" type="button" data-mgto="${nx}">📮 ${mgMon(nx)} 보고 ${mgBoss() ? "보기" : "쓰기"} ›</button>` : "");
};
MG.loadMine = async function () {
  const dlg = document.getElementById("mgDlg"), top = dlg.scrollTop;
  const ym = MG.month, { data, error } = await sb.from("month_goals").select("*").eq("user_id", me.id).eq("month", ym).maybeSingle();
  if (fail(error) || ym !== MG.month) return; // 그 사이 달을 바꿨으면 버림
  MG.row = data ?? { team_goal: null, my_goal: null, strategy: "", submitted_at: null, updated_at: null };
  const r = MG.row, past = mgPast(), ro = !!(previewTeam || previewUser) || past, dis = ro ? "readonly" : "", mon = mgMon(MG.month);
  const now = (() => { try { const x = SL.now(); return x.month === todayIso().slice(0, 7) ? x : null; } catch { return null; } })();
  mgBody().innerHTML = `<section class="mg"><div class="mghead"><h3>📮 월말 보고 — ${mon} 목표</h3><button class="btn ghost" type="button" id="mgClose">닫기</button><span id="mgState" class="mgstate"></span></div>
    <p class="slhint">내 목표·달성 전략·내 폼을 적고, 지점 매출 계획 [1]·[2]·[5]를 칸마다 [저장]하면 체크가 ✅ — 모두 ✅ 이면 대표님께 제출해요. 지점 계획은 팀에 1장, 내 폼은 사람마다 1장이에요. 적는 대로 저장돼요.${now ? ` · 참고: 이번 달 목표 ${mgWon(now.goal)} · 지금 순매출 ${mgWon(now.net)} · 지금 제출하면 ${LATE}로 표시돼요` : ""}</p>
    <div class="mggrid"><div class="mgtg"><small>🏢 팀(지점) 목표 — 매출 계획 [1] 월 목표</small><b id="mgTeamGoal">-</b></div>
      <label>🙋 내 목표<span class="u"><input data-mg="my_goal" inputmode="numeric" placeholder="예) 20,000,000" value="${r.my_goal != null ? won(r.my_goal) : ""}" ${dis}><i>원</i></span></label></div>
    <div id="mgSum" class="mgsum"></div>
    <label class="mglab">🧭 달성 전략 — 스스로 어떻게 할지</label>
    <textarea data-mg="strategy" class="grow mgstrat" maxlength="5000" ${dis} placeholder="${GUIDE}">${esc(r.strategy)}</textarea>
    <label class="mglab">📝 내 폼 — 내 목표 기준 숫자 (처음엔 지점 폼 값이에요. 내 숫자로 고쳐 주세요)</label>
    <div id="mgMyForm"></div><div id="mgMyPreview"></div>
    <div id="mgChk" class="mgchk"></div>
    <div class="mgfoot">${ro ? `<small class="mut">${past ? "지난 달 보고는 보기만 돼요" : "👀 미리보기 중엔 제출할 수 없어요"}</small>` : `<button class="btn" id="mgSubmit" type="button"></button>`}</div></section>`;
  MG.myDrawn = false; MG.state(); await MG.recheck(); dlg.scrollTop = top; // 다시 그려도 쓰던 자리 유지
};
const MY_F = [["reply", "회신율", "%"], ["consult", "상담률", "%"], ["pay", "결제율", "%"], ["arpu", "객단가", "원"], ["refundRate", "환불율", "%"], ["firstContact", "첫 연락 목표", "분"]];
// 내 폼 칸: 저장한 내 폼, 없으면 그달 지점 폼으로 시작
MG.drawMy = function (branch, ro) {
  const r = MG.row, b = branch || SL.newPlan(MG.month), dis = ro ? "readonly" : "";
  r.my_plan ??= { start: b.start, reply: b.reply, consult: b.consult, pay: b.pay, arpu: b.arpu, refundRate: b.refundRate, firstContact: b.firstContact, members: (b.members || []).map((m) => ({ name: m.name, price: m.price, p: m.p })) };
  const p = r.my_plan, inp = (attr, v, unit) => `<span class="u"><input inputmode="decimal" ${attr} value="${v == null ? "" : unit === "원" ? won(v) : v}" ${dis}><i>${unit}</i></span>`;
  document.getElementById("mgMyForm").innerHTML = `<div class="mgmy">${MY_F.map(([k, lab, u]) => `<label>${lab}${inp(`data-mgp="${k}"`, p[k], u)}</label>`).join("")}</div>
    <div class="mgmy">${p.members.map((m, i) => `<label>${esc(m.name)} 비율${inp(`data-mgm="${i}"`, m.p, "%")}</label>`).join("")}</div>`;
  MG.myDrawn = true; MG.myView();
};
MG.myView = function () {
  const el = document.getElementById("mgMyPreview"), r = MG.row; if (!el || !r.my_plan) return;
  el.innerHTML = r.my_goal > 0 ? SL.snapshotHtml({ ...r.my_plan, goal: r.my_goal }, MG.month, "👇 대표님께는 이렇게 보여요") : `<small class="mut">내 목표를 적으면 필요 인원이 계산돼요</small>`;
};
// 제출 전 체크: 목표 2개 · 전략 · 그달 매출 계획 [1]·[2]·[5] (매출 탭 각 칸 맨 아래 [저장]을 누르면 ✅)
MG.recheck = async function () {
  if (mgBoss() || !document.getElementById("mgChk")) return;
  const team = SL.team, ym = MG.month, mon = mgMon(ym);
  const { data } = team ? await sb.from("sales_plans").select("data").eq("team_id", team).eq("month", ym).maybeSingle() : { data: null };
  if (ym !== MG.month) return;
  const pc = data ? SL.planCheck(data.data, ym) : null, r = MG.row;
  if (!MG.myDrawn) MG.drawMy(data?.data, !!(previewTeam || previewUser) || mgPast());
  MG.planGoal = pc?.goal > 0 ? pc.goal : null;
  // 팀 목표 = 내 목표들의 합? (내 것은 지금 입력값으로)
  const { data: ppl } = await sb.rpc("team_goal_sum", { p_month: ym });
  if (ym !== MG.month || !document.getElementById("mgChk")) return;
  const rows = (ppl ?? []).map((x) => x.user_id === me.id ? { ...x, my_goal: r.my_goal } : x), sum = rows.reduce((a, x) => a + (x.my_goal || 0), 0);
  const left = rows.filter((x) => x.my_goal == null).length, diff = (MG.planGoal ?? 0) - sum;
  document.getElementById("mgTeamGoal").textContent = MG.planGoal ? mgWon(MG.planGoal) : "아직 없음";
  document.getElementById("mgSum").innerHTML = !MG.planGoal ? `<span class="no">⚠ 팀 목표가 아직 없어요 — 매출 계획 ${mon} [1] 월 목표를 정하고 [저장]해 주세요</span>`
    : `🏢 팀 목표 ${mgWon(MG.planGoal)} = ${rows.map((x) => `${esc(x.name)} ${x.my_goal != null ? won(x.my_goal) : "(아직)"}`).join(" + ")} → `
      + (diff === 0 ? `<span class="ok">✅ 팀 목표와 일치</span>` : diff < 0 ? `<span class="no">⚠ ${mgWon(-diff)} 초과 — 팀원과 맞춰 주세요</span>`
        : left ? `<span class="no">${mgWon(diff)} 남음 (아직 ${left}명 안 적음)</span>` : `<span class="no">⚠ ${mgWon(diff)} 부족 — 팀원과 나눠 맞춰 주세요</span>`);
  const items = [
    [r.my_goal > 0, "내 목표"],
    [(r.strategy || "").trim().length >= 10, "달성 전략"],
    [MG.myOk(r.my_plan), "내 폼 (비율 합계 100%)"],
    [pc && !pc.s1.length && !!pc.done.s1, `${mon} [1] 월별 목표`],
    [pc && !pc.s2.length && !!pc.done.s2, `${mon} [2] 목표 객단가 비율`],
    [pc && !pc.s5.length && !!pc.done.s5, `${mon} [5] 일일 실행 목표`],
  ];
  MG.ok = items.every((x) => x[0]);
  const r2 = MG.row, ch = r2.submitted_at && r2.updated_at > r2.submitted_at;
  MG.barTxt = r2.submitted_at && !ch ? `✅ 제출함 ${mgHm(r2.submitted_at)}${MG.late(ym, r2.submitted_at) ? ` · ${LATE}` : ""}` : mgPast() ? (r2.submitted_at ? "✅ 제출함" : "제출 안 함") : `체크 ${items.filter((x) => x[0]).length}/${items.length} · ${ch ? "고친 내용 다시 제출 필요" : "아직 제출 안 함"}`; MG.bar();
  document.getElementById("mgChk").innerHTML = `<b>제출 전 체크</b>${items.map(([ok, t]) => `<span class="${ok ? "ok" : "no"}">${ok ? "✅" : "⬜"} ${esc(t)}</span>`).join("")}`
    + (mgPast() || (pc?.ok && pc.done.s1 && pc.done.s2 && pc.done.s5) ? "" : `<button class="btn ghost" type="button" id="mgGoPlan">📝 ${mon} 매출 계획 아래에서 채우기</button>`);
};
MG.state = function (msg) {
  const r = MG.row, st = document.getElementById("mgState"), b = document.getElementById("mgSubmit");
  const changed = r.submitted_at && r.updated_at && r.updated_at > r.submitted_at;
  if (st) st.textContent = msg ?? (r.submitted_at ? `✅ 제출 ${mgHm(r.submitted_at)}${MG.late(MG.month, r.submitted_at) ? ` · ${LATE}` : ""}${changed ? " · 고친 내용은 다시 제출해야 대표님께 가요" : ""}` : r.updated_at ? `임시 저장 ${mgHm(r.updated_at)} · 아직 제출 안 함` : "아직 안 씀");
  if (st) st.classList.toggle("ok", !!r.submitted_at && !changed);
  if (b) b.textContent = r.submitted_at ? (changed ? "📮 고친 내용으로 다시 제출" : "✅ 제출함") : "📮 대표님께 제출";
};
let mgT, chkT;
MG.save = async function (extra = {}) {
  const r = MG.row, { data, error } = await sb.from("month_goals").upsert({ month: MG.month, team_goal: MG.planGoal ?? r.team_goal, my_goal: r.my_goal, strategy: r.strategy, my_plan: r.my_plan ?? null, updated_at: new Date().toISOString(), ...extra }, { onConflict: "user_id,month" }).select().single();
  if (fail(error)) return false;
  MG.row = data; MG.state(); return true;
};
document.addEventListener("input", (e) => {
  const pf = e.target.closest?.("#mgBody [data-mgp], #mgBody [data-mgm]");
  if (pf) { if (pf.readOnly) return;
    const k = pf.dataset.mgp, txt = String(pf.value).replace(/[^\d.]/g, ""), n = txt === "" ? null : +txt, p = MG.row.my_plan;
    if (k) { p[k] = n; if (k === "arpu") pf.value = n == null ? "" : won(n); } else p.members[+pf.dataset.mgm].p = n;
    MG.myView(); MG.state("저장 중…"); clearTimeout(mgT); mgT = setTimeout(() => MG.save(), 700);
    clearTimeout(chkT); chkT = setTimeout(() => MG.recheck(), 400); return;
  }
  const el = e.target.closest?.("#mgBody [data-mg]"); if (!el || el.readOnly) return;
  const k = el.dataset.mg;
  if (k === "strategy") MG.row.strategy = el.value;
  else { const n = String(el.value).replace(/[^\d]/g, ""); MG.row[k] = n ? +n : null; el.value = n ? won(+n) : ""; }
  MG.myView();
  MG.state("저장 중…"); clearTimeout(mgT); mgT = setTimeout(() => MG.save(), 700);
  clearTimeout(chkT); chkT = setTimeout(() => MG.recheck(), 400);
});
document.addEventListener("click", async (e) => {
  if (e.target.id === "mgOpen" || e.target.closest?.("#mgOpen")) { document.getElementById("mgDlg").showModal(); return MG.load(); }
  if (e.target.id === "mgClose") return document.getElementById("mgDlg").close();
  const to = e.target.closest?.("[data-mgto]")?.dataset.mgto;
  if (to) { SL.month = to; SL.day = SL.week = null; return SL.load(); } // 이번 달 탭 → 다음 달 탭·보고
  if (e.target.id === "mgGoPlan") { // [1] 로
    document.getElementById("mgDlg").close();
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
    if (await MG.save({ submitted_at: ts, updated_at: ts })) { toast("📮 제출했어요. 대표님께 알림이 가요"); MG.recheck(); } // 막대 글자도 '제출함'으로
    return;
  }
});

// ── 대표: 그달 지점별 제출 현황 ──
MG.loadBoss = async function () {
  const ym = MG.month, [t, p, g, sp] = await Promise.all([sb.from("teams").select("id, name, sort").order("sort"), sb.rpc("team_people"),
    sb.from("month_goals").select("*").eq("month", ym), sb.from("sales_plans").select("team_id, data").eq("month", ym)]);
  if (fail(t.error || p.error || g.error || sp.error) || ym !== MG.month) return; // 그 사이 달을 바꿨으면 버림
  const by = new Map(g.data.map((x) => [x.user_id, x])), set = new Map(sp.data.map((x) => [x.team_id, x.data?.goal]));
  const chk = new Map(sp.data.map((x) => [x.team_id, SL.planCheck(x.data, MG.month)])), mark = (c, k) => `${c && !c[k].length && c.done[k] ? "✅" : "⬜"}`; // 그달 매출 계획 [1]·[2]·[5]
  const mgrs = p.data.filter((x) => x.role === "manager" && x.team_id), done = mgrs.filter((m) => by.get(m.user_id)?.submitted_at).length;
  const lates = mgrs.filter((m) => MG.late(ym, by.get(m.user_id)?.submitted_at)).length;
  const dlg = document.getElementById("mgDlg"), top = dlg.scrollTop, opened = new Set([...mgBody().querySelectorAll("details[open]")].map((x) => x.dataset.u)); // 다른 사람이 제출해 다시 그려도 읽던 폼 유지
  const teamHtml = t.data.map((tm) => {
    const ms = mgrs.filter((m) => m.team_id === tm.id); if (!ms.length) return "";
    const sub = ms.map((m) => by.get(m.user_id)).filter((x) => x?.submitted_at), sumMy = ms.reduce((a, m) => a + (by.get(m.user_id)?.my_goal || 0), 0);
    const tg = set.get(tm.id) > 0 ? set.get(tm.id) : null, d = (tg ?? 0) - sumMy, left = ms.filter((m) => by.get(m.user_id)?.my_goal == null).length;
    const st = !tg ? `<span class="no">팀 목표 없음</span>` : d === 0 ? `<span class="ok">✅ 일치</span>` : d < 0 ? `<span class="no">⚠ ${mgWon(-d)} 초과</span>` : `<span class="no">${left ? `${mgWon(d)} 남음 (${left}명 안 적음)` : `⚠ ${mgWon(d)} 부족`}</span>`;
    return `<div class="mgteam"><div class="mgth"><b>${esc(tm.name)}</b><small>제출 ${sub.length}/${ms.length} · 팀 목표 <b>${tg ? mgWon(tg) : "-"}</b> · 내 목표 합 ${mgWon(sumMy)}</small>${st}<span class="mgplan" title="${mgMon(MG.month)} 매출 계획 (매출 탭)">${(() => { const c = chk.get(tm.id); return `[1] 월별 목표 ${mark(c, "s1")} · [2] 객단가 비율 ${mark(c, "s2")} · [5] 일일 실행 ${mark(c, "s5")}`; })()}</span></div>`
      + ms.map((m) => { const x = by.get(m.user_id);
        if (!x?.submitted_at) return `<div class="mgp none"><span class="who">${esc(m.name)}</span>${x?.my_goal != null ? `<span>🙋 ${mgWon(x.my_goal)}</span>` : ""}<span class="mut">${x?.updated_at ? "쓰는 중 (아직 제출 안 함)" : "아직 안 냄"}</span></div>`;
        return `<details class="mgp" data-u="${x.user_id}"${opened.has(x.user_id) ? " open" : ""}><summary><span class="who">${esc(m.name)}</span><span>🙋 ${mgWon(x.my_goal)}</span><small class="mut">제출 ${mgHm(x.submitted_at)}${MG.late(ym, x.submitted_at) ? ` · ${LATE}` : ""}${x.updated_at > x.submitted_at ? " · 이후 고치는 중" : ""}</small></summary>
          <div class="mgstr">${esc(x.strategy) || "<span class='mut'>(전략 없음)</span>"}</div>${x.plan_snapshot ? SL.snapshotHtml(x.plan_snapshot, ym) : `<small class="mut">제출 당시 폼이 저장되지 않은 보고예요. 지금 값은 매출 탭에서 볼 수 있어요.</small>`}</details>`; }).join("") + `</div>`;
  }).join("");
  MG.barTxt = `제출 ${done}/${mgrs.length}명${lates ? ` (⏰ 월초 ${lates}명)` : ""}`; MG.bar();
  mgBody().innerHTML = `<section class="mg"><div class="mghead"><h3>📮 월말 보고 — ${mgMon(MG.month)} 목표 (제출 ${done}/${mgrs.length})</h3><button class="btn ghost" type="button" id="mgClose">닫기</button></div>
    <p class="slhint">팀 목표 = 지점 매출 계획 ${mgMon(MG.month)} [1] 월 목표. 매니저 내 목표 합이 팀 목표와 맞는지(✅/⚠)와 [1]·[2]·[5] 저장 여부를 지점마다 봐요. 제출한 사람 줄을 누르면 전략 전문과 그 사람 폼 [1]·[2]·[5].</p>${teamHtml || `<p class="mut">매니저가 없어요</p>`}</section>`;
  dlg.scrollTop = top;
};
})();
