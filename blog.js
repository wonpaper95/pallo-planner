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
const RATIOS = { orig: 0, "4:3": 4 / 3, "1:1": 1, "3:4": 3 / 4, "16:9": 16 / 9 };
const BANNED = ["컬컴", "CULCOM", "culcom", "100%", "무조건", "보장", "1등", "1위", "최고", "최저가", "완벽"];
const CLICHES = ["알아보겠습니다", "정리해보았습니다", "결론적으로", "이처럼", "다양한", "효과적인", "핵심은"];
const SUBJ_RE = { 영어: /영어|오픽|토익|토스|토플|아이엘츠|IELTS|프리토킹|비즈니스/, 일본어: /일본어|JLPT|JPT|워홀/, 중국어: /중국어|HSK/, 스페인어: /스페인어|DELE|dele|FLEX|SIELE/ };
const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

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
const loadScript = (src) => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
const P = () => BL.profile ?? {};
let seq = 0, drag = null;

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
    <div class="bltabs"><button data-bt="new">새 글</button><button data-bt="list">보관함</button><button data-bt="profile">지점 설정</button><button data-bt="usage" class="hidden">사용량</button></div>
    <span id="blQuota" class="mut"></span></div>
  <div id="blBody"></div>
  <input type="file" id="blFile" accept="image/*" multiple hidden>
  <dialog id="blEditDlg"><h3 style="margin:0 0 8px">🖼 사진 편집 <small class="mut" id="blEdNo"></small></h3>
    <div class="tb"><span class="mut">비율</span><span class="blseg" id="blEdRatio">${Object.keys(RATIOS).map((r) => `<button type="button" data-ratio="${r}">${r === "orig" ? "원본" : r}</button>`).join("")}</span></div>
    <div class="tb"><span class="blseg" id="blEdMode"><button type="button" data-emode="blur">🟦 모자이크 그리기</button><button type="button" data-emode="pan">✋ 자르기 위치</button></span>
      <button type="button" class="btn ghost small" id="blEdFace">🙂 얼굴 자동 찾기</button><button type="button" class="btn ghost small" id="blEdClear">모자이크 지우기</button>
      <span class="mut">밝기</span><input type="range" id="blEdBright" min="-40" max="40" value="0"><span class="mut">대비</span><input type="range" id="blEdContrast" min="-40" max="40" value="0"></div>
    <div class="cv"><canvas id="blEdCv"></canvas></div>
    <div class="mut" style="margin-top:6px">모자이크: 끌어서 네모 그리기 · 네모를 누르면 지워져요. 학생 얼굴은 동의가 없으면 꼭 가려 주세요.</div>
    <label>사진 메모 (AI에게 알려줄 내용, 선택)</label><input id="blEdNote" placeholder="예) 토요반 프리토킹 시간, 원어민 강사">
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn ghost" id="blEdCancel">취소</button><button type="button" class="btn" id="blEdSave">적용</button></div></dialog>
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
    BL.profileSaved = !!row;
    if (prev !== undefined && prev !== BL.team) { BL.post = null; BL.postId = null; }
    BL.opts = { mode: "photo", topic: "", facts: "", subject: "", preset: "auto", writer: P().writer || "director", age: "30대", reader: "worker", readerAge: "30대", tone: "friendly", concept: P().concept || "class", main_keyword: "", sub_keywords: [] };
  }
  BL.styles = (await sb.from("blog_styles").select("id, name, team_id").order("created_at")).data ?? [];
  call("usage").then((r) => r && setQuota(r.quota));
  renderTab();
};
function setQuota(q) { BL.quota = q; const el = $b("#blQuota"); if (el && q) el.textContent = `오늘 남은 생성 ${Math.max(0, q.limit - q.used)}/${q.limit}회`; }

function renderTab() {
  V().querySelectorAll("[data-bt]").forEach((b) => b.classList.toggle("on", b.dataset.bt === BL.tab));
  if (BL.tab === "new") renderNew();
  else if (BL.tab === "list") renderList();
  else if (BL.tab === "profile") renderProfile();
  else renderUsage();
}

