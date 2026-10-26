// 📇 전체 연락처 탭: 전국 팔로 대표·매니저 번호. 누구나 보고 전화 걸기, 고치기는 대표만.
// index.html 의 sb·isBoss·previewTeam·previewUser·esc·toast·fail 을 씀 → window.CT
(() => {
const CT = (window.CT = { q: "", edit: null, rows: [] });
const V = () => document.getElementById("ctView");
const tel = (p) => p.replace(/\D/g, "");
const KIND = { boss: "👑 대표", manager: "🙋 매니저" };

CT.load = async function () {
  const { data, error } = await sb.from("contacts").select("*").order("kind").order("sort");
  if (fail(error)) return; CT.rows = data; CT.render();
};
CT.render = function () {
  const admin = isBoss && !previewTeam && !previewUser, q = CT.q.trim().toLowerCase();
  const hit = (r) => !q || [r.name, r.branch, r.phone, r.note].join(" ").toLowerCase().includes(q);
  const row = (r) => `<div class="ctrow" data-id="${r.id}">
      <b>${esc(r.name)}</b><span class="mut">${esc(r.branch)}</span>
      ${r.phone ? `<a href="tel:${tel(r.phone)}">📞 ${esc(r.phone)}</a>` : `<span class="mut">번호 없음</span>`}
      ${r.note ? `<small class="mut">${esc(r.note)}</small>` : ""}
      ${admin ? `<button class="btn ghost ctedit" title="고치기">✏️</button><button class="btn ghost ctdel" title="지우기">🗑</button>` : ""}</div>`;
  const sec = (kind) => { const rs = CT.rows.filter((r) => r.kind === kind && hit(r)); return `<section class="ctsec"><h2>${KIND[kind]} <span class="mut">${rs.length}명</span></h2><div class="card">${rs.length ? rs.map(row).join("") : `<div class="mut">없어요</div>`}</div></section>`; };
  const e = CT.edit;
  V().innerHTML = `<div class="ctbar"><h2>📇 전체 연락처</h2><input id="ctQ" placeholder="이름·지점·번호 검색" value="${esc(CT.q)}"><span class="mut">매니저 번호는 대부분 지점 매장 번호예요</span></div>
    ${admin ? `<form id="ctForm" class="card ctform">
      <select name="kind"><option value="manager" ${e?.kind !== "boss" ? "selected" : ""}>매니저</option><option value="boss" ${e?.kind === "boss" ? "selected" : ""}>대표</option></select>
      <input name="name" placeholder="이름(영어이름)" maxlength="60" value="${esc(e?.name ?? "")}" required>
      <input name="branch" placeholder="지점" maxlength="60" value="${esc(e?.branch ?? "")}">
      <input name="phone" inputmode="tel" placeholder="010-0000-0000" maxlength="20" value="${esc(e?.phone ?? "")}">
      <input name="note" placeholder="메모(선택)" maxlength="100" value="${esc(e?.note ?? "")}">
      <button class="btn">${e ? "고치기" : "추가"}</button>${e ? `<button type="button" class="btn ghost" id="ctCancel">취소</button>` : ""}</form>` : ""}
    ${sec("boss")}${sec("manager")}`;
  const qi = V().querySelector("#ctQ"); qi.oninput = () => { CT.q = qi.value; const at = qi.selectionStart; CT.render(); const n = V().querySelector("#ctQ"); n.focus(); n.setSelectionRange(at, at); };
  const f = V().querySelector("#ctForm");
  if (f) {
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const d = { kind: f.kind.value, name: f.name.value.trim(), branch: f.branch.value.trim(), phone: f.phone.value.trim(), note: f.note.value.trim() };
      if (!d.name) return toast("이름을 넣어 주세요");
      const { error } = e ? await sb.from("contacts").update({ ...d, updated_at: new Date().toISOString() }).eq("id", e.id) : await sb.from("contacts").insert(d);
      if (fail(error)) return;
      toast(e ? "고쳤어요" : "추가했어요"); CT.edit = null; CT.load();
    };
    V().querySelector("#ctCancel")?.addEventListener("click", () => { CT.edit = null; CT.render(); });
  }
  V().querySelectorAll(".ctedit").forEach((b) => (b.onclick = () => { CT.edit = CT.rows.find((r) => r.id == b.closest(".ctrow").dataset.id); CT.render(); window.scrollTo(0, 0); }));
  V().querySelectorAll(".ctdel").forEach((b) => (b.onclick = async () => {
    const r = CT.rows.find((x) => x.id == b.closest(".ctrow").dataset.id);
    if (!confirm(`'${r.name}' 연락처를 지울까요?`)) return;
    const { error } = await sb.from("contacts").delete().eq("id", r.id); if (fail(error)) return; CT.load();
  }));
};
})();
