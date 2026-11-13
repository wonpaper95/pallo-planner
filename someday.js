// 💡 아이디어 창구(옛 이름 언젠가 할 일): 당장은 아니지만 언젠가 하면 좋을 것들. 주간·월간 맨 아래 한 칸. 날짜 없음, 나만 봄.
// 📅 날짜를 고르면 그 날 할 일(tasks)로 옮기고 여기서는 사라짐. index.html 의 sb·me·uid·previewUser·esc·toast·fail·loadAll·today 를 씀 → window.SD
(() => {
const SD = (window.SD = {});
const V = () => document.getElementById("somedayView");
SD.load = async function () {
  const { data: rows, error } = await sb.from("someday").select("id, title, done, created_at, refs, memo").eq("user_id", uid()).order("done").order("created_at");
  if (fail(error)) return;
  const ro = !!previewUser;
  // ⏳ 아직 못 한 일: 지난 날짜(오늘 전)인데 안 끝낸 내 할 일 — 언제 하기로 했었는지 같이. 60일 안, 최근 것부터 5개만 먼저(나머지는 더 보기)
  const from = new Date(); from.setDate(from.getDate() - 60);
  const { data: miss, error: e0 } = await sb.from("tasks").select("id, day, title, deadline").eq("user_id", uid()).eq("done", false).lt("day", today()).gte("day", W.ymd(from)).order("day", { ascending: false }).order("sort").limit(100);
  if (fail(e0)) return;
  const DOWK = ["일", "월", "화", "수", "목", "금", "토"], t0 = new Date(today() + "T00:00:00");
  const ago = (d) => Math.round((t0 - new Date(d + "T00:00:00")) / 864e5);
  V().innerHTML = `<details open><summary>💡 아이디어 창구 <small>당장은 아니지만, 언젠가 하면 좋을 것들</small> <span class="mut">${rows.filter((r) => !r.done).length}개</span></summary>
    ${ro ? "" : `<form id="sdForm"><input name="title" maxlength="200" placeholder="예) 상담 스크립트 다시 정리하기" autocomplete="off" required><button class="btn">담기</button></form>`}
    <div id="sdList">${rows.length ? rows.map((r) => `<div class="sdrow ${r.done ? "done" : ""}" data-id="${r.id}">
        <input type="checkbox" ${r.done ? "checked" : ""} ${ro ? "disabled" : ""} aria-label="끝냄">
        <span class="ttl">${esc(r.title)}</span>
        ${ro ? "" : `<button class="rf ${r.refs?.length ? "on" : ""}" data-sdref title="참고 링크·파일">📎${r.refs?.length ? ` ${r.refs.length}` : ""}</button><label class="sdcal" title="날짜를 정해 플래너로 옮기기">📅<input type="date" min="${today()}"></label><button class="sddel" title="지우기">🗑</button>`}</div>`).join("")
      : `<div class="mut" style="padding:6px 0">아직 없어요. 떠오르는 걸 가볍게 담아 두세요.</div>`}</div>
    <button type="button" class="btn sdgo" style="margin-top:8px;width:100%">📝 아이디어 탭에서 메모하며 구상하기 ›</button></details>`;
  V().querySelector(".sdgo")?.addEventListener("click", () => setView("idea"));
  if (miss.length) V().insertAdjacentHTML("beforeend", `<details open class="sdmiss"><summary>⏳ 아직 못 한 일 <small>하기로 했던 날이 지났는데 안 끝낸 것들</small> <span class="mut">${miss.length}개</span></summary>
    <div>${miss.map((m, i) => { const d = new Date(m.day + "T00:00:00"); return `<div class="sdrow ${i >= 5 && !SD.missAll ? "sdhide" : ""}" data-mid="${m.id}">
      <input type="checkbox" ${ro ? "disabled" : ""} aria-label="끝냄">
      <span class="ttl">${esc(m.title)}<small class="mut sdwhen">${d.getMonth() + 1}/${d.getDate()}(${DOWK[d.getDay()]})에 하기로 함 · ${ago(m.day)}일 지남${m.deadline ? ` · 마감 ${new Date(m.deadline).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}</small></span>
      ${ro ? "" : `<label class="sdcal" title="새 날짜로 옮기기">📅<input type="date" min="${today()}"></label>`}</div>`; }).join("")}</div>${miss.length > 5 ? `<button type="button" class="btn sdmore">${SD.missAll ? "접기" : `+${miss.length - 5}개 더 보기`}</button>` : ""}</details>`);
  V().querySelector(".sdmore")?.addEventListener("click", () => { SD.missAll = !SD.missAll; SD.load(); });
  V().querySelectorAll(".sdmiss .sdrow").forEach((row) => {
    const id = row.dataset.mid;
    row.querySelector("input[type=checkbox]").onchange = async (e) => { const { error } = await sb.from("tasks").update({ done: e.target.checked }).eq("id", id); if (!fail(error)) { SD.load(); loadAll(); } };
    row.querySelector(".sdcal input")?.addEventListener("change", async (e) => {
      const day = e.target.value; if (!day) return;
      const { error } = await sb.from("tasks").update({ day }).eq("id", id); if (fail(error)) return;
      toast(`📅 ${day.slice(5).replace("-", "/")} 로 옮겼어요`); SD.load(); loadAll();
    });
  });
  const form = V().querySelector("#sdForm");
  if (form) form.onsubmit = async (e) => {
    e.preventDefault(); const title = form.title.value.trim(); if (!title) return;
    const { error } = await sb.from("someday").insert({ title }); if (fail(error)) return;
    form.reset(); SD.load();
  };
  V().querySelectorAll("#sdList .sdrow").forEach((row) => {
    const id = row.dataset.id, title = row.querySelector(".ttl").textContent, r0 = rows.find((x) => String(x.id) === id);
    row.querySelector("[data-sdref]")?.addEventListener("click", () => REF.open(r0, { // 📎 같은 참고 자료 창, 저장만 someday 로
      save: async (refs) => { const { data, error } = await sb.from("someday").update({ refs }).eq("id", id).select("id, title, done, created_at, refs, memo").single(); return fail(error) ? false : data; },
      after: () => SD.load(), folder: () => `sd-${id}` }));
    row.querySelector("input[type=checkbox]").onchange = async (e) => { const { error } = await sb.from("someday").update({ done: e.target.checked }).eq("id", id); if (!fail(error)) SD.load(); };
    row.querySelector(".sddel")?.addEventListener("click", async () => { if (!confirm(`'${title}' 지울까요?`)) return; const { error } = await sb.from("someday").delete().eq("id", id); if (!fail(error)) SD.load(); });
    row.querySelector(".sdcal input")?.addEventListener("change", async (e) => {
      const day = e.target.value; if (!day) return;
      const { error } = await sb.from("tasks").insert({ day, title, note: r0?.memo ?? "", refs: r0?.refs ?? [] }); if (fail(error)) return; // 📝 메모·📎 자료도 같이 옮김
      const { error: e2 } = await sb.from("someday").delete().eq("id", id); if (fail(e2)) return;
      toast(`📅 ${day.slice(5).replace("-", "/")} 할 일로 옮겼어요`); SD.load(); loadAll();
    });
  });
};
})();
