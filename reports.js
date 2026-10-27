// 📝 리포트 탭: 데일리 리포트(정식 매니저 교육, 10/27부터 한 달) · 주간 성장 리포트(매주, 미팅 전).
// 매니저는 양식대로 적고(0.7초 뒤 자동 저장) [제출] → 대표에게 푸시+카톡. 대표는 날짜(주)별로 지점·사람마다 모아 봄(읽기만).
// 쓰는 사람 = report_people(이름, 대표가 정함) — 다른 매니저는 탭이 안 보임. 쓰는 날: 데일리 = 수·일, 주간 성장 = 일 (일요일은 2개).
// index.html 의 sb·me·uid·isBoss·previewTeam·previewUser·previewName·myName·esc·toast·fail·today·DOW·inTeam 을 씀 → window.RP
(() => {
const RP = (window.RP = { kind: "daily", day: null, row: null, open: new Set(), names: new Set(), ok: false, todo: {} });
const DAILY_DAYS = [3, 0], WEEKLY_DAY = 0; // 수·일 / 일 (getDay: 0 = 일)
const V = () => document.getElementById("rpView");
const CONSULT = ["Premium", "Pro Max", "Pro", "Plus", "미등록"];
const MOODS = ["😄 매우 좋음", "🙂 괜찮음", "😐 보통", "😵 지침", "😢 많이 힘듦"];
const REVIEW_FORM = "https://forms.gle/TQwJQH9xZTpj97XY6";
const FORMS = {
  daily: {
    name: "데일리 리포트",
    note: `정식 매니저 교육 프로그램(10월 27일부터 한 달)의 일환입니다. 매일 업무를 돌아보며 스스로 성장하고, 개선할 점을 찾아 다음 날 업무에 반영하는 것이 목적이에요.
단순한 업무 일지가 아니라 정식 매니저로 성장하기 위한 교육 과정이니, 매일 빠짐없이 적어 주세요.`,
    fields: [
      ["learned", "1. 오늘 하루 배운 것", "오늘 한 업무를 나열하지 말고, 업무를 하면서 새롭게 배우거나 깨달은 점을 적어 주세요."],
      ["todo", "2. 오늘 완료하지 못해 내일로 미룬 업무", "마무리하지 못한 업무와 내일 진행해야 할 일을 구체적으로 적어 주세요."],
      ["ask", "3. 애매하거나 궁금한 점", "이해가 부족하거나 판단하기 어려웠던 부분, 추가로 질문하거나 확인해야 할 사항을 적어 주세요."],
      ["praise", "4. 오늘 하루 칭찬하고 싶은 일", "스스로 잘했다고 생각하는 일, 노력한 부분, 긍정적인 성과를 적어 주세요."],
    ],
  },
  weekly: {
    name: "주간 성장 리포트",
    note: `매주 1회, 미팅 전에 제출해 주세요 (약 10~15분).
★ 중요 원칙 (AI 사용 금지): 주간 리포트는 본인의 실제 생각과 경험을 스스로 정리하는 과정입니다. ChatGPT, Claude, Gemini 등 생성형 AI로 작성하지 마세요. '잘 꾸며진 답변'보다 실제 고민과 솔직한 생각이 더 중요해요.`,
    fields: [
      ["good", "1. 이번 주 가장 잘했다고 생각하는 것", "예시: 회원 응대, 신규회원 케어, 문제 해결, 분위기 메이킹, 이벤트 운영, 책임감 있는 행동 등"],
      ["regret", "2. 이번 주 가장 아쉬웠던 점", "예시: 감정 조절, 보고 누락, 시간관리, 회원 응대, 우선순위 설정 등"],
      ["worry", "3. 현재 가장 고민되는 문제", "예시: 업무 피로감, 관계 문제, 성장 방향 고민, 운영 고민, 고객 응대 스트레스 등"],
      ["goal", "4. 다음 주 개선 목표 (1개)", "목표는 많지 않아도 돼요. 가장 중요한 한 가지를 정해 주세요."],
      ["idea", "5. 회사에 제안하고 싶은 점 / 개선 아이디어", "예시: 운영 개선, 자동화, 콘텐츠 아이디어, 이벤트 제안, 고객 경험 개선, 분위기 개선 등"],
    ],
  },
};
const F = () => FORMS[RP.kind];
const md = (s) => { const d = W.parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
const hm = (t) => { const d = new Date(t); return `${md(W.ymd(d))} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`; };
const dow = (s) => W.parse(s).getDay(), dd = (s) => `${md(s)}(${DOW[dow(s)]})`;
const dayLabel = () => RP.kind === "daily" ? dd(RP.day) : `${md(RP.day)} ~ ${md(W.add(RP.day, 6))} 주 · ${dd(W.add(RP.day, 6))} 작성`;
// 데일리는 쓰는 날(수·일)끼리만 오감: n = -1 이전 · 1 다음
const stepDaily = (s, n) => { do s = W.add(s, n); while (!DAILY_DAYS.includes(dow(s))); return s; };
const thisDay = () => RP.kind === "daily" ? (DAILY_DAYS.includes(dow(today())) ? today() : stepDaily(today(), -1)) : W.monday(today());
const bossMode = () => isBoss && !previewUser;

// 부팅 때 한 번: 대상자만 탭 보이기 + 오늘 쓸 것 배지
RP.init = async function () {
  const { data } = await sb.from("report_people").select("name");
  RP.names = new Set((data ?? []).map((x) => x.name));
  RP.ok = bossMode() || RP.names.has(previewUser ? previewName : myName);
  document.querySelector('.seg [data-v="rp"]')?.classList.toggle("hidden", !RP.ok);
  if (RP.ok && !bossMode()) await RP.badge();
};
// 오늘 써야 하는 것: 수 = 데일리, 일 = 데일리 + 주간 성장. RP.todo = { daily: 제출했나, weekly: 제출했나 } (오늘 쓸 것만)
RP.badge = async function () {
  const t = today(), d = dow(t), need = { ...(DAILY_DAYS.includes(d) ? { daily: t } : {}), ...(d === WEEKLY_DAY ? { weekly: W.monday(t) } : {}) };
  RP.todo = {};
  if (Object.keys(need).length) {
    const { data } = await sb.from("reports").select("kind, day, submitted_at").eq("user_id", uid()).in("day", [...new Set(Object.values(need))]);
    for (const k in need) RP.todo[k] = !!(data ?? []).find((x) => x.kind === k && x.day === need[k] && x.submitted_at);
  }
  const left = Object.values(RP.todo).filter((x) => !x).length, b = document.getElementById("rpBadge");
  if (b) { b.textContent = left; b.classList.toggle("hidden", !left); }
};
// 📅 매니저 맨 위 안내: 쓰는 날 + 오늘 할 것
function todayCard() {
  const t = today(), d = dow(t), chip = (k, label) => `<button class="rpchip ${RP.todo[k] ? "ok" : ""}" data-k2="${k}">${RP.todo[k] ? "✅" : "⬜"} ${label}</button>`;
  let now;
  if (d === WEEKLY_DAY) now = `<b>오늘(일)은 리포트 2개를 써요</b> ${chip("daily", "① 데일리 리포트")} ${chip("weekly", "② 주간 성장 리포트")}`;
  else if (DAILY_DAYS.includes(d)) now = `<b>오늘(${DOW[d]})은 데일리 리포트 쓰는 날이에요</b> ${chip("daily", "데일리 리포트")}`;
  else { const n = stepDaily(t, 1); now = `오늘은 쓰는 날이 아니에요 · 다음은 <b>${dd(n)}</b> ${dow(n) === WEEKLY_DAY ? "데일리 + 주간 성장 2개" : "데일리"}`; }
  return `<div class="card rptoday"><div>📅 <b>쓰는 날</b> — 데일리: <b>수·일</b> · 주간 성장: <b>일요일</b> <span class="mut">(일요일은 2개 다 써요)</span></div><div class="rpnow">${now}</div></div>`;
}
// 상담 결과 숫자 → 'Premium 2명 / Pro 1명 / 미등록 1명'
const consultLine = (c = {}) => CONSULT.filter((k) => Number(c[k]) > 0).map((k) => `${k} ${c[k]}명`).join(" / ");
// 📋 복사용 글 (카톡·문서에 붙여넣기)
RP.text = function (kind, body, who) {
  const f = FORMS[kind], b = body ?? {};
  const out = [`[${f.name}] ${who ?? ""} ${dayLabel()}`.replace(/\s+/g, " ").trim(), ""];
  for (const [k, label] of f.fields) out.push(label, (b[k] ?? "").trim() || "-", "");
  if (kind === "daily") out.push("5. 오늘 상담 결과", consultLine(b.consult) || "상담 없음");
  else out.push("6. 현재 나의 컨디션", `선택: ${b.mood ?? "-"}`, `이유: ${(b.mood_why ?? "").trim() || "-"}`);
  return out.join("\n");
};

RP.load = async function () {
  RP.day ??= thisDay();
  if (bossMode()) return RP.loadBoss();
  if (!RP.ok) { V().innerHTML = `<div class="card mut">${esc(previewName || "이 계정")}은(는) 리포트 대상이 아니에요.</div>`; return; }
  await RP.badge();
  const { data, error } = await sb.from("reports").select("*").eq("user_id", uid()).eq("kind", RP.kind).eq("day", RP.day).maybeSingle();
  if (fail(error)) return;
  RP.row = data ?? { body: {} };
  RP.renderMine();
};

const head = (extra = "") => `<div class="rpbar"><h2>📝 리포트</h2>
  <div class="rpkind"><button data-k="daily" class="${RP.kind === "daily" ? "on" : ""}">데일리</button><button data-k="weekly" class="${RP.kind === "weekly" ? "on" : ""}">주간 성장</button></div>
  <div class="rpnav"><button class="btn ghost" data-go="-1" aria-label="이전">‹</button><b>${dayLabel()}</b><button class="btn ghost" data-go="1" aria-label="다음">›</button>
  ${RP.day !== thisDay() ? `<button class="btn ghost" data-go="0">${RP.kind === "daily" ? "오늘" : "이번 주"}</button>` : ""}</div>${extra}</div>`;
function wireHead() {
  V().querySelectorAll(".rpkind button").forEach((b) => (b.onclick = async () => {
    if (b.dataset.k === RP.kind) return; await RP.flush(); RP.kind = b.dataset.k; RP.day = thisDay(); RP.open.clear(); RP.load();
  }));
  V().querySelectorAll("[data-go]").forEach((b) => (b.onclick = async () => {
    await RP.flush(); const n = +b.dataset.go;
    RP.day = !n ? thisDay() : RP.kind === "daily" ? stepDaily(RP.day, n) : W.add(RP.day, n * 7); RP.open.clear(); RP.load();
  }));
  V().querySelectorAll("[data-k2]").forEach((b) => (b.onclick = async () => { await RP.flush(); RP.kind = b.dataset.k2; RP.day = thisDay(); RP.load(); }));
}

// ── 매니저: 내 리포트 쓰기 (대표가 '매니저 화면 그대로' 보는 중이면 보기만) ──
let saveT = null;
RP.renderMine = function () {
  const ro = !!previewUser, b = RP.row.body ?? {}, f = F();
  const area = (k, label, hint) => `<label class="rpq"><b>${label}</b><small>${esc(hint)}</small>
    <textarea data-f="${k}" rows="3" maxlength="3000" ${ro ? "readonly" : ""} placeholder="${ro ? "" : "여기에 적어 주세요"}">${esc(b[k] ?? "")}</textarea></label>`;
  const last = RP.kind === "daily"
    ? `<div class="rpq"><b>5. 오늘 상담 결과</b><small>상품별 등록 인원과 미등록 인원 숫자만 넣어 주세요. 상담 복기 글은 상담복기 폼에 매번 적어 주세요.</small>
        <div class="rpcons">${CONSULT.map((k) => `<label>${k}<input type="number" min="0" max="99" inputmode="numeric" data-c="${k}" value="${b.consult?.[k] ?? ""}" ${ro ? "readonly" : ""}></label>`).join("")}</div>
        <div class="rpline">📋 <span id="rpLine">${esc(consultLine(b.consult) || "아직 없음")}</span></div>
        <a class="btn ghost rpform" href="${REVIEW_FORM}" target="_blank" rel="noopener">✍️ 상담복기 폼 열기</a></div>`
    : `<div class="rpq"><b>6. 현재 나의 컨디션</b><small>하나 고르고 이유를 적어 주세요.</small>
        <div class="rpmood">${MOODS.map((m) => `<button type="button" data-m="${m}" class="${b.mood === m ? "on" : ""}" ${ro ? "disabled" : ""}>${m}</button>`).join("")}</div>
        <textarea data-f="mood_why" rows="2" maxlength="2000" ${ro ? "readonly" : ""} placeholder="${ro ? "" : "이유"}">${esc(b.mood_why ?? "")}</textarea></div>`;
  V().innerHTML = head() + todayCard() + `<div class="card rpnote">${esc(f.note).replace(/\n/g, "<br>")}</div>
    <div class="card rpform-card">${f.fields.map((x) => area(...x)).join("")}${last}</div>
    <div class="rpfoot"><span id="rpState" class="mut"></span>
      <button class="btn ghost" id="rpCopy">📋 복사</button>${ro ? "" : `<button class="btn" id="rpSubmit">${RP.row.submitted_at ? "✅ 제출함" : "📤 제출하기"}</button>`}</div>`;
  wireHead(); RP.state();
  V().querySelectorAll("textarea").forEach((t) => { grow(t); t.addEventListener("input", () => grow(t)); });
  V().querySelector("#rpCopy").onclick = () => copy(RP.text(RP.kind, RP.row.body, previewUser ? previewName : myName));
  if (ro) return;
  V().querySelectorAll("[data-f]").forEach((t) => (t.oninput = () => { RP.row.body = { ...RP.row.body, [t.dataset.f]: t.value }; RP.soon(); }));
  V().querySelectorAll("[data-c]").forEach((i) => (i.oninput = () => {
    const c = { ...(RP.row.body.consult ?? {}) }, n = parseInt(i.value, 10);
    if (n > 0) c[i.dataset.c] = n; else delete c[i.dataset.c];
    RP.row.body = { ...RP.row.body, consult: c }; V().querySelector("#rpLine").textContent = consultLine(c) || "아직 없음"; RP.soon();
  }));
  V().querySelectorAll("[data-m]").forEach((btn) => (btn.onclick = () => {
    RP.row.body = { ...RP.row.body, mood: btn.dataset.m };
    V().querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("on", x === btn)); RP.soon();
  }));
  V().querySelector("#rpSubmit").onclick = RP.submit;
};
const grow = (t) => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast("복사했어요 — 카톡·문서에 붙여넣기 하세요"); } catch { prompt("아래 글을 복사하세요", text); }
}
RP.state = function (msg) {
  const r = RP.row, s = V().querySelector("#rpState"); if (!s) return;
  s.textContent = msg ?? (r.submitted_at ? `제출 ${hm(r.submitted_at)}${r.updated_at > r.submitted_at ? ` · 고친 내용 저장 ${hm(r.updated_at)}` : ""}` : r.updated_at ? `임시 저장 ${hm(r.updated_at)} · 아직 제출 안 함` : "적는 대로 자동 저장돼요");
};
RP.soon = function () { clearTimeout(saveT); RP.state("저장 중…"); saveT = setTimeout(RP.save, 700); };
RP.flush = async function () { if (saveT) { clearTimeout(saveT); saveT = null; await RP.save(); } };
RP.save = async function (extra = {}) {
  saveT = null;
  const { data, error } = await sb.from("reports").upsert({ kind: RP.kind, day: RP.day, body: RP.row.body, updated_at: new Date().toISOString(), ...extra }, { onConflict: "user_id,kind,day" }).select().single();
  if (fail(error)) return false;
  RP.row = { ...data, body: RP.row.body }; RP.state(); return true; // 적는 중 바뀐 글은 화면 것을 유지
};
RP.submit = async function () {
  if (RP.row.submitted_at) return toast("이미 제출했어요. 고친 내용은 자동으로 저장돼요");
  const b = RP.row.body, f = F();
  const empty = f.fields.filter(([k]) => !(b[k] ?? "").trim()).map(([, l]) => l.split(".")[0] + "번");
  if (RP.kind === "weekly" && !b.mood) empty.push("6번(컨디션)");
  if (empty.length === f.fields.length) return toast("내용을 적고 제출해 주세요");
  if (empty.length && !confirm(`${empty.join(", ")} 칸이 비어 있어요. 그래도 제출할까요?`)) return;
  clearTimeout(saveT);
  if (!(await RP.save({ submitted_at: new Date().toISOString() }))) return;
  await RP.badge();
  const other = RP.kind === "daily" ? "weekly" : "daily", isToday = RP.day === (RP.kind === "daily" ? today() : W.monday(today()));
  toast(isToday && RP.todo[other] === false ? `제출했어요 — 오늘은 ${other === "weekly" ? "② 주간 성장" : "① 데일리"} 리포트도 써 주세요` : "제출했어요 — 대표님께 알림이 가요");
  RP.renderMine();
};

