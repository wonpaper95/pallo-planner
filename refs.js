// 📎 할 일 자료: 할 일 줄의 📎 → 참고 링크·파일 모아 두고 작업할 때 바로 열기 (tasks.refs, 파일은 비공개 task-files/<내 id>/<할 일 id>/)
// index.html 의 sb·me·tasks·save·renderWeek·esc·toast·fail 을 씀 → window.REF
// ponytail: 할 일을 지워도 올린 파일은 보관함에 남음 — 용량이 문제 되면 지울 때 같이 지우기
(() => {
const REF = (window.REF = {});
const list = (t) => (Array.isArray(t.refs) ? t.refs : []);
REF.btn = (t) => { const n = list(t).length; return `<button class="rf ${n ? "on" : ""}" data-act="ref" title="참고 링크·파일">📎${n ? ` ${n}` : ""}</button>`; };

let cur = null;
const dlg = () => {
  let d = document.getElementById("refDlg"); if (d) return d;
  d = document.createElement("dialog"); d.id = "refDlg"; d.className = "wide"; document.body.appendChild(d);
  d.addEventListener("click", onClick);
  d.addEventListener("change", (e) => e.target.id === "refFile" && upload([...e.target.files]));
  d.addEventListener("keydown", (e) => { if (e.target.id === "refUrl" && e.key === "Enter" && !e.isComposing) { e.preventDefault(); addLink(); } });
  d.addEventListener("dragover", (e) => e.preventDefault());
  d.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files.length) upload([...e.dataTransfer.files]); });
  return d;
};
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const render = () => {
  const t = cur, rs = list(t), d = dlg();
  d.innerHTML = `<h3 style="margin:0 0 2px">📎 참고 자료</h3><p class="mut" style="margin:0 0 10px;font-size:13px">${esc(t.title || "할 일")}</p>
    <div class="reflist">${rs.length ? rs.map((r, i) => `<div class="refrow"><span>${r.k === "file" ? "📄" : "🔗"}</span>
        <button class="reflink" data-ropen="${i}" title="열기">${esc(r.name)}</button><small class="mut">${r.k === "file" ? "파일" : esc(host(r.url))}</small>
        <button class="btn ghost" data-rdel="${i}" title="지우기">🗑</button></div>`).join("")
      : `<div class="mut" style="padding:10px 0;font-size:14px">아직 없어요 — 링크를 붙여 넣거나 파일을 올려 두면 작업할 때 바로 열 수 있어요</div>`}</div>
    <div class="refadd"><input id="refUrl" placeholder="링크 붙여넣기 (https://…)"><input id="refName" placeholder="이름 (비우면 주소)">
      <button class="btn" data-radd>추가</button></div>
    <div class="refadd"><label class="btn ghost" style="cursor:pointer">📤 파일 올리기<input type="file" id="refFile" multiple hidden></label>
      <small class="mut">여기로 끌어다 놓아도 돼요 · 50MB까지 · 나만 볼 수 있어요</small><span style="flex:1"></span><button class="btn ghost" data-rx>닫기</button></div>`;
};
const put = async (refs) => { if (!(await save(cur.id, { refs }))) return false; cur = tasks.find((t) => t.id === cur.id) ?? { ...cur, refs }; render(); renderWeek(); return true; };
async function addLink() {
  let u = document.getElementById("refUrl").value.trim(); if (!u) return toast("링크를 붙여 넣어 주세요");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  const name = document.getElementById("refName").value.trim() || host(u) + (new URL(u).pathname.length > 1 ? new URL(u).pathname : "");
  await put([...list(cur), { k: "link", name, url: u, at: new Date().toISOString() }]);
}
async function upload(files) {
  if (!files.length) return; const add = [];
  for (const f of files) {
    if (f.size > 52428800) { toast(`${f.name}: 50MB 넘어요`); continue; }
    const ext = (f.name.match(/\.[A-Za-z0-9]{1,8}$/) ?? [""])[0], path = `${me.id}/${cur.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`; // 보관함 주소는 영문만 됨 → 원래 이름은 name 에
    toast(`올리는 중… ${f.name}`);
    const { error } = await sb.storage.from("task-files").upload(path, f, { contentType: f.type || undefined }); if (fail(error)) continue;
    add.push({ k: "file", name: f.name, path, at: new Date().toISOString() });
  }
  if (add.length && (await put([...list(cur), ...add]))) toast(`📎 ${add.length}개 올렸어요`);
}
async function onClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  if (b.hasAttribute("data-rx")) return dlg().close();
  if (b.hasAttribute("data-radd")) return addLink();
  const rs = list(cur);
  if (b.dataset.ropen) {
    const r = rs[+b.dataset.ropen]; if (r.k === "link") return window.open(r.url, "_blank", "noopener");
    const w = window.open("", "_blank"); // 팝업 막힘 피하려고 먼저 열고 주소는 뒤에
    const { data, error } = await sb.storage.from("task-files").createSignedUrl(r.path, 3600); if (fail(error)) return w?.close();
    w ? (w.location = data.signedUrl) : (location.href = data.signedUrl);
  }
  if (b.dataset.rdel) {
    const i = +b.dataset.rdel, r = rs[i]; if (!confirm(`"${r.name}" 지울까요?`)) return;
    if (r.k === "file") await sb.storage.from("task-files").remove([r.path]);
    await put(rs.filter((_, j) => j !== i));
  }
}
REF.open = (t) => { cur = t; render(); dlg().showModal(); setTimeout(() => document.getElementById("refUrl")?.focus(), 50); };
})();
