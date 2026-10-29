// ✍️ 블로그 탭: 사진·주제 → AI 시안(제목 5안·본문 블록·해시태그) → 사진 드래그 배치·발행 전 점검 → 복붙 + 사진 번호대로 받기 · 다른 채널 변환.
// 지점(팀)마다 blog_profiles 1줄(위치·과목·키워드), 글은 blog_posts, AI 는 Edge Function "blog-write" (키는 서버에만).
// 사진은 서버에 올리지 않는다: 이 기기 안에서 모자이크·자르기 → AI 에는 1024px 사본만 보냄.
// index.html 의 sb·me·$·esc·toast·fail·isBoss·previewTeam·teams 를 씀. 이름 충돌 막으려고 전부 감쌈 → window.BL
(() => {
const BL = (window.BL = { tab: "new", photos: [], post: null, postId: null, opts: null, styles: [], extraKw: [] });

const PRESETS = [["auto", "✨ 자동 추천"], ["story", "수강생 변화 스토리형"], ["exam", "시험 목표 달성 전략형"], ["checklist", "꼼꼼 비교·체크리스트 정보형"], ["column", "원장·강사 칼럼 & 미니레슨형"], ["news", "현장 스케치 & 소식형"]];
const WRITERS = [["director", "원장"], ["teacher", "강사"], ["counselor", "상담실장"], ["student", "수강생 후기형"], ["enfp", "ENFP 매니저 (밝은 텐션)"]];
const AGES = ["20대", "30대", "40대", "50대 이상"].map((a) => [a, a]);
const READERS = [["worker", "직장인"], ["student", "대학생·취준생"], ["parent", "학부모"], ["senior", "시니어"], ["general", "성인 누구나"]];
const TONES = [["friendly", "친근한 존댓말"], ["warm", "다정한 존댓말"], ["expert", "전문가 정보체"], ["fun", "유머 섞인"], ["casual", "수다체 반말"]];
const CONCEPTS = [["class", "수업 현장"], ["review", "수강 후기"], ["event", "이벤트·모집"], ["tip", "공부 팁"], ["daily", "원장·강사 일상"], ["exam", "시험 정보"], ["exchange", "1:1 언어교환"], ["opening", "오픈 준비"]];
const BANNED = ["컬컴", "CULCOM", "culcom", "100%", "무조건", "보장", "1등", "1위", "최고", "최저가", "완벽"];
const CLICHES = ["알아보겠습니다", "정리해보았습니다", "결론적으로", "이처럼", "다양한", "효과적인", "핵심은"];
const SUBJ_RE = { 영어: /영어|오픽|토익|토스|토플|아이엘츠|IELTS|프리토킹|비즈니스/, 일본어: /일본어|JLPT|JPT|워홀/, 중국어: /중국어|HSK/, 스페인어: /스페인어|DELE|dele|FLEX|SIELE/ };

// 2026-10-24 키워드 리서치로 채운 지점 기본값 (지점 설정에서 저장하면 그 값을 씀)
const STRENGTH = "소수정예 수업, 1:1 언어교환, 토스·토플·IELTS·오픽·JLPT 등 시험 준비";
const DEF = {
  dsr: { display: "팔로 대구동성로점", address: "대구 중구 동성로2길 81, 5층", location: "동성로 중심, 중앙로역·반월당역 도보권", subjects: ["영어", "스페인어"],
    regions: ["대구", "동성로", "반월당", "중앙로"], strengths: STRENGTH + ", 스페인어 DELE 준비", brandTags: ["팔로", "팔로대구"], writer: "enfp",
    mainKeywords: ["대구 영어회화", "대구 영어회화학원", "대구 오픽학원", "대구 토익스피킹학원", "대구 성인영어회화"],
    subKeywords: ["대구 영어학원", "대구 오픽", "대구 토스학원", "대구 토플학원", "대구 아이엘츠", "대구 아이엘츠학원", "대구 토익스피킹", "대구 토플", "대구 스페인어", "동성로 영어회화", "대구 스페인어학원", "대구 성인영어", "대구 회화학원", "대구 언어교환",
      "DELE 시험", "DELE 시험 일정", "DELE B1", "스페인어 DELE", "대구 직장인 영어회화", "동성로 성인영어", "대구 영어회화 1:1", "반월당 영어회화"] },
  jpcn: { display: "팔로 대구일본어중국어점", address: "대구 중구 동성로3길 83, 4층", location: "동성로 상권 안쪽(공평동), 중앙로역·반월당역 인근", subjects: ["일본어", "중국어"],
    regions: ["대구", "동성로"], strengths: STRENGTH + ", 중국어 HSK 준비", brandTags: ["팔로", "팔로대구"],
    mainKeywords: ["대구 일본어학원", "대구 중국어학원", "대구 일본어", "대구 중국어", "대구 일본어회화"],
    subKeywords: ["대구 중국어회화", "JLPT 대구", "동성로 일본어학원", "대구 언어교환", "대구 일본어스터디", "대구 JLPT", "대구 일본어회화학원", "대구 일본어학원 추천", "대구 일본어학원 수강료", "대구 중국어회화학원", "대구 JLPT학원", "동성로 일본어", "대구 HSK", "대구 HSK학원", "HSK 시험접수",
      "대구 직장인 일본어", "대구 성인 일본어", "대구 워홀 일본어", "대구 직장인 중국어"] },
  ulsan: { display: "팔로 울산점", address: "울산 남구 삼산중로 67, 7층", location: "삼산동, 롯데백화점·현대백화점 울산점 인근", subjects: ["영어", "일본어", "스페인어"],
    regions: ["울산", "삼산동", "삼산", "달동"], strengths: STRENGTH + ", 스페인어 DELE 준비", brandTags: ["팔로", "팔로울산"],
    mainKeywords: ["울산 일본어학원", "울산 영어회화", "울산 영어학원", "울산 영어회화학원", "울산 토익스피킹"],
    subKeywords: ["울산 성인영어회화", "울산 일본어", "울산 오픽", "삼산동 영어", "울산 스페인어", "울산 성인영어", "울산 아이엘츠", "울산 토플", "울산 아이엘츠학원", "울산 JLPT", "울산 언어교환", "울산 직장인 영어",
      "삼산동 영어회화", "삼산동 일본어", "울산 일본어 학원 직장인", "울산 일본어 학원 주말", "DELE 시험 일정", "울산 DELE"] },
  gumi: { display: "팔로 구미점", address: "경북 구미시 옥계북로 34, 7층", location: "옥계동", subjects: ["영어", "일본어"],
    regions: ["구미", "옥계", "인동", "산동"], strengths: STRENGTH, brandTags: ["팔로", "팔로구미"], concept: "opening", notes: "오픈 준비 중 — 오픈 소식·사전 상담 위주",
    mainKeywords: ["구미 영어학원", "구미 일본어학원", "구미 일본어", "구미 영어회화", "구미 영어회화학원"],
    subKeywords: ["옥계 영어", "구미 오픽", "구미 토익스피킹", "구미 성인영어회화", "구미 성인영어학원", "구미 성인영어", "구미 JLPT", "구미 언어교환",
      "옥계동 영어회화", "구미 직장인 영어회화", "구미 영어회화 성인반", "구미 성인 일본어", "옥계 일본어"] },
};
// 네이버 검색광고 월간 검색수(PC+모바일), 2026-10-24 조회. 칩 옆에 보여 줌 (공백 빼고 맞춤). 없는 건 10 미만이거나 미조회
const VOL = { 대구영어회화: 1370, 대구영어회화학원: 560, 대구오픽학원: 300, 대구토익스피킹학원: 270, 대구성인영어회화: 200, 대구영어학원: 610, 대구오픽: 230, 대구토스학원: 230, 대구토플학원: 190,
  대구아이엘츠: 140, 대구아이엘츠학원: 120, 대구토익스피킹: 120, 대구토플: 90, 대구스페인어: 80, 동성로영어회화: 70, 대구스페인어학원: 60, 대구성인영어: 60, 대구회화학원: 55, 대구언어교환: 40,
  DELE시험: 770, DELE시험일정: 190, DELEB1: 120, 스페인어DELE: 100,
  대구일본어학원: 890, 대구중국어학원: 300, 대구일본어: 290, 대구중국어: 230, 대구일본어회화: 200, 대구중국어회화: 60, JLPT대구: 50, 동성로일본어학원: 40, 대구일본어스터디: 35, 대구JLPT: 30,
  대구일본어회화학원: 30, 대구일본어학원추천: 30, 대구일본어학원수강료: 30, 대구중국어회화학원: 25, 대구JLPT학원: 20, 동성로일본어: 15, 대구HSK: 15, 대구HSK학원: 10, HSK시험접수: 2100,
  울산일본어학원: 420, 울산영어회화: 410, 울산영어학원: 280, 울산영어회화학원: 210, 울산토익스피킹: 110, 울산성인영어회화: 90, 울산일본어: 80, 울산오픽: 70, 삼산동영어: 40, 울산스페인어: 30,
  울산성인영어: 30, 울산아이엘츠: 25, 울산토플: 15, 울산아이엘츠학원: 15, 울산JLPT: 10, 울산언어교환: 10, 울산직장인영어: 10,
  구미영어학원: 220, 구미일본어학원: 100, 구미일본어: 90, 구미영어회화: 80, 구미영어회화학원: 65, 옥계영어: 60, 구미오픽: 30, 구미토익스피킹: 15, 구미성인영어회화: 15, 구미성인영어학원: 15,
  구미성인영어: 15, 구미JLPT: 10, 구미언어교환: 10 };
const vol = (k) => VOL[k.replace(/\s/g, "")] ?? BL.kw?.find((x) => x.keyword === k.replace(/\s/g, ""))?.total;
// 운영 지점 이름: 구미점·대구영어점·울산점·대구일중점
const defKey = (n) => /일본어|중국어|일중/.test(n) ? "jpcn" : /울산/.test(n) ? "ulsan" : /구미/.test(n) ? "gumi" : /동성로|대구/.test(n) ? "dsr" : null;

const V = () => document.getElementById("blogView");
const $b = (s) => V().querySelector(s);
const opt = (list, v) => list.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(t)}</option>`).join("");
const pad = (n) => String(n).padStart(2, "0");
const len = (s) => [...String(s ?? "")].length;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const copy = PHOTO.copy; // 사진·복사 도구는 photo.js (게시물 탭과 공용)
const P = () => BL.profile ?? {};
let drag = null;

async function call(action, body = {}) {
  const { data, error } = await sb.functions.invoke("blog-write", { body: { action, team_id: BL.team, ...body } });
  if (error) {
    let m = error.message;
    try { m = (await error.context.json()).error || m; } catch {}
    if (/Failed to send|FunctionsFetchError|not found/i.test(m)) m = "AI 서버가 아직 연결되지 않았어요 (Edge Function 배포 필요)";
    toast(m); return null;
  }
  return data;
}

// ── 화면 뼈대 (한 번만) ──
function shell() {
  V().dataset.ready = 1;
  V().innerHTML = `<div class="blbar"><h2>✍️ 블로그</h2><select id="blTeam" class="hidden"></select><span id="blTeamName" class="mut"></span>
    <div class="bltabs"><button data-bt="new">새 글</button><button data-bt="list">보관함</button><button data-bt="profile">지점 설정</button><button data-bt="usage" class="hidden">사용량</button><button data-bt="fb">개선사항 보내기</button></div>
    <span id="blQuota" class="mut"></span></div>
  <div id="blBody"></div>
  <input type="file" id="blFile" accept="image/*,.heic,.heif" multiple hidden>
  <dialog id="blConvDlg" class="wide"><h3 style="margin:0 0 8px">🔁 다른 채널용</h3><div id="blConvBody"></div>
    <div style="text-align:right;margin-top:12px"><button type="button" class="btn ghost" onclick="this.closest('dialog').close()">닫기</button></div></dialog>
  <dialog id="blStyleDlg"><h3 style="margin:0 0 4px">➕ 블로그 스타일 추가</h3><p class="mut" style="margin:0">잘 쓴다고 생각하는 네이버 블로그 글 주소를 넣으면 구조·톤·사진 리듬만 분석해서 프리셋으로 저장해요. 문장은 베끼지 않아요.</p>
    <label>글 주소</label><input id="blStyleUrl" placeholder="https://blog.naver.com/아이디/글번호">
    <label>주소로 안 읽히면 본문을 복사해서 붙여 주세요 (선택)</label><textarea id="blStyleText"></textarea>
    <label class="${isBoss ? "" : "hidden"}" style="color:var(--text)"><input type="checkbox" id="blStyleShared"> 전 지점 공용으로 저장</label>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn ghost" onclick="this.closest('dialog').close()">취소</button><button type="button" class="btn" id="blStyleGo">분석해서 추가 (1회 사용)</button></div></dialog>`;
  wire();
}

