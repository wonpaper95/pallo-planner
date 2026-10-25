// 💬 Q&A 탭: 매니저가 묻고 AI 가 대표처럼 답(근거 있을 때만, 아니면 대표 대기), 대표는 확정·수정·캡처 학습·말투 메모로 AI 를 키운다.
// 설계 docs/manager-qna/README.md. index.html 의 sb·me·isBoss·previewTeam·previewUser·teams·esc·toast·fail·view 를 씀 → window.QA
(() => {
const QA = (window.QA = { tab: null, people: null });
const V = () => document.getElementById("qaView");
const $q = (s) => V().querySelector(s);
const boss = () => isBoss && !previewTeam && !previewUser;
const ro = () => !!(previewTeam || previewUser); // 👀 매니저 화면 보기: 보기만
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const when = (s) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const tname = (id) => teams.find((t) => t.id === id)?.name ?? "";
const BADGE = { ai: ["ai", "🤖 AI 답변 · 대표 확인 전"], waiting: ["waiting", "⏳ 대표님 확인 중"], final: ["final", "✅ 대표 확정"] };

async function call(action, body = {}) {
  const { data, error } = await sb.functions.invoke("qna", { body: { action, ...body } });
  if (error) {
    let m = error.message;
    try { m = (await error.context.json()).error || m; } catch {}
    if (/Failed to send|FunctionsFetchError|not found/i.test(m)) m = "AI 서버가 아직 연결되지 않았어요 (Edge Function 배포 필요)";
    toast(m); return null;
  }
  return data;
}

QA.load = async function () {
  if (!V()) return;
  if (boss()) {
    if (!QA.people) QA.people = new Map(((await sb.from("profiles").select("user_id, name, team_id")).data ?? []).map((p) => [p.user_id, p]));
    if (!BOSS_TABS.some((t) => t[0] === QA.tab)) QA.tab = "inbox";
    return renderBoss();
  }
  if (!["mine", "faq"].includes(QA.tab)) QA.tab = "mine";
  renderManager();
};

// 실시간: 고치는 중이면 덮어쓰지 않고 다음에
QA.remote = debounce(() => {
  QA.badge();
  if (view !== "qna" || !V()) return;
  if (document.activeElement?.closest("#qaView textarea, #qaView input")) { QA.dirty = true; return; }
  QA.load();
}, 500);
document.addEventListener("focusout", (e) => { if (QA.dirty && e.target.closest?.("#qaView") && !e.relatedTarget?.closest?.("#qaView textarea, #qaView input")) { QA.dirty = false; setTimeout(QA.load, 50); } });

// 대표: 탭 옆 숫자 = 대기 + AI 답 중 아직 안 본 것
QA.badge = async function () {
  const el = document.getElementById("qaBadge"); if (!el) return;
  if (!boss()) return el.classList.add("hidden");
  const { count } = await sb.from("qna_items").select("id", { count: "exact", head: true }).or("status.eq.waiting,and(status.eq.ai,reviewed.eq.false)");
  el.textContent = count || ""; el.classList.toggle("hidden", !count);
};

// ── 카드 한 장 (매니저 내 질문·FAQ 공용) ──
function card(r, { mine = false } = {}) {
  const [cls, text] = BADGE[r.status] ?? ["", r.status];
  const showAns = r.status !== "waiting" && r.answer;
  return `<div class="card" data-id="${r.id}">
    <div class="qameta">${mine ? `<span class="qbadge ${cls}">${text}</span>` : ""}${r.private ? `<span class="qbadge">🔒 나만 보기</span>` : ""}${r.only_team ? `<span class="qbadge">${esc(tname(r.only_team) || "지점 한정")}만</span>` : ""}${r.source === "capture" ? `<span class="qbadge">📸 카톡</span>` : ""}<span>${when(r.final_at || r.created_at)}</span></div>
    <div class="qaq">Q. ${esc(r.question)}</div>
    ${showAns ? `<div class="qaa">${esc(r.answer)}</div>` : ""}
    ${mine && r.auto_private ? `<div class="mut" style="margin-top:6px">🔒 민감한 내용 같아서 나만 보기로 바꿨어요</div>` : ""}
    ${mine && r.status === "waiting" ? `<div class="mut" style="margin-top:6px">${r.ai_flags?.failed ? "AI가 지금 답하기 어려워서 대표님께 바로 넘겼어요. " : ""}답이 오면 알림이 가요</div>` : ""}
    ${mine && r.status === "ai" && r.refs?.length ? `<button type="button" class="btn ghost small qarefbtn" style="margin-top:8px">확정된 답 ${r.refs.length}개 참고</button><div class="qarefs hidden"></div>` : ""}
    ${mine && !ro() ? `<div class="qarow">${r.status === "ai" && !r.resolved ? `<button type="button" class="btn ghost small" data-act="resolve">👍 해결됐어요</button><button type="button" class="btn ghost small" data-act="escalate">🙋 대표님께 직접 물어보기</button>` : ""}${r.status === "ai" && r.resolved ? `<span class="mut">👍 해결됨</span>` : ""}${r.status === "waiting" ? `<button type="button" class="btn ghost small" data-act="cancel">취소</button>` : ""}</div>` : ""}
  </div>`;
}

// ── 매니저 화면: 질문창 + 내 질문 / FAQ ──
async function renderManager() {
  V().innerHTML = `<div class="card">
      <textarea id="qaQ" maxlength="2000" placeholder="대표님께 물어볼 것을 적어 주세요. 이미 있는 답이 아래에 먼저 보여요."></textarea>
      <div class="qarow"><label><input type="checkbox" id="qaPriv"> 🔒 나만 보기</label><span class="sp"></span><button type="button" class="btn" id="qaSend" ${ro() ? "disabled" : ""}>보내기</button></div>
      <div id="qaHits" class="qahits"></div></div>
    <nav class="qatabs"><button data-tab="mine" class="${QA.tab === "mine" ? "on" : ""}">📝 내 질문</button><button data-tab="faq" class="${QA.tab === "faq" ? "on" : ""}">📚 FAQ</button></nav>
    <div id="qaBody"><div class="mut">불러오는 중…</div></div>`;
  $q("#qaQ").addEventListener("input", hitsSoon);
  $q("#qaSend").onclick = send;
  V().querySelectorAll(".qatabs [data-tab]").forEach((b) => (b.onclick = () => { QA.tab = b.dataset.tab; renderManager(); }));
  QA.tab === "faq" ? renderFaq() : renderMine();
}
const hitsSoon = debounce(async () => {
  const q = $q("#qaQ")?.value.trim() ?? "", box = $q("#qaHits"); if (!box) return;
  if (q.length < 2) return (box.innerHTML = "");
  const { data } = await sb.rpc("qna_search", { q, n: 5 });
  box.innerHTML = data?.length ? `<div class="mut">이미 있는 답 — 열어 보고 해결되면 안 보내도 돼요</div>` + data.map((x) =>
    `<details><summary>${esc(x.question)}</summary><div class="qaa">${esc(x.answer)}</div></details>`).join("") : "";
}, 400);

async function send() {
  const t = $q("#qaQ"), q = t.value.trim(), btn = $q("#qaSend");
  if (q.length < 2) return toast("질문을 적어 주세요");
  btn.disabled = true; btn.textContent = "AI가 답을 찾는 중…";
  const r = await call("ask", { question: q, private: $q("#qaPriv").checked });
  btn.disabled = false; btn.textContent = "보내기";
  if (!r?.item) return;
  t.value = ""; $q("#qaHits").innerHTML = "";
  toast(r.item.status === "ai" ? "🤖 확정된 답을 찾았어요" : "⏳ 대표님께 넘겼어요. 답이 오면 알림이 가요");
  QA.tab = "mine"; renderManager();
}

async function renderMine() {
  const { data, error } = await sb.from("qna_items").select("*").eq("user_id", me.id).order("created_at", { ascending: false }).limit(100);
  if (fail(error)) return;
  const box = $q("#qaBody"); if (!box) return;
  box.innerHTML = data.length ? data.map((r) => card(r, { mine: true })).join("") : `<div class="card qaempty">아직 보낸 질문이 없어요. 위에 적어서 보내 보세요.</div>`;
  box.querySelectorAll(".card").forEach((c) => {
    const r = data.find((x) => x.id === +c.dataset.id);
    c.querySelector(".qarefbtn")?.addEventListener("click", async (e) => {
      const el = c.querySelector(".qarefs");
      if (el.classList.toggle("hidden")) return;
      const { data: refs } = await sb.from("qna_items").select("id, question, answer").in("id", r.refs);
      el.innerHTML = (refs ?? []).map((x) => `<p><b>Q. ${esc(x.question)}</b>\n${esc(x.answer)}</p>`).join("") || `<span class="mut">참고한 답을 볼 수 없어요 (지워졌거나 다른 지점 한정)</span>`;
      e.target.blur();
    });
    c.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => act(r, b.dataset.act)));
  });
}
async function act(r, a) {
  if (a === "cancel") {
    if (!confirm("이 질문을 취소할까요?")) return;
    const { error } = await sb.from("qna_items").delete().eq("id", r.id); if (fail(error)) return;
    toast("취소했어요");
  } else {
    const { error } = await sb.from("qna_items").update(a === "resolve" ? { resolved: true } : { status: "waiting" }).eq("id", r.id); if (fail(error)) return;
    toast(a === "resolve" ? "👍 고마워요" : "🙋 대표님께 넘겼어요. 답이 오면 알림이 가요");
  }
  renderMine();
}