// ── 새 글: 입력 ──
function renderNew() {
  const o = BL.opts, subs = P().subjects ?? [];
  const styles = [...PRESETS, ...BL.styles.map((s) => [`custom:${s.id}`, `⭐ ${s.name}${s.team_id ? "" : " (공용)"}`])];
  $b("#blBody").innerHTML = `<div class="blgrid"><div class="blform card">
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
    <label>메인 키워드 <small>(비우면 AI가 골라요 · 칩 한 번=서브, 두 번=메인)</small></label><input data-o="main_keyword" value="${esc(o.main_keyword)}" style="width:100%" placeholder="예) 동성로 영어회화">
    <div class="blchips" id="blChips"></div>
    <button type="button" class="btn ghost small" id="blKwBtn" style="margin-top:8px">🔍 네이버 검색량 보기</button><div id="blKw"></div>
    <button type="button" class="btn blgo" id="blGo">✨ 시안 만들기</button><div class="mut" id="blGoNote" style="margin-top:6px"></div>
  </div><div id="blOut"></div></div>`;
  $b("#blTopic").value = o.topic;
  syncMode(); renderThumbs(); renderChips(); presetWhy(); renderOut();
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
  el.innerHTML = BL.photos.map((p, i) => `<div class="blthumb" draggable="true" data-thumb="${i}"><img src="${p.url}" alt=""><span class="no">${pad(i + 1)}</span>
    <button type="button" class="x" data-rm="${p.id}" title="빼기">✕</button><button type="button" class="ed" data-ed="${p.id}">편집</button>${p.faced ? `<span class="face">🙂${p.edits.blurs.length || ""}</span>` : ""}
    <input data-note="${p.id}" value="${esc(p.note)}" placeholder="메모"></div>`).join("");
  const n = BL.photos.length, unchecked = BL.photos.filter((p) => !p.faced).length;
  $b("#blFaceRow").innerHTML = n ? `<button type="button" class="btn ghost small" id="blFaceAll">🙂 얼굴 자동 모자이크${unchecked ? ` (${unchecked}장)` : ""}</button> <small class="mut">${n}장 · 사진은 이 기기 안에서만 처리돼요</small>` : "";
}
function renderChips() {
  const el = $b("#blChips"); if (!el) return;
  const o = BL.opts, re = SUBJ_RE[o.subject];
  const all = [...new Set([...(P().mainKeywords ?? []), ...BL.extraKw, ...(P().subKeywords ?? [])])].filter((k) => !re || re.test(k) || /언어교환/.test(k));
  el.innerHTML = all.slice(0, 28).map((k) => `<button type="button" class="blchip ${k === o.main_keyword ? "main" : o.sub_keywords.includes(k) ? "sub" : ""}" data-chip="${esc(k)}" title="네이버 월간 검색수">${esc(k)}${vol(k) ? ` <small>· ${vol(k).toLocaleString()}</small>` : ""}</button>`).join("");
}