// ── 불러오기 ──
BL.load = async function () {
  if (!me) return;
  if (!V().dataset.ready) shell();
  if (BL.myTeam === undefined) BL.myTeam = (await sb.from("profiles").select("team_id").eq("user_id", me.id).single()).data?.team_id ?? null;
  const boss = isBoss && !previewTeam;
  if (boss && !teams.length) teams = (await sb.from("teams").select("*").order("sort")).data ?? [];
  const prev = BL.team;
  if (boss) {
    try { BL.team = BL.team ?? (+localStorage.getItem("blog-team") || null); } catch {}
    if (!teams.some((t) => t.id === BL.team)) BL.team = teams[0]?.id ?? null;
    $b("#blTeam").innerHTML = teams.map((t) => `<option value="${t.id}" ${t.id === BL.team ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  } else BL.team = previewTeam || BL.myTeam;
  $b("#blTeam").classList.toggle("hidden", !boss);
  $b("[data-bt=usage]").classList.toggle("hidden", !boss);
  if (!BL.team) { $b("#blBody").innerHTML = `<div class="card">아직 지점이 정해지지 않았어요. 대표님이 [팀] 탭에서 지점을 정해 주시면 블로그를 쓸 수 있어요.</div>`; return; }
  BL.teamName = (teams.find((t) => t.id === BL.team) ?? (await sb.from("teams").select("name").eq("id", BL.team).single()).data)?.name ?? "";
  $b("#blTeamName").textContent = boss ? "" : BL.teamName;
  if (prev !== BL.team || !BL.profile) {
    const row = (await sb.from("blog_profiles").select("data").eq("team_id", BL.team).maybeSingle()).data;
    BL.profile = { ...(DEF[defKey(BL.teamName)] ?? { display: BL.teamName, subjects: ["영어"], regions: [], mainKeywords: [], subKeywords: [], brandTags: ["팔로"] }), ...(row?.data ?? {}) };
    BL.profileSaved = !!row && Object.keys(row.data ?? {}).some((k) => k !== "links"); // 게시물 탭 바로가기(links)만 저장된 행은 아직 지점 설정 전
    if (prev !== undefined && prev !== BL.team) { BL.post = null; BL.postId = null; }
    BL.opts = { mode: "photo", topic: "", facts: "", subject: "", preset: "auto", writer: P().writer || "director", age: "30대", reader: "worker", readerAge: "30대", tone: "friendly", concept: P().concept || "class", main_keyword: "", sub_keywords: [] };
    if (BL.prefs === undefined) BL.prefs = (await sb.from("blog_prefs").select("data, updated_at").eq("user_id", me.id).maybeSingle()).data ?? null;
    applyPrefs();
  }
  BL.styles = (await sb.from("blog_styles").select("id, name, team_id").order("created_at")).data ?? [];
  call("usage").then((r) => r && setQuota(r.quota));
  if (!BL.post) { // 화면이 새로 열렸으면 하루 안에 열어 둔 글을 다시
    let m = null; try { m = JSON.parse(localStorage.getItem("bl-open") || "null"); } catch {}
    if (m?.id && m.team === BL.team && Date.now() - m.at < 864e5) { const { data } = await sb.from("blog_posts").select("id, post").eq("id", m.id).maybeSingle(); if (data?.post) { BL.post = data.post; BL.postId = data.id; BL.tab = "new"; } else remember(null); }
  }
  renderTab();
};
// ── 내 기본값 (blog_prefs, 사람마다 1줄): 새 글 옵션을 지점 기본값 위에 덮어씀. 지점에 없는 과목은 건너뜀 ──
const PREF_KEYS = ["mode", "subject", "concept", "preset", "writer", "age", "reader", "readerAge", "tone"];
function applyPrefs() {
  const d = BL.prefs?.data ?? {};
  for (const k of PREF_KEYS) if (d[k] != null && (k !== "subject" || !d[k] || (P().subjects ?? []).includes(d[k]))) BL.opts[k] = d[k];
}
async function savePrefs() {
  const data = Object.fromEntries(PREF_KEYS.map((k) => [k, BL.opts[k]]));
  const { data: row, error } = await sb.from("blog_prefs").upsert({ user_id: me.id, data, updated_at: new Date().toISOString() }).select("data, updated_at").single();
  if (fail(error)) return;
  BL.prefs = row; toast("내 기본값을 저장했어요. 다음부터 이 옵션으로 시작해요"); renderNew();
}
async function resetPrefs() {
  if (!confirm("내 기본값을 지울까요? 다음부터 지점 기본 옵션으로 시작해요.")) return;
  const { error } = await sb.from("blog_prefs").delete().eq("user_id", me.id);
  if (fail(error)) return;
  BL.prefs = null; toast("내 기본값을 지웠어요"); renderNew();
}
function setQuota(q) { BL.quota = q; const el = $b("#blQuota"); if (el && q) el.textContent = `오늘 남은 생성 ${Math.max(0, q.limit - q.used)}/${q.limit}회`; }

function renderTab() {
  V().querySelectorAll("[data-bt]").forEach((b) => b.classList.toggle("on", b.dataset.bt === BL.tab));
  if (BL.tab === "new") renderNew();
  else if (BL.tab === "list") renderList();
  else if (BL.tab === "profile") renderProfile();
  else if (BL.tab === "fb") renderFb();
  else renderUsage();
}

// ── 개선사항 보내기: 플래너 🐞 신고·제안(feedback)에 kind=blog 로 넣음 → 대표 푸시·카톡 + 맥미니 예약 작업이 메일·작업 브랜치 ──
async function renderFb() {
  $b("#blBody").innerHTML = `<div class="card blset"><h3 style="margin:0 0 4px">💬 블로그 개선사항 보내기</h3>
    <p class="mut" style="margin:0">불편한 점이나 있으면 좋을 기능을 적어 주세요. 대표님께 바로 알림이 가고, 반영되면 아래에서 "반영됨"으로 바뀌어요.</p>
    <div class="blseg" id="blFbKind" style="margin-top:12px"><button type="button" data-fbk="bug" class="on">🐞 불편·오류</button><button type="button" data-fbk="idea">💡 아이디어</button></div>
    <textarea id="blFbBody" style="min-height:7em;margin-top:10px" placeholder="예) 사진이 10장 넘으면 시안이 늦게 나와요 / 제목에 지점명이 자동으로 들어가면 좋겠어요"></textarea>
    <div style="text-align:right;margin-top:10px"><button type="button" class="btn" id="blFbSend">보내기</button></div></div>
    <h3 style="margin:18px 0 8px">${isBoss && !previewTeam ? "받은 블로그 개선사항" : "내가 보낸 개선사항"}</h3><div class="bllist" id="blFbList"><div class="mut">불러오는 중…</div></div>`;
  const { data, error } = await sb.rpc("feedback_list"); if (fail(error)) return;
  const list = (data ?? []).filter((x) => x.kind === "blog");
  $b("#blFbList").innerHTML = list.length ? list.map((x) => `<div class="card"><div class="t"><b style="font-weight:500;white-space:pre-wrap">${esc(x.body)}</b>
      <span class="mut">${x.created_at.slice(0, 10)}${x.who ? ` · ${esc(x.who)}${x.team ? `(${esc(x.team)})` : ""}` : ""}</span></div>
      <span class="blbadge ${x.status === "new" ? "" : "pub"}">${x.status === "new" ? "확인 중" : "✓ 반영됨"}</span></div>`).join("")
    : `<div class="card blempty">아직 보낸 개선사항이 없어요.</div>`;
}
async function sendFb() {
  const t = $b("#blFbBody").value.trim(); if (t.length < 2) return toast("내용을 적어 주세요");
  const k = $b("#blFbKind .on")?.dataset.fbk === "idea" ? "💡 아이디어" : "🐞 불편·오류";
  const { error } = await sb.from("feedback").insert({ kind: "blog", body: `✍️ 블로그 ${k}: ${t}` }); if (fail(error)) return;
  toast("보냈어요. 대표님께 알림이 가요"); renderFb();
}

// ── 새 글: 입력 ──
function renderNew() {
  const o = BL.opts, subs = P().subjects ?? [];
  const styles = [...PRESETS, ...BL.styles.map((s) => [`custom:${s.id}`, `⭐ ${s.name}${s.team_id ? "" : " (공용)"}`])];
  if (!styles.some(([k]) => k === o.preset)) o.preset = "auto"; // 기본값에 저장된 스타일이 이 지점에서 안 보이면
  $b("#blBody").innerHTML = `<section class="card blbench">
    <div class="blbench-h"><h3>🔎 쓰기 전에 벤치마킹</h3>${seenBench() ? "" : `<span class="blnew">🆕 업데이트</span>`}<span class="mut">키워드 검색 추이와 네이버 블로그 상위 10개 글을 먼저 보고, 우리 글 각도를 정해요</span></div>
    <details class="blhow" id="blHow" ${seenBench() ? "" : "open"}><summary>❓ 사용법 <small>(10/29 새로 생긴 기능)</small></summary>
      <ol><li><b>키워드 넣고 엔터</b> (또는 📈 버튼) — 오늘 쓸 글의 메인 키워드. 예) 대구 영어회화</li>
        <li><b>비교하고 싶으면</b> 아래 키워드 칩을 한 번 눌러 서브로 고르고 다시 조회 → 그래프에 같이 그려져요 (최대 4개)</li>
        <li><b>그래프</b> — 가장 많이 찾은 달과 이번 달 % 를 봐요. 많이 찾는 시기에 맞춰 모집·이벤트 글을 미리 써 두기</li>
        <li><b>상위 10개 글</b> — 제목·첫 문단을 훑고 <b>다들 쓰는 각도는 피하고</b>, 우리만 있는 것(1:1 언어교환·소수정예·실제 수강생 변화)을 찾기. 제목을 누르면 새 탭</li>
        <li><b>그 키워드 그대로 ✨ 시안 만들기</b> — 키워드가 아래 폼에 자동으로 들어가고, AI 도 상위 글을 참고해 겹치지 않게 써요</li></ol>
      <div class="mut">⚠️ 남의 글 문장은 베끼지 말고 구조·각도만 참고해요. 그래프는 검색 '수'가 아니라 비교값이라, 실제 월 검색수는 폼 아래 🔍 네이버 검색량 보기에서.</div></details>
    <div class="blbench-q"><input data-o="main_keyword" id="blBenchKw" value="${esc(o.main_keyword)}" placeholder="메인 키워드 예) 대구 영어회화" enterkeyhint="search"><button type="button" class="btn" id="blResBtn">📈 추이 · 상위 글 보기</button></div>
    <div class="mut">아래 키워드 칩에서 서브로 고른 것(최대 4개)도 그래프에 같이 그려요. 여기 키워드가 글의 메인 키워드가 돼요.</div>
    <div id="blRes"></div></section>
  <div class="blgrid"><div class="blform card">
    <div class="blseg" id="blMode"><button type="button" data-mode="photo">📷 사진 보고 쓰기</button><button type="button" data-mode="topic">📝 주제 주고 쓰기</button></div>
    <div class="bldrop" id="blDrop">📷 사진을 끌어다 놓거나 눌러서 고르세요<br><small>올린 순서대로 번호가 붙어요 · 끌어서 순서 바꾸기</small></div>
    <div class="blthumbs" id="blThumbs"></div>
    <div id="blFaceRow" style="margin-top:6px"></div>
    <label id="blTopicLbl"></label><textarea data-o="topic" id="blTopic"></textarea>
    <label>확인된 사실 <small>(여기 적은 것만 숫자·후기·일정으로 들어가요)</small></label>
    <textarea data-o="facts" placeholder="예) 김○○님 직장인, 주 2회 3개월, 오픽 IM1→IH / 11월 토요반 신설, 정원 6명, 수강생 동의 받음">${esc(o.facts)}</textarea>
    <div class="row2"><div><label>과목</label><select data-o="subject"><option value="">자동</option>${opt(subs.map((s) => [s, s]), o.subject)}</select></div>
      <div><label>컨셉</label><select data-o="concept">${opt(CONCEPTS, o.concept)}</select></div></div>
    <label>스타일 · <a href="#" id="blAddStyle">➕ 블로그 주소로 추가</a></label><select data-o="preset" style="width:100%">${opt(styles, o.preset)}</select><div class="mut" id="blPresetWhy"></div>
    <div class="row2"><div><label>글쓴이</label><select data-o="writer">${opt(WRITERS, o.writer)}</select></div><div><label>글쓴이 나이대</label><select data-o="age">${opt(AGES, o.age)}</select></div></div>
    <div class="row2"><div><label>타깃 독자</label><select data-o="reader">${opt(READERS, o.reader)}</select></div><div><label>독자 나이대</label><select data-o="readerAge">${opt(AGES, o.readerAge)}</select></div></div>
    <label>어투</label><select data-o="tone" style="width:100%">${opt(TONES, o.tone)}</select>
    <div class="blpref"><button type="button" class="btn ghost small" id="blPrefSave">⭐ 지금 옵션을 내 기본값으로</button>${BL.prefs ? `<button type="button" class="btn ghost small" id="blPrefReset">기본값 지우기</button>` : ""}
      <div class="mut" style="margin-top:4px">${BL.prefs ? `⭐ 내 기본값으로 시작했어요 (${new Date(BL.prefs.updated_at).getMonth() + 1}/${new Date(BL.prefs.updated_at).getDate()} 저장)` : "자주 쓰는 글쓴이·어투·타깃을 저장해 두면 다음부터 그 값으로 시작해요"}</div></div>
    <label>메인 키워드 <small>(비우면 AI가 골라요 · 칩 한 번=서브, 두 번=메인)</small></label><input data-o="main_keyword" value="${esc(o.main_keyword)}" style="width:100%" placeholder="예) 동성로 영어회화">
    <div class="blchips" id="blChips"></div>
    <button type="button" class="btn ghost small" id="blKwBtn" style="margin-top:8px">🔍 네이버 검색량 보기</button><div id="blKw"></div>
    <button type="button" class="btn blgo" id="blGo">✨ 시안 만들기</button><div class="mut" id="blGoNote" style="margin-top:6px"></div>
  </div><div id="blOut"></div></div>`;
  $b("#blTopic").value = o.topic;
  syncMode(); renderThumbs(); renderChips(); presetWhy(); renderOut(); renderRes();
}
function syncMode() {
  const topic = BL.opts.mode === "topic";
  V().querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === BL.opts.mode));
  $b("#blTopicLbl").innerHTML = topic ? "주제 <small>(필수)</small>" : "추가 메모 <small>(선택 · 사진만으로 써도 돼요)</small>";
  $b("#blTopic").placeholder = topic ? "예) 직장인이 퇴근 후 영어회화 학원을 고를 때 확인할 것" : "예) 이번 주 토요 프리토킹 모임, 처음 온 분이 3명";
}
function recommend(o) {
  if (o.concept === "exam" || /IM\d|IH|AL|N[1-5]|급|점수|등급|레벨\s?\d/.test(o.facts)) return ["exam", "시험·점수 정보가 있어서"];
  if (o.concept === "review" && o.facts.trim()) return ["story", "수강생 이야기가 있어서"];
  if (["event", "opening", "class"].includes(o.concept) && BL.photos.length >= 8) return ["news", "현장 사진이 많아서"];
  if (["event", "opening"].includes(o.concept)) return ["news", "소식·모집 글이라서"];
  if (["tip", "daily"].includes(o.concept)) return ["column", "팁·칼럼 글이라서"];
  return ["checklist", o.concept === "review" ? "후기는 확인된 사실이 있어야 스토리형이 돼요" : "비교·정보형이 기본값이라서"];
}
function presetWhy() {
  const el = $b("#blPresetWhy"); if (!el) return;
  const [k, why] = recommend(BL.opts);
  el.textContent = BL.opts.preset === "auto" ? `→ ${PRESETS.find((p) => p[0] === k)[1]} (${why})` : "";
}

// 사진 썸네일
function renderThumbs() {
  const el = $b("#blThumbs"); if (!el) return;
  el.innerHTML = BL.photos.map((p, i) => `<div class="blthumb" draggable="true" data-thumb="${i}"><img src="${p.url}" alt="" draggable="false"><span class="no">${pad(i + 1)}</span>
    <button type="button" class="x" data-rm="${p.id}" title="빼기">✕</button><button type="button" class="ed" data-ed="${p.id}">편집</button>${p.faced ? `<span class="face">🙂${p.edits.blurs.length || ""}</span>` : ""}
    <input data-note="${p.id}" value="${esc(p.note)}" placeholder="메모"></div>`).join("");
  const n = BL.photos.length, unchecked = BL.photos.filter((p) => !p.faced).length;
  $b("#blFaceRow").innerHTML = n ? `<button type="button" class="btn ghost small" id="blFaceAll">🙂 얼굴 자동 블러${unchecked ? ` (${unchecked}장)` : ""}</button> <small class="mut">${n}장 · 사진은 이 기기 안에서만 처리돼요</small>` : "";
}
function renderChips() {
  V().querySelectorAll("[data-o=main_keyword]").forEach((i) => { if (i !== document.activeElement) i.value = BL.opts.main_keyword; }); // 벤치마킹 칸·폼 칸 같은 값
  const el = $b("#blChips"); if (!el) return;
  const o = BL.opts, re = SUBJ_RE[o.subject];
  const all = [...new Set([...(P().mainKeywords ?? []), ...BL.extraKw, ...(P().subKeywords ?? [])])].filter((k) => !re || re.test(k) || /언어교환/.test(k));
  el.innerHTML = all.slice(0, 28).map((k) => `<button type="button" class="blchip ${k === o.main_keyword ? "main" : o.sub_keywords.includes(k) ? "sub" : ""}" data-chip="${esc(k)}" title="네이버 월간 검색수">${esc(k)}${vol(k) ? ` <small>· ${vol(k).toLocaleString()}</small>` : ""}</button>`).join("");
}

// ── 사진: 읽기·편집은 photo.js(PHOTO) ──
async function addFiles(files) { BL.photos.push(...await PHOTO.fromFiles(files)); renderThumbs(); presetWhy(); }
async function faceAll() {
  if (!BL.photos.length) return toast("사진을 먼저 올려 주세요");
  const btn = $b("#blFaceAll"); if (btn) { btn.disabled = true; btn.textContent = "🙂 얼굴 찾는 중…"; }
  try { // 버튼은 매번 모든 사진을 다시 봄 (놓친 얼굴만 더하고, 이미 칠한 곳은 그대로)
    const n = await PHOTO.faceAll(BL.photos, true, (i, all) => btn && (btn.textContent = `🙂 얼굴 찾는 중… ${i}/${all}`));
    toast(n ? `얼굴 ${n}개를 블러 처리했어요. 뒤돌아 있는 등 놓친 얼굴은 [편집]에서 직접 칠해 주세요` : "새로 찾은 얼굴이 없어요. 놓친 얼굴은 [편집]에서 직접 칠해 주세요");
  } catch (e) { console.error(e); toast("얼굴 찾기를 불러오지 못했어요. [편집]에서 직접 칠해 주세요"); }
  renderThumbs(); if (BL.post) renderOut();
}
function openEditor(id) {
  const p = BL.photos.find((x) => x.id === id); if (!p) return;
  PHOTO.edit(p, { title: `사진 ${pad(BL.photos.indexOf(p) + 1)}`, onSave: () => { renderThumbs(); if (BL.post) renderOut(); } });
}

// ── 시안 만들기 ──
async function generate() {
  const o = BL.opts;
  if (o.mode === "photo" && !BL.photos.length) return toast("사진을 1장 이상 올려 주세요");
  if (o.mode === "topic" && !o.topic.trim()) return toast("주제를 적어 주세요");
  if (BL.post && !confirm(`지금 시안을 새 시안으로 바꿀까요?${BL.quota ? ` (오늘 남은 ${BL.quota.limit - BL.quota.used}회)` : ""}`)) return;
  const preset = o.preset === "auto" ? recommend(o)[0] : o.preset;
  const btn = $b("#blGo"); btn.disabled = true; btn.textContent = "✍️ 쓰는 중… (30초 안팎)";
  $b("#blGoNote").textContent = "사진을 보고 → 초안 → 편집장 시점 점검 → 수정까지 한 번에 해요";
  try {
    const r = await call("write", { photos: BL.photos.map((p) => ({ data: p.ai, media_type: "image/jpeg", note: p.note })), options: { ...o, preset } });
    if (!r) return;
    const ids = BL.photos.map((p) => p.id);
    r.post.blocks.forEach((b) => { b.pid = b.photo ? ids[b.photo - 1] ?? 0 : 0; });
    BL.post = { ...r.post, sel: 0, opts: { ...o, preset } }; BL.postId = null;
    setQuota(r.quota);
    await savePost(true);
    renderOut();
    $b("#blOut").scrollIntoView({ behavior: "smooth", block: "start" });
  } finally { btn.disabled = false; btn.textContent = "✨ 시안 만들기"; $b("#blGoNote").textContent = ""; }
}

// ── 시안 보기·고치기 ──
const used = () => new Set((BL.post?.blocks ?? []).filter((b) => b.type === "photo" && b.pid).map((b) => b.pid));
const photoOf = (pid) => BL.photos.find((p) => p.id === pid);
const presetName = (k) => PRESETS.find((p) => p[0] === k)?.[1] ?? BL.styles.find((s) => `custom:${s.id}` === k)?.name ?? k;
function blockHtml(b, i, n) {
  const tools = `<div class="tools">${b.type === "photo" ? `<button type="button" data-mv="-1" data-i="${i}" title="위로">↑</button><button type="button" data-mv="1" data-i="${i}" title="아래로">↓</button>` : ""}<button type="button" data-add="${i}" title="아래에 문단 추가">＋</button><button type="button" data-del="${i}" title="삭제">✕</button></div>`;
  if (b.type === "text" || b.type === "quote") return `<div class="blk ${b.type}" data-i="${i}">${tools}<div class="tx" contenteditable="true" data-tx="${i}">${esc(b.text)}</div></div>`;
  if (b.type === "divider") return `<div class="blk divider" data-i="${i}">${tools}<hr></div>`;
  if (b.type === "map") return `<div class="blk map" data-i="${i}">${tools}<div class="mapbox">📍 지도: ${esc(P().display || BL.teamName)} — 붙여넣은 뒤 스마트에디터 [장소]로 넣어 주세요</div></div>`;
  const p = photoOf(b.pid);
  // 네이버는 대표사진을 따로 안 고르면 첫 사진을 대표(썸네일)로 씀 → 사진 01 = 대표, ⭐ 는 그 사진을 01 자리와 맞바꿈
  return `<div class="blk photo" draggable="true" data-i="${i}">${tools}<span class="tag">사진 ${pad(n)}${n === 1 ? " · ⭐ 대표" : ""}</span>
    <figure>${p ? `<img src="${p.url}" alt="">` : `<div class="ph">📷 ${esc(b.text || "안 쓴 사진을 여기로 끌어다 놓으세요")}${b.pid ? "<br><small>원본은 처음 만든 기기에만 있어요</small>" : ""}</div>`}</figure>
    ${p ? `<div class="pacts"><button type="button" class="btn ghost small" data-pcopy="${i}">📋 사진 ${pad(n)} 복사</button>${n === 1 ? "" : `<button type="button" class="btn ghost small" data-cover="${i}">⭐ 대표사진으로</button>`}</div>` : ""}
    <div class="cap" contenteditable="true" data-cap="${i}">${esc(b.caption)}</div></div>`;
}
function renderOut() {
  const el = $b("#blOut"); if (!el) return;
  const X = BL.post;
  if (!X) { el.innerHTML = `<div class="card blempty">왼쪽에서 사진·옵션을 고르고 <b>✨ 시안 만들기</b>를 누르면<br>여기에 제목 5안 · 본문 · 해시태그 · 발행 전 점검이 나와요.<br><br><small>사진은 시안 안에서 끌어서 자리를 바꿀 수 있어요.</small></div>`; return; }
  let n = 0;
  const spare = BL.photos.filter((p) => !used().has(p.id));
  el.innerHTML = `<div class="card">
    <div class="bltitles"><b>제목 고르기</b> <small class="mut">(고친 제목도 그대로 써요)</small>
      ${X.titles.map((t, i) => `<label class="t"><input type="radio" name="blT" value="${i}" ${i === X.sel ? "checked" : ""}><input type="text" data-title="${i}" value="${esc(t)}"><small>${len(t)}자</small></label>`).join("")}</div>
    <div class="mut" style="margin-top:10px">🖼 대표 사진 문구 (누르면 복사)</div>
    <div class="blchips">${(X.thumbnail_texts ?? []).map((t) => `<button type="button" class="blchip" data-copy="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <div class="mut" style="margin-top:10px">메인 <b>${esc(X.main_keyword)}</b> · 서브 ${esc((X.sub_keywords ?? []).join(", "))} · ${esc(presetName(X.opts?.preset))}</div>
    ${spare.length ? `<div class="mut" style="margin-top:10px">안 쓴 사진 — 본문으로 끌어다 놓으세요</div><div class="bltray">${spare.map((p) => `<div class="blthumb" draggable="true" data-spare="${p.id}"><img src="${p.url}" alt=""></div>`).join("")}</div>` : ""}
    <div class="mut" style="margin-top:10px">💡 네이버에 올리기: <b>📋 본문 복사</b> → 네이버에 붙여넣기 → <b>📋 다음 사진 복사</b>를 누를 때마다 01·02·03… 차례로 복사돼요. '📷 사진 01' 줄을 지우고 그 자리에 붙여넣기(⌘V / Ctrl+V), 다음 사진도 같은 방법. 사진 01이 대표사진(썸네일) — 바꾸려면 원하는 사진의 <b>⭐ 대표사진으로</b></div>
    <div class="blpaper" id="blPaper">${X.blocks.map((b, i) => blockHtml(b, i, b.type === "photo" ? ++n : n)).join("")}</div>
    <div class="bltags" id="blTags" contenteditable="true">${esc((X.hashtags ?? []).map((t) => "#" + String(t).replace(/^#/, "")).join(" "))}</div>
    <details style="margin-top:10px"><summary class="mut">🔁 AI 자체 검수 메모</summary><div class="mut" style="white-space:pre-wrap;margin-top:6px">${esc(X.self_review)}</div></details>
    <h3 style="margin:16px 0 4px">🚦 발행 전 점검</h3><div class="blcheck" id="blCheck"></div>
    <div class="blacts">
      <button type="button" class="btn" id="blCopy">📋 본문 복사</button><button type="button" class="btn" id="blNextPhoto">${nextLabel()}</button><button type="button" class="btn ghost" id="blCopyTitle">제목 복사</button>
      <button type="button" class="btn ghost" id="blPhotos">🖼 사진 번호대로 받기</button><button type="button" class="btn ghost" id="blTagsCopy"># 해시태그 복사</button>
      <button type="button" class="btn ghost" id="blConv">🔁 인스타·당근·카톡</button><button type="button" class="btn ghost" id="blSave">💾 저장</button>
    </div></div>`;
  check(); similarSoon();
}
const pasteAsText = (ev) => { if (!ev.target.closest("[contenteditable]")) return; ev.preventDefault(); document.execCommand("insertText", false, ev.clipboardData.getData("text/plain")); };

// 복붙용 글
const bodyText = () => (BL.post?.blocks ?? []).filter((b) => b.type === "text" || b.type === "quote").map((b) => b.text).join("\n\n");
function plainText() {
  let n = 0;
  return BL.post.blocks.map((b) => b.type === "photo" ? `📷 사진 ${pad(++n)}${b.caption ? ` — ${b.caption}` : ""}` : b.type === "divider" ? "────────" : b.type === "map" ? `📍 [지도: ${P().display || BL.teamName}]` : b.text).join("\n\n") + "\n\n" + tagsText();
}
const tagsText = () => (BL.post.hashtags ?? []).map((t) => "#" + String(t).replace(/^#/, "")).join(" ");
// 네이버 스마트에디터: 붙여넣은 HTML 속 사진은 data: 면 빠지고, https 주소면 외부 주소 사진으로만 남아 대표·업로드가 안 됨 (10-28 실측)
// → 글은 '📷 사진 NN' 자리표시로, 사진은 한 장씩 이미지 클립보드(copyImg)로. 예전 임시 공개 보관함(blog-temp) 업로드는 그만둠
async function richHtml() {
  const lines = (t) => String(t).split("\n").map((l) => `<p>${l.trim() ? esc(l) : "<br>"}</p>`).join("");
  let n = 0; const out = [];
  for (const b of BL.post.blocks) {
    if (b.type === "text") out.push(lines(b.text));
    else if (b.type === "quote") out.push(`<blockquote><p><b>${esc(b.text)}</b></p></blockquote>`);
    else if (b.type === "divider") out.push("<hr>");
    else if (b.type === "map") out.push(`<p>📍 [지도: ${esc(P().display || BL.teamName)}]</p>`);
    else out.push(`<p>📷 사진 ${pad(++n)}${b.caption ? ` — ${esc(b.caption)}` : ""}</p>`);
    out.push("<p><br></p>");
  }
  out.push(`<p>${esc(tagsText())}</p>`);
  return out.join("");
}
// 사진 한 장을 '이미지'로 클립보드에 (캡처 붙여넣기와 같은 길 → 스마트에디터가 사진으로 올림. HTML 속 주소는 글자로 들어갈 때가 있음)
// 크롬 클립보드는 PNG 만 받음 → 긴 변 1600px PNG 로. Safari 는 클릭 직후 write 를 불러야 해서 내용은 Promise 로
async function copyImg(p) {
  if (!p) return false;
  const png = createImageBitmap(p.blob).then((bm) => {
    const k = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = document.createElement("canvas");
    c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); c.getContext("2d").drawImage(bm, 0, 0, c.width, c.height);
    return new Promise((ok) => c.toBlob(ok, "image/png"));
  });
  try { await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]); return true; }
  catch (e) { console.warn("사진 복사 실패", e); toast("이 브라우저에선 사진 복사가 안 돼요. 🖼 사진 번호대로 받기로 받아서 올려 주세요"); return false; }
}
// [📋 다음 사진 복사] 차례: 시안의 사진 자리 번호(빈 자리 건너뜀) 순서. BL.next = 다음에 복사할 칸
const shots = () => { let n = 0; return (BL.post?.blocks ?? []).flatMap((b) => b.type !== "photo" ? [] : (n++, photoOf(b.pid) ? [{ no: pad(n), p: photoOf(b.pid) }] : [])); };
function nextLabel() {
  const L = shots(); if (BL.nextOf !== BL.post) { BL.nextOf = BL.post; BL.next = 0; } // 다른 글을 열면 01부터
  if (!L.length) return "📋 다음 사진 복사";
  return BL.next >= L.length ? `✅ 사진 ${L.length}장 다 복사 · 다시 01부터` : `📋 다음 사진 복사 (${L[BL.next].no} · ${BL.next + 1}/${L.length})`;
}
async function photosOut() {
  const list = []; let n = 0;
  BL.post.blocks.forEach((b) => { if (b.type === "photo") { n++; const p = photoOf(b.pid); if (p) list.push({ name: `${pad(n)}.jpg`, blob: p.blob }); } });
  if (!list.length) return toast("시안에 들어간 사진이 없어요");
  await PHOTO.share(list, `${BL.teamName}_${today()}`);
}

// ── 발행 전 점검 ──
const count = (s, k) => k ? s.split(k).length - 1 : 0;
function check() {
  const X = BL.post, el = $b("#blCheck"); if (!X || !el) return;
  const title = X.titles[X.sel] ?? "", kw = String(X.main_keyword ?? "").trim(), body = bodyText(), all = body + "\n" + title + "\n" + tagsText() + X.blocks.map((b) => b.caption).join(" ");
  const nchar = body.replace(/\s/g, "").length, range = { news: [700, 1100], exam: [1400, 3000] }[X.opts?.preset] ?? [1400, 2200];
  const cnt = count(body, kw), first = (X.blocks.find((b) => b.type === "text")?.text ?? "");
  const hits = BANNED.filter((w) => all.includes(w)), todo = count(all, "[확인 필요"), review = count(all, "[강사 검수]");
  const photos = X.blocks.filter((b) => b.type === "photo"), placed = photos.filter((b) => photoOf(b.pid)), empty = photos.length - placed.length;
  const unfaced = placed.filter((b) => !photoOf(b.pid).faced).length, tags = (X.hashtags ?? []).length, cl = CLICHES.filter((w) => body.includes(w));
  const L = [];
  const add = (lv, txt) => L.push(`<div class="${lv}"><b>${{ ok: "✔", warn: "!", bad: "✕", info: "·" }[lv]}</b><span>${txt}</span></div>`);
  add(len(title) >= 25 && len(title) <= 38 ? "ok" : "warn", `제목 ${len(title)}자 (25~38자 권장)`);
  add(!kw ? "warn" : title.slice(0, 16).includes(kw) ? "ok" : title.includes(kw) ? "warn" : "bad", kw ? `제목 앞쪽에 메인 키워드 "${esc(kw)}"` : "메인 키워드가 없어요");
  add(kw && first.includes(kw) ? "ok" : "warn", "첫 문단에 메인 키워드");
  add(nchar >= range[0] && nchar <= range[1] ? "ok" : nchar >= range[0] * 0.8 ? "warn" : "bad", `본문 ${nchar.toLocaleString()}자 (공백 제외, 권장 ${range[0].toLocaleString()}~${range[1].toLocaleString()}자)`);
  add(cnt >= 3 && cnt <= 5 ? "ok" : cnt === 0 || cnt > 7 ? "bad" : "warn", `메인 키워드 본문 ${cnt}회 (3~5회 · 너무 많으면 스팸으로 봐요)`);
  add(hits.some((h) => /컬컴|CULCOM/i.test(h)) ? "bad" : hits.length ? "warn" : "ok", hits.length ? `과장·금지 표현: ${esc(hits.join(", "))}` : "과장·금지 표현 없음");
  add(todo ? "bad" : "ok", todo ? `[확인 필요] ${todo}곳 — 채우거나 지우고 발행하세요` : "[확인 필요] 없음");
  if (review) add("warn", `[강사 검수] ${review}곳 — 외국어 표현을 강사님께 확인받고 표시를 지우세요`);
  add(empty ? "warn" : "info", empty ? `사진 자리 ${empty}곳이 비어 있어요` : `사진 ${placed.length}장 (장 수는 순위와 무관 — 내용에 맞게)`);
  if (placed.length) add(unfaced ? "warn" : "ok", unfaced ? `얼굴 확인 안 한 사진 ${unfaced}장 — 🙂 얼굴 자동 블러 또는 [편집]` : "사진 얼굴 확인 완료");
  add(tags >= 8 && tags <= 12 ? "ok" : "warn", `해시태그 ${tags}개 (8~12개)`);
  add(cl.length >= 3 ? "warn" : "ok", cl.length >= 3 ? `AI 티 나는 표현: ${esc(cl.join(", "))}` : "AI 티 나는 상투어 적음");
  el.innerHTML = L.join("") + `<div class="info" id="blSim"><b>·</b><span>다른 글과 겹침 확인 중…</span></div>`;
  if (BL.sim) showSim(BL.sim);
}
function showSim(m) {
  const el = $b("#blSim"); if (!el) return;
  const top = m[0], lv = !top ? "ok" : top.score >= 30 ? "bad" : top.score >= 15 ? "warn" : "ok";
  el.className = lv;
  el.innerHTML = `<b>${{ ok: "✔", warn: "!", bad: "✕" }[lv]}</b><span>${top ? `다른 글과 겹침 최대 ${top.score}% — ${esc(top.team)} "${esc(top.title)}" (${top.date})${top.score >= 15 ? " · 도입·소제목·마무리를 바꿔 주세요" : ""}` : "지난 글과 겹치는 글 없음"}</span>`;
}
const similarSoon = debounce(async () => {
  if (!BL.post) return;
  const r = await sb.functions.invoke("blog-write", { body: { action: "similar", team_id: BL.team, text: bodyText(), exclude_id: BL.postId } });
  if (r.data?.matches) { BL.sim = r.data.matches; showSim(BL.sim); } else { const el = $b("#blSim"); if (el) el.querySelector("span").textContent = "겹침 확인은 AI 서버 연결 후에 돼요"; }
}, 1500);
const edited = debounce(() => { check(); similarSoon(); }, 400);

// ── 저장·보관함 ──
// 열어 둔 글 기억: 다른 사이트에 올리고 돌아왔을 때 화면이 새로 열려도 그 글을 다시 띄움
const remember = (id) => { try { id ? localStorage.setItem("bl-open", JSON.stringify({ id, team: BL.team, at: Date.now() })) : localStorage.removeItem("bl-open"); } catch {} };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && BL.post) savePost(true); }); // 다른 앱·사이트로 갈 때 바로 저장
async function savePost(silent) {
  const X = BL.post; if (!X) return;
  const row = { team_id: BL.team, title: X.titles[X.sel] ?? "", keyword: X.main_keyword ?? "", body: bodyText(), post: X, updated_at: new Date().toISOString() };
  if (BL.postId) { const { error } = await sb.from("blog_posts").update(row).eq("id", BL.postId); if (!fail(error) && !silent) toast("저장했어요"); }
  else { const { data, error } = await sb.from("blog_posts").insert(row).select("id").single(); if (!fail(error)) { BL.postId = data.id; remember(data.id); if (!silent) toast("보관함에 저장했어요"); } }
}
async function renderList() {
  $b("#blBody").innerHTML = `<div class="mut">불러오는 중…</div>`;
  const { data, error } = await sb.from("blog_posts").select("id, title, keyword, status, url, created_at").eq("team_id", BL.team).order("created_at", { ascending: false }).limit(100);
  if (fail(error)) return;
  $b("#blBody").innerHTML = data.length ? `<div class="bllist">${data.map((p) => `<div class="card"><div class="t"><b>${esc(p.title || "(제목 없음)")}</b><span class="mut">${esc(p.keyword)} · ${p.created_at.slice(0, 10)}</span></div>
      <span class="blbadge ${p.status === "published" ? "pub" : ""}">${p.status === "published" ? "발행함" : "초안"}</span>${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" class="mut">글 보기</a>` : ""}
      <button type="button" class="btn ghost small" data-open="${p.id}">열기</button><button type="button" class="btn ghost small" data-pub="${p.id}">${p.status === "published" ? "주소 고치기" : "발행함 표시"}</button><button type="button" class="btn ghost small" data-delp="${p.id}">삭제</button></div>`).join("")}</div>`
    : `<div class="card blempty">아직 저장된 글이 없어요. [새 글]에서 시안을 만들면 자동으로 여기에 쌓여요.</div>`;
}

// ── 지점 설정 ──
const LISTS = [["subjects", "과목 (쉼표)"], ["regions", "지역·동네 이름 (쉼표, 검색량 필터용)"], ["brandTags", "브랜드 해시태그 (쉼표)"]];
const LINES = [["mainKeywords", "메인 키워드 후보 (한 줄에 하나)"], ["subKeywords", "서브·롱테일 키워드 (한 줄에 하나)"]];
const FIELDS = [["display", "블로그에 쓰는 지점명"], ["address", "주소"], ["location", "위치 설명 (역·랜드마크·동네)"], ["hours", "운영시간"], ["contact", "상담 방법 (전화·카톡·예약)"], ["strengths", "강점"], ["notes", "지점 메모 (AI에게 알려줄 것)"]];
function renderProfile() {
  const p = P();
  $b("#blBody").innerHTML = `<div class="card blset">
    ${BL.profileSaved ? "" : `<div class="mut" style="margin-bottom:6px">아직 저장 전이에요. 10/24 키워드 조사로 채운 기본값이 들어가 있어요. 확인하고 [저장]해 주세요.</div>`}
    ${FIELDS.map(([k, t]) => `<label>${t}</label>${k === "strengths" || k === "notes" ? `<textarea data-pf="${k}">${esc(p[k] ?? "")}</textarea>` : `<input data-pf="${k}" value="${esc(p[k] ?? "")}" style="width:100%">`}`).join("")}
    ${LISTS.map(([k, t]) => `<label>${t}</label><input data-pfl="${k}" value="${esc((p[k] ?? []).join(", "))}" style="width:100%">`).join("")}
    <div class="row2"><div><label>기본 글쓴이</label><select data-pf="writer">${opt(WRITERS, p.writer || "director")}</select></div><div><label>기본 컨셉</label><select data-pf="concept">${opt(CONCEPTS, p.concept || "class")}</select></div></div>
    ${LINES.map(([k, t]) => `<label>${t}</label><textarea data-pfn="${k}" style="min-height:8em">${esc((p[k] ?? []).join("\n"))}</textarea>`).join("")}
    <div style="margin-top:14px;text-align:right"><button type="button" class="btn" id="blPfSave">저장</button></div></div>`;
}
async function saveProfile() {
  const d = { ...P() };
  V().querySelectorAll("[data-pf]").forEach((el) => d[el.dataset.pf] = el.value.trim());
  V().querySelectorAll("[data-pfl]").forEach((el) => d[el.dataset.pfl] = el.value.split(",").map((s) => s.trim()).filter(Boolean));
  V().querySelectorAll("[data-pfn]").forEach((el) => d[el.dataset.pfn] = el.value.split("\n").map((s) => s.trim()).filter(Boolean));
  const { error } = await sb.from("blog_profiles").upsert({ team_id: BL.team, data: d, updated_at: new Date().toISOString() });
  if (fail(error)) return;
  BL.profile = d; BL.profileSaved = true; toast("지점 설정을 저장했어요"); renderProfile();
}

// ── 사용량 (대표) ──
async function renderUsage() {
  $b("#blBody").innerHTML = `<div class="mut">불러오는 중…</div>`;
  const now = new Date(), month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const k = new Date(Date.now() + 9 * 3600e3); k.setUTCHours(0, 0, 0, 0); const midnight = new Date(k.getTime() - 9 * 3600e3).toISOString();
  const [g, l] = await Promise.all([sb.from("blog_gens").select("team_id, kind, cost_usd, created_at").gte("created_at", month).limit(10000), sb.from("blog_limits").select("*")]);
  if (fail(g.error)) return;
  const lim = Object.fromEntries((l.data ?? []).map((x) => [x.team_id, x.daily]));
  const rows = teams.map((t) => {
    const mine = g.data.filter((x) => x.team_id === t.id), ai = mine.filter((x) => x.kind !== "keywords");
    const cost = mine.reduce((s, x) => s + +x.cost_usd, 0);
    return `<tr><td>${esc(t.name)}</td><td>${ai.filter((x) => x.created_at >= midnight).length} / <input type="number" min="0" max="200" data-lim="${t.id}" value="${lim[t.id] ?? 10}"></td>
      <td>${mine.filter((x) => x.kind === "write").length}</td><td>${mine.filter((x) => ["convert", "style", "sns"].includes(x.kind)).length}</td><td>$${cost.toFixed(2)} <small class="mut">(약 ${Math.round(cost * 1400).toLocaleString()}원)</small></td></tr>`;
  });
  $b("#blBody").innerHTML = `<div class="card"><table class="blusage"><tr><th>지점</th><th>오늘 / 하루 제한</th><th>이번 달 글</th><th>변환·스타일·게시물</th><th>이번 달 AI 비용</th></tr>${rows.join("")}</table>
    <p class="mut">비용은 Claude API 토큰 단가로 계산한 추정치예요 (환율 1,400원). 하루 제한 숫자를 바꾸면 바로 저장돼요.</p></div>`;
}

// ── 키워드 검색량 ──
async function keywordVolume() {
  const o = BL.opts, hints = [o.main_keyword, ...o.sub_keywords].filter(Boolean);
  const btn = $b("#blKwBtn"); btn.disabled = true; btn.textContent = "🔍 조회 중…";
  const r = await call("keywords", { hints: (hints.length ? hints : P().mainKeywords ?? []).slice(0, 5) });
  btn.disabled = false; btn.textContent = "🔍 네이버 검색량 보기";
  if (!r) return;
  BL.kw = r.keywords; BL.kwLocal = true; renderKw();
}
function renderKw() {
  const el = $b("#blKw"); if (!el || !BL.kw) return;
  const reg = (P().regions ?? []).map((x) => x.replace(/\s/g, "")), re = SUBJ_RE[BL.opts.subject];
  const list = BL.kw.filter((k) => (!BL.kwLocal || reg.some((r) => k.keyword.includes(r))) && (!re || re.test(k.keyword) || /언어교환/.test(k.keyword))).sort((a, b) => b.total - a.total).slice(0, 25);
  el.innerHTML = `<label style="color:var(--text);margin-top:8px"><input type="checkbox" id="blKwLocal" ${BL.kwLocal ? "checked" : ""}> 우리 지역 키워드만</label>
    <table class="blkw"><tr><th>키워드 (누르면 메인)</th><th>월 검색</th><th>경쟁</th></tr>${list.map((k) => `<tr data-kwrow="${esc(k.keyword)}"><td>${esc(k.keyword)}</td><td>${k.total.toLocaleString()}</td><td>${esc(k.comp ?? "")}</td></tr>`).join("") || `<tr><td colspan="3" class="mut">맞는 키워드가 없어요</td></tr>`}</table>
    <div class="mut">검색량 많고 경쟁 "낮음·중간"인 키워드가 블로그로 노리기 좋아요.</div>`;
}

// ── 검색 추이·블로그 상위 글 (NAVER API HUB). 상위 글은 시안 만들 때 서버가 메인 키워드로 다시 찾아 AI 에 넘김 ──
async function research() {
  const o = BL.opts, kws = [...new Set([o.main_keyword, ...o.sub_keywords].map((k) => k.trim()).filter(Boolean))].slice(0, 5);
  if (!kws.length) return toast("메인 키워드를 넣거나 칩을 골라 주세요");
  const btn = $b("#blResBtn"); btn.disabled = true; btn.textContent = "📈 조회 중…";
  const r = await call("research", { keywords: kws });
  btn.disabled = false; btn.textContent = "📈 추이 · 상위 글 보기";
  if (!r) return;
  BL.res = r; renderRes();
}
const LINE = ["var(--accent)", "#e0a020", "#3aa676", "#d0607a", "#4a8fd8"];
function trendSvg(trend) {
  const W = 480, H = 200, n = trend[0]?.data.length ?? 0; if (n < 2) return "";
  const x = (i) => 16 + (i * (W - 32)) / (n - 1), y = (v) => H - 26 - (v / 100) * (H - 40);
  const grid = [0, 50, 100].map((v) => `<line x1="16" x2="${W - 16}" y1="${y(v)}" y2="${y(v)}" class="g"/>`).join("");
  const lines = trend.map((t, k) => `<polyline fill="none" stroke="${LINE[k]}" stroke-width="${k ? 2 : 3.5}" stroke-linejoin="round" points="${t.data.map((d, i) => `${x(i).toFixed(1)},${y(d.ratio).toFixed(1)}`).join(" ")}"/>`).join("");
  const dots = trend[0].data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.ratio).toFixed(1)}" r="3.5" fill="${LINE[0]}"/>`).join("");
  const labels = trend[0].data.map((d, i) => `<text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${+d.month.slice(5)}월</text>`).join("");
  return `<svg class="bltrend" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 12개월 검색 추이">${grid}${lines}${dots}${labels}</svg>`;
}
const seenBench = () => { try { return localStorage.getItem("bl-bench-seen") === "1"; } catch { return false; } }; // 🆕 표시·사용법 펼침은 처음 한 번만
function renderRes() {
  const el = $b("#blRes"), r = BL.res; if (!el || !r) return;
  const t0 = r.trend[0], d = t0?.data ?? [], peak = d.reduce((a, b) => (b.ratio > a.ratio ? b : a), d[0] ?? { ratio: 0 }), last = d[d.length - 1];
  const note = t0 && peak?.ratio ? `<b>${esc(t0.keyword)}</b> 가장 많이 찾은 달은 <b>${+peak.month.slice(5)}월</b> · 이번 달은 그때의 <b>${Math.round((last.ratio / peak.ratio) * 100)}%</b> (이번 달은 진행 중)` : "검색 추이 데이터가 없어요 (검색이 너무 적은 키워드)";
  el.innerHTML = `<div class="blres">
    <div class="blres-chart"><h4>📈 최근 12개월 검색 추이</h4>
      ${trendSvg(r.trend)}
      <div class="bllegend">${r.trend.map((t, k) => `<span><i style="background:${LINE[k]}"></i>${esc(t.keyword)}</span>`).join("")}</div>
      <p>${note}</p>
      <div class="mut">숫자가 아니라 넣은 키워드 중 최고치를 100으로 본 비교값이에요.</div></div>
    <div class="blres-top"><h4>🏆 '${esc(t0?.keyword ?? "")}' 네이버 블로그 상위 ${r.top.items.length}개 <span class="mut">· 전체 ${r.top.total.toLocaleString()}개 글</span></h4>
      <ol class="bltop">${r.top.items.map((x) => `<li><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a><div class="mut">${esc(x.blogger)} · ${esc(x.date.replace(/(\d{4})(\d\d)(\d\d)/, "$1.$2.$3"))}</div>${x.desc ? `<div class="desc">${esc(x.desc)}</div>` : ""}</li>`).join("") || `<li class="mut">글이 없어요</li>`}</ol>
      <div class="mut">제목을 누르면 새 탭으로 열려요. ✨ 시안 만들 때 이 상위 글 제목도 AI가 함께 보고, 겹치지 않는 각도로 써요.</div></div></div>`;
}

