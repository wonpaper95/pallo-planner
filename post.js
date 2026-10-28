// 📸 게시물 탭: 사진 1~10장 + 주제 → AI 공통 원고 + 인스타·구글·네이버·당근 문구 → 채널별 점검 → 복사·사진 받기 → [올렸어요].
// 1단계는 네 채널 모두 수동. 인스타(2단계)·구글(3단계) 자동 게시는 Edge Function sns-publish 로 붙인다. 설계: docs/sns-posts/README.md
// 사진은 이 기기에서 모자이크·자르기(photo.js) → sns 버킷(공개, 무작위 이름)에 올린다: 다른 기기에서 다시 열고, 나중에 API가 공개 주소로 가져가게.
// 채널 규칙·점검은 sns-core.js(SNSCORE). index.html 전역 sb·me·esc·toast·fail·isBoss·previewTeam·teams 를 씀 → window.PS
(() => {
const C = window.SNSCORE;
const allKeys = () => new Set(C.CHANNELS.map((c) => c.key));
const PS = (window.PS = { tab: "make", photos: [], post: null, jobs: [], ch: "instagram", sel: allKeys(), topic: "", tone: "friendly" });
const TONES = [["friendly", "친근 (~해요)"], ["polite", "정중 (~합니다)"]];
const V = () => document.getElementById("postView");
const $p = (s) => V().querySelector(s);
const pad = PHOTO.pad;
const opt = (list, v) => list.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(t)}</option>`).join("");
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const pub = (path) => sb.storage.from("sns").getPublicUrl(path).data.publicUrl;
const chOf = (k) => C.CHANNELS.find((c) => c.key === k);
const linkOf = (k) => PS.links?.[k] || chOf(k).open; // 지점이 저장한 바로가기, 없으면 채널 기본 주소
const jobOf = (k) => PS.jobs.find((j) => j.channel === k);
const facts = () => ({ photos: PS.photos.length, unfaced: PS.photos.filter((p) => !p.faced).length });
const MARK = { ok: "✔", warn: "!", bad: "✕", info: "·" };

async function call(action, body = {}) {
  const { data, error } = await sb.functions.invoke("blog-write", { body: { action, team_id: PS.team, ...body } });
  if (error) {
    let m = error.message;
    try { m = (await error.context.json()).error || m; } catch {}
    if (/Failed to send|FunctionsFetchError|not found/i.test(m)) m = "AI 서버가 아직 연결되지 않았어요 (Edge Function 배포 필요)";
    toast(m); return null;
  }
  return data;
}
function setQuota(q) { const el = $p("#psQuota"); if (el && q) el.textContent = `오늘 남은 생성 ${Math.max(0, q.limit - q.used)}/${q.limit}회 (블로그와 합산)`; }
function reset() { PS.photos = []; PS.post = null; PS.jobs = []; PS.topic = ""; PS.tone = "friendly"; PS.ch = "instagram"; PS.sel = allKeys(); }

// ── 화면 뼈대 (한 번만) ──
function shell() {
  V().dataset.ready = 1;
  V().innerHTML = `<div class="psbar"><h2>📸 게시물</h2><select id="psTeam" class="hidden"></select><span id="psTeamName" class="mut"></span>
    <div class="pstabs"><button type="button" data-pt="make">만들기</button><button type="button" data-pt="list">목록</button></div>
    <span id="psQuota" class="mut"></span></div>
  <div id="psLinks" class="pslinks"></div>
  <div id="psBody"></div>
  <input type="file" id="psFile" accept="image/*,.heic,.heif" multiple hidden>`;
  wire();
}

// ── 불러오기 ──
PS.load = async function () {
  if (!me) return;
  if (!V().dataset.ready) shell();
  if (PS.myTeam === undefined) PS.myTeam = (await sb.from("profiles").select("team_id").eq("user_id", me.id).single()).data?.team_id ?? null;
  const boss = isBoss && !previewTeam;
  if (boss && !teams.length) teams = (await sb.from("teams").select("*").order("sort")).data ?? [];
  const prev = PS.team;
  if (boss) {
    try { PS.team = PS.team ?? (+localStorage.getItem("post-team") || null); } catch {}
    if (!teams.some((t) => t.id === PS.team)) PS.team = teams[0]?.id ?? null;
    $p("#psTeam").innerHTML = teams.map((t) => `<option value="${t.id}" ${t.id === PS.team ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  } else PS.team = previewTeam || PS.myTeam;
  $p("#psTeam").classList.toggle("hidden", !boss);
  if (!PS.team) { $p("#psBody").innerHTML = `<div class="card">아직 지점이 정해지지 않았어요. 대표님이 [팀] 탭에서 지점을 정해 주시면 게시물을 만들 수 있어요.</div>`; return; }
  PS.teamName = (teams.find((t) => t.id === PS.team) ?? (await sb.from("teams").select("name").eq("id", PS.team).single()).data)?.name ?? "";
  $p("#psTeamName").textContent = boss ? "" : PS.teamName;
  if (prev !== undefined && prev !== PS.team) reset();
  if (PS.linksTeam !== PS.team || !PS.links) { PS.links = (await sb.from("blog_profiles").select("data").eq("team_id", PS.team).maybeSingle()).data?.data?.links ?? {}; PS.linksTeam = PS.team; } // 지점 바꾸면 그 지점 바로가기 (지점 고르기가 PS.team 을 먼저 바꿔서 prev 로는 못 앎)
  renderLinks();
  call("usage").then((r) => r && setQuota(r.quota));
  renderTab();
};
function renderTab() {
  V().querySelectorAll("[data-pt]").forEach((b) => b.classList.toggle("on", b.dataset.pt === PS.tab));
  if (PS.tab === "list") renderList(); else renderMake();
}