// ── 사진: 읽기·편집·굽기 ──
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
async function addFiles(files) {
  const added = [];
  for (const f of files) {
    if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) continue;
    try {
      const img = await loadImg(URL.createObjectURL(f));
      const p = { id: ++seq, name: f.name, img, note: "", faced: false, edits: { ratio: "orig", ox: 0.5, oy: 0.5, bright: 0, contrast: 0, blurs: [] } };
      BL.photos.push(p); added.push(p);
    } catch { toast(`${f.name}: 이 형식은 못 읽어요 (HEIC면 JPG로 바꿔서 올려 주세요)`); }
  }
  await Promise.all(added.map(bake));
  renderThumbs(); presetWhy();
}
function cropRect(p) {
  const W = p.img.naturalWidth, H = p.img.naturalHeight, r = RATIOS[p.edits.ratio];
  if (!r) return { x: 0, y: 0, w: W, h: H };
  let w = W, h = W / r; if (h > H) { h = H; w = H * r; }
  return { x: (W - w) * p.edits.ox, y: (H - h) * p.edits.oy, w, h };
}
function mosaic(ctx, x, y, w, h) {
  if (w < 2 || h < 2) return;
  const cell = Math.max(6, Math.round(Math.max(w, h) / 9)), t = document.createElement("canvas");
  t.width = Math.max(1, Math.ceil(w / cell)); t.height = Math.max(1, Math.ceil(h / cell));
  t.getContext("2d").drawImage(ctx.canvas, x, y, w, h, 0, 0, t.width, t.height);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w, h); ctx.restore();
}
function tone(ctx, e) {
  if (!e.bright && !e.contrast) return;
  const { width: w, height: h } = ctx.canvas, d = ctx.getImageData(0, 0, w, h), a = d.data;
  const b = e.bright * 2.2, c = (100 + e.contrast) / 100;
  for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) a[i + k] = Math.max(0, Math.min(255, (a[i + k] - 128) * c + 128 + b));
  ctx.putImageData(d, 0, 0);
}
// 편집 반영한 사진 (crop: 자르기 적용 여부)
function draw(p, maxSide, e = p.edits, crop = true) {
  const W = p.img.naturalWidth, H = p.img.naturalHeight, c = crop ? cropRect({ ...p, edits: e }) : { x: 0, y: 0, w: W, h: H };
  const s = Math.min(1, maxSide / Math.max(c.w, c.h)), cv = document.createElement("canvas");
  cv.width = Math.round(c.w * s); cv.height = Math.round(c.h * s);
  const ctx = cv.getContext("2d"); ctx.drawImage(p.img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  e.blurs.forEach((r) => mosaic(ctx, (r.x - c.x) * s, (r.y - c.y) * s, r.w * s, r.h * s));
  tone(ctx, e);
  return { cv, s, c };
}
async function bake(p) {
  const big = draw(p, 2000).cv;
  p.blob = await new Promise((ok) => big.toBlob(ok, "image/jpeg", 0.9));
  if (p.url) URL.revokeObjectURL(p.url);
  p.url = URL.createObjectURL(p.blob);
  p.ai = draw(p, 1024).cv.toDataURL("image/jpeg", 0.8).split(",")[1];
}

// 얼굴 찾기: 전체 + 2×2 조각(작은 얼굴용)으로 돌리고 겹치는 건 합침
let detector;
async function faceDetector() {
  if (detector) return detector;
  const v = await import(`${MP}/vision_bundle.mjs`);
  const fs = await v.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  detector = await v.FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: "IMAGE", minDetectionConfidence: 0.35 });
  return detector;
}
async function findFaces(p) {
  const d = await faceDetector(), W = p.img.naturalWidth, H = p.img.naturalHeight, boxes = [];
  const run = (sx, sy, sw, sh) => {
    const k = Math.min(1, 1024 / Math.max(sw, sh)), cv = document.createElement("canvas");
    cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    cv.getContext("2d").drawImage(p.img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    for (const det of d.detect(cv).detections) { const b = det.boundingBox; boxes.push({ x: sx + b.originX / k, y: sy + b.originY / k, w: b.width / k, h: b.height / k }); }
  };
  run(0, 0, W, H);
  const tw = W * 0.6, th = H * 0.6;
  for (const fx of [0, 0.4]) for (const fy of [0, 0.4]) run(W * fx, H * fy, tw, th);
  const iou = (a, b) => { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return x * y / Math.min(a.w * a.h, b.w * b.h); };
  const keep = [];
  boxes.sort((a, b) => b.w * b.h - a.w * a.h).forEach((b) => { if (!keep.some((k) => iou(k, b) > 0.3)) keep.push(b); });
  return keep.map((b) => ({ x: Math.max(0, b.x - b.w * 0.25), y: Math.max(0, b.y - b.h * 0.35), w: b.w * 1.5, h: b.h * 1.6 }));
}
async function faceAll() {
  const todo = BL.photos.filter((p) => !p.faced); if (!todo.length) return toast("모든 사진을 이미 확인했어요");
  const btn = $b("#blFaceAll"); if (btn) { btn.disabled = true; btn.textContent = "🙂 얼굴 찾는 중…"; }
  try {
    let n = 0;
    for (const p of todo) { const f = await findFaces(p); p.edits.blurs.push(...f); p.faced = true; n += f.length; await bake(p); }
    toast(n ? `얼굴 ${n}개를 모자이크했어요. 놓친 얼굴은 [편집]에서 직접 칠해 주세요` : "찾은 얼굴이 없어요. 작은 얼굴은 [편집]에서 확인해 주세요");
  } catch (e) { console.error(e); toast("얼굴 찾기를 불러오지 못했어요. [편집]에서 직접 칠해 주세요"); }
  renderThumbs(); if (BL.post) renderOut();
}

// 사진 편집 창
const ED = { p: null, e: null, mode: "blur", s: 1, drag: null };
function openEditor(id) {
  const p = BL.photos.find((x) => x.id === id); if (!p) return;
  ED.p = p; ED.e = structuredClone(p.edits); ED.mode = "blur";
  $b("#blEdNo").textContent = `사진 ${pad(BL.photos.indexOf(p) + 1)}`;
  $b("#blEdBright").value = ED.e.bright; $b("#blEdContrast").value = ED.e.contrast; $b("#blEdNote").value = p.note;
  $b("#blEditDlg").showModal(); edDraw();
}
function edDraw() {
  const { p, e } = ED, maxW = Math.min(940, window.innerWidth - 60), maxH = window.innerHeight * 0.55;
  const s = Math.min(maxW / p.img.naturalWidth, maxH / p.img.naturalHeight, 1); ED.s = s;
  const { cv: src } = draw(p, Math.max(p.img.naturalWidth, p.img.naturalHeight) * s, e, false);
  const cv = $b("#blEdCv"); cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d"); ctx.drawImage(src, 0, 0);
  const c = cropRect({ ...p, edits: e }), cx = c.x * s, cy = c.y * s, cw = c.w * s, ch = c.h * s;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(0, 0, cv.width, cy); ctx.fillRect(0, cy + ch, cv.width, cv.height - cy - ch); ctx.fillRect(0, cy, cx, ch); ctx.fillRect(cx + cw, cy, cv.width - cx - cw, ch);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(cx, cy, cw, ch);
  ctx.setLineDash([5, 4]); ctx.strokeStyle = "#ffd400";
  e.blurs.forEach((r) => ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s));
  if (ED.drag?.rect) { const r = ED.drag.rect; ctx.strokeStyle = "#4dabf7"; ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s); }
  ctx.setLineDash([]);
  V().querySelectorAll("[data-ratio]").forEach((b) => b.classList.toggle("on", b.dataset.ratio === e.ratio));
  V().querySelectorAll("[data-emode]").forEach((b) => b.classList.toggle("on", b.dataset.emode === ED.mode));
}
function edPoint(ev) { const r = $b("#blEdCv").getBoundingClientRect(), k = $b("#blEdCv").width / r.width; return { x: (ev.clientX - r.left) * k / ED.s, y: (ev.clientY - r.top) * k / ED.s }; }
function wireEditor() {
  const cv = $b("#blEdCv");
  cv.onpointerdown = (ev) => { cv.setPointerCapture(ev.pointerId); const pt = edPoint(ev); ED.drag = { start: pt, last: pt, moved: false }; };
  cv.onpointermove = (ev) => {
    const d = ED.drag; if (!d) return; const pt = edPoint(ev);
    if (Math.abs(pt.x - d.start.x) + Math.abs(pt.y - d.start.y) > 6 / ED.s) d.moved = true;
    if (ED.mode === "blur") d.rect = { x: Math.min(d.start.x, pt.x), y: Math.min(d.start.y, pt.y), w: Math.abs(pt.x - d.start.x), h: Math.abs(pt.y - d.start.y) };
    else {
      const c = cropRect({ ...ED.p, edits: ED.e }), W = ED.p.img.naturalWidth, H = ED.p.img.naturalHeight;
      if (W > c.w) ED.e.ox = Math.max(0, Math.min(1, ED.e.ox + (pt.x - d.last.x) / (W - c.w)));
      if (H > c.h) ED.e.oy = Math.max(0, Math.min(1, ED.e.oy + (pt.y - d.last.y) / (H - c.h)));
    }
    d.last = pt; edDraw();
  };
  cv.onpointerup = () => {
    const d = ED.drag; ED.drag = null; if (!d) return;
    if (ED.mode === "blur") {
      if (d.moved && d.rect.w > 4 && d.rect.h > 4) ED.e.blurs.push(d.rect);
      else if (!d.moved) { const { x, y } = d.start, i = ED.e.blurs.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); if (i >= 0) ED.e.blurs.splice(i, 1); }
    }
    edDraw();
  };
  $b("#blEdRatio").onclick = (ev) => { const r = ev.target.dataset.ratio; if (r) { ED.e.ratio = r; edDraw(); } };
  $b("#blEdMode").onclick = (ev) => { const m = ev.target.dataset.emode; if (m) { ED.mode = m; edDraw(); } };
  $b("#blEdBright").oninput = (ev) => { ED.e.bright = +ev.target.value; edDraw(); };
  $b("#blEdContrast").oninput = (ev) => { ED.e.contrast = +ev.target.value; edDraw(); };
  $b("#blEdClear").onclick = () => { ED.e.blurs = []; edDraw(); };
  $b("#blEdFace").onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = "찾는 중…";
    try { const f = await findFaces(ED.p); ED.e.blurs.push(...f); ED.faced = true; toast(f.length ? `얼굴 ${f.length}개를 찾았어요` : "찾은 얼굴이 없어요. 직접 칠해 주세요"); }
    catch (e) { console.error(e); toast("얼굴 찾기를 불러오지 못했어요"); }
    ev.target.disabled = false; ev.target.textContent = "🙂 얼굴 자동 찾기"; edDraw();
  };
  $b("#blEdCancel").onclick = () => $b("#blEditDlg").close();
  $b("#blEdSave").onclick = async () => {
    const p = ED.p; p.edits = ED.e; p.note = $b("#blEdNote").value.trim(); p.faced = true; // 편집 창에서 직접 봤으면 확인한 것으로
    await bake(p); $b("#blEditDlg").close(); renderThumbs(); if (BL.post) renderOut();
  };
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
  return `<div class="blk photo" draggable="true" data-i="${i}">${tools}<span class="tag">사진 ${pad(n)}</span>
    <figure>${p ? `<img src="${p.url}" alt="">` : `<div class="ph">📷 ${esc(b.text || "안 쓴 사진을 여기로 끌어다 놓으세요")}${b.pid ? "<br><small>원본은 처음 만든 기기에만 있어요</small>" : ""}</div>`}</figure>
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
    <div class="blpaper" id="blPaper">${X.blocks.map((b, i) => blockHtml(b, i, b.type === "photo" ? ++n : n)).join("")}</div>
    <div class="bltags" id="blTags" contenteditable="true">${esc((X.hashtags ?? []).map((t) => "#" + String(t).replace(/^#/, "")).join(" "))}</div>
    <details style="margin-top:10px"><summary class="mut">🔁 AI 자체 검수 메모</summary><div class="mut" style="white-space:pre-wrap;margin-top:6px">${esc(X.self_review)}</div></details>
    <h3 style="margin:16px 0 4px">🚦 발행 전 점검</h3><div class="blcheck" id="blCheck"></div>
    <div class="blacts">
      <button type="button" class="btn" id="blCopy">📋 본문 복사</button><button type="button" class="btn ghost" id="blCopyTitle">제목 복사</button>
      <button type="button" class="btn ghost" id="blPhotos">🖼 사진 번호대로 받기</button><button type="button" class="btn ghost" id="blTagsCopy"># 해시태그 복사</button>
      <button type="button" class="btn ghost" id="blCopyAll" title="사진까지 한 번에 붙여넣기 (스마트에디터에서 안 될 수 있어요)">🧪 사진까지 통째 복사</button>
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
const dataUrl = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
async function richHtml(embed) {
  const lines = (t) => String(t).split("\n").map((l) => `<p>${l.trim() ? esc(l) : "<br>"}</p>`).join("");
  let n = 0; const out = [];
  for (const b of BL.post.blocks) {
    if (b.type === "text") out.push(lines(b.text));
    else if (b.type === "quote") out.push(`<blockquote><p><b>${esc(b.text)}</b></p></blockquote>`);
    else if (b.type === "divider") out.push("<hr>");
    else if (b.type === "map") out.push(`<p>📍 [지도: ${esc(P().display || BL.teamName)}]</p>`);
    else { n++; const p = photoOf(b.pid); out.push(embed && p ? `<p><img src="${await dataUrl(p.blob)}" alt=""></p>${b.caption ? `<p>${esc(b.caption)}</p>` : ""}` : `<p>📷 사진 ${pad(n)}${b.caption ? ` — ${esc(b.caption)}` : ""}</p>`); }
    out.push("<p><br></p>");
  }
  out.push(`<p>${esc(tagsText())}</p>`);
  return out.join("");
}
// html 은 Promise 로 받는다: Safari 는 클릭 직후 await 없이 clipboard.write 를 불러야 해서 내용은 나중에 채움
async function copy(text, html) {
  try {
    if (html && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ "text/html": html.then((h) => new Blob([h], { type: "text/html" })), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    else await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select();
    const ok = document.execCommand("copy"); t.remove(); if (!ok) toast("복사하지 못했어요. 길게 눌러 직접 복사해 주세요"); return ok;
  }
}
async function photosOut() {
  const list = []; let n = 0;
  BL.post.blocks.forEach((b) => { if (b.type === "photo") { n++; const p = photoOf(b.pid); if (p) list.push(new File([p.blob], `${pad(n)}.jpg`, { type: "image/jpeg" })); } });
  if (!list.length) return toast("시안에 들어간 사진이 없어요");
  if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare?.({ files: list })) {
    try { await navigator.share({ files: list }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  await loadScript(JSZIP);
  const zip = new JSZip(); list.forEach((f) => zip.file(f.name, f));
  const a = document.createElement("a"); a.href = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
  a.download = `${BL.teamName}_${today()}_사진${list.length}장.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`사진 ${list.length}장을 01, 02… 번호대로 받았어요`);
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
  if (placed.length) add(unfaced ? "warn" : "ok", unfaced ? `얼굴 확인 안 한 사진 ${unfaced}장 — 🙂 얼굴 자동 모자이크 또는 [편집]` : "사진 얼굴 확인 완료");
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
async function savePost(silent) {
  const X = BL.post; if (!X) return;
  const row = { team_id: BL.team, title: X.titles[X.sel] ?? "", keyword: X.main_keyword ?? "", body: bodyText(), post: X, updated_at: new Date().toISOString() };
  if (BL.postId) { const { error } = await sb.from("blog_posts").update(row).eq("id", BL.postId); if (!fail(error) && !silent) toast("저장했어요"); }
  else { const { data, error } = await sb.from("blog_posts").insert(row).select("id").single(); if (!fail(error)) { BL.postId = data.id; if (!silent) toast("보관함에 저장했어요"); } }
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
      <td>${mine.filter((x) => x.kind === "write").length}</td><td>${mine.filter((x) => x.kind === "convert" || x.kind === "style").length}</td><td>$${cost.toFixed(2)} <small class="mut">(약 ${Math.round(cost * 1400).toLocaleString()}원)</small></td></tr>`;
  });
  $b("#blBody").innerHTML = `<div class="card"><table class="blusage"><tr><th>지점</th><th>오늘 / 하루 제한</th><th>이번 달 글</th><th>변환·스타일</th><th>이번 달 AI 비용</th></tr>${rows.join("")}</table>
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
  $b("#blTeam").onchange = (ev) => { BL.team = +ev.target.value; try { localStorage.setItem("blog-team", ev.target.value); } catch {} BL.profile = null; BL.post = null; BL.postId = null; BL.sim = null; BL.kw = null; BL.load(); };
  v.addEventListener("paste", pasteAsText);
  wireEditor();
  v.addEventListener("click", async (ev) => {
    const t = ev.target, d = t.dataset ?? {}, X = BL.post;
    if (d.bt) { if (BL.tab === "new" && X) await savePost(true); BL.tab = d.bt; return renderTab(); }
    if (d.mode) { BL.opts.mode = d.mode; return syncMode(); }
    if (t.closest("#blDrop")) return $b("#blFile").click();
    if (d.rm) { BL.photos = BL.photos.filter((p) => p.id !== +d.rm); renderThumbs(); presetWhy(); if (X) renderOut(); return; }
    if (d.ed) return openEditor(+d.ed);
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
    if (t.id === "blCopy") { if (await copy(plainText(), richHtml(false))) toast("본문 복사! 스마트에디터 본문에 붙여넣고 📷 사진 01 자리에 01번 사진을 올리세요"); return; }
    if (t.id === "blCopyAll") { t.textContent = "🧪 준비 중…"; const ok = await copy(plainText(), richHtml(true)); t.textContent = "🧪 사진까지 통째 복사"; if (ok) toast("사진까지 복사했어요. 스마트에디터에서 사진이 빠지면 [본문 복사]로 해 주세요"); return; }
    if (t.id === "blCopyTitle") { if (await copy(X.titles[X.sel])) toast("제목 복사했어요"); return; }
    if (t.id === "blTagsCopy") { if (await copy(tagsText())) toast("해시태그 복사했어요"); return; }
    if (t.id === "blPhotos") return photosOut();
    if (t.id === "blConv") return convert();
    if (t.id === "blSave") return savePost(false);
    if (d.open) {
      const { data, error } = await sb.from("blog_posts").select("id, post").eq("id", +d.open).single();
      if (fail(error)) return;
      BL.post = data.post; BL.postId = data.id; BL.sim = null; BL.tab = "new"; return renderTab();
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
  });
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
    ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", "pallo");
    (th || sp || bk).classList.add("dragging");
  });
  v.addEventListener("dragend", () => { drag = null; v.querySelectorAll(".dragging, .dropbefore, .dropon").forEach((x) => x.classList.remove("dragging", "dropbefore", "dropon")); });
  v.addEventListener("dragover", (ev) => {
    const drop = ev.target.closest?.("#blDrop, #blThumbs");
    if (ev.dataTransfer.types.includes("Files") && drop) { ev.preventDefault(); $b("#blDrop")?.classList.add("over"); return; }
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
    if (ev.dataTransfer.files?.length && ev.target.closest?.("#blDrop, #blThumbs")) { ev.preventDefault(); return addFiles([...ev.dataTransfer.files]); }
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