// ── 다른 채널 변환 ──
async function convert() {
  const btn = $b("#blConv"); btn.disabled = true; btn.textContent = "🔁 바꾸는 중…";
  const r = await call("convert", { title: BL.post.titles[BL.post.sel], body: plainText() });
  btn.disabled = false; btn.textContent = "🔁 인스타·당근·카톡";
  if (!r) return; setQuota(r.quota);
  const C = [["instagram", "📸 인스타그램"], ["daangn", "🥕 당근"], ["kakao", "💬 카카오톡 채널"]];
  $b("#blConvBody").innerHTML = C.map(([k, t]) => `<label style="color:var(--text)">${t} <button type="button" class="btn ghost small" data-copyta="${k}">복사</button></label><textarea id="blConv_${k}">${esc(r.channels[k])}</textarea>`).join("");
  $b("#blConvDlg").showModal();
}

// ── 이벤트 (한 번만 연결) ──
function wire() {
  const v = V();
  $b("#blFile").onchange = (ev) => { addFiles([...ev.target.files]); ev.target.value = ""; };
  $b("#blTeam").onchange = (ev) => { BL.team = +ev.target.value; try { localStorage.setItem("blog-team", ev.target.value); } catch {} BL.profile = null; BL.post = null; BL.postId = null; BL.sim = null; BL.kw = null; BL.res = null; BL.load(); };
  v.addEventListener("paste", pasteAsText);
  v.addEventListener("click", async (ev) => {
    const t = ev.target, d = t.dataset ?? {}, X = BL.post;
    if (d.bt) { if (BL.tab === "new" && X) await savePost(true); BL.tab = d.bt; return renderTab(); }
    if (d.mode) { BL.opts.mode = d.mode; return syncMode(); }
    if (t.closest("#blDrop")) return $b("#blFile").click();
    if (d.rm) { BL.photos = BL.photos.filter((p) => p.id !== +d.rm); renderThumbs(); presetWhy(); if (X) renderOut(); return; }
    if (d.ed) return openEditor(+d.ed);
    const th = t.closest("#blThumbs .blthumb"); if (th && !t.closest("button, input")) return PHOTO.view(BL.photos, +th.dataset.thumb, { onEdit: (p) => openEditor(p.id) }); // 🔍 크게 보기
    if (t.id === "blFaceAll") return faceAll();
    const chip = t.closest("[data-chip]");
    if (chip) {
      const o = BL.opts, k = chip.dataset.chip;
      if (o.main_keyword === k) o.main_keyword = "";
      else if (o.sub_keywords.includes(k)) { o.sub_keywords = o.sub_keywords.filter((x) => x !== k); o.main_keyword = k; }
      else o.sub_keywords.push(k);
      $b("[data-o=main_keyword]").value = o.main_keyword; return renderChips();
    }
    if (t.id === "blKwBtn") return keywordVolume();
    if (t.id === "blResBtn") return research();
    if (t.id === "blKwLocal") { BL.kwLocal = t.checked; return renderKw(); }
    const row = t.closest("[data-kwrow]");
    if (row) { const k = row.dataset.kwrow; if (!BL.extraKw.includes(k)) BL.extraKw.unshift(k); BL.opts.main_keyword = k; $b("[data-o=main_keyword]").value = k; return renderChips(); }
    if (t.id === "blGo") return generate();
    if (t.id === "blAddStyle") { ev.preventDefault(); $b("#blStyleUrl").value = ""; $b("#blStyleText").value = ""; return $b("#blStyleDlg").showModal(); }
    if (t.id === "blStyleGo") {
      t.disabled = true; t.textContent = "분석 중…";
      const r = await call("style", { url: $b("#blStyleUrl").value.trim(), text: $b("#blStyleText").value, shared: $b("#blStyleShared").checked });
      t.disabled = false; t.textContent = "분석해서 추가 (1회 사용)";
      if (!r) return; setQuota(r.quota); BL.styles.push(r.style); BL.opts.preset = `custom:${r.style.id}`;
      $b("#blStyleDlg").close(); toast(`"${r.style.name}" 스타일을 추가했어요`); return renderNew();
    }
    if (d.copy) { if (await copy(d.copy)) toast("복사했어요"); return; }
    if (d.copyta) { if (await copy($b(`#blConv_${d.copyta}`).value)) toast("복사했어요"); return; }
    if (d.mv) { const i = +d.i, j = i + +d.mv, B = X.blocks; if (j < 0 || j >= B.length) return; [B[i], B[j]] = [B[j], B[i]]; renderOut(); return; }
    if (d.add) { X.blocks.splice(+d.add + 1, 0, { type: "text", text: "", photo: 0, caption: "", pid: 0 }); renderOut(); v.querySelector(`[data-tx="${+d.add + 1}"]`)?.focus(); return; }
    if (d.del) { X.blocks.splice(+d.del, 1); return renderOut(); }
    if (d.pcopy) { const no = t.textContent.match(/\d+/)?.[0]; if (await copyImg(photoOf(X.blocks[+d.pcopy].pid))) toast(`사진 ${no} 복사! 네이버 글쓰기 '📷 사진 ${no}' 자리에 붙여넣으세요(⌘V / Ctrl+V)`); return; }
    if (d.cover) { const B = X.blocks, i = +d.cover, f = B.findIndex((b) => b.type === "photo"); [B[f], B[i]] = [B[i], B[f]]; renderOut(); toast("이 사진이 사진 01(대표사진)이 됐어요"); return; }
    if (t.id === "blCopy") { BL.next = 0; $b("#blNextPhoto").textContent = nextLabel(); if (await copy(plainText(), richHtml())) toast("본문 복사! 네이버에 붙여넣은 뒤 [📋 다음 사진 복사] → '📷 사진 01' 자리에 붙여넣기를 사진마다 반복하세요"); return; }
    if (t.id === "blNextPhoto") {
      const L = shots(); if (!L.length) return toast("시안에 들어간 사진이 없어요");
      const { no, p } = L[BL.next % L.length];
      if (await copyImg(p)) { BL.next = BL.next % L.length + 1; toast(`사진 ${no} 복사! '📷 사진 ${no}' 줄을 지우고 그 자리에 붙여넣으세요(⌘V / Ctrl+V)${no === "01" ? " — 대표사진" : ""}`); }
      t.textContent = nextLabel(); return;
    }
    if (t.id === "blCopyTitle") { if (await copy(X.titles[X.sel])) toast("제목 복사했어요"); return; }
    if (t.id === "blTagsCopy") { if (await copy(tagsText())) toast("해시태그 복사했어요"); return; }
    if (t.id === "blPhotos") return photosOut();
    if (t.id === "blConv") return convert();
    if (t.id === "blSave") return savePost(false);
    if (d.open) {
      const { data, error } = await sb.from("blog_posts").select("id, post").eq("id", +d.open).single();
      if (fail(error)) return;
      BL.post = data.post; BL.postId = data.id; BL.sim = null; BL.tab = "new"; remember(data.id); return renderTab();
    }
    if (d.pub) {
      const url = prompt("발행한 네이버 글 주소를 붙여 주세요 (없으면 비워 두세요)", ""); if (url === null) return;
      const { error } = await sb.from("blog_posts").update({ status: "published", url: url.trim() || null }).eq("id", +d.pub);
      if (!fail(error)) renderList(); return;
    }
    if (d.delp) {
      if (!confirm("이 글을 보관함에서 지울까요? 되돌릴 수 없어요.")) return;
      const { error } = await sb.from("blog_posts").delete().eq("id", +d.delp);
      if (!fail(error)) { if (BL.postId === +d.delp) { BL.postId = null; } renderList(); } return;
    }
    if (t.id === "blPfSave") return saveProfile();
    if (t.id === "blPrefSave") return savePrefs();
    if (t.id === "blPrefReset") return resetPrefs();
    if (d.fbk) { V().querySelectorAll("[data-fbk]").forEach((b) => b.classList.toggle("on", b === t)); return; }
    if (t.id === "blFbSend") return sendFb();
  });
  v.addEventListener("toggle", (ev) => { if (ev.target.id === "blHow" && !ev.target.open) { try { localStorage.setItem("bl-bench-seen", "1"); } catch {} $b(".blnew")?.remove(); } }, true); // 사용법 접으면 '봤음'
  v.addEventListener("keydown", (ev) => { if (ev.target.id === "blBenchKw" && ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); research(); } });
  v.addEventListener("input", (ev) => {
    const t = ev.target, d = t.dataset, X = BL.post;
    if (d.o) { BL.opts[d.o] = t.value; if (d.o === "main_keyword") renderChips(); presetWhy(); return; }
    if (d.note) { const p = photoOf(+d.note); if (p) p.note = t.value; return; }
    if (!X) return;
    if (d.tx) X.blocks[+d.tx].text = t.innerText.replace(/\n$/, "");
    else if (d.cap) X.blocks[+d.cap].caption = t.innerText.trim();
    else if (d.title) { X.titles[+d.title] = t.value; t.nextElementSibling.textContent = `${len(t.value)}자`; }
    else if (t.id === "blTags") X.hashtags = t.innerText.split(/[\s,]+/).map((s) => s.replace(/^#/, "")).filter(Boolean);
    else return;
    edited();
  });
  v.addEventListener("change", async (ev) => {
    const t = ev.target, d = t.dataset;
    if (d.o) { BL.opts[d.o] = t.value; if (d.o === "subject") { renderChips(); renderKw(); } presetWhy(); return; }
    if (t.name === "blT") { BL.post.sel = +t.value; return edited(); }
    if (d.lim) { const { error } = await sb.from("blog_limits").upsert({ team_id: +d.lim, daily: Math.max(0, Math.min(200, +t.value || 0)) }); if (!fail(error)) toast("하루 제한을 바꿨어요"); }
  });

  // 끌어다 놓기: 파일 → 사진 목록 / 썸네일 순서 / 시안 안 사진 블록 이동·교체 / 안 쓴 사진 → 시안
  v.addEventListener("dragstart", (ev) => {
    const th = ev.target.closest?.("[data-thumb]"), sp = ev.target.closest?.("[data-spare]"), bk = ev.target.closest?.(".blk.photo");
    drag = th ? { kind: "thumb", i: +th.dataset.thumb } : sp ? { kind: "spare", pid: +sp.dataset.spare } : bk ? { kind: "blk", i: +bk.dataset.i } : null;
    if (!drag) return;
    // 내부 표시는 다른 사이트가 안 읽는 타입으로만 단다
    ev.dataTransfer.effectAllowed = "copyMove"; ev.dataTransfer.setData("application/x-pallo", "1");
    (th || sp || bk).classList.add("dragging");
  });
  v.addEventListener("dragend", () => { drag = null; v.querySelectorAll(".dragging, .dropbefore, .dropon").forEach((x) => x.classList.remove("dragging", "dropbefore", "dropon")); });
  v.addEventListener("dragover", (ev) => {
    const drop = ev.target.closest?.("#blDrop, #blThumbs");
    if (!drag && ev.dataTransfer.types.includes("Files") && drop) { ev.preventDefault(); $b("#blDrop")?.classList.add("over"); return; }
    if (!drag) return;
    const th = ev.target.closest?.("[data-thumb]"), bk = ev.target.closest?.(".blk"), paper = ev.target.closest?.("#blPaper");
    if (drag.kind === "thumb" && th) { ev.preventDefault(); return; }
    if (drag.kind !== "thumb" && (bk || paper)) {
      ev.preventDefault();
      v.querySelectorAll(".dropbefore, .dropon").forEach((x) => x.classList.remove("dropbefore", "dropon"));
      if (bk) bk.classList.add(drag.kind === "spare" && bk.classList.contains("photo") ? "dropon" : "dropbefore");
    }
  });
  v.addEventListener("dragleave", (ev) => { if (ev.target.id === "blDrop") ev.target.classList.remove("over"); });
  v.addEventListener("drop", (ev) => {
    $b("#blDrop")?.classList.remove("over");
    if (!drag && ev.dataTransfer.files?.length && ev.target.closest?.("#blDrop, #blThumbs")) { ev.preventDefault(); return addFiles([...ev.dataTransfer.files]); }
    if (!drag) return;
    ev.preventDefault();
    const X = BL.post, th = ev.target.closest?.("[data-thumb]"), bk = ev.target.closest?.(".blk");
    if (drag.kind === "thumb" && th) {
      const [p] = BL.photos.splice(drag.i, 1); BL.photos.splice(+th.dataset.thumb, 0, p); return renderThumbs();
    }
    if (!X || drag.kind === "thumb") return;
    const at = bk ? +bk.dataset.i : X.blocks.length;
    if (drag.kind === "spare") {
      if (bk?.classList.contains("photo")) X.blocks[at].pid = drag.pid; // 빈 자리 채우기 / 사진 바꾸기
      else X.blocks.splice(at, 0, { type: "photo", text: "", photo: 0, caption: "", pid: drag.pid });
    } else if (drag.kind === "blk" && drag.i !== at) {
      const [b] = X.blocks.splice(drag.i, 1); X.blocks.splice(at > drag.i ? at - 1 : at, 0, b);
    }
    drag = null; renderOut();
  });
}
})();
