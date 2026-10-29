// 💬 [톡톡·인스타 봇] 탭 (대표만): 네이버 톡톡 봇·인스타 DM 봇이 몰라서 매니저에게 넘긴 질문(talk_asks)에 답을 달면 봇 지식(talk_kb)이 되고, 봇은 다음 질문부터 그 답을 씀
// 봇 = supabase/functions/talktalk-bot · insta-bot (지식 talk_kb 하나를 같이 씀 — 한 번 가르치면 둘 다 배움). 인스타 질문은 q 앞에 '[인스타] '. index.html 의 sb·isBoss·previewTeam·previewUser·esc·toast·fail 을 씀 → window.TK
(() => {
const TK = (window.TK = { br: "all", ch: "all", asks: [], kb: [], edit: null });
const IG = "[인스타] ", isIg = (q) => q.startsWith(IG), bare = (q) => (isIg(q) ? q.slice(IG.length) : q);
const CHS = { all: "톡톡+인스타", talk: "💬 톡톡만", insta: "📷 인스타만" };
const V = () => document.getElementById("tkView");
const BR = { all: "3지점 공통", daegu: "대구 동성로점", ulsan: "울산점", "daegu-jpcn": "일본어&중국어 대구동성로점" };
const opts = (sel, withAll = true) => Object.entries(BR).filter(([k]) => withAll || k !== "all").map(([k, v]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${v}</option>`).join("");
const when = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

TK.load = async function () {
  if (!isBoss || previewTeam || previewUser) { V().innerHTML = `<p class="mut">대표만 볼 수 있어요</p>`; return; }
  const [a, k] = await Promise.all([
    sb.from("talk_asks").select("*").eq("done", false).order("at", { ascending: false }).limit(300),
    sb.from("talk_kb").select("*").order("branch").order("sort").order("id"),
  ]);
  if (fail(a.error) || fail(k.error)) return;
  TK.asks = a.data; TK.kb = k.data; TK.render();
};

TK.render = function () {
  const show = (b) => TK.br === "all" || b === TK.br || b === "all";
  const groups = []; // 같은 지점·같은 질문은 한 묶음
  const showCh = (q) => TK.ch === "all" || (TK.ch === "insta") === isIg(q);
  for (const r of TK.asks.filter((r) => show(r.branch) && showCh(r.q))) {
    const g = groups.find((x) => x.branch === r.branch && x.q === r.q);
    g ? g.n++ : groups.push({ branch: r.branch, q: r.q, at: r.at, n: 1 });
  }
  const kb = TK.kb.filter((r) => show(r.branch)), e = TK.edit;
  V().innerHTML = `<div class="tkbar"><h2>💬 톡톡·인스타 봇</h2><select id="tkBr">${opts(TK.br).replace(">3지점 공통<", ">전체 지점 보기<")}</select>
      <select id="tkCh">${Object.entries(CHS).map(([k, v]) => `<option value="${k}" ${k === TK.ch ? "selected" : ""}>${v}</option>`).join("")}</select>
      <span class="mut">두 봇 모두 아래 '봇이 아는 것'만 보고 답해요 — 한 번 가르치면 톡톡·인스타가 같이 배워요. 모르는 건 매니저에게 넘기고 여기에 쌓여요.
      📷 인스타 봇은 매니저 근무시간 밖에만 답해요(월–목 22시~11시 · 토·일 16시 이후 · 금 종일).</span></div>
    <section class="tksec"><h3>❓ 봇이 몰라서 넘긴 질문 <span class="mut">${groups.length}개</span></h3>
      ${groups.length ? groups.map((g, i) => `<div class="card tkask" data-i="${i}">
        <div><span class="tkch ${isIg(g.q) ? "ig" : ""}">${isIg(g.q) ? "📷 인스타" : "💬 톡톡"}</span> <span class="tkbr">${esc(BR[g.branch] ?? g.branch)}</span> <span class="mut">${when(g.at)}${g.n > 1 ? ` · ${g.n}번 물어봄` : ""}</span></div>
        <b>“${esc(bare(g.q))}”</b>
        <textarea placeholder="봇이 이 질문에 할 답 (예: 3개월 ○○만원이에요. 할인은 상담 때 안내드려요)" maxlength="1000"></textarea>
        <div class="tkrow"><label><input type="checkbox" class="tkall"> 3지점 공통 답</label>
          <button class="btn tkok">💾 답 저장 → 봇이 배움</button><button class="btn ghost tkskip">무시</button></div></div>`).join("")
      : `<div class="card mut">넘긴 질문이 없어요 🎉</div>`}</section>
    <section class="tksec"><h3>📚 봇이 아는 것 <span class="mut">${kb.length}개</span></h3>
      <form id="tkForm" class="card tkform">
        <select name="branch">${opts(e?.branch ?? (TK.br === "all" ? "all" : TK.br))}</select>
        <input name="q" placeholder="주제·질문 (예: 주차)" maxlength="200" value="${esc(e?.q ?? "")}" required>
        <textarea name="a" placeholder="봇이 쓸 답" maxlength="1000" required>${esc(e?.a ?? "")}</textarea>
        <div class="tkrow"><button class="btn">${e ? "고치기" : "+ 알려주기"}</button>${e ? `<button type="button" class="btn ghost" id="tkCancel">취소</button>` : ""}</div></form>
      <div class="card">${kb.map((r) => `<div class="tkkb ${r.on ? "" : "off"}" data-id="${r.id}">
        <span class="tkbr">${esc(BR[r.branch])}</span><b>${esc(r.q)}</b><span>${esc(r.a)}</span>
        <span class="tkbtns"><button class="btn ghost tkon" title="켜기/끄기">${r.on ? "✅ 씀" : "⏸ 안 씀"}</button><button class="btn ghost tkedit" title="고치기">✏️</button><button class="btn ghost tkdel" title="지우기">🗑</button></span></div>`).join("") || `<div class="mut">없어요</div>`}</div></section>`;

  V().querySelector("#tkBr").onchange = (ev) => { TK.br = ev.target.value; TK.render(); };
  V().querySelector("#tkCh").onchange = (ev) => { TK.ch = ev.target.value; TK.render(); };
  V().querySelectorAll(".tkask").forEach((c) => {
    const g = groups[c.dataset.i];
    const close = async (kbId) => {
      const { error } = await sb.from("talk_asks").update({ done: true, kb_id: kbId }).eq("branch", g.branch).eq("q", g.q).eq("done", false);
      if (!fail(error)) TK.load();
    };
    c.querySelector(".tkok").onclick = async () => {
      const a = c.querySelector("textarea").value.trim();
      if (!a) return toast("답을 적어 주세요");
      const { data, error } = await sb.from("talk_kb").insert({ branch: c.querySelector(".tkall").checked ? "all" : g.branch, q: bare(g.q).slice(0, 200), a }).select("id").single();
      if (fail(error)) return;
      toast("봇이 배웠어요 — 다음 질문부터 이 답을 써요"); close(data.id);
    };
    c.querySelector(".tkskip").onclick = () => close(null);
  });
  const f = V().querySelector("#tkForm");
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const d = { branch: f.branch.value, q: f.q.value.trim(), a: f.a.value.trim() };
    if (!d.q || !d.a) return toast("주제와 답을 적어 주세요");
    const { error } = e ? await sb.from("talk_kb").update({ ...d, updated_at: new Date().toISOString() }).eq("id", e.id) : await sb.from("talk_kb").insert(d);
    if (fail(error)) return;
    toast(e ? "고쳤어요" : "봇이 배웠어요"); TK.edit = null; TK.load();
  };
  V().querySelector("#tkCancel")?.addEventListener("click", () => { TK.edit = null; TK.render(); });
  const row = (b) => TK.kb.find((r) => r.id == b.closest(".tkkb").dataset.id);
  V().querySelectorAll(".tkon").forEach((b) => (b.onclick = async () => {
    const r = row(b); const { error } = await sb.from("talk_kb").update({ on: !r.on, updated_at: new Date().toISOString() }).eq("id", r.id); if (!fail(error)) TK.load();
  }));
  V().querySelectorAll(".tkedit").forEach((b) => (b.onclick = () => { TK.edit = row(b); TK.render(); V().querySelector("#tkForm").scrollIntoView({ block: "center" }); }));
  V().querySelectorAll(".tkdel").forEach((b) => (b.onclick = async () => {
    const r = row(b); if (!confirm(`'${r.q}' 지식을 지울까요? (잠깐 끄려면 ✅ 씀 을 눌러 '안 씀'으로)`)) return;
    const { error } = await sb.from("talk_kb").delete().eq("id", r.id); if (!fail(error)) TK.load();
  }));
};
})();