// ── 만들기: 입력 ──
function renderMake() {
  $p("#psBody").innerHTML = `<div class="blgrid"><div class="card">
    <div class="bldrop" id="psDrop">📷 사진 1~10장을 끌어다 놓거나 눌러서 고르세요<br><small>순서 = 게시 순서 · ◀ ▶ 로 바꾸기</small></div>
    <div class="blthumbs" id="psThumbs"></div>
    <div id="psFaceRow" style="margin-top:6px"></div>
    <div class="psratio" id="psRatio"></div>
    <label>주제·메모 <small>(선택 · 비우면 사진만 보고 써요)</small></label>
    <textarea data-f="topic" placeholder="예) 11월부터 토요일 오전 10시 프리토킹반을 새로 열어요"></textarea>
    <label>어투</label><select data-f="tone" style="width:100%">${opt(TONES, PS.tone)}</select>
    <button type="button" class="btn psgo" id="psGo">✨ 문구 만들기</button><div class="mut" id="psGoNote" style="margin-top:6px"></div>
  </div><div id="psOut"></div></div>`;
  $p("[data-f=topic]").value = PS.topic;
  renderThumbs(); renderOut();
}
function renderThumbs() {
  const el = $p("#psThumbs"); if (!el) return;
  el.innerHTML = PS.photos.map((p, i) => `<div class="blthumb"><img src="${p.url}" alt=""><span class="no">${pad(i + 1)}</span>
    <button type="button" class="x" data-rm="${p.id}" title="빼기">✕</button><button type="button" class="ed" data-ed="${p.id}">편집</button>
    ${p.faced ? `<span class="face">🙂${p.edits.blurs.length || ""}</span>` : ""}
    <div class="psmv"><button type="button" data-mv="-1" data-i="${i}" title="앞으로">◀</button><button type="button" data-mv="1" data-i="${i}" title="뒤로">▶</button></div></div>`).join("");
  const n = PS.photos.length, unchecked = PS.photos.filter((p) => !p.faced).length;
  $p("#psFaceRow").innerHTML = n ? `<button type="button" class="btn ghost small" id="psFaceAll">🙂 얼굴 자동 모자이크${unchecked ? ` (${unchecked}장)` : ""}</button> <small class="mut">${n}장 · 사진은 이 기기 안에서 처리한 뒤 올려요</small>` : "";
  $p("#psRatio").innerHTML = n ? `<span class="mut">한 번에 자르기</span><span class="blseg">${[["4:5", "4:5 세로 (인스타 추천)"], ["1:1", "1:1"], ["orig", "원본"]].map(([r, t]) => `<button type="button" data-ratio="${r}">${t}</button>`).join("")}</span>` : "";
}
async function addFiles(files) {
  const room = 10 - PS.photos.length;
  if (room <= 0) return toast("사진은 10장까지예요");
  if (files.length > room) toast(`10장까지라 ${files.length - room}장은 뺐어요`);
  PS.photos.push(...await PHOTO.fromFiles(files.slice(0, room)));
  renderThumbs(); photosChanged();
}
function photosChanged() { if (PS.post) { renderOut(); saveSoon(); } }
async function faceAll() {
  if (!PS.photos.length) return toast("사진을 먼저 올려 주세요");
  const btn = $p("#psFaceAll"); if (btn) { btn.disabled = true; btn.textContent = "🙂 얼굴 찾는 중…"; }
  try { // 버튼은 매번 모든 사진을 다시 봄 (놓친 얼굴만 더하고, 이미 칠한 곳은 그대로)
    const n = await PHOTO.faceAll(PS.photos, true, (i, all) => btn && (btn.textContent = `🙂 얼굴 찾는 중… ${i}/${all}`));
    toast(n ? `얼굴 ${n}개를 모자이크했어요. 뒤돌아 있는 등 놓친 얼굴은 [편집]에서 직접 칠해 주세요` : "새로 찾은 얼굴이 없어요. 놓친 얼굴은 [편집]에서 직접 칠해 주세요");
  } catch (e) { console.error(e); toast("얼굴 찾기를 불러오지 못했어요. [편집]에서 직접 칠해 주세요"); }
  renderThumbs(); photosChanged();
}

