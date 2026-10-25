// 🔗 바로가기 탭: 매니저들이 자주 쓰는 파일·사이트(구글 드라이브 등) 링크를 제목/주소로 올려 두는 공용 목록.
// index.html 의 sb·me·isBoss·esc·toast·fail·setView 를 씀 → window.LK
(() => {
const LK = (window.LK = {});
const V = () => document.getElementById("lkView");
const favicon = (u) => { try { return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(u).hostname}`; } catch { return ""; } };
const normUrl = (u) => (/^https?:\/\//i.test(u) ? u : "https://" + u);

LK.load = async function () {
  const { data: rows, error } = await sb.from("links").select("id, title, url, user_id, created_at, profiles(name)").order("created_at");
  if (fail(error)) return;
  V().innerHTML = `<div class="lkbar"><h2>🔗 바로가기</h2><span class="mut">자주 쓰는 파일·사이트를 올려 두면 모두가 함께 써요</span></div>
    <form id="lkForm" class="card lkform">
      <input name="title" maxlength="80" placeholder="제목 (예: 상담 일지 시트)" required>
      <input name="url" inputmode="url" autocomplete="off" placeholder="바로가기 링크 (https://…)" required>
      <button class="btn">추가</button>
    </form>
    <div class="card lklist">${rows.length ? rows.map((r) => `<div class="lkrow" data-id="${r.id}">
        <a href="${esc(r.url)}" target="_blank" rel="noopener"><img src="${esc(favicon(r.url))}" alt="" width="20" height="20" onerror="this.style.visibility='hidden'"><b>${esc(r.title)}</b><span class="mut">${esc(r.url.replace(/^https?:\/\//, "")).slice(0, 60)}</span></a>
        <span class="mut">${esc(r.profiles?.name ?? "")}</span>
        ${r.user_id === me.id || isBoss ? `<button class="btn ghost lkdel" title="지우기">🗑</button>` : ""}</div>`).join("")
      : `<div class="mut">아직 없어요. 위에 제목과 링크를 넣고 추가하세요.</div>`}</div>`;
  V().querySelector("#lkForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, title = f.title.value.trim(), url = normUrl(f.url.value.trim());
    if (!title) return toast("제목을 넣어 주세요");
    const { error } = await sb.from("links").insert({ title, url });
    if (fail(error)) return;
    toast("추가했어요"); LK.load();
  };
  V().querySelectorAll(".lkdel").forEach((b) => (b.onclick = async () => {
    const row = b.closest(".lkrow");
    if (!confirm(`'${row.querySelector("b").textContent}' 바로가기를 지울까요?`)) return;
    const { error } = await sb.from("links").delete().eq("id", row.dataset.id);
    if (fail(error)) return;
    LK.load();
  }));
};
})();
