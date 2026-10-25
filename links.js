// 🔗 바로가기 탭: 자주 쓰는 파일·사이트(구글 드라이브 등) 링크를 제목/주소로 올려 둔다.
// 🏢 지점업무 = 같은 지점끼리 공유(대표는 지점 골라서 올림) / 👤 개인업무 = 나만. 전 지점 공용은 없음.
// index.html 의 sb·me·isBoss·previewTeam·previewUser·teams·esc·toast·fail 을 씀 → window.LK
(() => {
const LK = (window.LK = { team: null, myTeam: undefined });
const V = () => document.getElementById("lkView");
const favicon = (u) => { try { return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(u).hostname}`; } catch { return ""; } };
const normUrl = (u) => (/^https?:\/\//i.test(u) ? u : "https://" + u);
const tname = (id) => teams.find((t) => t.id === id)?.name ?? "";

LK.load = async function () {
  if (LK.myTeam === undefined) LK.myTeam = (await sb.from("profiles").select("team_id").eq("user_id", me.id).maybeSingle()).data?.team_id ?? null;
  const admin = isBoss && !previewTeam && !previewUser;
  if (admin) { try { LK.team = LK.team ?? (+localStorage.getItem("lk-team") || null); } catch {} if (!teams.some((t) => t.id === LK.team)) LK.team = teams[0]?.id ?? null; }
  else LK.team = previewTeam || LK.myTeam;
  const { data: rows, error } = await sb.from("links").select("id, title, url, scope, team_id, user_id, created_at, profiles(name)").order("created_at");
  if (fail(error)) return;
  const teamRows = rows.filter((r) => r.scope === "team" && r.team_id === LK.team), myRows = previewUser ? [] : rows.filter((r) => r.scope === "me"); // 미리보기: 매니저 개인 것은 못 보고(RLS), 내 것을 보여 주면 헷갈리니 비움
  const row = (r) => `<div class="lkrow" data-id="${r.id}">
      <a href="${esc(r.url)}" target="_blank" rel="noopener"><img src="${esc(favicon(r.url))}" alt="" width="20" height="20" onerror="this.style.visibility='hidden'"><b>${esc(r.title)}</b><span class="mut">${esc(r.url.replace(/^https?:\/\//, "")).slice(0, 60)}</span></a>
      ${r.scope === "team" ? `<span class="mut">${esc(r.profiles?.name ?? "")}</span>` : ""}
      ${r.user_id === me.id || (r.scope === "team" && isBoss) ? `<button class="btn ghost lkdel" title="지우기">🗑</button>` : ""}</div>`;
  const form = (scope, ph) => `<form class="lkform" data-scope="${scope}"><input name="title" maxlength="80" placeholder="제목 (예: ${ph})" required><input name="url" inputmode="url" autocomplete="off" placeholder="바로가기 링크 (https://…)" required><button class="btn">추가</button></form>`;
  const section = (icon, title, extra, rows, scope, ph, empty) => `<section class="lksec"><div class="lkbar"><h2>${icon} ${title}</h2>${extra}</div>
      <div class="card">${scope === "me" && previewUser ? "" : form(scope, ph)}<div class="lklist">${rows.length ? rows.map(row).join("") : `<div class="mut">${empty}</div>`}</div></div></section>`;
  V().innerHTML = section("🏢", "지점업무 바로가기",
      admin ? `<select id="lkTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === LK.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : `<span class="mut">${esc(tname(LK.team)) || "지점 없음"} · 우리 지점 매니저끼리 같이 봐요</span>`,
      teamRows, "team", "상담 일지 시트", LK.team ? "아직 없어요. 지점에서 같이 쓰는 파일·사이트를 올려 두세요." : "지점이 정해지면 쓸 수 있어요.")
    + section("👤", "개인업무 바로가기", `<span class="mut">나만 보여요</span>`, myRows, "me", "내 업무 메모", previewUser ? "매니저 개인 바로가기는 미리보기에서 안 보여요." : "아직 없어요. 나만 쓰는 파일·사이트를 올려 두세요.");
  V().querySelector("#lkTeam")?.addEventListener("change", (e) => { LK.team = +e.target.value; try { localStorage.setItem("lk-team", LK.team); } catch {} LK.load(); });
  V().querySelectorAll(".lkform").forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const scope = f.dataset.scope, title = f.title.value.trim(), url = normUrl(f.url.value.trim());
    if (!title) return toast("제목을 넣어 주세요");
    if (scope === "team" && !LK.team) return toast("지점이 없어요");
    const { error } = await sb.from("links").insert({ title, url, scope, team_id: scope === "team" ? LK.team : null });
    if (fail(error)) return;
    toast(scope === "team" ? `🏢 ${tname(LK.team)} 바로가기에 올렸어요` : "👤 내 바로가기에 올렸어요"); LK.load();
  }));
  V().querySelectorAll(".lkdel").forEach((b) => (b.onclick = async () => {
    const r = b.closest(".lkrow");
    if (!confirm(`'${r.querySelector("b").textContent}' 바로가기를 지울까요?`)) return;
    const { error } = await sb.from("links").delete().eq("id", r.dataset.id);
    if (fail(error)) return;
    LK.load();
  }));
};
})();