// ── 대표: 그날(그 주) 매니저 리포트 모아 보기 ──
RP.loadBoss = async function () {
  const [t, p, r] = await Promise.all([sb.from("teams").select("id, name, sort").order("sort"), sb.rpc("team_people"),
    sb.from("reports").select("*").eq("kind", RP.kind).eq("day", RP.day)]);
  if (fail(t.error || p.error || r.error)) return;
  const mgrs = inTeam(p.data).filter((x) => x.role === "manager" && x.team_id && RP.names.has(x.name)), by = new Map(r.data.map((x) => [x.user_id, x]));
  const noAcct = previewTeam ? [] : [...RP.names].filter((n) => !p.data.some((x) => x.name === n)); // 대상인데 아직 플래너 가입 전
  const done = mgrs.filter((m) => by.get(m.user_id)?.submitted_at).length;
  const card = (m) => {
    const x = by.get(m.user_id), b = x?.body ?? {}, open = RP.open.has(m.user_id);
    const st = !x ? `<span class="rpst none">미작성</span>` : x.submitted_at ? `<span class="rpst ok">✅ 제출 ${hm(x.submitted_at)}</span>` : `<span class="rpst draft">✍️ 작성 중</span>`;
    const sum = !x ? "" : RP.kind === "daily" ? consultLine(b.consult) || "상담 없음" : b.mood ?? "";
    return `<div class="rpp ${open ? "open" : ""}" data-u="${m.user_id}"><button class="rph" ${x ? "" : "disabled"}><b>${esc(m.name)}</b>${st}<span class="mut">${esc(sum)}</span>${x ? `<span class="rpar">${open ? "▲" : "▼"}</span>` : ""}</button>
      ${open && x ? `<div class="rpread">${F().fields.map(([k, l]) => `<div><b>${l}</b><p>${esc((b[k] ?? "").trim() || "-")}</p></div>`).join("")}
        ${RP.kind === "daily" ? `<div><b>5. 오늘 상담 결과</b><p>${esc(consultLine(b.consult) || "상담 없음")}</p></div>`
          : `<div><b>6. 현재 나의 컨디션</b><p>${esc(b.mood ?? "-")}<br>${esc((b.mood_why ?? "").trim())}</p></div>`}
        <button class="btn ghost rpcp">📋 복사</button></div>` : ""}</div>`;
  };
  const offDay = RP.kind === "daily" && !DAILY_DAYS.includes(dow(RP.day));
  V().innerHTML = head(`<span class="mut">제출 ${done}/${mgrs.length + noAcct.length}명 · 대상 ${[...RP.names].join("·")} · 데일리 수·일, 주간 성장 일</span>`) + (offDay ? `<div class="card mut">이 날은 쓰는 날이 아니에요</div>` : "") + t.data.map((tm) => {
    const ms = mgrs.filter((m) => m.team_id === tm.id); if (!ms.length) return "";
    return `<section class="rpsec"><h3>${esc(tm.name)} <span class="mut">${ms.filter((m) => by.get(m.user_id)?.submitted_at).length}/${ms.length}</span></h3><div class="card">${ms.map(card).join("")}</div></section>`;
  }).join("") + (noAcct.length ? `<section class="rpsec"><h3>가입 전</h3><div class="card">${noAcct.map((n) => `<div class="rpp"><div class="rph"><b>${esc(n)}</b><span class="rpst none">플래너 가입 전</span></div></div>`).join("")}</div></section>` : "")
    || `<div class="card mut">대상 매니저가 없어요</div>`;
  wireHead();
  V().querySelectorAll(".rph").forEach((h) => (h.onclick = () => { const u = h.closest(".rpp").dataset.u; RP.open.has(u) ? RP.open.delete(u) : RP.open.add(u); RP.loadBoss(); }));
  V().querySelectorAll(".rpcp").forEach((c) => (c.onclick = () => {
    const u = c.closest(".rpp").dataset.u; copy(RP.text(RP.kind, by.get(u).body, mgrs.find((m) => m.user_id === u).name));
  }));
};
})();
