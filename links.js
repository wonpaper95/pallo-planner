// 🔗 바로가기 탭: 자주 쓰는 파일·사이트(구글 드라이브 등) 링크를 제목/주소로 올려 둔다.
// 🏢 지점업무 = 같은 지점끼리 공유(대표는 지점 골라서 올림) / 👤 개인업무 = 나만. 전 지점 공용은 없음.
// 📁 지점 중요 서류 = 대표가 지점 탭에서 파일 올림 → 그 지점 매니저는 내려받기만 (branch_docs + 비공개 보관함 branch-docs/<지점 id>/)
// index.html 의 sb·me·isBoss·previewTeam·previewUser·teams·esc·toast·fail 을 씀 → window.LK
(() => {
const LK = (window.LK = { team: null, myTeam: undefined });
const V = () => document.getElementById("lkView");
const favicon = (u) => { try { return `https://www.google.com/s2/favicons?sz=32&domain=${new URL(u).hostname}`; } catch { return ""; } };
const normUrl = (u) => (/^https?:\/\//i.test(u) ? u : "https://" + u);
const tname = (id) => teams.find((t) => t.id === id)?.name ?? (id === LK.myTeam ? LK.myTeamName : "") ?? ""; // 매니저는 teams 목록이 비어 있음 → 우리 지점 이름은 따로

LK.load = async function () {
  if (LK.myTeam === undefined) LK.myTeam = (await sb.from("profiles").select("team_id").eq("user_id", me.id).maybeSingle()).data?.team_id ?? null;
  const admin = isBoss && !previewTeam && !previewUser;
  if (admin) { try { LK.team = LK.team ?? (+localStorage.getItem("lk-team") || null); } catch {} if (!teams.some((t) => t.id === LK.team)) LK.team = teams[0]?.id ?? null; }
  else LK.team = previewTeam || LK.myTeam;
  if (LK.myTeam && LK.myTeamName === undefined) LK.myTeamName = (await sb.from("teams").select("name").eq("id", LK.myTeam).maybeSingle()).data?.name ?? "";
  const docs = LK.team ? (await sb.from("branch_docs").select("id, name, path, size, created_at").eq("team_id", LK.team).order("created_at", { ascending: false })).data ?? [] : [];
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
  const kb = (n) => (n == null ? "" : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))}KB` : `${(n / 1048576).toFixed(1)}MB`);
  const docSec = `<section class="lksec"><div class="lkbar"><h2>📁 지점 중요 서류</h2><span class="mut">${admin ? "지점 탭을 골라 올려요 · 그 지점 매니저님이 내려받아요" : `${esc(tname(LK.team))} · 대표님이 올린 서류 · 눌러서 내려받기`}</span></div>
      <div class="card">${admin ? `<label class="btn lkup">📤 ${esc(tname(LK.team))}에 서류 올리기<input type="file" id="lkFile" multiple hidden></label><small class="mut" style="display:block;margin:4px 0 10px">눌러서 고르거나 여기로 끌어다 놓기 · 50MB까지</small>` : ""}
      <div class="lklist">${docs.length ? docs.map((d) => `<div class="lkrow lkdoc" data-doc="${d.id}"><button class="lkdl" data-path="${esc(d.path)}" data-name="${esc(d.name)}" title="내려받기">📄 <b>${esc(d.name)}</b><span class="mut">${kb(d.size)} · ${d.created_at.slice(5, 10).replace("-", "/")}</span><span class="lkget">⬇️ 내려받기</span></button>${admin ? `<button class="btn ghost lkddel" title="지우기">🗑</button>` : ""}</div>`).join("")
        : `<div class="mut">${admin ? "아직 없어요. 이 지점 매니저님이 봐야 할 서류를 올려 두세요." : "아직 올라온 서류가 없어요."}</div>`}</div></div></section>`;
  const tabs = admin ? `<div class="lktabs">${teams.map((t) => `<button data-lkt="${t.id}" class="${t.id === LK.team ? "on" : ""}">${esc(t.name)}</button>`).join("")}</div>` : "";
  V().innerHTML = tabs + (LK.team ? docSec : "") + section("🏢", "지점업무 바로가기",
      admin ? `<span class="mut">${esc(tname(LK.team))} · 위 지점 탭에서 바꿔요</span>` : `<span class="mut">${esc(tname(LK.team)) || "지점 없음"} · 우리 지점 매니저끼리 같이 봐요</span>`,
      teamRows, "team", "상담 일지 시트", LK.team ? "아직 없어요. 지점에서 같이 쓰는 파일·사이트를 올려 두세요." : "지점이 정해지면 쓸 수 있어요.")
    + section("👤", "개인업무 바로가기", `<span class="mut">나만 보여요</span>`, myRows, "me", "내 업무 메모", previewUser ? "매니저 개인 바로가기는 미리보기에서 안 보여요." : "아직 없어요. 나만 쓰는 파일·사이트를 올려 두세요.");
  V().querySelectorAll("[data-lkt]").forEach((b) => (b.onclick = () => { LK.team = +b.dataset.lkt; try { localStorage.setItem("lk-team", LK.team); } catch {} LK.load(); }));
  // 📁 서류: 올리기(대표) · 내려받기(원래 이름으로) · 지우기(대표)
  const up = async (files) => {
    const team = LK.team; let n = 0;
    for (const f of files) {
      if (f.size > 52428800) { toast(`${f.name}: 50MB 넘어요`); continue; }
      const ext = (f.name.match(/\.[A-Za-z0-9]{1,8}$/) ?? [""])[0], path = `${team}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`; // 보관함 주소는 영문만 → 이름은 표에
      toast(`올리는 중… ${f.name}`);
      const { error } = await sb.storage.from("branch-docs").upload(path, f, { contentType: f.type || undefined }); if (fail(error)) continue;
      const { error: e2 } = await sb.from("branch_docs").insert({ team_id: team, name: f.name.slice(0, 200), path, size: f.size }); if (fail(e2)) { await sb.storage.from("branch-docs").remove([path]); continue; }
      n++;
    }
    if (n) { toast(`📁 ${tname(team)}에 ${n}개 올렸어요`); LK.load(); }
  };
  V().querySelector("#lkFile")?.addEventListener("change", (e) => up([...e.target.files]));
  const card = V().querySelector(".lkup")?.closest(".card");
  if (card) { card.ondragover = (e) => e.preventDefault(); card.ondrop = (e) => { e.preventDefault(); if (e.dataTransfer.files.length) up([...e.dataTransfer.files]); }; }
  V().querySelectorAll(".lkdl").forEach((b) => (b.onclick = async () => {
    const { data, error } = await sb.storage.from("branch-docs").createSignedUrl(b.dataset.path, 300, { download: b.dataset.name }); if (fail(error)) return;
    location.href = data.signedUrl; // 원래 파일 이름으로 내려받기
  }));
  V().querySelectorAll(".lkddel").forEach((b) => (b.onclick = async () => {
    const r = b.closest(".lkdoc"), d = docs.find((x) => String(x.id) === r.dataset.doc); if (!confirm(`'${d.name}' 서류를 지울까요? 매니저님 화면에서도 사라져요`)) return;
    const { error } = await sb.from("branch_docs").delete().eq("id", d.id); if (fail(error)) return;
    await sb.storage.from("branch-docs").remove([d.path]); LK.load();
  }));
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
