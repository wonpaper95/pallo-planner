// 📚 매니저 교육 탭: 신입 매니저 8주(INTRO~8주차) 교육 진행·평가.
// 내용은 edu-data.js(EDU_WEEKS·EDU_ITEMS), 사람마다 달라지는 것은 DB(edu_*).
// 신입 = 자기 진행 체크 + 산출물 제출. 대표 = 사람 고르기 + 등급·코멘트 + 피드백 기록 + 평가서.
// 평가는 RLS 로 대표만 읽는다(합격기준 글은 모두에게 보임 — 평가받기 전에 기준을 안다).
// index.html 의 sb·me·uid()·isBoss·previewUser·esc·toast·fail 을 씀 → window.EDU
(() => {
const EDU = (window.EDU = { target: null, openWeek: null, openItem: null, data: null, split: false });
const V = () => document.getElementById("eduView");
const W = () => globalThis.EDU_WEEKS || [];
const ITEMS = () => globalThis.EDU_ITEMS || [];
const byWeek = (w) => ITEMS().filter((i) => i.week === w);
const LEVELS = [["0", "미달"], ["1", "기본"], ["2", "우수"]];
const AXES = { ops: "운영정확도", sales: "영업·협상력", data: "데이터 판단력", own: "자기주도", people: "사람관리", mkt: "마케팅 실행력" };
const BOOKS = [["book1", "어떻게 원하는 것을 얻는가", "INTRO~2주차"], ["book2", "일의 격", "3주차"], ["book3", "데일 카네기 인간관계론", "5~7주차"]];
const KPIS = [["revenue", "매출"], ["callback", "회신율"], ["consult", "상담율"], ["payment", "결제율"]];
const TOOLS = [["notion", "Notion"], ["ai", "Claude/Gemini"], ["clovanote", "Clovanote"], ["discord", "Discord"], ["colortag", "Mac 컬러태그"], ["rectangle", "Rectangle"], ["icloud", "iCloud 공유"], ["gmail", "Gmail 라벨"]];
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const normUrl = (u) => (/^https?:\/\//i.test(u) ? u : "https://" + u);
// Storage 키는 ASCII 만 받는다(한글 파일명이면 거절) → 안전한 이름으로 바꿔 올리고, 보이는 이름은 사용자가 적은 제목을 쓴다
const safeKey = (name) => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || ""); const ext = m ? "." + m[1].toLowerCase() : ""; const base = (name || "file").slice(0, 40).replace(/\.[^.]*$/, "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, ""); return `${Date.now()}_${base || "file"}${ext}`; };

// 대표가 보는 대상자(없으면 본인). 매니저는 언제나 자기 것.
const who = () => (EDU.canPick() ? EDU.target : uid());
EDU.canPick = () => isBoss && !previewUser;

EDU.load = async function () {
  try { EDU.split = !!localStorage.getItem("edu-split"); } catch {}
  const mine = who();
  if (EDU.canPick() && !mine) {
    const { data: ppl, error } = await sb.rpc("edu_people");
    if (fail(error)) return;
    EDU.people = ppl || [];
    try { EDU.target = localStorage.getItem("edu-target") || null; } catch {}
    if (!EDU.people.some((p) => p.user_id === EDU.target)) EDU.target = EDU.people[0]?.user_id ?? null;
    if (!EDU.target) { V().innerHTML = `<div class="card mut">교육할 매니저가 아직 없어요. 매니저가 가입하면 여기에서 고를 수 있어요.</div>`; return; }
    return EDU.load();
  }
  if (EDU.canPick() && !EDU.people) { const { data: ppl } = await sb.rpc("edu_people"); EDU.people = ppl || []; }

  const admin = EDU.canPick();
  const [prog, meta, refs, subs, evals, fbs] = await Promise.all([
    sb.from("edu_progress").select("item_id, status").eq("user_id", mine),
    sb.from("edu_meta").select("*").eq("user_id", mine).maybeSingle(),
    sb.from("edu_refs").select("*").order("created_at"),
    sb.from("edu_submits").select("*").eq("user_id", mine).order("created_at"),
    admin ? sb.from("edu_eval").select("*").eq("user_id", mine) : Promise.resolve({ data: [] }),
    admin ? sb.from("edu_feedback").select("*").eq("user_id", mine).order("day") : Promise.resolve({ data: [] }),
  ]);
  if (fail(prog.error) || fail(refs.error)) return;

  const d = (EDU.data = {
    admin, mine,
    status: Object.fromEntries((prog.data || []).map((r) => [r.item_id, r.status])),
    meta: meta.data || { improvements: 0, books: {}, kpi: {}, tools: {}, started_on: null },
    refs: refs.data || [],
    subs: subs.data || [],
    evals: Object.fromEntries((evals.data || []).map((r) => [r.item_id, r])),
    fbs: fbs.data || [],
  });

  // 지워진 항목에 평가가 남아 있으면 알려 준다(내용 파일에서 항목을 뺀 경우).
  const known = new Set(ITEMS().map((i) => i.id));
  d.orphans = Object.keys(d.evals).filter((id) => !known.has(id));

  V().innerHTML = head(d) + (d.orphans.length ? orphanBar(d) : "") + mission(d) + W().map((w) => weekCard(w, d)).join("") + report(d);
  bind(d);
};

// ── 위 칸: 대상자·진행률 ──
function head(d) {
  const all = ITEMS().length, done = ITEMS().filter((i) => d.status[i.id] === "done").length;
  const start = d.meta.started_on;
  const dday = start ? Math.floor((Date.now() - new Date(start + "T00:00:00+09:00").getTime()) / 86400000) : null;
  const pick = d.admin
    ? `<select id="eduWho">${(EDU.people || []).map((p) => `<option value="${p.user_id}" ${p.user_id === EDU.target ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`
    : `<b>${esc(myName || "내 교육")}</b>`;
  return `<section class="edutop card">
    <div class="edubar">
      <div class="eduwho">📚 매니저 교육 ${pick}</div>
      <label class="mut edustart">시작일 <input type="date" id="eduStart" value="${start || ""}" ${d.admin ? "disabled" : ""}></label>
      ${dday === null ? "" : `<span class="mut">D+${dday} / 56일</span>`}
      <span class="grow"></span>
      ${d.admin ? `<button class="btn ghost ${EDU.split ? "on" : ""}" id="eduSplitBtn" title="항목을 펼치면 매니저 화면과 대표 칸을 나란히 보여 줘요">👀 매니저 화면 같이 보기${EDU.split ? " 끄기" : ""}</button>` : ""}
      ${d.admin ? `<button class="btn ghost" id="eduRepBtn">🧾 평가서</button>` : ""}
    </div>
    <div class="edubarline"><div style="width:${Math.round((done / all) * 100)}%"></div></div>
    <div class="mut">전체 ${done} / ${all} 항목 완료${d.admin ? " · 평가는 대표만 보여요" : " · 합격기준은 항목을 펼치면 볼 수 있어요"}</div>
  </section>`;
}

function orphanBar(d) {
  return `<div class="card eduwarn">내용에서 빠진 항목에 평가 기록이 남아 있어요: ${d.orphans.map(esc).join(", ")} — 항목을 되살리거나 그 평가를 지워 주세요.</div>`;
}

// ── 장기 미션 ──
function mission(d) {
  const m = d.meta, ro = !d.admin ? "" : "disabled";
  const n = m.improvements || 0;
  return `<section class="card edumission">
    <h3>장기 미션</h3>
    <div class="edugrid">
      <div>
        <b>지점 개선안 50개</b>
        <div class="eduline"><input type="number" id="eduImp" min="0" max="50" value="${n}" ${ro}> / 50</div>
        <div class="edubarline sm"><div style="width:${Math.min(100, n * 2)}%"></div></div>
        <span class="mut">10개마다 한 칸 — 지금 ${Math.floor(n / 10)}/5</span>
      </div>
      <div><b>필독서 3권</b>${BOOKS.map(([k, t, when]) => {
        const b = (m.books || {})[k] || {};
        return `<div class="eduline"><span>${esc(t)} <span class="mut">${when}</span></span>${["start:시작", "done:완독", "summary:요약제출"].map((s) => { const [f, lb] = s.split(":"); return `<label class="mut"><input type="checkbox" data-book="${k}" data-f="${f}" ${b[f] ? "checked" : ""} ${ro}> ${lb}</label>`; }).join("")}</div>`;
      }).join("")}</div>
      <div><b>KPI</b><table class="edukpi"><tr><td></td><td class="mut">목표</td><td class="mut">기준선</td><td class="mut">현재</td></tr>
        ${KPIS.map(([k, name]) => { const v = (m.kpi || {})[k] || {}; return `<tr><td>${name}</td>${["target", "base", "current"].map((f) => `<td><input data-kpi="${k}" data-f="${f}" value="${esc(v[f] || "")}" ${ro}></td>`).join("")}</tr>`; }).join("")}
      </table><span class="mut">4주차에 기준선을 재고, 8주차에 그 대비 증감으로 본다</span></div>
      <div><b>업무 툴 세팅</b>${TOOLS.map(([k, name]) => `<label class="eduline mut"><input type="checkbox" data-tool="${k}" ${(m.tools || {})[k] ? "checked" : ""} ${ro}> ${esc(name)}</label>`).join("")}</div>
    </div>
  </section>`;
}

// ── 주차 카드 ──
function weekCard(w, d) {
  const items = byWeek(w.week), done = items.filter((i) => d.status[i.id] === "done").length;
  const open = EDU.openWeek === w.week;
  const refs = d.refs.filter((r) => r.week === w.week);
  if (!open) return `<section class="card eduweek" data-week="${w.week}"><div class="eduwk"><button class="eduwkbtn">▸ <b>${esc(w.label)}</b> <span class="mut">${esc(w.theme)}</span></button><span class="mut">${done}/${items.length}</span></div></section>`;
  return `<section class="card eduweek open" data-week="${w.week}">
    <div class="eduwk"><button class="eduwkbtn">▾ <b>${esc(w.label)}</b> <span class="mut">${esc(w.theme)}</span></button><span class="mut">${done}/${items.length}</span></div>
    <ul class="edugoals">${w.goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
    <div class="mut edureport">📋 보고: ${esc(w.report)}</div>
    <div class="edurefs">
      <b>📎 주차 자료</b>
      ${refs.length ? refs.map((r) => refRow(r, d)).join("") : `<span class="mut">아직 없어요.</span>`}
      ${d.admin ? `<form class="edureff" data-week="${w.week}"><input name="title" placeholder="자료 이름" maxlength="120" required><input name="url" placeholder="링크 (https://…) — 파일만 올릴 땐 비워 두세요"><label class="btn ghost eduup">📁 파일<input type="file" hidden name="file"></label><button class="btn">추가</button></form>` : ""}
    </div>
    <div class="eduitems">${items.map((i) => itemRow(i, d)).join("")}</div>
  </section>`;
}

function refRow(r, d) {
  // 공개 주소는 손으로 만들지 말고 SDK 가 주는 것을 쓴다(직접 조립하면 404)
  const href = r.url || sb.storage.from("edu-materials").getPublicUrl(r.path).data.publicUrl;
  return `<div class="eduref" data-id="${r.id}"><a href="${esc(href)}" target="_blank" rel="noopener">${r.path ? "📄" : "🔗"} ${esc(r.title)}</a>${d.admin ? `<button class="btn ghost edurefdel" title="지우기">🗑</button>` : ""}</div>`;
}

function itemRow(i, d) {
  const st = d.status[i.id] || "todo", open = EDU.openItem === i.id, ev = d.evals[i.id];
  const mark = st === "done" ? "✓" : st === "doing" ? "·" : "";
  return `<div class="eduitem ${st} ${i.report ? "rep" : ""}" data-id="${i.id}">
    <div class="eduhead">
      <button class="edust ${st}" title="미착수 → 하는 중 → 끝">${mark}</button>
      <button class="edutitle">${esc(i.title)}</button>
      ${i.required ? `<span class="tag">필수</span>` : ""}${i.report ? `<span class="tag rep">보고</span>` : ""}
      <span class="tag">${esc(i.cat)}</span>
      ${d.admin && ev ? `<span class="tag lv${ev.level}">${LEVELS[ev.level][1]}</span>` : ""}
    </div>
    ${open ? detail(i, d) : ""}
  </div>`;
}

function detail(i, d) {
  // 대표가 "매니저한테는 이게 어떻게 보이지?"를 확인하려고 앱 전체를 미리보기로 바꾸지 않아도 되게,
  // 같이 보기를 켜면 한 항목 안에서 매니저 화면(왼쪽)과 대표 전용 칸(오른쪽)을 나란히 보여 준다.
  const side = d.admin && EDU.split;
  const mgr = mgrPane(i, d, side);
  if (!d.admin) return `<div class="edudetail">${mgr}</div>`;
  const boss = bossPane(i, d);
  if (!side) return `<div class="edudetail">${mgr}${boss}</div>`;
  return `<div class="edudetail edusplit">
    <div class="edupane mgr"><div class="edupanetag">🧑‍💼 매니저가 보는 화면</div>${mgr}</div>
    <div class="edupane boss"><div class="edupanetag">👑 대표만 보는 칸</div>${boss}</div>
  </div>`;
}

// 양쪽이 똑같이 보는 부분. side 가 켜져 있으면 제출 폼을 '매니저에겐 이렇게 보인다'는 설명용으로 잠가서 보여 준다.
function mgrPane(i, d, side) {
  const subs = d.subs.filter((s) => s.item_id === i.id);
  let h = `<div><b>목표</b><br>${esc(i.goal)}</div>
    <div><b>진행법</b><ol>${i.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>
    <div><b>산출물</b><br>${esc(i.output)}</div>
    <div class="educrit"><b>합격기준</b>
      <div><span class="tag lv0">미달</span> ${esc(i.criteria.fail)}</div>
      <div><span class="tag lv1">기본</span> ${esc(i.criteria.base)}</div>
      <div><span class="tag lv2">우수</span> ${esc(i.criteria.good)}</div></div>`;
  if (i.refs?.length) h += `<div><b>참고자료</b><br>${i.refs.map((r) => { const u = r.url || r, lb = r.label || String(u).split("/").pop(); return /^https?:/i.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(lb)}</a>` : `<span class="mut">${esc(lb)} <small>(교육 폴더 파일 — 주차 자료로 올려 주세요)</small></span>`; }).join("<br>")}</div>`;
  h += `<div class="edusubs"><b>📤 제출물</b>
    ${subs.length ? subs.map((s) => `<div class="edusub" data-id="${s.id}" data-path="${esc(s.path || "")}"><a href="${s.url ? esc(s.url) : "#"}" ${s.url ? 'target="_blank" rel="noopener"' : 'class="edusubfile"'}>${s.path ? "📄" : "🔗"} ${esc(s.title)}</a><button class="btn ghost edusubdel" title="지우기">🗑</button></div>`).join("") : `<span class="mut">아직 없어요.</span>`}
    ${!d.admin ? `<form class="edusubf" data-id="${i.id}"><input name="title" placeholder="제출물 이름" maxlength="120" required><input name="url" placeholder="링크 (https://…) — 파일만 올릴 땐 비워 두세요"><label class="btn ghost eduup">📁 파일<input type="file" hidden name="file"></label><button class="btn">올리기</button></form>`
      : side ? `<form class="edusubf demo"><input placeholder="제출물 이름" disabled><input placeholder="링크 (https://…)" disabled><span class="btn ghost" aria-disabled="true">📁 파일</span><span class="btn" aria-disabled="true">올리기</span></form><div class="mut">매니저는 여기에 산출물을 올려요 (대표 화면에서는 안 눌려요)</div>` : ""}
  </div>`;
  return h;
}

// 대표만 보는 부분 — 확인 질문과 평가.
function bossPane(i, d) {
  const ev = d.evals[i.id] || {};
  return `<div class="eduadmin">
      ${EDU.split ? "" : `<div class="mut">대표 전용</div>`}
      ${i.leaderQ?.length ? `<div><b>확인 질문</b><ul>${i.leaderQ.map((q) => `<li>${esc(q)}</li>`).join("")}</ul></div>` : ""}
      <div class="eduev"><b>평가</b> ${LEVELS.map(([v, lb]) => `<label><input type="radio" name="ev-${i.id}" data-ev="${i.id}" value="${v}" ${String(ev.level) === v ? "checked" : ""}> ${lb}</label>`).join("")}</div>
      <textarea data-evc="${i.id}" rows="2" placeholder="관찰한 사실을 적어요 (예: 3차 연습에서 스크립트 4개 구간 누락)">${esc(ev.comment || "")}</textarea>
      <div class="mut">${ev.rated_on ? `평가일 ${ev.rated_on}${ev.updated_on && ev.updated_on !== ev.rated_on ? ` (최종 수정 ${ev.updated_on})` : ""}` : "아직 평가 전"}</div>
    </div>`;
}


// ── 평가서 ──
function report(d) {
  if (!d.admin) return "";
  const rated = ITEMS().filter((i) => d.evals[i.id]);
  const ax = {}; Object.keys(AXES).forEach((k) => (ax[k] = { got: 0, max: 0, n: 0, all: 0 }));
  const un = { got: 0, max: 0, n: 0, all: 0 };
  ITEMS().forEach((i) => {
    const slot = AXES[i.axis] ? ax[i.axis] : un; slot.all++;
    const e = d.evals[i.id]; if (!e) return;
    slot.n++; slot.got += e.level * i.weight; slot.max += 2 * i.weight;
  });
  const fails = ITEMS().filter((i) => d.evals[i.id]?.level === 0);
  const pct = (s) => (s.max ? Math.round((s.got / s.max) * 100) + "%" : "미평가");
  const name = (EDU.people || []).find((p) => p.user_id === d.mine)?.name || "";
  const wlabel = (w) => W().find((x) => x.week === w)?.label || w;
  return `<div id="eduReport">
    <h2>매니저 교육 최종 평가서</h2>
    <table><tr><th>성명</th><td>${esc(name)}</td><th>교육기간</th><td>${esc(d.meta.started_on || "")} ~ (8주)</td></tr>
      <tr><th>작성일</th><td>${today()}</td><th>평가 진행률</th><td>${rated.length} / ${ITEMS().length} 항목</td></tr></table>
    <h2>역량별 평가</h2>
    <table><tr><th>역량</th><th>점수</th><th>백분율</th><th>평가/전체</th></tr>
      ${Object.entries(AXES).map(([k, nm]) => `<tr><td>${nm}</td><td>${ax[k].got} / ${ax[k].max}</td><td>${pct(ax[k])}</td><td>${ax[k].n} / ${ax[k].all}</td></tr>`).join("")}</table>
    <table><tr><th>축 미분류 (필독서·업무 툴)</th><th>점수</th><th>백분율</th><th>평가/전체</th></tr>
      <tr><td>역량 점수에 포함되지 않음</td><td>${un.got} / ${un.max}</td><td>${pct(un)}</td><td>${un.n} / ${un.all}</td></tr></table>
    <h2>주차별 이수 현황</h2>
    <table><tr><th>주차</th><th>완료</th><th>이수율</th></tr>
      ${W().map((w) => { const it = byWeek(w.week), dn = it.filter((i) => d.status[i.id] === "done").length; return `<tr><td>${esc(w.label)} ${esc(w.theme)}</td><td>${dn} / ${it.length}</td><td>${Math.round((dn / it.length) * 100)}%</td></tr>`; }).join("")}</table>
    <h2>미달 항목</h2>
    ${fails.length ? `<table><tr><th>주차</th><th>항목</th><th>미달 기준</th><th>평가 내용</th><th>평가일</th></tr>
      ${fails.map((i) => { const e = d.evals[i.id]; return `<tr><td>${esc(wlabel(i.week))}</td><td>${esc(i.title)}</td><td>${esc(i.criteria.fail)}</td><td>${esc(e.comment || "")}</td><td>${esc(e.rated_on)}</td></tr>`; }).join("")}</table>`
      : `<p>미달로 평가된 항목이 없습니다.</p>`}
    <h2>피드백 제공 이력</h2>
    ${d.fbs.length ? `<table><tr><th>일자</th><th>주차</th><th>방식</th><th>내용</th></tr>
      ${d.fbs.map((f) => `<tr><td>${esc(f.day)}</td><td>${esc(wlabel(f.week))}</td><td>${esc(f.method)}</td><td>${esc(f.note)}</td></tr>`).join("")}</table>`
      : `<p class="red">기록된 피드백 제공 이력이 없습니다. 평가 근거로 쓰기 전에 실제 피드백 이력을 남기세요.</p>`}
    <div class="edufb no-print"><b>피드백 기록 남기기</b>
      <form id="eduFbForm"><input type="date" name="day" value="${today()}"><select name="week">${W().map((w) => `<option value="${w.week}">${esc(w.label)}</option>`).join("")}</select>
      <select name="method"><option>면담</option><option>서면</option><option>구두</option></select>
      <input name="note" placeholder="전달한 내용 요지" maxlength="500" required><button class="btn">기록 추가</button></form></div>
    <h2>종합 소견</h2>
    <textarea id="eduFinal" rows="6" placeholder="종합 소견"></textarea>
    <div class="edusign"><div>평가자 (대표) 서명 / 일자</div><div>피평가자 (매니저) 확인 / 일자</div></div>
    <div class="no-print" style="margin-top:16px"><button class="btn" id="eduPrint">인쇄 / PDF 저장</button> <button class="btn ghost" id="eduRepClose">닫기</button></div>
  </div>`;
}

// ── 동작 ──
function bind(d) {
  const V0 = V();
  const save = async (patch) => { const { error } = await sb.from("edu_meta").upsert({ user_id: d.mine, ...patch, updated_at: new Date().toISOString() }); if (!fail(error)) EDU.load(); };

  V0.querySelector("#eduWho")?.addEventListener("change", (e) => { EDU.target = e.target.value; try { localStorage.setItem("edu-target", EDU.target); } catch {} EDU.openItem = null; EDU.load(); });
  V0.querySelector("#eduStart")?.addEventListener("change", (e) => save({ started_on: e.target.value || null }));
  V0.querySelector("#eduImp")?.addEventListener("change", (e) => save({ improvements: Math.max(0, Math.min(50, +e.target.value || 0)) }));
  V0.querySelectorAll("[data-book]").forEach((c) => (c.onchange = () => { const b = { ...(d.meta.books || {}) }; b[c.dataset.book] = { ...(b[c.dataset.book] || {}), [c.dataset.f]: c.checked }; save({ books: b }); }));
  V0.querySelectorAll("[data-kpi]").forEach((inp) => (inp.onchange = () => { const k = { ...(d.meta.kpi || {}) }; k[inp.dataset.kpi] = { ...(k[inp.dataset.kpi] || {}), [inp.dataset.f]: inp.value }; save({ kpi: k }); }));
  V0.querySelectorAll("[data-tool]").forEach((c) => (c.onchange = () => save({ tools: { ...(d.meta.tools || {}), [c.dataset.tool]: c.checked } })));

  V0.querySelectorAll(".eduwkbtn").forEach((b) => (b.onclick = () => { const w = +b.closest(".eduweek").dataset.week; EDU.openWeek = EDU.openWeek === w ? null : w; EDU.load(); }));
  V0.querySelectorAll(".edutitle").forEach((b) => (b.onclick = () => { const id = b.closest(".eduitem").dataset.id; EDU.openItem = EDU.openItem === id ? null : id; EDU.load(); }));

  const NEXT = { todo: "doing", doing: "done", done: "todo" };
  V0.querySelectorAll(".edust").forEach((b) => (b.onclick = async () => {
    if (d.admin) return toast("진행 체크는 교육받는 매니저가 해요");
    const id = b.closest(".eduitem").dataset.id, next = NEXT[d.status[id] || "todo"];
    const { error } = next === "todo"
      ? await sb.from("edu_progress").delete().eq("user_id", d.mine).eq("item_id", id)
      : await sb.from("edu_progress").upsert({ user_id: d.mine, item_id: id, status: next, updated_at: new Date().toISOString() });
    if (!fail(error)) EDU.load();
  }));

  // 평가 (대표)
  V0.querySelectorAll("[data-ev]").forEach((r) => (r.onchange = async () => {
    const id = r.dataset.ev, prev = d.evals[id];
    const row = { user_id: d.mine, item_id: id, level: +r.value, comment: prev?.comment || "", updated_on: today(), rated_by: me.id };
    if (!prev) row.rated_on = today();                       // 최초 평가일은 한 번만 찍고 그대로 둔다
    const { error } = await sb.from("edu_eval").upsert(row);
    if (!fail(error)) EDU.load();
  }));
  V0.querySelectorAll("[data-evc]").forEach((t) => (t.onchange = async () => {
    const id = t.dataset.evc, prev = d.evals[id];
    if (!prev) return toast("등급을 먼저 골라 주세요");
    const { error } = await sb.from("edu_eval").update({ comment: t.value, updated_on: today() }).eq("user_id", d.mine).eq("item_id", id);
    if (fail(error)) return; toast("평가 내용을 저장했어요");
  }));

  // 주차 자료 (대표)
  V0.querySelectorAll(".edureff").forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const week = +f.dataset.week, title = f.title.value.trim(), url = f.url.value.trim(), file = f.file.files[0];
    if (!url && !file) return toast("링크를 넣거나 파일을 고르세요");
    let path = null;
    if (file) { path = `${week}/${safeKey(file.name)}`; const { error } = await sb.storage.from("edu-materials").upload(path, file); if (fail(error)) return; }
    const { error } = await sb.from("edu_refs").insert({ week, title, url: url ? normUrl(url) : null, path });
    if (fail(error)) return; toast("주차 자료에 올렸어요"); EDU.load();
  }));
  V0.querySelectorAll(".edurefdel").forEach((b) => (b.onclick = async () => {
    const row = b.closest(".eduref"), r = d.refs.find((x) => x.id == row.dataset.id);
    if (!confirm(`'${r.title}' 자료를 지울까요?`)) return;
    if (r.path) await sb.storage.from("edu-materials").remove([r.path]);
    const { error } = await sb.from("edu_refs").delete().eq("id", r.id);
    if (!fail(error)) EDU.load();
  }));

  // 제출물 (신입)
  V0.querySelectorAll(".edusubf").forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const item_id = f.dataset.id, title = f.title.value.trim(), url = f.url.value.trim(), file = f.file.files[0];
    if (!url && !file) return toast("링크를 넣거나 파일을 고르세요");
    let path = null;
    if (file) { path = `${me.id}/${safeKey(file.name)}`; const { error } = await sb.storage.from("edu-submits").upload(path, file); if (fail(error)) return; }
    const { error } = await sb.from("edu_submits").insert({ item_id, title, url: url ? normUrl(url) : null, path });
    if (fail(error)) return; toast("제출했어요"); EDU.load();
  }));
  V0.querySelectorAll(".edusubdel").forEach((b) => (b.onclick = async () => {
    const row = b.closest(".edusub"), s = d.subs.find((x) => x.id == row.dataset.id);
    if (!confirm(`'${s.title}' 제출물을 지울까요?`)) return;
    if (s.path) await sb.storage.from("edu-submits").remove([s.path]);
    const { error } = await sb.from("edu_submits").delete().eq("id", s.id);
    if (!fail(error)) EDU.load();
  }));
  V0.querySelectorAll(".edusubfile").forEach((a) => (a.onclick = async (e) => {   // 비공개 버킷이라 열 때마다 서명 주소를 받는다
    e.preventDefault();
    const path = a.closest(".edusub").dataset.path;
    const { data, error } = await sb.storage.from("edu-submits").createSignedUrl(path, 600);
    if (fail(error)) return; window.open(data.signedUrl, "_blank", "noopener");
  }));

  // 평가서
  V0.querySelector("#eduSplitBtn")?.addEventListener("click", () => {
    EDU.split = !EDU.split;
    try { localStorage.setItem("edu-split", EDU.split ? "1" : ""); } catch {}
    EDU.load();
  });
  V0.querySelector("#eduRepBtn")?.addEventListener("click", async () => {
    const { data } = await sb.from("edu_final").select("note").eq("user_id", d.mine).maybeSingle();
    V0.querySelector("#eduFinal").value = data?.note || "";
    document.body.classList.add("edurep"); window.scrollTo(0, 0);
  });
  V0.querySelector("#eduRepClose")?.addEventListener("click", () => document.body.classList.remove("edurep"));
  V0.querySelector("#eduPrint")?.addEventListener("click", () => window.print());
  V0.querySelector("#eduFinal")?.addEventListener("change", async (e) => {
    const { error } = await sb.from("edu_final").upsert({ user_id: d.mine, note: e.target.value, updated_at: new Date().toISOString() });
    if (!fail(error)) toast("종합 소견을 저장했어요");
  });
  V0.querySelector("#eduFbForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, note = f.note.value.trim();
    if (!note) return toast("전달한 내용 요지를 적어야 기록이 의미가 있어요");
    const { error } = await sb.from("edu_feedback").insert({ user_id: d.mine, day: f.day.value, week: +f.week.value, method: f.method.value, note });
    if (fail(error)) return; toast("피드백 기록을 남겼어요"); f.note.value = ""; EDU.load();
  });
}
})();