async function renderFaq() {
  const box = $q("#qaBody"); if (!box) return;
  box.innerHTML = `<input type="search" id="qaFind" placeholder="FAQ 검색 (예: 상담 일지, 환불)"><div id="qaFaqList" style="margin-top:10px"></div>`;
  const { data, error } = await sb.from("qna_items").select("id, question, answer, only_team, final_at, source, private, status")
    .eq("status", "final").eq("private", false).order("final_at", { ascending: false }).limit(500);
  if (fail(error)) return;
  const draw = () => {
    const k = $q("#qaFind").value.trim().toLowerCase();
    const rows = k ? data.filter((x) => (x.question + " " + x.answer).toLowerCase().includes(k)) : data;
    $q("#qaFaqList").innerHTML = rows.length ? rows.map((r) => card(r)).join("") : `<div class="card qaempty">${data.length ? "찾는 내용이 없어요. 위에서 질문해 주세요." : "아직 확정된 답이 없어요."}</div>`;
  };
  $q("#qaFind").addEventListener("input", debounce(draw, 200)); draw();
}

// ── 대표 화면 (Task 5) ──
const BOSS_TABS = [["inbox", "📥 확인할 것"]];
function renderBoss() { V().innerHTML = `<div class="card qaempty">대표 화면은 다음 단계에서 붙여요.</div>`; }
})();
