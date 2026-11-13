// 💡 아이디어 창구 탭: 아이디어(someday 표 그대로) + 구상 메모(큰 칸·접기/펴기·자동 저장). 날짜를 고르면 할 일로 옮기고 메모는 할 일 note 로.
// index.html 의 sb·uid·previewUser·esc·toast·fail·loadAll·today·setView 를 씀 → window.IDEA
(() => {
const IDEA = (window.IDEA = {});
const V = () => document.getElementById("ideaView");
const COLS = "id, title, done, created_at, refs, memo";
const OPEN_KEY = "idea-open"; // 펼친 카드 기억 (이 기기만)
const openSet = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || "[]")); } catch { return new Set(); } };
const saveOpen = (s) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s].slice(-200))); } catch {} };
IDEA.load = async function () {
  const { data: rows, error } = await sb.from("someday").select(COLS).eq("user_id", uid()).order("done").order("created_at", { ascending: false });
  if (fail(error)) return;
  const ro = !!previewUser, open = openSet();
  V().innerHTML = `<h2>💡 아이디어 창구</h2><div class="mut">떠오른 걸 담고, 어떻게 구상하고 해볼지는 아래 메모에 적어 두세요. 카드를 눌러 접고 펼 수 있어요.</div>
    ${ro ? "" : `<form id="idForm"><input name="title" maxlength="200" placeholder="예) 애플 메시지 답장 제안해주는 프로그램 만들기" autocomplete="off" required><button class="btn">담기</button></form>`}
    ${rows.length ? rows.map((r) => `<details class="idcard ${r.done ? "done" : ""}" data-id="${r.id}" ${open.has(String(r.id)) ? "open" : ""}>
      <summary><span class="idarrow">▶</span>
        <textarea class="idtitle" rows="1" maxlength="200" ${ro ? "readonly" : ""} aria-label="아이디어 제목">${esc(r.title)}</textarea>
        ${r.memo?.trim() ? `<span class="idhas" title="메모 있음">📝</span>` : ""}
        ${ro ? "" : `<button type="button" class="rf ${r.refs?.length ? "on" : ""}" data-ref title="참고 링크·파일">📎${r.refs?.length ? ` ${r.refs.length}` : ""}</button><label class="idcal" title="날짜를 정해 플래너로 옮기기">📅<input type="date" min="${today()}"></label><button type="button" class="iddel" title="지우기">🗑</button>`}
      </summary>
      <div class="idmemo"><textarea placeholder="이 아이디어를 어떻게 구상하고, 어떻게 해볼지 메모해 두세요." ${ro ? "readonly" : ""}>${esc(r.memo ?? "")}</textarea><div class="idsave"></div></div></details>`).join("")
      : `<div class="mut idempty">아직 없어요. 떠오르는 걸 가볍게 담아 두세요.</div>`}`;
  const form = V().querySelector("#idForm");
  if (form) form.onsubmit = async (e) => { e.preventDefault(); const title = form.title.value.trim(); if (!title) return;
    const { error } = await sb.from("someday").insert({ title }); if (fail(error)) return; form.reset(); IDEA.load(); window.SD?.load(); };
  V().querySelectorAll(".idcard").forEach((card) => {
    const id = card.dataset.id, r0 = rows.find((x) => String(x.id) === id), stop = (e) => e.stopPropagation();
    card.addEventListener("toggle", () => { const s = openSet(); card.open ? s.add(id) : s.delete(id); saveOpen(s); });
    const ti = card.querySelector(".idtitle"), ta = card.querySelector(".idmemo textarea"), st = card.querySelector(".idsave");
    // summary 안 입력칸·버튼을 눌러도 카드가 접히지 않게
    card.querySelectorAll("summary input, summary button, summary label").forEach((el) => el.addEventListener("click", stop));
    const fit = () => { ti.style.height = "auto"; ti.style.height = ti.scrollHeight + (ti.offsetHeight - ti.clientHeight) + "px"; }; // 제목이 길면 줄바꿈해서 전부 보이게
    fit(); ti.addEventListener("input", fit); card.addEventListener("toggle", fit); addEventListener("resize", fit);
    ti.addEventListener("keydown", (e) => { if (e.key === " ") e.stopPropagation(); if (e.key === "Enter" && !e.isComposing) ti.blur(); }); // 스페이스가 카드 접기로 안 먹게
    ti.onchange = async () => { const title = ti.value.trim() || r0.title; ti.value = title; r0.title = title; const { error } = await sb.from("someday").update({ title }).eq("id", id); if (!fail(error)) window.SD?.load(); };
    let t; const flush = async () => { clearTimeout(t); if (ta.value === (r0.memo ?? "")) return; const memo = ta.value; st.textContent = "저장 중…";
      const { error } = await sb.from("someday").update({ memo }).eq("id", id); if (fail(error)) { st.textContent = "⚠️ 저장 실패 — 다시 눌러 주세요"; return; } r0.memo = memo; st.textContent = "✓ 저장됨"; };
    ta.addEventListener("input", () => { st.textContent = "…"; clearTimeout(t); t = setTimeout(flush, 800); });
    ta.addEventListener("blur", flush);
    card.querySelector("[data-ref]")?.addEventListener("click", () => REF.open(r0, {
      save: async (refs) => { const { data, error } = await sb.from("someday").update({ refs }).eq("id", id).select(COLS).single(); return fail(error) ? false : data; },
      after: () => IDEA.load(), folder: () => `sd-${id}` }));
    card.querySelector(".iddel")?.addEventListener("click", async () => { if (!confirm(`'${r0.title}' 지울까요? 메모도 같이 지워져요.`)) return; const { error } = await sb.from("someday").delete().eq("id", id); if (!fail(error)) { IDEA.load(); window.SD?.load(); } });
    card.querySelector(".idcal input")?.addEventListener("change", async (e) => {
      const day = e.target.value; if (!day) return; await flush();
      const { error } = await sb.from("tasks").insert({ day, title: r0.title, note: r0.memo ?? "", refs: r0.refs ?? [] }); if (fail(error)) return; // 📝 메모·📎 자료도 같이 옮김
      const { error: e2 } = await sb.from("someday").delete().eq("id", id); if (fail(e2)) return;
      toast(`📅 ${day.slice(5).replace("-", "/")} 할 일로 옮겼어요`); IDEA.load(); window.SD?.load(); loadAll();
    });
  });
};
})();
