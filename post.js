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
  <div id="psBody"></div>
  <input type="file" id="psFile" accept="image/*" multiple hidden>`;
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
  if (!PS.photos.some((p) => !p.faced)) return toast("모든 사진을 이미 확인했어요");
  const btn = $p("#psFaceAll"); if (btn) { btn.disabled = true; btn.textContent = "🙂 얼굴 찾는 중…"; }
  try {
    const n = await PHOTO.faceAll(PS.photos);
    toast(n ? `얼굴 ${n}개를 모자이크했어요. 놓친 얼굴은 [편집]에서 직접 칠해 주세요` : "찾은 얼굴이 없어요. 작은 얼굴은 [편집]에서 확인해 주세요");
  } catch (e) { console.error(e); toast("얼굴 찾기를 불러오지 못했어요. [편집]에서 직접 칠해 주세요"); }
  renderThumbs(); photosChanged();
}

// ── 문구 만들기 ──
async function generate() {
  if (!PS.photos.length && !PS.topic.trim()) return toast("사진을 올리거나 주제를 적어 주세요");
  if (PS.post && !confirm("지금 문구를 새로 만든 문구로 바꿀까요? (고친 내용은 사라져요)")) return;
  const btn = $p("#psGo"); btn.disabled = true; btn.textContent = "✍️ 쓰는 중… (30초 안팎)";
  $p("#psGoNote").textContent = "공통 원고 → 인스타 · 구글 · 네이버 · 당근 순서로 다시 써요";
  try {
    const r = await call("sns", { photos: PS.photos.map((p) => ({ data: p.ai, media_type: "image/jpeg", note: p.note })), topic: PS.topic, tone: PS.tone });
    if (!r) return;
    setQuota(r.quota);
    const n = C.normalizeAi(r.result);
    PS.post = { ...(PS.post ?? {}), topic: PS.topic, tone: PS.tone, draft: n.draft, channels: n.channels, self_review: n.self_review };
    renderOut(); await save(); renderOut();
    $p("#psOut").scrollIntoView({ behavior: "smooth", block: "start" });
  } finally { btn.disabled = false; btn.textContent = "✨ 문구 만들기"; $p("#psGoNote").textContent = ""; }
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
    <div id="psEd">${editorHtml(k, ch)}</div>
    <div class="blcheck" id="psCheck"></div>
    <div class="blacts">
      <button type="button" class="btn" id="psCopy">📋 문구 복사</button>
      <button type="button" class="btn ghost" id="psPhotos">🖼 사진 ${k === "google" ? "1장" : "번호대로"} 받기</button>
      <a class="btn ghost" href="${c.open}" target="_blank" rel="noopener">↗ ${esc(c.label.replace(/^\S+\s/, ""))} 열기</a>
      ${doneBtn}
    </div></div>`;
  check();
}
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
async function uploadPhotos() {
  const out = [];
  for (const p of PS.photos) {
    if (!(p.path && p.pathOf === p.url)) {
      const path = `${PS.team}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("sns").upload(path, p.blob, { contentType: "image/jpeg" });
      if (error) throw error;
      p.path = path; p.pathOf = p.url;
    }
    out.push({ path: p.path, w: p.w, h: p.h });
  }
  return out;
}
let saving = null;
async function save() {
  const X = PS.post; if (!X) return;
  if (saving) { saving.again = true; return; } // 저장 중이면 끝난 뒤 한 번 더
  saving = {};
  try {
    const photos = await uploadPhotos();
    const row = { team_id: PS.team, topic: X.topic ?? "", tone: X.tone ?? "friendly", draft: X.draft ?? "", photos, channels: X.channels, updated_at: new Date().toISOString() };
    if (X.id) fail((await sb.from("sns_posts").update(row).eq("id", X.id)).error);
    else {
      const { data, error } = await sb.from("sns_posts").insert(row).select("id").single();
      if (!fail(error)) { X.id = data.id; await syncJobs(); renderOut(); }
    }
  } catch (e) { console.error(e); toast("사진을 올리지 못했어요. 인터넷 연결을 확인하고 다시 고쳐 주세요"); }
  finally { const again = saving.again; saving = null; if (again) save(); }
}
const saveSoon = debounce(save, 1200);
async function loadJobs() { PS.jobs = PS.post?.id ? (await sb.from("sns_jobs").select("*").eq("post_id", PS.post.id)).data ?? [] : []; }
async function syncJobs() {
  const X = PS.post; if (!X?.id) return;
  const have = new Set(PS.jobs.map((j) => j.channel));
  const add = [...PS.sel].filter((k) => !have.has(k));
  const drop = PS.jobs.filter((j) => !PS.sel.has(j.channel) && j.status === "waiting_copy").map((j) => j.id);
  if (add.length) fail((await sb.from("sns_jobs").insert(C.jobRows({ id: X.id, team_id: PS.team }, add))).error);
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
  PS.post = { id: data.id, topic: data.topic, tone: data.tone, draft: data.draft, channels: C.normalizeChannels(data.channels), self_review: "" };
  PS.topic = data.topic; PS.tone = data.tone; PS.ch = "instagram";
  await loadJobs(); PS.sel = new Set(PS.jobs.map((j) => j.channel));
  PS.tab = "make"; renderTab();
}
async function deletePost(id) {
  if (!confirm("이 게시물을 지울까요? 올려 둔 사진 파일도 같이 지워요. 되돌릴 수 없어요.")) return;
  const row = (await sb.from("sns_posts").select("photos").eq("id", id).single()).data;
  const paths = (row?.photos ?? []).map((x) => x.path);
  if (paths.length) { const { error } = await sb.storage.from("sns").remove(paths); if (error) console.warn("사진 파일 지우기 실패", error); }
  const { error } = await sb.from("sns_posts").delete().eq("id", id);
  if (fail(error)) return;
  if (PS.post?.id === id) reset();
  toast("지웠어요"); renderList();
}

// ── 이벤트 (한 번만 연결) ──
function wire() {
  const v = V();
  $p("#psFile").onchange = (ev) => { addFiles([...ev.target.files]); ev.target.value = ""; };
  $p("#psTeam").onchange = (ev) => { PS.team = +ev.target.value; try { localStorage.setItem("post-team", ev.target.value); } catch {} reset(); PS.load(); };
  v.addEventListener("click", async (ev) => {
    const t = ev.target, d = t.dataset ?? {};
    if (d.pt) { PS.tab = d.pt; return renderTab(); }
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
    if (d.f === "topic") { PS.topic = t.value; return; }
    if (!d.c || !PS.post || t.tagName === "SELECT") return;
    PS.post.channels[PS.ch][d.c] = d.c === "hashtags" ? C.parseTags(t.value) : t.value;
    editedSoon();
  });
  v.addEventListener("change", async (ev) => {
    const t = ev.target, d = t.dataset;
    if (d.f === "tone") { PS.tone = t.value; return; }
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