// ── 문구 만들기 ──
async function generate() {
  if (!PS.photos.length && !PS.topic.trim()) return toast("사진을 올리거나 주제를 적어 주세요");
  if (PS.post && !confirm("지금 문구를 새로 만든 문구로 바꿀까요? (고친 내용은 사라져요)")) return;
  const team = PS.team, X0 = PS.post; // 기다리는 사이 대표가 지점을 바꾸거나 다른 게시물을 열면 결과를 버린다
  const btn = $p("#psGo"); btn.disabled = true; btn.textContent = "✍️ 쓰는 중… (30초 안팎)";
  $p("#psGoNote").textContent = "공통 원고 → 인스타 · 구글 · 네이버 · 당근 순서로 다시 써요";
  try {
    const r = await call("sns", { photos: PS.photos.map((p) => ({ data: p.ai, media_type: "image/jpeg", note: p.note })), topic: PS.topic, tone: PS.tone });
    if (!r) return;
    if (PS.team !== team || PS.post !== X0) return;
    setQuota(r.quota);
    const n = C.normalizeAi(r.result);
    PS.post = { ...(PS.post ?? {}), topic: PS.topic, tone: PS.tone, draft: n.draft, channels: n.channels, self_review: n.self_review };
    renderOut(); await save(); renderOut();
    $p("#psOut")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    const b = $p("#psGo"), note = $p("#psGoNote"); // 화면이 다시 그려졌을 수 있어 다시 찾는다
    if (b) { b.disabled = false; b.textContent = "✨ 문구 만들기"; }
    if (note) note.textContent = "";
  }
}

