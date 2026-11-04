// 📝 전체 회의록 탭: 대표·전 지점 매니저가 함께 보는 회의 기록. 슬라이드를 만들어 전체 화면으로 발표하고, 논의·결정은 회의 기록 칸에 남긴다.
// 쓴 사람·대표만 고침(입력 1초 뒤 자동 저장), 직전 내용은 서버가 meeting_revisions 에 쌓음, 진짜 삭제 없음(대표만 숨김·복원) — 0090_meetings.sql
// index.html 의 sb·me·isBoss·previewTeam·previewUser·esc·toast·fail·today 를 씀 → window.MT
(() => {
const MT = (window.MT = { list: [], cur: null, idx: 0, q: "", urls: {}, show: null });
const V = () => document.getElementById("mtView");
const BUCKET = "meeting-files";
const admin = () => isBoss && !previewTeam && !previewUser;
const canEdit = (m) => !m.id || m.created_by === me.id || admin();
const newSlide = () => ({ title: "", body: "", image: null });
const dayStr = (d) => { const [y, m, n] = String(d).split("-"); return `${y}년 ${+m}월 ${+n}일`; };
const stamp = (t) => { const d = new Date(t), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const count = (m) => `슬라이드 ${(m.slides ?? []).length}장`;

// ── 슬라이드 한 장 (편집 미리보기·목록·발표가 모두 이 모양을 씀). 글자 크기는 슬라이드 폭 기준(cqw)이라 어디서든 같은 비율
function slideHtml(s, i, m) {
  const lines = String(s.body ?? "").split("\n").map((l) => l.trim().replace(/^[-•·]\s*/, "")).filter(Boolean), url = s.image && MT.urls[s.image];
  const cover = i === 0 && !lines.length && !s.image, title = s.title || (i === 0 ? m.title : "");
  return `<div class="mtsl${cover ? " cover" : ""}${url ? " hasimg" : ""}"><div class="mtsl-in">${title ? `<h3>${esc(title)}</h3>` : ""}${cover && m.held_on ? `<p class="mtsl-sub">${esc(dayStr(m.held_on))}</p>` : ""}${lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}</div>${url ? `<img src="${esc(url)}" alt="">` : ""}</div>`;
}
// 내용이 많으면 글자를 줄여 슬라이드 안에 맞춤. 가장 작게 해도 넘치면 true (편집 화면이 '나눠 주세요' 안내)
function fit(el) {
  const box = el.querySelector?.(".mtsl-in"); if (!box) return false;
  let fs = 2.8; box.style.setProperty("--fs", fs + "cqw");
  while (box.scrollHeight > box.clientHeight + 1 && fs > 1.2) { fs = +(fs - 0.2).toFixed(1); box.style.setProperty("--fs", fs + "cqw"); }
  return box.scrollHeight > box.clientHeight + 1;
}
const fitAll = (root) => root.querySelectorAll(".mtsl").forEach(fit);
async function signUrls(slideLists) {
  const need = [...new Set(slideLists.flat().map((s) => s.image).filter((p) => p && !MT.urls[p]))]; if (!need.length) return;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need, 21600); if (fail(error)) return;
  for (const r of data ?? []) if (r.signedUrl) MT.urls[r.path] = r.signedUrl;
}

// ── 목록
MT.load = async function () {
  if (MT.cur) return fitAll(V()); // 쓰던 회의록은 탭을 다녀와도 그대로
  const { data, error } = await sb.from("meetings").select("*").order("held_on", { ascending: false }).order("id", { ascending: false });
  if (fail(error)) return;
  MT.list = data ?? [];
  V().innerHTML = `<div class="mtbar"><div><h2>📝 전체 회의록</h2><p class="mut">대표님과 전 지점 매니저님이 함께 봐요. 슬라이드로 발표하고, 회의 내용은 여기에 계속 남아요.</p></div><button class="btn" id="mtNew">+ 새 회의록</button></div>
    <input id="mtSearch" class="mtsearch" type="search" placeholder="제목·참석자·내용으로 찾기" value="${esc(MT.q)}"><div id="mtList"></div>`;
  V().querySelector("#mtNew").onclick = () => MT.open(null);
  V().querySelector("#mtSearch").oninput = (e) => { MT.q = e.target.value; drawList(); };
  drawList();
};
function drawList() {
  const q = MT.q.trim().toLowerCase(), live = MT.list.filter((m) => !m.deleted_at), gone = admin() ? MT.list.filter((m) => m.deleted_at) : []; // 대표가 매니저 화면으로 볼 때는 숨김
  const hit = live.filter((m) => !q || [m.title, m.attendees, m.notes, m.created_name, ...(m.slides ?? []).flatMap((s) => [s.title, s.body])].join(" ").toLowerCase().includes(q));
  let last = "", html = "";
  for (const m of hit) {
    const mon = String(m.held_on).slice(0, 7);
    if (mon !== last) { last = mon; html += `<h3 class="mtmon">${+mon.slice(0, 4)}년 ${+mon.slice(5)}월</h3>`; }
    html += `<div class="mtrow" data-id="${m.id}"><button class="mtopen"><span class="mtdate">${esc(String(m.held_on).slice(5).replace("-", "/"))}</span><b>${esc(m.title)}</b><span class="mut">${esc(count(m))}${m.attendees ? ` · 참석 ${esc(m.attendees)}` : ""} · ${esc(m.created_name)}</span></button>${(m.slides ?? []).length ? `<button class="btn ghost mtplay">▶ 발표</button>` : ""}</div>`;
  }
  const trash = gone.length ? `<details class="mttrash"><summary>🗂 숨긴 회의록 ${gone.length}건 (대표님만 보여요)</summary>${gone.map((m) => `<div class="mtrow" data-id="${m.id}"><span class="mtdate">${esc(String(m.held_on).slice(5).replace("-", "/"))}</span><b>${esc(m.title)}</b><button class="btn ghost mtback">복원</button></div>`).join("")}</details>` : "";
  const box = V().querySelector("#mtList");
  box.innerHTML = (html ? `<div class="card">${html}</div>` : `<div class="card mut">${q ? "찾는 회의록이 없어요." : "아직 회의록이 없어요. + 새 회의록으로 첫 회의를 남겨 보세요."}</div>`) + trash;
  box.querySelectorAll(".mtopen").forEach((b) => (b.onclick = () => MT.open(+b.closest(".mtrow").dataset.id)));
  box.querySelectorAll(".mtplay").forEach((b) => (b.onclick = () => { const m = MT.list.find((x) => x.id === +b.closest(".mtrow").dataset.id); present(m.slides, 0, m); }));
  box.querySelectorAll(".mtback").forEach((b) => (b.onclick = async () => { const { error } = await sb.from("meetings").update({ deleted_at: null }).eq("id", +b.closest(".mtrow").dataset.id); if (!fail(error)) { toast("복원했어요"); MT.load(); } }));
}

// ── 회의록 열기: 고칠 수 있으면 편집 화면, 아니면 읽기 화면
MT.open = async function (id) {
  const m = id == null ? { id: null, held_on: today(), title: "", attendees: "", slides: [newSlide()], notes: "" } : JSON.parse(JSON.stringify(MT.list.find((x) => x.id === id)));
  if (!m.slides.length && canEdit(m)) m.slides = [newSlide()];
  MT.cur = m; MT.idx = 0; MT.state = m.id ? "저장됨" : "제목을 넣으면 자동으로 저장돼요";
  await signUrls([m.slides]);
  canEdit(m) ? drawEdit() : drawRead();
};
const backBar = (m) => `<div class="mtbar"><button class="btn ghost" id="mtBack">← 목록</button><span class="mut" id="mtState" aria-live="polite">${canEdit(m) ? esc(MT.state) : `${esc(m.created_name)}님이 쓴 회의록`}</span><button class="btn" id="mtShow">▶ 발표 시작</button></div>`;
function wireBar() {
  V().querySelector("#mtBack").onclick = leave;
  V().querySelector("#mtShow").onclick = () => { const m = MT.cur, s = m.slides; present(s, canEdit(m) ? MT.idx : 0, m); };
}
async function leave() {
  const m = MT.cur;
  if (canEdit(m) && !m.title.trim() && (m.notes.trim() || m.slides.some((s) => s.title || s.body || s.image)) && !confirm("제목이 없어 저장되지 않았어요. 이대로 나갈까요?")) return;
  clearTimeout(MT.t); if (MT.dirty && m.title.trim()) await save();
  if (MT.dirty && m.title.trim() && !confirm("저장하지 못했어요. 이대로 나갈까요? (방금 쓴 내용은 사라져요)")) return;
  MT.cur = null; MT.dirty = false; MT.load();
}
function drawRead() {
  const m = MT.cur;
  V().innerHTML = backBar(m) + `<h2 class="mtrtitle">${esc(m.title)}</h2><p class="mut">${esc(dayStr(m.held_on))}${m.attendees ? ` · 참석 ${esc(m.attendees)}` : ""} · 마지막 저장 ${esc(m.updated_name)} ${esc(stamp(m.updated_at))}</p>
    <div class="mtgrid">${m.slides.map((s, i) => slideHtml(s, i, m)).join("")}</div>
    <section class="card"><h3>📋 회의 기록</h3><div class="mtnotes">${m.notes ? esc(m.notes) : '<span class="mut">아직 적은 내용이 없어요.</span>'}</div></section>${revSection()}`;
  wireBar(); wireRevs(); fitAll(V());
}
function drawEdit() {
  const m = MT.cur;
  V().innerHTML = backBar(m) + `<div class="card mtmeta">
      <label>날짜<input type="date" id="mtDate" value="${esc(m.held_on)}"></label>
      <label class="mtgrow">회의 제목<input id="mtTitle" maxlength="120" value="${esc(m.title)}" placeholder="예: 11월 전체 회의"></label>
      <label class="mtfull">참석자<input id="mtWho" maxlength="500" value="${esc(m.attendees)}" placeholder="예: 대표, 대구 마야, 울산 민주"></label></div>
    <div class="mtwork"><div class="mtthumbs" id="mtThumbs"></div><div class="mtmain" id="mtMain"></div></div>
    <section class="card"><h3>📋 회의 기록</h3><p class="mut">논의한 내용과 결정한 일을 적어 두세요. 발표 화면에는 나오지 않아요.</p><textarea id="mtNotes" rows="8" maxlength="50000" placeholder="결정: …&#10;담당: …">${esc(m.notes)}</textarea></section>
    ${m.id ? revSection() : ""}${m.id && admin() ? `<button class="btn ghost mthide" id="mtHide">🗂 이 회의록 숨기기</button>` : ""}`;
  wireBar(); wireRevs();
  const bind = (sel, key) => (V().querySelector(sel).oninput = (e) => { m[key] = e.target.value; touch(); if (key === "title" || key === "held_on") refreshSlide(); });
  bind("#mtDate", "held_on"); bind("#mtTitle", "title"); bind("#mtWho", "attendees"); bind("#mtNotes", "notes");
  V().querySelector("#mtHide")?.addEventListener("click", async () => {
    if (!confirm("목록에서 숨길까요? 내용은 지워지지 않고, 대표님이 다시 복원할 수 있어요")) return;
    clearTimeout(MT.t); const { error } = await sb.from("meetings").update({ deleted_at: new Date().toISOString() }).eq("id", m.id); if (fail(error)) return;
    MT.cur = null; MT.dirty = false; MT.load();
  });
  drawSlides();
}
function drawSlides() {
  const m = MT.cur, s = m.slides[MT.idx], n = m.slides.length;
  const th = V().querySelector("#mtThumbs");
  th.innerHTML = m.slides.map((x, i) => `<button class="mtthumb${i === MT.idx ? " on" : ""}" data-i="${i}" aria-label="${i + 1}번 슬라이드"><span>${i + 1}</span>${slideHtml(x, i, m)}</button>`).join("") + `<button class="btn ghost mtadd" id="mtAdd">+ 슬라이드</button>`;
  th.querySelectorAll(".mtthumb").forEach((b) => (b.onclick = () => { MT.idx = +b.dataset.i; drawSlides(); }));
  th.querySelector("#mtAdd").onclick = () => { m.slides.splice(MT.idx + 1, 0, newSlide()); MT.idx++; touch(); drawSlides(); V().querySelector("#mtStitle").focus(); };
  V().querySelector("#mtMain").innerHTML = `<div id="mtPrev"></div><p class="mtwarn hidden" id="mtLong">내용이 많아 슬라이드에 다 안 들어가요. 슬라이드를 나눠 주세요.</p>
    <label>슬라이드 제목<input id="mtStitle" maxlength="120" value="${esc(s.title)}" placeholder="${MT.idx === 0 ? "비우면 회의 제목이 나와요" : "이 슬라이드의 제목"}"></label>
    <label>내용 <span class="mut">줄마다 항목 하나 · 사진은 붙여넣기(Ctrl/⌘+V)도 돼요</span><textarea id="mtSbody" rows="6" maxlength="5000" placeholder="항목을 한 줄씩 적어 주세요">${esc(s.body)}</textarea></label>
    <div class="mttools"><label class="btn ghost">🖼 사진 ${s.image ? "바꾸기" : "넣기"}<input type="file" id="mtImg" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>${s.image ? `<button class="btn ghost" id="mtImgDel">사진 빼기</button>` : ""}
      <span class="mtspace"></span><button class="btn ghost" id="mtUp" ${MT.idx === 0 ? "disabled" : ""} title="앞으로">↑ 앞으로</button><button class="btn ghost" id="mtDown" ${MT.idx === n - 1 ? "disabled" : ""}>↓ 뒤로</button><button class="btn ghost" id="mtDup">복제</button><button class="btn ghost" id="mtDel" ${n === 1 ? "disabled" : ""}>🗑 삭제</button></div>`;
  const $ = (q) => V().querySelector(q);
  $("#mtStitle").oninput = (e) => { s.title = e.target.value; touch(); refreshSlide(); };
  $("#mtSbody").oninput = (e) => { s.body = e.target.value; touch(); refreshSlide(); };
  $("#mtSbody").onpaste = (e) => { const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/")); if (f) { e.preventDefault(); addImage(f); } };
  $("#mtImg").onchange = (e) => e.target.files[0] && addImage(e.target.files[0]);
  $("#mtImgDel")?.addEventListener("click", () => { s.image = null; touch(); drawSlides(); }); // 파일은 보관함에 남음 (옛 수정 기록이 씀)
  const move = (d) => { const [x] = m.slides.splice(MT.idx, 1); MT.idx += d; m.slides.splice(MT.idx, 0, x); touch(); drawSlides(); };
  $("#mtUp").onclick = () => move(-1); $("#mtDown").onclick = () => move(1);
  $("#mtDup").onclick = () => { m.slides.splice(MT.idx + 1, 0, { ...s }); MT.idx++; touch(); drawSlides(); };
  $("#mtDel").onclick = () => { if (!confirm(`${MT.idx + 1}번 슬라이드를 뺄까요? (수정 기록에는 남아요)`)) return; m.slides.splice(MT.idx, 1); MT.idx = Math.min(MT.idx, m.slides.length - 1); touch(); drawSlides(); };
  refreshSlide();
}
// 입력칸은 그대로 두고 미리보기·썸네일만 다시 그림 (한글 조합·커서 유지)
function refreshSlide() {
  const m = MT.cur, s = m.slides[MT.idx], prev = V().querySelector("#mtPrev"); if (!prev) return;
  prev.innerHTML = slideHtml(s, MT.idx, m);
  const over = fit(prev), warn = V().querySelector("#mtLong"); warn?.classList.toggle("hidden", !over);
  V().querySelectorAll(".mtthumb").forEach((b) => { const i = +b.dataset.i, old = b.querySelector(".mtsl"); if (i === MT.idx && old) old.outerHTML = slideHtml(s, i, m); if (i === MT.idx || !b.dataset.fit) { fit(b); b.dataset.fit = "1"; } });
}
async function addImage(f) {
  if (f.size > 15728640) return toast("사진은 15MB까지 올릴 수 있어요");
  const m = MT.cur, s = m.slides[MT.idx], ext = (f.name?.match(/\.[A-Za-z0-9]{1,8}$/) ?? [".png"])[0], path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  toast("사진 올리는 중…");
  const { error } = await sb.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined }); if (fail(error)) return;
  s.image = path; await signUrls([[s]]); touch(); drawSlides();
}

// ── 자동 저장: 입력 1초 뒤. 저장 중에 또 고치면 끝난 뒤 한 번 더
const setState = (t) => { MT.state = t; const e = V().querySelector("#mtState"); if (e) e.textContent = t; };
function touch() { MT.dirty = true; setState(MT.cur.title.trim() ? "저장 중…" : "제목을 넣으면 자동으로 저장돼요"); clearTimeout(MT.t); MT.t = setTimeout(save, 1000); }
async function save() {
  const m = MT.cur; if (!m || !m.title.trim()) return;
  if (MT.saving) { MT.again = true; return MT.saving; }
  const row = { held_on: m.held_on || today(), title: m.title.trim(), attendees: m.attendees, slides: m.slides, notes: m.notes };
  MT.dirty = false;
  MT.saving = (async () => {
    const q = m.id ? sb.from("meetings").update(row).eq("id", m.id) : sb.from("meetings").insert(row);
    const { data, error } = await q.select().single();
    MT.saving = null;
    if (error) { MT.dirty = true; console.error(error); setState("⚠️ 저장 실패 — 인터넷을 확인해 주세요. 내용을 고치면 다시 저장해요"); toast("저장 실패: " + error.message); return; }
    const first = !m.id; Object.assign(m, { id: data.id, created_by: data.created_by, created_name: data.created_name, updated_name: data.updated_name, updated_at: data.updated_at });
    if (MT.cur === m && !MT.dirty) setState(`저장됨 ${stamp(data.updated_at).slice(11)}`);
    if (first && MT.cur === m) { const a = document.activeElement?.id, c = document.activeElement?.selectionStart; drawEdit(); const el = a && document.getElementById(a); if (el) { el.focus(); try { el.setSelectionRange(c, c); } catch {} } } // 첫 저장 뒤 수정 기록 칸이 생김
    if (MT.again) { MT.again = false; await save(); }
  })();
  return MT.saving;
}
window.addEventListener("beforeunload", (e) => { if (MT.dirty) e.preventDefault(); });

// ── 수정 기록: 고치기 전 내용이 버전별로 남음. 발표로 보기·기록 읽기·되돌리기
const revSection = () => `<details class="card mtrevs" id="mtRevs"><summary>🕘 수정 기록 (고치기 전 내용이 모두 남아요)</summary><div id="mtRevList" class="mut">불러오는 중…</div></details>`;
function wireRevs() {
  const d = V().querySelector("#mtRevs"); if (!d) return;
  d.ontoggle = async () => {
    if (!d.open) return;
    const m = MT.cur, box = V().querySelector("#mtRevList");
    const { data, error } = await sb.from("meeting_revisions").select("*").eq("meeting_id", m.id).order("id", { ascending: false }); if (fail(error)) return;
    MT.revs = data ?? [];
    box.innerHTML = MT.revs.length ? MT.revs.map((r) => `<div class="mtrev" data-id="${r.id}"><div><b>${esc(stamp(r.saved_at))}</b> ${esc(r.saved_name)} · ${esc(r.title)} · ${esc(count(r))}</div>
        <div class="mttools">${r.slides.length ? `<button class="btn ghost mtrplay">▶ 그때 슬라이드</button>` : ""}${canEdit(m) ? `<button class="btn ghost mtrback">이 내용으로 되돌리기</button>` : ""}</div>${r.notes ? `<details><summary>그때 회의 기록</summary><div class="mtnotes">${esc(r.notes)}</div></details>` : ""}</div>`).join("") : "아직 고친 적이 없어요.";
    const rev = (b) => MT.revs.find((r) => r.id === +b.closest(".mtrev").dataset.id);
    box.querySelectorAll(".mtrplay").forEach((b) => (b.onclick = async () => { const r = rev(b); await signUrls([r.slides]); present(r.slides, 0, r); }));
    box.querySelectorAll(".mtrback").forEach((b) => (b.onclick = async () => {
      const r = rev(b); if (!confirm(`${stamp(r.saved_at)} 내용으로 되돌릴까요? 지금 내용도 수정 기록에 남아요`)) return;
      Object.assign(m, { held_on: r.held_on, title: r.title, attendees: r.attendees, slides: r.slides.length ? r.slides : [newSlide()], notes: r.notes }); MT.idx = 0;
      await signUrls([m.slides]); clearTimeout(MT.t); MT.dirty = true; await save(); drawEdit(); toast("되돌렸어요");
    }));
  };
}

// ── 발표: 전체 화면, ←/→·스페이스·화면 왼쪽/오른쪽 누르기로 넘김, Esc 로 끝
async function present(slides, start, m) {
  if (!slides?.length) return toast("슬라이드를 먼저 넣어 주세요");
  await signUrls([slides]);
  slides.forEach((s) => { if (s.image && MT.urls[s.image]) new Image().src = MT.urls[s.image]; }); // 넘길 때 깜빡임 방지
  let i = Math.min(start, slides.length - 1);
  const o = document.createElement("div"); o.id = "mtStage"; o.tabIndex = -1;
  const draw = () => {
    o.innerHTML = `<div class="mtstage-sl">${slideHtml(slides[i], i, m)}</div><div class="mtctl"><button data-a="prev" aria-label="이전" ${i === 0 ? "disabled" : ""}>‹</button><span>${i + 1} / ${slides.length}</span><button data-a="next" aria-label="다음" ${i === slides.length - 1 ? "disabled" : ""}>›</button><button data-a="end" aria-label="발표 끝내기">✕ 끝내기</button></div>`;
    fit(o);
  };
  const go = (d) => { const n = Math.max(0, Math.min(slides.length - 1, i + d)); if (n !== i) { i = n; draw(); } };
  const end = () => { MT.show = null; document.removeEventListener("keydown", key, true); document.removeEventListener("fullscreenchange", onFs); removeEventListener("resize", draw); document.documentElement.style.overflow = ""; o.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  const key = (e) => {
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " " || k === "Enter") go(1);
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") go(-1);
    else if (k === "Home") go(-i); else if (k === "End") go(slides.length);
    else if (k === "Escape") end(); else return;
    e.preventDefault(); e.stopPropagation();
  };
  const onFs = () => { if (!document.fullscreenElement) end(); };
  o.onclick = (e) => {
    const a = e.target.closest?.("[data-a]")?.dataset.a;
    if (a === "end") return end();
    if (a) return go(a === "next" ? 1 : -1);
    go(e.clientX < innerWidth / 3 ? -1 : 1);
  };
  document.body.append(o); document.documentElement.style.overflow = "hidden"; MT.show = o; draw(); o.focus();
  document.addEventListener("keydown", key, true); addEventListener("resize", draw);
  try { await o.requestFullscreen?.(); document.addEventListener("fullscreenchange", onFs); } catch {} // 아이폰 등 안 되는 기기는 화면 가득 채운 창으로
}
})();
