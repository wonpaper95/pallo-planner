// 🌱 언젠가 할 일: 당장은 아니지만 언젠가 하면 좋을 것들. 주간·월간 맨 아래 한 칸. 날짜 없음, 나만 봄.
// 📅 날짜를 고르면 그 날 할 일(tasks)로 옮기고 여기서는 사라짐. index.html 의 sb·me·uid·previewUser·esc·toast·fail·loadAll·today 를 씀 → window.SD
(() => {
const SD = (window.SD = {});
const V = () => document.getElementById("somedayView");
SD.load = async function () {
  const { data: rows, error } = await sb.from("someday").select("id, title, done, created_at, refs").eq("user_id", uid()).order("done").order("created_at");
  if (fail(error)) return;
  const ro = !!previewUser;
  V().innerHTML = `<details open><summary>🌱 언젠가 할 일 <small>당장은 아니지만, 언젠가 하면 좋을 것들</small> <span class="mut">${rows.filter((r) => !r.done).length}개</span></summary>
    ${ro ? "" : `<form id="sdForm"><input name="title" maxlength="200" placeholder="예) 상담 스크립트 다시 정리하기" autocomplete="off" required><button class="btn">담기</button></form>`}
    <div id="sdList">${rows.length ? rows.map((r) => `<div class="sdrow ${r.done ? "done" : ""}" data-id="${r.id}">
        <input type="checkbox" ${r.done ? "checked" : ""} ${ro ? "disabled" : ""} aria-label="끝냄">
        <span class="ttl">${esc(r.title)}</span>
        ${ro ? "" : `<button class="rf ${r.refs?.length ? "on" : ""}" data-sdref title="참고 링크·파일">📎${r.refs?.length ? ` ${r.refs.length}` : ""}</button><label class="sdcal" title="날짜를 정해 플래너로 옮기기">📅<input type="date" min="${today()}"></label><button class="sddel" title="지우기">🗑</button>`}</div>`).join("")
      : `<div class="mut" style="padding:6px 0">아직 없어요. 떠오르는 걸 가볍게 담아 두세요.</div>`}</div></details>`;
  const form = V().querySelector("#sdForm");
  if (form) form.onsubmit = async (e) => {
    e.preventDefault(); const title = form.title.value.trim(); if (!title) return;
    const { error } = await sb.from("someday").insert({ title }); if (fail(error)) return;
    form.reset(); SD.load();
  };
  V().querySelectorAll(".sdrow").forEach((row) => {
    const id = row.dataset.id, title = row.querySelector(".ttl").textContent, r0 = rows.find((x) => String(x.id) === id);
    row.querySelector("[data-sdref]")?.addEventListener("click", () => REF.open(r0, { // 📎 같은 참고 자료 창, 저장만 someday 로
      save: async (refs) => { const { data, error } = await sb.from("someday").update({ refs }).eq("id", id).select("id, title, done, created_at, refs").single(); return fail(error) ? false : data; },
      after: () => SD.load(), folder: () => `sd-${id}` }));
    row.querySelector("input[type=checkbox]").onchange = async (e) => { const { error } = await sb.from("someday").update({ done: e.target.checked }).eq("id", id); if (!fail(error)) SD.load(); };
    row.querySelector(".sddel")?.addEventListener("click", async () => { if (!confirm(`'${title}' 지울까요?`)) return; const { error } = await sb.from("someday").delete().eq("id", id); if (!fail(error)) SD.load(); });
    row.querySelector(".sdcal input")?.addEventListener("change", async (e) => {
      const day = e.target.value; if (!day) return;
      const { error } = await sb.from("tasks").insert({ day, title, refs: r0?.refs ?? [] }); if (fail(error)) return; // 📎 자료도 같이 옮김
      const { error: e2 } = await sb.from("someday").delete().eq("id", id); if (fail(e2)) return;
      toast(`📅 ${day.slice(5).replace("-", "/")} 할 일로 옮겼어요`); SD.load(); loadAll();
    });
  });
};
})();