// ── 결과: 채널별 보기·고치기 ──
function worst(k) { const L = C.checkChannel(k, PS.post.channels[k], facts()); return L.some((x) => x.lv === "bad") ? "bad" : L.some((x) => x.lv === "warn") ? "warn" : "ok"; }
function editorHtml(k, ch) {
  if (k === "instagram") return `<label>캡션</label><textarea data-c="caption" style="min-height:12em">${esc(ch.caption)}</textarea>
    <label>해시태그 <small>(띄어쓰기로 구분)</small></label><textarea data-c="hashtags">${esc(C.tagLine(ch.hashtags))}</textarea>`;
  if (k === "google") return `<label>본문</label><textarea data-c="body" style="min-height:10em">${esc(ch.body)}</textarea>
    <div class="row2"><div><label>소식 종류</label><select data-c="type">${opt(Object.entries(C.GOOGLE_TYPES), ch.type)}</select></div>
      <div><label>버튼</label><select data-c="button">${opt(Object.entries(C.GOOGLE_BUTTONS), ch.button)}</select></div></div>
    <div class="mut" style="margin-top:6px">구글 비즈니스 프로필 → 업데이트 추가에서 같은 종류·버튼을 고르세요${ch.type !== "standard" ? " · 이벤트·혜택은 기간도 넣어야 해요" : ""}</div>`;
  return `<label>제목</label><input data-c="title" value="${esc(ch.title)}" style="width:100%"><label>본문</label><textarea data-c="body" style="min-height:10em">${esc(ch.body)}</textarea>`;
}
function renderOut() {
  const el = $p("#psOut"); if (!el) return;
  const X = PS.post;
  if (!X) { el.innerHTML = `<div class="card blempty">왼쪽에서 사진을 올리고 <b>✨ 문구 만들기</b>를 누르면<br>인스타 · 구글 · 네이버 · 당근 문구가 한 번에 나와요.<br><br><small>채널마다 고칠 수 있고, 복사해서 각 앱에 붙여넣으면 돼요.</small></div>`; return; }
  const k = PS.ch, ch = X.channels[k], j = jobOf(k), c = chOf(k);
  const doneBtn = !PS.sel.has(k) ? `<span class="mut">이 채널은 이번에 안 올려요 (위에서 체크)</span>`
    : j?.status === "done_manual" ? `<button type="button" class="btn ghost" id="psUndo">↩ 올렸어요 취소</button>` : `<button type="button" class="btn ghost" id="psDone">✓ 올렸어요</button>`;
  el.innerHTML = `<div class="card">
    <details><summary class="mut">📝 공통 원고 (AI가 먼저 쓴 핵심)</summary><div class="psdraft">${esc(X.draft)}</div>${X.self_review ? `<div class="mut" style="margin-top:6px">${esc(X.self_review)}</div>` : ""}</details>
    <div class="mut" style="margin-top:12px">올릴 채널</div>
    <div class="pssel">${C.CHANNELS.map((x) => { const jj = jobOf(x.key), b = jj ? C.badge(jj) : null;
      return `<label><input type="checkbox" data-sel="${x.key}" ${PS.sel.has(x.key) ? "checked" : ""} ${jj?.status === "done_manual" ? "disabled" : ""}> ${x.label}${b ? ` <span class="blbadge ${b.cls}">${esc(b.text)}</span>` : ""}</label>`; }).join("")}</div>
    <div class="pstabs pschs">${C.CHANNELS.map((x) => `<button type="button" data-ch="${x.key}" class="${x.key === k ? "on" : ""}">${x.label}${worst(x.key) === "bad" ? " ⚠" : ""}</button>`).join("")}</div>
    ${goBar(k)}
    <div id="psEd">${editorHtml(k, ch)}</div>
    <div class="blcheck" id="psCheck"></div>
    <div class="blacts">
      <button type="button" class="btn" id="psCopy">📋 문구 복사</button>
      <button type="button" class="btn ghost" id="psPhotos">🖼 사진 ${k === "google" ? "1장" : "번호대로"} 받기</button>
      <a class="btn ${PS.links?.[k] ? "psgo" : "ghost"}" href="${esc(linkOf(k))}" target="_blank" rel="noopener">↗ ${PS.links?.[k] ? `${esc(PS.teamName ?? "")} ` : ""}${esc(c.label.replace(/^\S+\s/, ""))} 열기${PS.links?.[k] ? "" : " (지점 주소 없음)"}</a>
      ${doneBtn}
    </div></div>`;
  check();
}
// 📍 올리는 곳: 이 지점 이 채널 바로가기를 크게 — 없으면 그 자리에서 넣기
function goBar(k) {
  const c = chOf(k), u = PS.links?.[k], nm = c.label.replace(/^\S+\s/, "");
  return u ? `<div class="psgobar"><a class="psgo" href="${esc(u)}" target="_blank" rel="noopener">📍 ${esc(PS.teamName ?? "")} ${esc(nm)} 올리는 곳 열기 ↗</a><span class="psgourl">${esc(u.replace(/^https?:\/\//, ""))}</span><button type="button" class="btn ghost small" data-goedit="${k}">✏️ 주소 바꾸기</button></div>`
    : `<div class="psgobar none"><span>📍 아직 <b>${esc(PS.teamName ?? "")} ${esc(nm)}</b> 올리는 곳 주소가 없어요 — 넣어 두면 여기서 바로 열려요</span><input data-goin="${k}" placeholder="${esc(LINK_HINT[k])}"><button type="button" class="btn small" data-gosave="${k}">저장</button></div>`;
}
async function saveOneLink(k, raw) {
  let u = (raw ?? "").trim(); if (!u) return toast("주소를 붙여 넣어 주세요");
  if (!/^[a-z]+:\/\//i.test(u)) u = "https://" + u; if (!okUrl(u)) return toast("주소는 http(s)로 시작해야 해요");
  const team = PS.team, row = (await sb.from("blog_profiles").select("data").eq("team_id", team).maybeSingle()).data; // 블로그 지점 설정을 덮어쓰지 않게 읽고 합친다
  const L = { ...(row?.data?.links ?? {}), [k]: u };
  const { error } = await sb.from("blog_profiles").upsert({ team_id: team, data: { ...(row?.data ?? {}), links: L }, updated_at: new Date().toISOString() }); if (fail(error)) return;
  PS.links = L; if (window.BL?.profile && window.BL.team === team) window.BL.profile.links = L;
  toast("📍 바로가기를 저장했어요"); renderLinks(); renderOut();
}
document.addEventListener("click", (e) => {
  const s = e.target.closest?.("[data-gosave]"); if (s) return saveOneLink(s.dataset.gosave, s.parentElement.querySelector("[data-goin]").value);
  const ed = e.target.closest?.("[data-goedit]"); if (ed) { const v = prompt(`${chOf(ed.dataset.goedit).label} 올리는 곳 주소`, PS.links?.[ed.dataset.goedit] ?? ""); if (v != null) saveOneLink(ed.dataset.goedit, v); }
});
function check() {
  const el = $p("#psCheck"); if (!el || !PS.post) return;
  const k = PS.ch;
  el.innerHTML = C.checkChannel(k, PS.post.channels[k], facts()).map((x) => `<div class="${x.lv}"><b>${MARK[x.lv]}</b><span>${esc(x.txt)}</span></div>`).join("")
    + (k === "naver" ? `<div class="info" id="psSim"><b>·</b><span>다른 지점 네이버 소식과 겹침 확인 중…</span></div>` : "");
  if (k === "naver") similarSoon();
}
const similarSoon = debounce(async () => {
  const X = PS.post; if (!X || PS.ch !== "naver") return;
  const r = await sb.functions.invoke("blog-write", { body: { action: "similar", team_id: PS.team, channel: "naver", text: C.channelText("naver", X.channels.naver), exclude_id: X.id } });
  const el = $p("#psSim"); if (!el) return;
  if (!r.data?.matches) { el.querySelector("span").textContent = "겹침 확인은 AI 서버 연결 후에 돼요"; return; }
  const top = r.data.matches[0], lv = !top ? "ok" : top.score >= 30 ? "bad" : top.score >= 15 ? "warn" : "ok";
  el.className = lv;
  el.innerHTML = `<b>${MARK[lv]}</b><span>${top ? `다른 지점 네이버 소식과 겹침 최대 ${top.score}% — ${esc(top.team)} "${esc(top.title)}" (${top.date})${top.score >= 15 ? " · 도입·구성을 바꿔 주세요" : ""}` : "다른 지점 네이버 소식과 겹치지 않아요"}</span>`;
}, 1200);
const editedSoon = debounce(() => { check(); save(); }, 900);

// ── 저장: 사진 올리기 → sns_posts → 고른 채널 작업(sns_jobs) ──
class FaceCheckError extends Error {}
// 모자이크 안 한 사진은 공개 버킷에 올리지 않는다: 올리기 전에 얼굴 자동 확인을 먼저 돌리고, 못 돌리면 아무것도 올리지 않는다.
async function uploadPhotos(team) {
  if (PS.photos.some((p) => !p.faced)) {
    try { await PHOTO.faceAll(PS.photos); } catch (e) { console.error(e); throw new FaceCheckError("face"); }
    renderThumbs();
    if (PS.photos.some((p) => !p.faced)) throw new FaceCheckError("face");
  }
  const out = [];
  for (const p of [...PS.photos]) {
    const url = p.url, blob = p.blob, w = p.w, h = p.h; // 올리는 동안 [편집]으로 사진이 바뀌어도 올린 것과 같은 걸로 기록한다
    if (!(p.path && p.pathOf === url)) {
      const path = `${team}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("sns").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      p.path = path; p.pathOf = url;
    }
    out.push({ path: p.path, w, h });
  }
  return out;
}
let saving = null;
async function save() {
  const X = PS.post; if (!X) return;
  if (saving) { saving.again = true; return; } // 저장 중이면 끝난 뒤 한 번 더
  saving = {};
  const team = PS.team; // 저장하는 동안 대표가 지점을 바꿔도 처음 지점에만 쓴다
  try {
    const photos = await uploadPhotos(team);
    if (PS.team !== team) return;
    const row = { topic: X.topic ?? "", tone: X.tone ?? "friendly", draft: X.draft ?? "", photos, channels: X.channels, updated_at: new Date().toISOString() };
    let ok = false;
    if (X.id) { // 고친 줄이 정확히 1개일 때만 성공으로 본다 (0개면 남의 지점·삭제된 글이라 저장이 안 된 것)
      const { data, error } = await sb.from("sns_posts").update(row).eq("id", X.id).select("id");
      if (!fail(error)) { ok = data?.length === 1; if (!ok) toast("저장하지 못했어요. 새로고침 후 다시 해 주세요"); }
    }
    else {
      const { data, error } = await sb.from("sns_posts").insert({ team_id: team, ...row }).select("id").single();
      if (!fail(error)) { ok = true; X.id = data.id; if (PS.post === X) { await syncJobs(team); renderOut(); } }
    }
    if (ok) { // 고쳐서 다시 올렸거나 뺀 사진의 예전 파일은 바로 지운다
      const keep = new Set(photos.map((x) => x.path)), old = (X.savedPaths ?? []).filter((x) => !keep.has(x));
      X.savedPaths = [...keep];
      if (old.length) { const { error } = await sb.storage.from("sns").remove(old); if (error) console.warn("예전 사진 파일 지우기 실패", error); }
    }
  } catch (e) {
    console.error(e);
    toast(e instanceof FaceCheckError ? "얼굴 확인이 안 돼서 사진을 아직 올리지 않았어요. [편집]에서 얼굴을 확인해 주세요" : "사진을 올리지 못했어요. 인터넷 연결을 확인하고 다시 고쳐 주세요");
  }
  finally { const again = saving.again; saving = null; if (again) save(); }
}
const saveSoon = debounce(save, 1200);
async function loadJobs() { PS.jobs = PS.post?.id ? (await sb.from("sns_jobs").select("*").eq("post_id", PS.post.id)).data ?? [] : []; }
async function syncJobs(team = PS.team) {
  const X = PS.post; if (!X?.id) return;
  const have = new Set(PS.jobs.map((j) => j.channel));
  const add = [...PS.sel].filter((k) => !have.has(k));
  const drop = PS.jobs.filter((j) => !PS.sel.has(j.channel) && j.status === "waiting_copy").map((j) => j.id);
  if (add.length) fail((await sb.from("sns_jobs").insert(C.jobRows({ id: X.id, team_id: team }, add))).error);
  if (drop.length) fail((await sb.from("sns_jobs").delete().in("id", drop)).error);
  await loadJobs();
}
async function setDone(k, done) {
  if (!PS.post?.id) await save();
  const j = jobOf(k); if (!j) return toast("저장 중이에요. 잠시 뒤 다시 눌러 주세요");
  const { error } = await sb.from("sns_jobs").update({ status: done ? "done_manual" : "waiting_copy" }).eq("id", j.id);
  if (fail(error)) return;
  await loadJobs(); renderOut();
  if (done) toast(`${chOf(k).label}에 올린 것으로 표시했어요`);
}
async function photosOut() {
  const list = (PS.ch === "google" ? PS.photos.slice(0, 1) : PS.photos).map((p, i) => ({ name: `${pad(i + 1)}.jpg`, blob: p.blob }));
  if (!list.length) return toast("사진이 없어요");
  await PHOTO.share(list, `${PS.teamName}_${chOf(PS.ch).label.replace(/^\S+\s/, "")}_${kstDay()}_사진${list.length}장.zip`);
}

// ── 바로가기: 지점마다 인스타·구글·네이버·당근 주소를 저장해 두고 한 번에 연다 (blog_profiles.data.links — 블로그 지점 설정과 같은 줄) ──
const LINK_HINT = { instagram: "https://www.instagram.com/지점계정", google: "https://business.google.com/ (프로필 관리 주소)", naver: "https://new.smartplace.naver.com/ (소식 쓰기 주소)", daangn: "https://business.daangn.com/ (비즈프로필 주소)" };
const okUrl = (u) => /^https?:\/\//i.test(u);
function renderLinks(edit) {
  const el = $p("#psLinks"); if (!el || !PS.team) return;
  const L = PS.links ?? {};
  if (edit) {
    el.innerHTML = `<div class="card"><b>🔗 우리 지점 바로가기</b> <span class="mut">채널마다 올리는 곳 주소를 넣어 두면 [열기]가 바로 그곳으로 가요</span>
      ${C.CHANNELS.map((c) => `<label>${c.label}</label><input data-lnk="${c.key}" value="${esc(L[c.key] ?? "")}" placeholder="${esc(LINK_HINT[c.key])}" style="width:100%">`).join("")}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" class="btn ghost" id="psLnkCancel">취소</button><button type="button" class="btn" id="psLnkSave">저장</button></div></div>`;
    return;
  }
  const set = C.CHANNELS.filter((c) => L[c.key]);
  el.innerHTML = `<div class="psrow">${C.CHANNELS.map((c) => L[c.key]
    ? `<a class="btn ghost small" href="${esc(L[c.key])}" target="_blank" rel="noopener">${c.label} ↗</a>`
    : `<span class="btn ghost small off" title="주소가 없어요 — ✏️ 로 넣어 주세요">${c.label} ·</span>`).join("")}
    <button type="button" class="btn ghost small" id="psLnkEdit">✏️ ${set.length ? "바로가기 수정" : "우리 지점 주소 넣기"}</button></div>`;
}
async function saveLinks() {
  const L = {};
  for (const c of C.CHANNELS) {
    let u = $p(`[data-lnk="${c.key}"]`).value.trim();
    if (!u) continue;
    if (!/^[a-z]+:\/\//i.test(u)) u = "https://" + u; // 주소만 붙여넣어도 되게
    if (!okUrl(u)) return toast(`${c.label} 주소는 http(s)로 시작해야 해요`);
    L[c.key] = u;
  }
  const team = PS.team;
  const row = (await sb.from("blog_profiles").select("data").eq("team_id", team).maybeSingle()).data; // 블로그 지점 설정을 덮어쓰지 않게 읽고 합친다
  const data = { ...(row?.data ?? {}), links: L };
  const { error } = await sb.from("blog_profiles").upsert({ team_id: team, data, updated_at: new Date().toISOString() });
  if (fail(error)) return;
  PS.links = L; if (window.BL?.profile && window.BL.team === team) window.BL.profile.links = L; // 블로그 탭이 같은 세션에서 저장해도 유지
  toast("바로가기를 저장했어요"); renderLinks(); if (PS.post) renderOut();
}

// ── 목록: 내 지점 게시물 + 채널별 상태 ──
const ORDER = Object.fromEntries(C.CHANNELS.map((c, i) => [c.key, i]));
async function renderList() {
  $p("#psBody").innerHTML = `<div class="mut">불러오는 중…</div>`;
  const { data, error } = await sb.from("sns_posts").select("id, topic, draft, photos, created_at, sns_jobs(channel, status, run_at, result_url, error_ko)")
    .eq("team_id", PS.team).order("created_at", { ascending: false }).limit(60);
  if (fail(error)) return;
  if (PS.tab !== "list") return; // 기다리는 사이 [만들기]로 옮겼으면 덮어쓰지 않는다
  $p("#psBody").innerHTML = data.length ? `<div class="bllist">${data.map((x) => {
    const jobs = [...x.sns_jobs].sort((a, b) => ORDER[a.channel] - ORDER[b.channel]);
    return `<div class="card">
      ${x.photos?.[0] ? `<img class="psthumb" src="${esc(pub(x.photos[0].path))}" alt="" loading="lazy">` : `<div class="psthumb">📝</div>`}
      <div class="t"><b>${esc(C.titleOf(x))}</b><span class="mut">${new Date(Date.parse(x.created_at) + 9 * 3600e3).toISOString().slice(0, 10)} · 사진 ${x.photos?.length ?? 0}장</span>
        <div class="psbadges">${jobs.map((j) => { const b = C.badge(j); return /^https?:\/\//i.test(j.result_url)
          ? `<a class="blbadge ${b.cls}" href="${esc(j.result_url)}" target="_blank" rel="noopener">${esc(chOf(j.channel).label)} ${esc(b.text)} ↗</a>`
          : `<span class="blbadge ${b.cls}">${esc(chOf(j.channel).label)} ${esc(b.text)}</span>`; }).join("") || `<span class="mut">고른 채널 없음</span>`}</div></div>
      <button type="button" class="btn ghost small" data-open="${x.id}">열기</button><button type="button" class="btn ghost small" data-delp="${x.id}">삭제</button></div>`; }).join("")}</div>`
    : `<div class="card blempty">아직 만든 게시물이 없어요. [만들기]에서 문구를 만들면 여기에 쌓여요.</div>`;
}
async function openPost(id) {
  const { data, error } = await sb.from("sns_posts").select("*").eq("id", id).single();
  if (fail(error)) return;
  $p("#psBody").innerHTML = `<div class="mut">사진 불러오는 중…</div>`;
  const got = await PHOTO.fromUrls(data.photos.map((x) => pub(x.path)));
  if (got.includes(null)) toast("불러오지 못한 사진이 있어요 (지워졌을 수 있어요)");
  PS.photos = got.map((p, i) => p && Object.assign(p, { path: data.photos[i].path, pathOf: p.url })).filter(Boolean);
  // 못 불러온 사진은 목록에 넣지 않는다. 넣으면 다음 저장 때 일시적 실패로 파일이 지워진다
  PS.post = { id: data.id, savedPaths: PS.photos.map((x) => x.path), topic: data.topic, tone: data.tone, draft: data.draft, channels: C.normalizeChannels(data.channels), self_review: "" };
  PS.topic = data.topic; PS.tone = data.tone; PS.ch = "instagram";
  await loadJobs(); PS.sel = new Set(PS.jobs.map((j) => j.channel));
  PS.tab = "make"; renderTab();
}
async function deletePost(id) {
  if (!confirm("이 게시물을 지울까요? 올려 둔 사진 파일도 같이 지워요. 되돌릴 수 없어요.")) return;
  const row = (await sb.from("sns_posts").select("photos").eq("id", id).single()).data;
  const paths = (row?.photos ?? []).map((x) => x.path);
  const { error } = await sb.from("sns_posts").delete().eq("id", id);
  if (fail(error)) return;
  let left = false; // 글을 먼저 지우고, 지워진 걸 확인한 뒤에만 사진 파일을 지운다
  if (paths.length) { const { error } = await sb.storage.from("sns").remove(paths); if (error) { console.warn("사진 파일 지우기 실패", error); left = true; } }
  if (PS.post?.id === id) reset();
  toast(left ? "게시물은 지웠지만 사진 파일 일부를 못 지웠어요" : "지웠어요"); renderList();
}

// ── 이벤트 (한 번만 연결) ──
function wire() {
  const v = V();
  $p("#psFile").onchange = (ev) => { addFiles([...ev.target.files]); ev.target.value = ""; };
  $p("#psTeam").onchange = (ev) => { PS.team = +ev.target.value; try { localStorage.setItem("post-team", ev.target.value); } catch {} reset(); PS.load(); };
  v.addEventListener("click", async (ev) => {
    const t = ev.target, d = t.dataset ?? {};
    if (d.pt) { PS.tab = d.pt; return renderTab(); }
    if (t.id === "psLnkEdit") return renderLinks(true);
    if (t.id === "psLnkCancel") return renderLinks();
    if (t.id === "psLnkSave") return saveLinks();
    if (t.closest?.("#psDrop")) return $p("#psFile").click();
    if (d.rm) { PS.photos = PS.photos.filter((p) => p.id !== +d.rm); renderThumbs(); return photosChanged(); }
    if (d.ed) {
      const p = PS.photos.find((x) => x.id === +d.ed);
      if (p) PHOTO.edit(p, { title: `사진 ${pad(PS.photos.indexOf(p) + 1)}`, onSave: () => { renderThumbs(); photosChanged(); } });
      return;
    }
    if (d.mv) { const i = +d.i, j = i + +d.mv; if (j < 0 || j >= PS.photos.length) return; [PS.photos[i], PS.photos[j]] = [PS.photos[j], PS.photos[i]]; renderThumbs(); return photosChanged(); }
    if (d.ratio) {
      V().querySelectorAll("[data-ratio]").forEach((b) => { b.disabled = true; });
      await PHOTO.setRatio(PS.photos, d.ratio); renderThumbs();
      toast(`${PS.photos.length}장을 ${d.ratio === "orig" ? "원본 비율로" : d.ratio + " 로"} 맞췄어요 · 자르기 위치는 [편집]에서`);
      return photosChanged();
    }
    if (t.id === "psFaceAll") return faceAll();
    if (t.id === "psGo") return generate();
    if (d.ch) { PS.ch = d.ch; return renderOut(); }
    if (t.id === "psCopy") { if (await PHOTO.copy(C.channelText(PS.ch, PS.post.channels[PS.ch]))) toast(`복사했어요. ${chOf(PS.ch).label} 글쓰기에 붙여넣으세요`); return; }
    if (t.id === "psPhotos") return photosOut();
    if (t.id === "psDone" || t.id === "psUndo") return setDone(PS.ch, t.id === "psDone");
    if (d.open) return openPost(+d.open);
    if (d.delp) return deletePost(+d.delp);
  });
  v.addEventListener("input", (ev) => {
    const t = ev.target, d = t.dataset;
    if (d.f === "topic") { PS.topic = t.value; if (PS.post) { PS.post.topic = t.value; saveSoon(); } return; }
    if (!d.c || !PS.post || t.tagName === "SELECT") return;
    PS.post.channels[PS.ch][d.c] = d.c === "hashtags" ? C.parseTags(t.value) : t.value;
    editedSoon();
  });
  v.addEventListener("change", async (ev) => {
    const t = ev.target, d = t.dataset;
    if (d.f === "tone") { PS.tone = t.value; if (PS.post) { PS.post.tone = t.value; saveSoon(); } return; }
    if (d.c && PS.post && t.tagName === "SELECT") { PS.post.channels[PS.ch][d.c] = t.value; renderOut(); return saveSoon(); }
    if (d.sel) { if (t.checked) PS.sel.add(d.sel); else PS.sel.delete(d.sel); if (PS.post?.id) await syncJobs(); return renderOut(); }
  });
  v.addEventListener("dragover", (ev) => { if (ev.dataTransfer.types.includes("Files") && ev.target.closest?.("#psDrop, #psThumbs")) { ev.preventDefault(); $p("#psDrop")?.classList.add("over"); } });
  v.addEventListener("dragleave", (ev) => { if (ev.target.id === "psDrop") ev.target.classList.remove("over"); });
  v.addEventListener("drop", (ev) => {
    $p("#psDrop")?.classList.remove("over");
    if (ev.dataTransfer.files?.length && ev.target.closest?.("#psDrop, #psThumbs")) { ev.preventDefault(); addFiles([...ev.dataTransfer.files]); }
  });
}
})();
