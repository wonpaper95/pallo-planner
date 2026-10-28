// 🧑‍🏫 리더 현황 보드 탭: 지점별 리더 명단 · 라포 ⭐ · 수업마다 출석(O/X 클릭) · 🚨 재관리(한 달 3번↑ 결석) · 🏆 개근 혜택
// 주간 / 월간 / 3달 보기. 계산은 leaders-core.js(LDC), index.html 의 sb·isBoss·previewTeam·previewUser·teams·myName·esc·toast·fail 을 씀 → window.LD
(() => {
const LD = (window.LD = { team: null, mode: "month", filter: "all", anchor: null, rows: [], att: new Map(), subs: new Map(), cover: new Map(), awards: new Map(), mon: new Map() }); // mon: `${id}:${달}` → 그달 라포·리더나잇
const V = () => document.getElementById("ldView");
const DOW = "일월화수목금토", md = (d) => `${+d.slice(5, 7)}/${+d.slice(8, 10)}`, dw = (d) => DOW[W.parse(d).getDay()];
const today = () => W.ymd(new Date());
const admin = () => isBoss && !previewTeam && !previewUser;
const ym = (m) => `${+m.slice(5, 7)}월`;
try { LD.mode = localStorage.getItem("ld-mode") === "q3" ? "q3" : "month"; LD.filter = localStorage.getItem("ld-filter") || "all"; } catch {} // 주간 보기는 없앰(10-26) — 월간 · 3달

// 보는 기간: 월간 = 그달, 3달 = 기준 달 포함 지난 3달
const range = () => LD.mode === "month" ? [LDC.monthStart(LD.anchor), LDC.monthEnd(LD.anchor)] : [LDC.addMonths(LD.anchor, -2), LDC.monthEnd(LD.anchor)];
const statMonth = () => LDC.monthStart(LD.anchor);

LD.load = async function () {
  LD.anchor ??= today();
  if (admin() && !teams.length) teams = (await sb.from("teams").select("*").order("sort")).data ?? []; // 앱 켜자마자 이 탭이면 지점 목록이 아직 없을 수 있음
  if (admin() && !LD.team) { // 대표: 마지막에 본 지점, 처음이면 리더가 있는 첫 지점
    let saved = null; try { saved = +localStorage.getItem("ld-team") || null; } catch {}
    const has = new Set(((await sb.from("leaders").select("team_id").limit(2000)).data ?? []).map((x) => x.team_id));
    LD.team = teams.find((t) => t.id === saved)?.id ?? teams.find((t) => has.has(t.id))?.id ?? teams[0]?.id ?? null;
  }
  if (!admin()) LD.team = previewTeam ?? (await sb.rpc("my_team")).data ?? (await sb.rpc("assistant_team")).data ?? null; // 매니저·미리보기: 우리 지점 · 조교: 링크 지점
  if (!LD.team) { V().innerHTML = `<div class="ldbar"><h2>🧑‍🏫 리더 현황 보드</h2></div><div class="card mut">지점이 정해져야 볼 수 있어요 — 대표님께 말씀해 주세요</div>`; return; }
  const [from, to] = range(), aFrom = [from, LDC.addMonths(statMonth(), -2)].sort()[0], aTo = [to, LDC.monthEnd(statMonth())].sort().at(-1);
  const { data: rows, error } = await sb.from("leaders").select("*").eq("team_id", LD.team).order("sort").order("id");
  if (fail(error)) return;
  const ids = rows.map((r) => r.id);
  const [a, w, mo, ce] = ids.length ? await Promise.all([sb.from("leader_att").select("leader_id, day, state, sub").in("leader_id", ids).gte("day", aFrom).lte("day", aTo),
    sb.from("leader_awards").select("*").in("leader_id", ids),
    sb.from("leader_months").select("*").in("leader_id", ids).gte("month", LDC.addMonths(aFrom, -1)).lte("month", aTo),
    sb.from("leader_certs").select("*").in("leader_id", ids)]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]; // 지난달 라포도 (흐리게 보여 주려고)
  if (fail(a.error || w.error || mo.error || ce.error)) return;
  LD.certs = new Map(ce.data.map((x) => [`${x.leader_id}:${x.grade}`, x]));
  LD.mon = new Map(mo.data.map((x) => [`${x.leader_id}:${x.month}`, x]));
  LD.rows = rows; LD.att = new Map(rows.map((r) => [r.id, new Map()]));
  LD.subs = new Map(rows.map((r) => [r.id, new Map()])); LD.cover = new Map();
  const byId = new Map(rows.map((r) => [r.id, r])), credit = (id, day) => { const m = LDC.monthStart(day), c = LD.cover.get(id) ?? new Map(); c.set(m, (c.get(m) ?? 0) + 1); LD.cover.set(id, c); };
  a.data.forEach((x) => { LD.att.get(x.leader_id)?.set(x.day, x.state);
    const me_ = byId.get(x.leader_id); // 자기 반 요일이 아닌 날 나옴(전산 출석) = 다른 시간대 대타 → 인정
    if (x.state === "O" && me_?.grp && !LDC.DAYS[me_.grp].includes(W.parse(x.day).getDay())) credit(x.leader_id, x.day);
    if (!x.sub) return;
    LD.subs.get(x.leader_id)?.set(x.day, x.sub);
    const who = LDC.matchSub(x.sub, rows); if (who) credit(who.id, x.day); }); // 🔁 대타 해준 사람 → 그달 출석 인정 +1
  LD.awards = new Map(w.data.map((x) => [`${x.leader_id}:${x.month}`, x]));
  await mixLoad();
  LD.render();
};

// ⭐ 라포는 달마다 새로 매김 (그달 기록). 아직이면 지난달 별점을 흐리게 보여 줌
const mon = (r, m) => LD.mon.get(`${r.id}:${m}`);
const stars = (r, m) => { const c = mon(r, m), p = mon(r, LDC.addMonths(m, -1)), v = c?.rapport ?? null, g = v ? null : p?.rapport ?? null;
  return `<span class="ldstars r${v ? (v <= 2 ? "low" : v === 3 ? "mid" : "high") : "none"} ${g ? "ghost" : ""}" title="${ym(m)} 라포 ${v ?? "아직"}/5${c?.rapport_by ? ` · ${esc(c.rapport_by)}` : ""}${g ? ` · 지난달 ★${g} — 이번 달도 매겨 주세요` : ""}">`
  + [1, 2, 3, 4, 5].map((i) => `<button data-star="${i}">${i <= (v ?? g ?? 0) ? "★" : "☆"}</button>`).join("") + `</span>`; };
const nightBox = (r, m) => { const on = !!mon(r, m)?.night; return `<button class="night ${on ? "on" : ""}" data-night title="${ym(m)} 리더나잇 ${on ? "왔음" : "안 옴"} — 누르면 바뀜">${on ? "🌙" : ""}</button>`; };
// 👋 그만둠 버튼 (줄마다 보임) → 날짜·이유 창. 그만둔 줄은 ↩️ 취소 · 빈자리 줄은 없음
const endBtn = (r) => `<td class="endc">${r.end_day ? `<button class="endb back" data-endback title="${md(r.end_day)} 그만둠 취소 — 다시 활동">↩️ 취소</button>` : r.name === VACANT ? "" : `<button class="endb" data-end title="그만둔 날·이유 기록 (지우지 않고 남겨요)">👋 그만둠</button>`}<button class="endb del" data-del title="줄 지우기 — 잘못 넣은 줄만">🗑</button></td>`;
const goneTag = (r) => r.end_day ? `<span class="gonetag" title="그만둠${r.end_reason ? ` · ${esc(r.end_reason)}` : ""}${r.end_note ? ` — ${esc(r.end_note)}` : ""}">👋 ${md(r.end_day)} 그만둠${r.end_reason ? ` · ${esc(r.end_reason)}` : ""}</span>` : "";
const eduBox = (r) => `<button class="edu ${r.edu_done ? "on" : ""}" data-edu title="리더교육 ${r.edu_done ? "했음" : "아직"}${r.edu ? ` · ${esc(r.edu)}` : ""} — 누르면 바뀜">${r.edu_done ? "✓" : ""}</button>`;
// 🔴 구해야 함 + 며칠째 (구해야 함이 된 날부터, 그날 = 1일째) · 줄 색: 🚨 재관리 주황, 구해야 함 분홍
const needDays = (r) => r.need_since ? Math.round((W.parse(today()) - W.parse(r.need_since)) / 864e5) + 1 : null;
const stBox = (r) => r.status !== "구해야 함" ? `<button class="st ok" data-st title="누르면 바뀜">🟢 확정</button>`
  : `<button class="st need" data-st title="누르면 바뀜">🔴 구해야 함</button>${needDays(r) ? `<b class="nd" title="${md(r.need_since)}부터">${needDays(r)}일째</b>` : ""}`;
const rowCls = (r, m) => `${r.status === "구해야 함" ? "need" : ""} ${stat(r, m).recheck ? "rerow" : ""} ${r.end_day ? "gone" : ""}`;
// 이름 칸: 이름 · 전화(더블클릭으로 고침, 📞 은 전화 걸기)
const nameCell = (r) => `<td class="nm"><b data-f="name">${esc(r.name)}</b>${goneTag(r)}${r.phone ? `<span class="ph"><span data-f="phone">${esc(r.phone)}</span><a href="tel:${r.phone.replace(/[^\d]/g, "").slice(0, 11)}" title="전화 걸기">📞</a></span>` : `<span class="ph ed1 addh" data-f="phone" title="누르면 전화번호 적기">+ 전화</span>`}</td>`;
const cov = (r, m) => LD.cover.get(r.id)?.get(m) ?? 0;
const stat = (r, m) => LDC.monthStat(r.grp, m, LD.att.get(r.id), today(), cov(r, m));
// 출석 버튼: 누르면 O → X → X+대타(이름) → 비움
const attBtn = (r, d, label = "") => { const s = LD.att.get(r.id)?.get(d) ?? "", sb_ = LD.subs.get(r.id)?.get(d) ?? "", fut = d > today();
  return `<button class="att ${s === "O" ? "o" : s === "X" ? "x" : ""} ${sb_ ? "sub" : ""} ${fut ? "fut" : ""} ${d === today() ? "tdy" : ""}" data-att="${d}" title="${md(d)}(${dw(d)})${sb_ ? ` 대타 ${esc(sb_)}` : ""} · 누르면 O → X → 대타 → 비움">${label ? `<small>${label}</small>` : ""}${s || "·"}${sb_ ? `<i>${esc(sb_)}</i>` : ""}</button>`; };
// 월간 출석 칸: 두 줄 — 열 = 주, 윗줄 = 그 반 첫째 요일(월·화·토), 아랫줄 = 둘째 요일(수·목·일). 한눈에 보이게 폭 절반
function attGrid(r, ses, g) {
  const wks = [...new Set(ses.map((d) => W.monday(d)))], days = LDC.DAYS[g] ?? [];
  const at = (wk, row) => ses.find((d) => W.monday(d) === wk && days.indexOf(W.parse(d).getDay()) === row);
  return `<div class="ag" style="grid-template-columns:repeat(${wks.length},auto)">${[0, 1].map((row) => wks.map((wk) => { const d = at(wk, row); return d ? attBtn(r, d, md(d)) : `<span></span>`; }).join("")).join("")}</div>`;
}
function flags(r, m) {
  const st = stat(r, m), aw = LD.awards.get(`${r.id}:${m}`);
  return `<span class="ldfl">${st.recheck ? `<b class="re" title="${ym(m)} 결석 ${st.x} − 대타 ${st.cover}">🚨 재관리</b>` : st.x ? `<span class="mut">결석 ${st.x}</span>` : ""}`
    + `${st.cover ? `<span class="cv" title="${ym(m)} 다른 리더 대신 와준 횟수 — 출석으로 인정">🔁 대타 ${st.cover}</span>` : ""}`
    + `${st.award ? (aw ? `<button class="aw done" data-aw="${m}" title="${esc(aw.by_name)} · ${esc(aw.note)}">🎁 혜택 줌</button>` : `<button class="aw" data-aw="${m}">🏆 개근 · 혜택 주기</button>`)
      : st.onTrack ? `<span class="on" title="${ym(m)} 지금까지 다 나옴">🏆 개근 중</span>` : ""}</span>`;
}
function monthCell(r, m) {
  const st = stat(r, m);
  const c = mon(r, m), extra = [c?.rapport ? `<span class="mrp">★${c.rapport}</span>` : "", c?.night ? `<span title="리더나잇 왔음">🌙</span>` : ""].join(" ").trim();
  return `<td class="m">${st.o + st.x + st.cover ? `<span class="ldo">O ${st.o}</span> <span class="ldx">X ${st.x}</span>${st.blank ? ` <span class="mut">미체크 ${st.blank}</span>` : ""}` : `<span class="mut">–</span>`}${extra ? ` ${extra}` : ""}<br>${flags(r, m)}</td>`;
}

// 🔴 맨 위 구해야 함 현황표: 지금 비어 있는 자리 전부 (보기 필터·달과 상관없이) · 시간대별 색으로 묶고 그 안에서 오래 비어 있는 순
// 칸은 눌러서 바로 고침 (구해야 함 시작일·레벨·자리·이름·메모) · 반·시간대는 ✏️ → 고치기 창 · 팀 특이사항은 바로 적음
const ed = (r, f, txt, hint) => `<span class="ed1 nf" data-f="${f}" title="누르면 고치기">${txt || `<span class="addh">+ ${hint}</span>`}</span>`;
function needTable() {
  const td = today(), bi = (r) => LDC.BANDS.findIndex(([k]) => k === LDC.band(r));
  const rs = LD.rows.filter((r) => r.status === "구해야 함" && (!r.end_day || r.end_day >= td))
    .sort((a, b) => bi(a) - bi(b) || LDC.GRPS.indexOf(a.grp) - LDC.GRPS.indexOf(b.grp) || LDC.slotMin(a.slot) - LDC.slotMin(b.slot) || (needDays(b) ?? 0) - (needDays(a) ?? 0));
  if (!rs.length) return `<div class="ldneedtb ok">🎉 지금 리더 빈자리 없어요</div>`;
  const cnt = {}; rs.forEach((r) => { const k = LDC.band(r); cnt[k] = (cnt[k] ?? 0) + 1; });
  const legend = LDC.BANDS.filter(([k]) => cnt[k]).map(([k, l]) => `<span class="bdg b-${k}">${l} ${cnt[k]}</span>`).join("");
  let prev = "";
  const body = rs.map((r) => { const n = needDays(r), k = LDC.band(r), first = k !== prev; prev = k;
    return `${first ? `<tr class="bhead b-${k}"><td colspan="5">${LDC.BANDS.find(([x]) => x === k)[1]} <span>${cnt[k]}자리</span></td></tr>` : ""}`
      + `<tr data-id="${r.id}" class="b-${k}"><td class="ed1 nf" data-f="need_since" title="누르면 구해야 함 시작일 고치기"><b class="nd ${n >= 14 ? "long" : ""}">${n ? `${n}일째` : "–"}</b>${r.need_since ? `<small>${md(r.need_since)}부터</small>` : ""}</td>`
      + `<td><span class="slotchip b-${k}"><button class="goto" data-goto="${r.id}" title="보드에서 이 줄 보기">${esc([r.grp, r.slot].filter(Boolean).join(" ") || "반 없음")}</button><button class="slotedit" data-ldedit title="반·시간대 고치기">✏️</button></span></td>`
      + `<td>${ed(r, "level", esc(r.level), "레벨")} · ${ed(r, "seat", esc(r.seat), "자리")}</td>`
      + `<td>${ed(r, "name", r.name === VACANT ? `<span class="mut">빈자리</span>` : esc(r.name), "이름")}<small>${ed(r, "note", esc(r.note), "메모")}</small></td>`
      + `<td class="nn"><textarea data-nn="${r.id}" rows="1" maxlength="500" placeholder="이 팀 특이사항 — 구하는 이유 · 팀 분위기 · 원하는 리더 · 진행 상황">${esc(r.need_note ?? "")}</textarea></td></tr>`; }).join("");
  return `<section class="ldneedtb"><h3>🔴 리더 구해야 함 현황 <span class="mut">${rs.length}자리 · 시간대별 · 2주 넘으면 빨강 · 칸 누르면 고쳐요</span></h3><div class="bdgs">${legend}</div>
    <div class="ldtw"><table><tr><th>비어 있은 지</th><th>반 · 시간대</th><th>레벨 · 자리</th><th>원래 리더 · 메모</th><th>팀 특이사항</th></tr>${body}</table></div></section>`;
}

// 📜 자격증: 첫 시작일부터 6개월 → 2급, 1년 → 1급. 발급하면 날짜·누가 남김 (누르면 취소) · 아직이면 다음 급까지 남은 날
const isSub = (r) => r.kind === "sub", isLeader = (r) => r.kind !== "staff" && !isSub(r);
const certOf = (r, g) => LD.certs?.get(`${r.id}:${g}`);
const certDue = (r) => r.name === VACANT || r.kind === "staff" ? [] : LDC.certs(r.start_day, r.end_day, today()).filter((c) => c.ok && !certOf(r, c.grade));
function certCell(r) {
  if (r.name === VACANT) return `<td></td>`;
  const cs = LDC.certs(r.start_day, r.end_day, today()); if (!cs.length) return `<td class="mut" title="첫 시작일을 넣으면 자격 날짜가 나와요"><small>시작일 필요</small></td>`;
  let wait = false;
  return `<td class="certc">${cs.map((c) => { const done = certOf(r, c.grade);
    if (done) return `<button class="cert done" data-cert="${c.grade}" title="${md(done.issued_on)} 발급${done.by_name ? ` · ${esc(done.by_name)}` : ""} — 누르면 취소">📜 ${c.grade}급 ✓ ${md(done.issued_on)}</button>`;
    if (c.ok) return `<button class="cert due" data-cert="${c.grade}" title="${md(c.on)}부터 받을 수 있어요 — 누르면 발급 기록">📜 ${c.grade}급 발급</button>`;
    if (wait || r.end_day) return ""; wait = true;
    return `<span class="cert wait" title="${md(c.on)}부터 ${c.grade}급">${c.grade}급 D-${Math.round((W.parse(c.on) - W.parse(today())) / 864e5)}</span>`; }).join("")}</td>`;
}
// 📜 맨 위 발급 대상 표 (지금 받을 수 있는데 아직 안 준 리더 · 30일 안에 받을 리더)
function certTable() {
  const td = today(), soon = W.ymd(new Date(W.parse(td).getTime() + 30 * 864e5));
  const live = LD.rows.filter((r) => r.kind !== "staff" && r.name !== VACANT && !r.end_day);
  const due = live.flatMap((r) => certDue(r).map((c) => ({ r, c })));
  const next = live.flatMap((r) => LDC.certs(r.start_day, null, td).filter((c) => !c.ok && c.on <= soon && !certOf(r, c.grade)).map((c) => ({ r, c })));
  if (!due.length && !next.length) return "";
  const row = ({ r, c }, ok) => `<tr data-id="${r.id}"><td><b>${esc(r.name)}</b>${isSub(r) ? ` <span class="mut">서브</span>` : ""}</td><td>${esc([r.grp, r.slot].filter(Boolean).join(" ") || "–")}</td><td>${esc(r.start_day)}</td>`
    + `<td>${ok ? `<button class="cert due" data-cert="${c.grade}">📜 ${c.grade}급 발급</button>` : `<span class="cert wait">${c.grade}급 · ${md(c.on)}부터</span>`}</td></tr>`;
  return `<section class="ldcerttb"><h3>📜 자격증 발급 대상 <span class="mut">근속 6개월 → 2급 · 1년 → 1급 · 발급 ${due.length}${next.length ? ` · 30일 안 ${next.length}` : ""}</span></h3>
    <div class="ldtw"><table><tr><th>리더</th><th>반 · 시간대</th><th>첫 시작일</th><th>자격증</th></tr>${due.map((x) => row(x, true)).join("")}${next.map((x) => row(x, false)).join("")}</table></div></section>`;
}
// 🔁 서브리더 (대기·대타 풀): 반 없이 빈자리·결석을 채움 · 대타는 출석 칸 '대타' 이름으로 자동 집계 · ⭐ 승격 후보 → ✏️ 에서 구분을 리더로
function subTable(sm) {
  const [from, to] = range(), m3 = [LDC.addMonths(sm, -2), LDC.addMonths(sm, -1), sm];
  const rs = LD.rows.filter((r) => isSub(r) && LDC.activeIn(r, from, to)).sort((a, b) => (b.promote - a.promote) || m3.reduce((n, m) => n + cov(b, m) - cov(a, m), 0));
  const body = rs.map((r) => { const c3 = m3.reduce((n, m) => n + cov(r, m), 0);
    return `<tr data-id="${r.id}" class="${r.end_day ? "gone" : ""}">${nameCell(r)}<td class="nt ed1" data-f="avail" title="누르면 가능 요일·시간 적기">${r.avail ? esc(r.avail) : `<span class="addh">+ 가능 시간</span>`}</td>`
      + `<td class="sd ed1" data-f="start_day" title="누르면 첫 시작일 고치기">${r.start_day ? esc(r.start_day) : `<span class="addh">+ 날짜</span>`}${LDC.dPlus(r.start_day, today()) ? `<b class="dp">${LDC.dPlus(r.start_day, today())}</b>` : ""}</td>`
      + `<td>${stars(r, sm)}</td><td class="m"><b>${cov(r, sm)}</b>번 <small class="mut">· 3달 ${c3}</small></td>`
      + `<td><button class="promo ${r.promote ? "on" : ""}" data-promote title="메인 리더 승격 후보 — 누르면 바뀜">${r.promote ? "⭐ 후보" : "☆"}</button> <button class="slotedit" data-ldedit title="메인으로 올리기 = 구분을 리더로, 반·시간대 고르기">⬆️</button></td>`
      + `${certCell(r)}${endBtn(r)}<td class="nt ed1" data-f="note" title="누르면 메모 적기">${r.note ? esc(r.note) : `<span class="addh">+ 적기</span>`}</td></tr>`; }).join("");
  return `<section class="ldblk ldsubblk"><h3>🔁 서브리더 <span class="mut">대기·대타 풀 ${rs.filter((r) => !r.end_day).length}명 · 대타는 출석 칸 '대타'에 이름을 적으면 자동으로 세요</span> <button class="btn ghost small" id="ldAddSub">+ 서브리더 추가</button></h3>
    ${rs.length ? `<div class="ldtw"><table><tr><th>이름</th><th>가능 요일·시간 <small class="agh">✏️ 눌러서 적기</small></th><th>첫 시작일</th><th>라포</th><th>${ym(sm)} 대타</th><th>승격 후보</th><th>📜 자격증</th><th>그만둠</th><th>메모</th></tr>${body}</table></div>` : `<div class="card mut" style="padding:12px">아직 서브리더가 없어요 — <b>+ 서브리더 추가</b></div>`}</section>`;
}

LD.render = function () {
  const [from, to] = range(), sm = statMonth(), td = today();
  const months = [LDC.addMonths(LD.anchor, -2), LDC.addMonths(LD.anchor, -1), LDC.monthStart(LD.anchor)];
  const vis = LD.rows.filter((r) => LDC.passFilter(r, LD.filter) && LDC.activeIn(r, from, to)); // 🔎 평일 오전·오후·주말·월수·화목 필터 · 📅 그 기간에 활동한 리더만 (시작 전·그만둔 뒤 달엔 안 보임)
  const leaders = vis.filter(isLeader), staff = vis.filter((r) => r.kind === "staff");
  const live = vis.filter((r) => !r.end_day || r.end_day > LDC.monthEnd(sm)), smEnd = LDC.monthEnd(sm);
  const cnt = { need: live.filter((r) => r.status === "구해야 함").length, re: 0, aw: 0,
    gone: vis.filter((r) => r.end_day && r.end_day >= sm && r.end_day <= smEnd).length,
    rp: live.filter((r) => r.status === "확정" && mon(r, sm)?.rapport).length, rpAll: live.filter((r) => r.status === "확정").length,
    night: vis.filter((r) => mon(r, sm)?.night).length, cert: LD.rows.filter((r) => !r.end_day).reduce((n, r) => n + certDue(r).length, 0) };
  vis.forEach((r) => { const s = stat(r, sm); if (s.recheck) cnt.re++; if (s.award || s.onTrack) cnt.aw++; });
  const title = LD.mode === "month" ? `${LD.anchor.slice(0, 4)}년 ${ym(LD.anchor)}` : `${ym(months[0])} ~ ${ym(months[2])}`;
  const blocks = [];
  for (const g of [...LDC.GRPS, ""]) { // "" = 반 없는 리더 (백업리더 등)
    const slots = [...new Set(leaders.filter((r) => r.grp === g).map((r) => r.slot))].sort((a, b) => LDC.slotMin(a) - LDC.slotMin(b));
    for (const s of slots) {
      const rs = leaders.filter((r) => r.grp === g && r.slot === s), need = rs.filter((r) => r.status === "구해야 함").length;
      const ses = LD.mode === "q3" ? [] : LDC.sessions(g, from, to);
      const head = `<tr><th>레벨</th><th>자리</th><th>리더</th><th>첫 시작일 <small class="agh">✏️ 눌러서 고치기</small></th><th>라포</th><th>상태</th><th>그만둠</th>${LD.mode === "q3" ? months.map((m) => `<th>${ym(m)}</th>`).join("")
        : `<th>출석${g ? ` <small class="agh">윗줄 ${DOW[LDC.DAYS[g][0]]} · 아랫줄 ${DOW[LDC.DAYS[g][1]]}</small>` : ""}</th><th>${ym(sm)}</th>`}${LD.mode === "month" ? `<th>특이사항 <small class="agh">✏️ 눌러서 적기</small></th><th>리더교육</th><th>🌙 리더나잇</th><th>📜 자격증</th>` : ""}</tr>`;
      const body = rs.map((r) => `<tr data-id="${r.id}" class="${rowCls(r, sm)}"><td data-f="level">${esc(r.level)}</td><td data-f="seat">${esc(r.seat)}</td>`
        + `${nameCell(r)}<td class="sd ed1" data-f="start_day" title="누르면 첫 시작일 고치기">${r.start_day ? esc(r.start_day) : `<span class="addh">+ 날짜</span>`}${LDC.dPlus(r.start_day, today()) ? `<b class="dp">${LDC.dPlus(r.start_day, today())}</b>` : ""}</td>`
        + `<td>${stars(r, sm)}</td><td>${stBox(r)}</td>${endBtn(r)}`
        + (LD.mode === "q3" ? months.map((m) => monthCell(r, m)).join("") : `<td class="att2">${attGrid(r, ses, g)}</td><td>${flags(r, sm)}</td>`)
        + (LD.mode === "month" ? `<td class="nt ed1" data-f="note" title="누르면 특이사항 적기">${r.note ? esc(r.note) : `<span class="addh">+ 적기</span>`}</td><td>${eduBox(r)}</td><td>${nightBox(r, sm)}</td>${certCell(r)}` : "") + `</tr>`).join("");
      blocks.push(`<section class="ldblk"><h3>${g} ${esc(s || (g ? "시간 미정" : "반 없음"))} <span class="mut">${rs.length}팀</span>${need ? ` <span class="ldneed">🔴 리더 구해야 함 ${need}</span>` : ""}</h3><div class="ldtw"><table>${head}${body}</table></div></section>`);
    }
  }
  if (LD.mode === "month") blocks.push(subTable(sm));
  if (staff.length) { // 🧑‍💼 워킹스텝: 반이 저마다 달라서 출석은 한 칸에 날짜 버튼으로
    const head = `<tr><th>업무</th><th>이름</th><th>첫 시작일 <small class="agh">✏️ 눌러서 고치기</small></th><th>라포</th><th>상태</th><th>그만둠</th>${LD.mode === "q3" ? months.map((m) => `<th>${ym(m)}</th>`).join("") : `<th>출석</th><th>${ym(sm)}</th>`}<th>비고 <small class="agh">✏️ 눌러서 적기</small></th></tr>`;
    const body = staff.map((r) => `<tr data-id="${r.id}" class="${rowCls(r, sm)}"><td data-f="slot">${esc([r.grp, r.slot].filter(Boolean).join(" "))}</td>`
      + `${nameCell(r)}<td class="sd ed1" data-f="start_day" title="누르면 첫 시작일 고치기">${r.start_day ? esc(r.start_day) : `<span class="addh">+ 날짜</span>`}${LDC.dPlus(r.start_day, today()) ? `<b class="dp">${LDC.dPlus(r.start_day, today())}</b>` : ""}</td>`
      + `<td>${stars(r, sm)}</td><td>${stBox(r)}</td>${endBtn(r)}`
      + (LD.mode === "q3" ? months.map((m) => monthCell(r, m)).join("")
        : `<td class="ina">${r.grp ? LDC.sessions(r.grp, from, to).map((d) => attBtn(r, d, `${md(d)}(${dw(d)})`)).join("") : `<span class="mut">–</span>`}</td><td>${flags(r, sm)}</td>`)
      + `<td class="nt ed1" data-f="note" title="누르면 특이사항 적기">${r.note ? esc(r.note) : `<span class="addh">+ 적기</span>`}</td></tr>`).join("");
    blocks.push(`<section class="ldblk"><h3>🧑‍💼 워킹스텝 <span class="mut">${staff.length}명</span></h3><div class="ldtw"><table>${head}${body}</table></div></section>`);
  }
  V().innerHTML = `<div class="ldbar"><h2>🧑‍🏫 리더 현황 보드</h2>
      ${admin() ? `<select id="ldTeam">${teams.map((t) => `<option value="${t.id}" ${t.id === LD.team ? "selected" : ""}>${esc(t.name)}</option>`).join("")}</select>` : ""}
      <span class="ldseg">${[["month", "월간"], ["q3", "3달"]].map(([k, l]) => `<button data-mode="${k}" class="${LD.mode === k ? "on" : ""}">${l}</button>`).join("")}</span>
      <span class="ldseg ldflt">${LDC.FILTERS.map(([k, l]) => `<button data-flt="${k}" class="${LD.filter === k ? "on" : ""}">${l}</button>`).join("")}</span>
      <span class="ldnav"><button data-nav="-1">‹</button><b>${title}</b><button data-nav="1">›</button><button data-nav="0">오늘</button></span>
      <span class="ldfind"><input id="ldFind" type="search" list="ldNames" placeholder="🔍 리더 찾기" value="${esc(LD.findQ ?? "")}" title="이름(일부)·전화 뒷자리 → Enter, 또 누르면 다음 사람"><datalist id="ldNames">${[...new Set(LD.rows.map((r) => r.name).filter((n) => n && n !== VACANT))].map((n) => `<option value="${esc(n)}">`).join("")}</datalist></span>
      <span class="ldact">${myRole !== "assistant" ? `<button class="btn ai" id="ldAI" title="이 지점 리더 데이터를 AI 가 읽고 ${ym(sm)} 운영 전략을 써 줘요 (달마다 저장)">🤖 AI 전략</button>` : ""}<button class="btn" id="ldAdd">+ 리더 추가</button><button class="btn ghost" id="ldPaste">📋 시트에서 붙여넣기</button></span></div>
    ${needTable()}
    ${certTable()}
    ${mixHtml()}
    <div class="ldsum"><span>리더 <b>${leaders.filter((r) => live.includes(r)).length}</b>팀</span>${staff.length ? `<span>스텝 <b>${staff.length}</b>명</span>` : ""}<span class="ldneed">🔴 구해야 함 <b>${cnt.need}</b></span><span class="re">🚨 재관리 <b>${cnt.re}</b></span><span class="on">🏆 개근 <b>${cnt.aw}</b></span><span class="${cnt.rp < cnt.rpAll ? "re" : "on"}" title="${ym(sm)} 라포를 매긴 리더 / 확정 리더 — 달마다 전원 다시 매겨요">⭐ 라포 <b>${cnt.rp}/${cnt.rpAll}</b></span><span>🌙 리더나잇 <b>${cnt.night}</b></span>${cnt.cert ? `<span class="on" title="근속 6개월 2급 · 1년 1급 — 아직 발급 안 함">📜 자격증 발급 <b>${cnt.cert}</b></span>` : ""}${cnt.gone ? `<span class="mut">👋 그만둠 <b>${cnt.gone}</b></span>` : ""}
      <small class="mut">${ym(sm)} 기준 · 한 달에 ${LDC.ABSENT_LIMIT}번 이상 빠지면 🚨 재관리 · 그달 수업을 다 나오면 🏆 개근 → 혜택 · 🔁 다른 리더 대신 와준(대타) 날은 출석으로 인정 · 출석 칸은 누르면 O → X → 대타 → 비움 · <b>✏️ 첫 시작일·특이사항·전화는 한 번 누르면 바로 고쳐요</b>(레벨·자리·이름은 더블클릭) → Enter 로 저장 · 줄 오른쪽 클릭 → 반·시간대 옮기기·지우기 · ⭐ 1~2 빨강 · 3 주황 · 4~5 초록 · <b>라포는 달마다 새로 매겨요</b>(흐린 별 = 지난달) · 리더가 그만두면 상태 옆 <b>👋 그만둠</b> → 날짜·이유 (지우지 마세요 — 근속·이탈 기록이 남아야 해요)</small></div>
    ${blocks.join("") || `<div class="card mut" style="padding:16px">${LD.rows.length ? "이 필터에 맞는 리더가 없어요" : `아직 리더가 없어요 — <b>+ 리더 추가</b> 하거나, 구글시트에서 줄을 복사해 <b>📋 시트에서 붙여넣기</b> 하세요`}</div>`}`;
};

// ── 고치기 · 붙여넣기 창 ──
function dlg(html) {
  let d = document.getElementById("ldDlg");
  if (!d) { d = document.createElement("dialog"); d.id = "ldDlg"; document.body.appendChild(d); }
  d.innerHTML = html; d.showModal(); return d;
}
const F = [["level", "레벨"], ["seat", "자리"], ["name", "리더 이름"], ["start_day", "첫 시작일"], ["phone", "전화번호"], ["avail", "가능 요일·시간 (서브리더)"], ["note", "특이사항 (상담조교 참고)"], ["edu", "리더교육 메모 (일정 등)"], ["memo", "메모"]];
function editDlg(r, kind) {
  if (!r && kind) r = { kind, grp: "" }; // + 서브리더 추가: 구분·반 없음 미리 골라 둠
  const add = !r?.id;
  const d = dlg(`<form method="dialog" class="ldform"><h2>${add ? (r?.kind === "sub" ? "서브리더 추가" : "리더 추가") : r.kind === "sub" ? "서브리더 고치기 · ⬆️ 메인으로 올리려면 구분을 리더로" : "리더 고치기"}</h2>
    <label>구분<select name="kind"><option value="leader" ${r?.kind !== "staff" ? "selected" : ""}>리더</option><option value="staff" ${r?.kind === "staff" ? "selected" : ""}>워킹스텝</option><option value="sub" ${r?.kind === "sub" ? "selected" : ""}>서브리더 (대기·대타)</option></select></label>
    <label>반<select name="grp">${LDC.GRPS.map((g) => `<option ${r?.grp === g ? "selected" : ""}>${g}</option>`).join("")}<option value="" ${r && !r.grp ? "selected" : ""}>없음 (블로그스텝 등)</option></select></label>
    <label>시간대 · 업무<span class="slotpick"><select name="slotSel"></select><input name="slotOwn" placeholder="직접 입력 (예: 9PM · 블로그스텝)" maxlength="20" class="hidden"></span></label>
    ${F.map(([k, l]) => k === "start_day" ? `<label>${l}<input type="date" name="start_day" value="${LDC.parseDay(r?.start_day) ?? ""}"></label>`
      : `<label>${l}<input name="${k}" value="${esc(r?.[k] ?? "")}" ${k === "name" ? "required" : ""}></label>`).join("")}
    <label>리더교육<span><input type="checkbox" name="edu_done" ${r?.edu_done ? "checked" : ""}> 했음</span></label>
    <label>구해야 함 시작일<input type="date" name="need_since" value="${r?.need_since ?? ""}" title="누적일 계산 — 비우면 오늘부터"></label>
    <label>모집 경로<select name="source"><option value="">모름</option>${LDC.SOURCES.map((x) => `<option ${r?.source === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
    <label>상태<select name="status"><option ${r?.status !== "구해야 함" ? "selected" : ""}>확정</option><option ${r?.status === "구해야 함" ? "selected" : ""}>구해야 함</option></select></label>
    <div class="row">${!add ? (r.end_day ? `<button type="button" class="btn ghost" id="ldBack" title="${md(r.end_day)} 그만둠 · ${esc(r.end_reason)}">↩️ 그만둠 취소</button>` : `<button type="button" class="btn ghost" id="ldEnd">👋 그만둠</button>`) + `<button type="button" class="btn ghost" id="ldDel" title="잘못 넣은 줄만 — 그만둔 리더는 👋 그만둠">🗑</button>` : ""}<span style="flex:1"></span><button type="button" class="btn ghost" value="cancel" id="ldX">취소</button><button class="btn">저장</button></div></form>`);
  const f = d.querySelector("form");
  d.querySelector("#ldX").onclick = () => d.close();
  // 시간대: 그 지점·반에서 이미 쓰는 칸 중 고르기 (처음이면 자주 쓰는 시간), 없으면 '직접 입력…'
  const fillSlots = (keep) => {
    const used = LD.rows.filter((x) => x.grp === f.grp.value && x.slot && (x.kind === "staff") === (f.kind.value === "staff")).map((x) => x.slot); // 리더·워킹스텝 따로
    const opts = [...new Set(used.length ? used : f.grp.value ? ["오전", "11AM", "오후", "6PM", "7PM", "8PM", "저녁"] : [])].sort((a, b) => LDC.slotMin(a) - LDC.slotMin(b)); // 그 지점이 쓰는 칸만, 없으면 기본 목록
    const cur = keep ?? f.slotSel.value;
    f.slotSel.innerHTML = `<option value="">시간 미정</option>` + opts.map((o) => `<option ${o === cur ? "selected" : ""}>${esc(o)}</option>`).join("") + `<option value="__own">직접 입력…</option>`;
    if (cur && !opts.includes(cur)) { f.slotSel.value = "__own"; f.slotOwn.value = cur; }
    f.slotOwn.classList.toggle("hidden", f.slotSel.value !== "__own");
  };
  fillSlots(r?.slot ?? "");
  f.grp.onchange = f.kind.onchange = () => fillSlots();
  f.slotSel.onchange = () => { f.slotOwn.classList.toggle("hidden", f.slotSel.value !== "__own"); if (f.slotSel.value === "__own") f.slotOwn.focus(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)); v.slot = v.slotSel === "__own" ? v.slotOwn.trim() : v.slotSel; delete v.slotSel; delete v.slotOwn; v.name = v.name.trim(); v.edu_done = f.edu_done.checked; v.need_since ||= null; v.slot = /\d\s*(am|pm)/i.test(v.slot) ? v.slot.replace(/\s+/g, "").toUpperCase() : v.slot.trim();
    if (v.kind === "leader" && r?.kind === "sub") v.promote = false; // ⬆️ 메인 승격
    const { error } = !add ? await sb.from("leaders").update(v).eq("id", r.id) : await sb.from("leaders").insert({ ...v, team_id: LD.team });
    if (fail(error)) return; d.close(); toast(!add ? (v.kind === "leader" && r.kind === "sub" ? "⬆️ 메인 리더로 올렸어요" : "고쳤어요") : "추가했어요"); LD.load();
  };
  d.querySelector("#ldEnd")?.addEventListener("click", () => endDlg(r));
  d.querySelector("#ldBack")?.addEventListener("click", async () => {
    const { error } = await sb.from("leaders").update({ end_day: null, end_reason: "", end_note: "" }).eq("id", r.id); if (fail(error)) return; d.close(); toast("다시 활동으로 바꿨어요"); LD.load();
  });
  d.querySelector("#ldDel")?.addEventListener("click", () => delRow(r, d));
}
// 🗑 줄 지우기 (보드 줄 🗑 · 고치기 창 공용)
async function delRow(r, d) {
  if (!confirm(`'${r.name}' 줄을 완전히 지울까요?\n잘못 넣은 줄만 지우세요. 그만둔 리더는 👋 그만둠으로 남겨야 근속·이탈 기록이 쌓여요.\n(출석·라포 기록도 같이 지워져요)`)) return;
  const { error } = await sb.from("leaders").delete().eq("id", r.id); if (fail(error)) return; d?.close(); toast("줄을 지웠어요"); LD.load();
}
// 👋 그만둠: 그만둔 날·이유 남김 (줄은 그 달까지 보이고 다음 달부터 안 보임) + 그 자리 새로 구할 빈 줄
function endDlg(r) {
  const d = dlg(`<form method="dialog" class="ldform"><h2>👋 ${esc(r.name)} 그만둠</h2>
    <p class="mut" style="margin:0">지우지 않고 기록으로 남겨요 — 근속일·이탈 이유·어느 달에 많이 빠지는지 분석에 쓰여요</p>
    <label>그만둔 날<input type="date" name="end_day" value="${today()}" required></label>
    <label>이유<select name="end_reason" required><option value="">고르세요</option>${LDC.END_REASONS.map((x) => `<option>${x}</option>`).join("")}</select></label>
    <label>자세한 사유<textarea name="end_note" rows="3" maxlength="300" placeholder="예: 11월부터 회사 야근 많아짐 · 다음 학기 복귀 가능성 있음"></textarea></label>
    ${r.kind === "leader" ? `<label>빈 자리<span><input type="checkbox" name="seat" checked> 이 자리(${esc(r.grp)} ${esc(r.slot)}) 새 리더 구해야 함 줄 만들기</span></label>` : ""}
    <div class="row"><span style="flex:1"></span><button type="button" class="btn ghost" id="ldX">취소</button><button class="btn">그만둠 기록</button></div></form>`);
  const f = d.querySelector("form");
  d.querySelector("#ldX").onclick = () => d.close();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.from("leaders").update({ end_day: f.end_day.value, end_reason: f.end_reason.value, end_note: f.end_note.value.trim() }).eq("id", r.id); if (fail(error)) return;
    if (f.seat?.checked) { const { error: e2 } = await sb.from("leaders").insert({ team_id: r.team_id, kind: r.kind, grp: r.grp, slot: r.slot, level: r.level, seat: r.seat, name: VACANT, status: "구해야 함", note: `${r.name} 자리 (${md(f.end_day.value)} 그만둠)`, sort: r.sort + 0.001 });
      if (fail(e2)) return; }
    d.close(); toast("👋 그만둠 기록했어요"); LD.load();
  };
}
// 📜 자격증 발급 기록 (발급일 고름) · 이미 발급했으면 취소
async function certDlg(r, g) {
  const done = certOf(r, g);
  if (done) { if (!confirm(`${r.name} ${g}급 자격증 발급 기록(${md(done.issued_on)}${done.by_name ? ` · ${done.by_name}` : ""})을 취소할까요?`)) return;
    const { error } = await sb.from("leader_certs").delete().eq("leader_id", r.id).eq("grade", g); if (fail(error)) return; LD.certs.delete(`${r.id}:${g}`); return LD.render(); }
  const c = LDC.certs(r.start_day, r.end_day, today()).find((x) => x.grade === g);
  const d = dlg(`<form method="dialog" class="ldform"><h2>📜 ${esc(r.name)} ${g}급 자격증 발급</h2>
    <p class="mut" style="margin:0">첫 시작일 ${esc(r.start_day)} · 근속 ${g === 2 ? "6개월" : "1년"} 채운 날 ${c ? md(c.on) : "–"}</p>
    <label>발급일<input type="date" name="issued_on" value="${today()}" required></label>
    <div class="row"><span style="flex:1"></span><button type="button" class="btn ghost" id="ldX">취소</button><button class="btn">발급 기록</button></div></form>`);
  const f = d.querySelector("form");
  d.querySelector("#ldX").onclick = () => d.close();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const row = { leader_id: r.id, grade: g, issued_on: f.issued_on.value, by_name: myName ?? "" };
    const { error } = await sb.from("leader_certs").insert(row); if (fail(error)) return;
    LD.certs.set(`${r.id}:${g}`, row); d.close(); toast(`📜 ${r.name} ${g}급 발급 기록했어요`); LD.render();
  };
}
const VACANT = "(구하는 중)"; // 빈 자리 줄 이름 → 확정 누르면 새 리더 이름 물어봄
// 🔀 팀 믹싱 메모 (지점·달마다 하나): 매니저·조교·대표가 같이 적음 — 시뮬레이터처럼 줄마다 쓴 사람 글자색(TB.color), 적는 중 글자는 비공개 채널 ldmix:<지점> 으로 실시간
// 0.15초 모아 전송(직전→지금 바뀐 줄만 받는 쪽에 적용) · 0.7초 뒤 저장(서버 최신 글 위에 내가 바꾼 줄만 얹음, SIMMERGE) · 12초마다 서버 글 다시 받아 맞춤(끊김 대비)
const ML = (t, who) => { const lines = String(t ?? "").split("\n"); return { lines, who: lines.map((_, i) => (Array.isArray(who) ? who[i] ?? "" : "")) }; };
async function mixLoad() {
  const month = statMonth(), m = LD.mix;
  if (m?.dirty && m.team === LD.team && m.month === month) return; // 적은 게 저장 전이면 그대로
  const { data } = await sb.from("leader_mix").select("body, who, by_name, updated_at").eq("team_id", LD.team).eq("month", month).maybeSingle();
  LD.mix = { team: LD.team, month, body: data?.body ?? "", who: data?.who ?? [], base: data?.body ?? "", sent: null, at: data?.updated_at ?? null, by: data?.by_name ?? "" };
  mixListen();
}
function mixHtml() {
  const m = LD.mix; if (!m) return "";
  const at = m.at && new Date(m.at);
  return `<section class="ldmix"><h3>🔀 팀 믹싱 <span class="mut">${ym(m.month)} · 매니저·조교 같이 적어요 · 글자색 = 쓴 사람 · 실시간</span> <small id="mixWho">${at ? `${md(W.ymd(at))} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")} ${esc(m.by)} 저장` : "아직 없음"}</small></h3>
    <div class="mixleg"></div><div class="mixw"><div class="tbbk" aria-hidden="true">${TB.bk(m.body, m.who)}</div><textarea id="ldMix" spellcheck="false" placeholder="팀 믹싱 계획을 같이 적어요 — 예: 월수 11AM 3팀 ↔ 화목 8PM 2팀 리더 교체 / 신규 리더 OO님 → 패턴1 반 …">${esc(m.body)}</textarea></div></section>`;
}
function mixPaint() {
  const m = LD.mix, v = V(), bk = v?.querySelector(".ldmix .tbbk"), leg = v?.querySelector(".ldmix .mixleg"); if (!bk) return;
  bk.innerHTML = TB.bk(m.body, m.who); bk.scrollTop = v.querySelector("#ldMix").scrollTop;
  const names = [...new Set(m.body.split("\n").map((l, i) => (l.trim() ? m.who[i] : "")))].filter((n) => n && n !== "대표");
  leg.innerHTML = names.map((n) => `<span style="color:${TB.color(n)}">● ${esc(n)}</span>`).join("");
}
const mixWho = (t) => { const el = document.getElementById("mixWho"); if (el) el.textContent = t; };
function mixSet(out) { // 받은 글을 칸에 — 적는 중이면 커서를 같은 줄에 둠
  const m = LD.mix, val = out.lines.join("\n"), el = document.getElementById("ldMix");
  m.body = val; m.who = out.who;
  if (el && el.value !== val) {
    if (el !== document.activeElement) el.value = val;
    else { const before = el.value.slice(0, el.selectionStart).split("\n"), line = before.length - 1, col = before.at(-1).length, cur = el.value.split("\n")[line];
      el.value = val; const nl = val.split("\n"); let i = nl.indexOf(cur); if (i < 0) i = Math.min(line, nl.length - 1);
      const off = nl.slice(0, i).reduce((a, x) => a + x.length + 1, 0) + Math.min(col, nl[i].length); el.setSelectionRange(off, off); }
  }
  mixPaint();
}
let mixChan = null, mixTopic = "";
function mixListen() {
  const t = `ldmix:${LD.team}`; if (mixTopic === t) return;
  if (mixChan) sb.removeChannel(mixChan); mixTopic = t;
  mixChan = sb.channel(t, { config: { private: true, broadcast: { self: false } } }).on("broadcast", { event: "mix" }, ({ payload: p }) => {
    const m = LD.mix; if (!m || p.month !== m.month || `ldmix:${m.team}` !== mixTopic) return;
    m.base = SIMMERGE.merge3(ML(p.from), ML(p.text), ML(m.base)).lines.join("\n");
    mixSet(SIMMERGE.merge3(ML(p.from), ML(p.text, p.who), ML(m.body, m.who)));
    mixWho(`✍️ ${p.by} 적는 중…`); clearTimeout(mixWho.t); mixWho.t = setTimeout(() => { const n = new Date(); mixWho(`${p.by} ${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")} 저장`); }, 2500);
  }).subscribe();
}
async function mixSave() {
  const m = LD.mix, { team, month } = m;
  const { data: sv, error: e1 } = await sb.from("leader_mix").select("body, who").eq("team_id", team).eq("month", month).maybeSingle(); if (fail(e1)) return;
  if (sv && sv.body !== m.base) mixSet(SIMMERGE.merge3(ML(m.base), ML(m.body, m.who), ML(sv.body, sv.who))); // 그 사이 남이 저장한 줄도 살림
  const body = m.body, row = { team_id: team, month, body, who: m.who, by_name: myName ?? "", updated_at: new Date().toISOString() };
  const { error } = await sb.from("leader_mix").upsert(row); if (fail(error)) return;
  m.base = body; m.at = row.updated_at; m.by = row.by_name; if (m.body === body) m.dirty = false;
  const n = new Date(); mixWho(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")} 저장됨`);
}
document.addEventListener("input", (e) => {
  if (e.target.id !== "ldMix" || !LD.mix) return;
  const m = LD.mix, el = e.target;
  m.who = TB.relines(m.body, el.value, m.who, myName ?? ""); m.body = el.value; m.dirty = true; mixPaint(); mixWho("적는 중…");
  clearTimeout(m.tSend); m.tSend = setTimeout(() => { mixChan?.send({ type: "broadcast", event: "mix", payload: { month: m.month, from: m.sent ?? m.base, text: m.body, who: m.who, by: myName ?? "" } }); m.sent = m.body; }, 150);
  clearTimeout(m.tSave); m.tSave = setTimeout(mixSave, 700);
});
document.addEventListener("scroll", (e) => { if (e.target?.id === "ldMix") e.target.previousElementSibling.scrollTop = e.target.scrollTop; }, true);
setInterval(async () => { // 🔁 실시간이 끊겨도 맞춤: 보드가 보이고, 안 적고 있을 때만
  const m = LD.mix; if (!m || m.dirty || !document.body.classList.contains("ldv") || document.hidden || document.activeElement?.id === "ldMix") return;
  const { data } = await sb.from("leader_mix").select("body, who, by_name, updated_at").eq("team_id", m.team).eq("month", m.month).maybeSingle();
  if (!data || data.body === m.body || LD.mix !== m || m.dirty) return;
  Object.assign(m, { base: data.body, at: data.updated_at, by: data.by_name }); mixSet(ML(data.body, data.who));
}, 12000);

// 🤖 AI 전략: 서버 함수 planner-leader-ai (Claude) 가 지점 리더 데이터를 읽고 그달 전략을 씀 · 지점·달마다 1개 저장, 다시 만들면 덮어씀
async function aiDlg(month = statMonth()) {
  const cur = LDC.monthStart(today()), tname = teams.find((t) => t.id === LD.team)?.name ?? (await sb.from("teams").select("name").eq("id", LD.team).maybeSingle()).data?.name ?? "우리 지점";
  const { data: list } = await sb.from("leader_ai").select("month, text, by_name, created_at").eq("team_id", LD.team).order("month", { ascending: false }).limit(24);
  const saved = new Map((list ?? []).map((x) => [x.month, x])), ms = [...new Set([cur, month, ...saved.keys()])].filter((m) => m <= cur).sort().reverse();
  if (month > cur) month = cur;
  const it = saved.get(month), fmt = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  const at = it && new Date(it.created_at);
  const d = dlg(`<div class="ldform ldai"><h2>🤖 ${esc(tname)} 리더 AI 전략</h2>
    <div class="row" style="margin:0;align-items:center"><select id="aiMonth">${ms.map((m) => `<option value="${m}" ${m === month ? "selected" : ""}>${m.slice(0, 4)}년 ${ym(m)}${saved.has(m) ? " ✓" : ""}</option>`).join("")}</select>
      <span class="mut" style="flex:1">${it ? `${at.getMonth() + 1}/${at.getDate()} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")} · ${esc(it.by_name)} 만듦` : "아직 없어요"}</span></div>
    <div class="aitext">${it ? fmt(it.text) : `<p class="mut">이 달 출석·라포·리더나잇·공석·그만둠 기록을 AI 가 읽고 <b>공석 채우기 · 신경 쓸 리더 · 핵심 리더 · 이번 달 체크리스트</b>를 써 줘요.<br>기록이 많을수록 정확해져요. 만드는 데 1분 정도 걸려요.</p>`}</div>
    <div class="row"><span class="mut" style="flex:1;font-size:12px">지점·달마다 하나 저장 · 다시 만들면 새 데이터로 덮어써요</span><button type="button" class="btn ghost" id="ldX">닫기</button><button type="button" class="btn" id="aiGo">${it ? "🔄 다시 만들기" : "✨ 전략 만들기"}</button></div></div>`);
  d.querySelector("#ldX").onclick = () => d.close();
  d.querySelector("#aiMonth").onchange = (e) => aiDlg(e.target.value);
  d.querySelector("#aiGo").onclick = async (e) => {
    if (it && !confirm(`${ym(month)} 전략을 지금 데이터로 다시 만들까요? (지금 것은 덮어써요)`)) return;
    const b = e.target; b.disabled = true; b.textContent = "🤖 만드는 중… (1분 정도)";
    const { error } = await sb.functions.invoke("planner-leader-ai", { body: { team: LD.team, month, force: !!it } });
    if (error) { let m = "전략을 만들지 못했어요"; try { m = (await error.context.json()).error || m; } catch {} b.disabled = false; b.textContent = it ? "🔄 다시 만들기" : "✨ 전략 만들기"; return toast(m); }
    aiDlg(month);
  };
}
function pasteDlg() {
  const d = dlg(`<div class="ldform"><h2>📋 구글시트에서 붙여넣기</h2>
    <p class="mut" style="margin:0">리더 시트에서 <b>구역 제목 줄부터</b>(예: ☀️ 오전 | 월수 11AM …) 리더 줄까지 드래그해 복사(⌘C) → 아래에 붙여넣기(⌘V). 여러 구역을 한 번에 넣어도 돼요. 이름 끝 숫자(예: 김주란4+)는 라포 ⭐로 바뀌어요.</p>
    <textarea id="ldTxt" rows="10" placeholder="여기에 붙여넣기"></textarea><div id="ldPrev" class="mut"></div>
    <div class="row"><span style="flex:1"></span><button type="button" class="btn ghost" id="ldX">취소</button><button class="btn" id="ldGo" disabled>추가</button></div></div>`);
  const t = d.querySelector("#ldTxt"), go = d.querySelector("#ldGo");
  let rows = [];
  t.oninput = () => {
    rows = LDC.parsePaste(t.value); go.disabled = !rows.length; go.textContent = `${rows.length}명 추가`;
    const by = {}; rows.forEach((r) => { const k = `${r.grp} ${r.slot}`; by[k] = (by[k] ?? 0) + 1; });
    d.querySelector("#ldPrev").textContent = rows.length ? `읽은 리더: ${Object.entries(by).map(([k, n]) => `${k} ${n}명`).join(" · ")}` : t.value.trim() ? "리더 줄을 못 찾았어요 — 구역 제목(월수 11AM 같은) 줄부터 같이 복사해 주세요" : "";
  };
  d.querySelector("#ldX").onclick = () => d.close();
  go.onclick = async () => {
    const base = Date.now() / 1000, by = myName ?? "";
    const { data: added, error } = await sb.from("leaders").insert(rows.map(({ att, ...r }, i) => ({ ...r, team_id: LD.team, sort: base + i, rapport_by: r.rapport ? by : "" }))).select("id, rapport");
    if (fail(error)) return;
    const rp = added.filter((x) => x.rapport).map((x) => ({ leader_id: x.id, month: LDC.monthStart(today()), rapport: x.rapport, rapport_by: by })); // 시트 별점 → 이번 달 라포
    if (rp.length && fail((await sb.from("leader_months").upsert(rp)).error)) return; d.close(); toast(`${rows.length}명 추가했어요`); LD.load();
  };
}

document.addEventListener("click", async (e) => {
  const v = V(); if (!v || !v.contains(e.target)) return;
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.flt) { LD.filter = b.dataset.flt; try { localStorage.setItem("ld-filter", LD.filter); } catch {} return LD.render(); }
  if (b.dataset.mode) { LD.mode = b.dataset.mode; try { localStorage.setItem("ld-mode", LD.mode); } catch {} return LD.load(); }
  if (b.dataset.nav !== undefined) {
    const n = +b.dataset.nav;
    LD.anchor = !n ? today() : LDC.addMonths(LD.anchor, n);
    return LD.load();
  }
  if (b.id === "ldAdd") return editDlg(null);
  if (b.id === "ldAddSub") return editDlg(null, "sub");
  if (b.id === "ldPaste") return pasteDlg();
  if (b.id === "ldAI") return aiDlg();
  if (b.dataset.goto) { // 현황표 → 보드의 그 줄 (지금 보기 필터·달에 없으면 알려 줌)
    const t = v.querySelector(`.ldblk tr[data-id="${b.dataset.goto}"]`); if (!t) return toast("지금 보기(필터·달)에는 없는 줄이에요 — 전체 · 오늘로 바꿔 보세요");
    t.scrollIntoView({ behavior: "smooth", block: "center" }); t.classList.add("flash"); return setTimeout(() => t.classList.remove("flash"), 1600); }
  const tr = b.closest("tr[data-id]"), r = tr && LD.rows.find((x) => x.id == tr.dataset.id); if (!r) return;
  const sm = statMonth();
  if (b.dataset.star) { const n = +b.dataset.star === mon(r, sm)?.rapport ? null : +b.dataset.star; // 그달 라포 · 같은 별 다시 누르면 지움
    const row = { leader_id: r.id, month: sm, rapport: n, rapport_by: n ? myName ?? "" : "", at: new Date().toISOString() };
    const { data: nr, error } = await sb.from("leader_months").upsert(row).select().single(); if (fail(error)) return;
    LD.mon.set(`${r.id}:${sm}`, nr); if (sm >= LDC.monthStart(today())) Object.assign(r, { rapport: n, rapport_by: row.rapport_by }); return LD.render(); }
  if (b.dataset.night !== undefined) { const v = !mon(r, sm)?.night; // 🌙 그달 리더나잇 왔는지
    const { data: nr, error } = await sb.from("leader_months").upsert({ leader_id: r.id, month: sm, night: v, at: new Date().toISOString() }).select().single(); if (fail(error)) return;
    LD.mon.set(`${r.id}:${sm}`, nr); return LD.render(); }
  if (b.dataset.promote !== undefined) { const v = !r.promote; // ⭐ 서브리더 → 메인 승격 후보
    const { error } = await sb.from("leaders").update({ promote: v }).eq("id", r.id); if (fail(error)) return; r.promote = v; return LD.render(); }
  if (b.dataset.cert) return certDlg(r, +b.dataset.cert);
  if (b.dataset.edu !== undefined) { const v = !r.edu_done; // 🎓 리더교육 했는지
    const { error } = await sb.from("leaders").update({ edu_done: v }).eq("id", r.id); if (fail(error)) return; r.edu_done = v; return LD.render(); }
  if (b.dataset.end !== undefined) return endDlg(r);
  if (b.dataset.del !== undefined) return delRow(r);
  if (b.dataset.ldedit !== undefined) return editDlg(r);
  if (b.dataset.endback !== undefined) { if (!confirm(`${r.name} 그만둠(${md(r.end_day)} · ${r.end_reason || "이유 없음"})을 취소하고 다시 활동으로 바꿀까요?`)) return;
    const { error } = await sb.from("leaders").update({ end_day: null, end_reason: "", end_note: "" }).eq("id", r.id); if (fail(error)) return; toast("다시 활동으로 바꿨어요"); return LD.load(); }
  if (b.dataset.st !== undefined) { const s = r.status === "구해야 함" ? "확정" : "구해야 함", up = { status: s };
    if (s === "확정" && r.name === VACANT) { const n = prompt("새 리더 이름은요? (오늘이 첫 시작일로 들어가요)", ""); if (!n?.trim()) return; Object.assign(up, { name: n.trim(), start_day: today() }); } // 빈 자리 줄 → 새 리더
    const { data: nr, error } = await sb.from("leaders").update(up).eq("id", r.id).select("status, need_since, name, start_day").single(); if (fail(error)) return; Object.assign(r, nr); return LD.render(); } // need_since 는 서버가 정함
  if (b.dataset.att) { // O → X → X+대타 → 비움
    const d = b.dataset.att, m = LD.att.get(r.id), cur = m.get(d) ?? "", cs = LD.subs.get(r.id).get(d) ?? "";
    let nx = cur === "" ? "O" : cur === "O" ? "X" : "", sub = "";
    if (cur === "X" && !cs) { const v = prompt(`${md(d)}(${dw(d)}) ${r.name} 대신 누가 와줬나요? (대타 이름 — 그 리더는 출석으로 인정돼요)\n비우고 확인하면 기록을 지워요`, ""); if (v === null) return;
      if (v.trim()) { nx = "X"; sub = v.trim().slice(0, 40); } }
    const { error } = nx ? await sb.from("leader_att").upsert({ leader_id: r.id, day: d, state: nx, sub, by_name: myName ?? "", at: new Date().toISOString() })
      : await sb.from("leader_att").delete().eq("leader_id", r.id).eq("day", d);
    if (fail(error)) return; return LD.load(); // 대타 인정은 다른 리더 줄에도 반영돼서 다시 불러옴
  }
  if (b.dataset.aw) { const k = `${r.id}:${b.dataset.aw}`, aw = LD.awards.get(k);
    if (aw) { if (!confirm(`${ym(b.dataset.aw)} 개근 혜택 기록을 지울까요? (${aw.by_name} · ${aw.note || "메모 없음"})`)) return;
      const { error } = await sb.from("leader_awards").delete().eq("leader_id", r.id).eq("month", b.dataset.aw); if (fail(error)) return; LD.awards.delete(k); return LD.render(); }
    const note = prompt(`${r.name} 리더 ${ym(b.dataset.aw)} 개근 🏆 — 어떤 혜택을 줬나요? (예: 커피 쿠폰)`, ""); if (note === null) return;
    const row = { leader_id: r.id, month: b.dataset.aw, note: note.trim(), by_name: myName ?? "" };
    const { error } = await sb.from("leader_awards").insert(row); if (fail(error)) return; LD.awards.set(k, row); toast("🎁 혜택 기록했어요"); return LD.render();
  }
});
// 🔄 전산 리더 출석 → 플래너 (매일 예약 작업이 전산 탭에서 모은 걸 넘겨줌, 대표 계정에서만)
// data = { branches: { DAEGUDSR: { r: [[이름, 전화], …], a: [[날짜, r번호, 'O'|'X', 전산 수업 이름], …] }, … } }
LD.syncJeonsan = async function (data) {
  const report = {};
  if (!teams.length) teams = (await sb.from("teams").select("*").order("sort")).data ?? [];
  for (const [code, b] of Object.entries(data.branches ?? {})) {
    if (b.error) { report[code] = "전산 오류: " + b.error; continue; }
    const team = teams.find((t) => t.name === LDC.JEONSAN[code]); if (!team) { report[code] = "플래너 지점 없음"; continue; }
    const { data: rows, error } = await sb.from("leaders").select("id, name, phone, grp, slot").eq("team_id", team.id); if (error) { report[code] = error.message; continue; }
    const first = (i) => b.a.find((x) => x[1] === i)?.[3] ?? "";
    const hit = b.r.map(([n, p], i) => LDC.matchJeonsan(n, p, rows, first(i))), up = new Map(), miss = new Set(), added = [];
    // 플래너에 없는 전산 리더 → 자동 추가 (전산 수업 이름으로 반·시간대 칸 찾기). 이름 없는 리더('?')는 건너뜀
    for (const [i, [n, p]] of b.r.entries()) {
      if (hit[i] || !n || n === "?") continue;
      const course = first(i), { grp, slot } = LDC.courseSlot(course, rows);
      const { data: nl, error: e2 } = await sb.from("leaders").insert({ team_id: team.id, kind: "leader", grp, slot, name: n, phone: p, note: `전산에서 자동 추가 (${course || "수업 모름"})` }).select("id, name, phone, grp, slot").single();
      if (e2) { miss.add(n); continue; } hit[i] = nl; rows.push(nl); added.push(n);
    }
    for (const [d, i, st, course] of b.a) { if (d < LDC.SYNC_START) continue; if (!hit[i]) { miss.add(b.r[i][0]); continue; }
      const l = LDC.matchJeonsan(b.r[i][0], b.r[i][1], rows, course) ?? hit[i]; // 같은 사람 여러 줄이면 그날 수업 반에 맞는 줄
      up.set(`${l.id}:${d}`, { leader_id: l.id, day: d, state: st, by_name: "전산", at: new Date().toISOString(), ...(st === "O" ? { sub: "" } : {}) }); }
    const list = [...up.values()], os = list.filter((x) => x.state === "O"), xs = list.filter((x) => x.state === "X"); // X 는 sub(대타) 안 건드림 — 열이 다르면 한 번에 못 보냄
    const errs = (await Promise.all([os, xs].filter((l) => l.length).map((l) => sb.from("leader_att").upsert(l)))).map((r) => r.error?.message).filter(Boolean);
    report[team.name] = errs.length ? errs.join(" / ") : { 반영: list.length, 새로추가: added, 못찾은리더: [...miss] };
  }
  if (V() && document.body.classList.contains("ldv")) LD.load();
  return report;
};
// 예약 작업용: ① 1회용 표 받기(대표) → 전산 탭이 그 표로 전달함에 넣음 → ② 꺼내서 반영하고 지움
LD.syncTicket = async () => { const { data, error } = await sb.rpc("leader_sync_ticket"); if (error) throw error; return data; };
LD.syncInbox = async function (ticket) {
  const { data, error } = await sb.from("leader_sync_inbox").select("payload").eq("ticket", ticket).maybeSingle();
  if (error) return { error: error.message }; if (!data?.payload) return { error: "전달함이 비어 있어요 (전산 탭에서 못 넣음)" };
  if (data.payload.error) return { error: data.payload.error };
  const report = await LD.syncJeonsan(data.payload);
  await sb.from("leader_sync_inbox").delete().eq("ticket", ticket);
  return { 모은시각: data.payload.at, ...report };
};
document.addEventListener("click", (e) => { const c = e.target.closest(".ed1"); if (c && V()?.contains(c) && !e.target.closest("a")) cellEdit(e); }); // ✏️ 첫 시작일·특이사항·전화: 한 번 누르면 고침
document.addEventListener("dblclick", (e) => cellEdit(e));
function cellEdit(e) {
  const v = V(); if (!v || !v.contains(e.target)) return;
  const c = e.target.closest("[data-f]"), tr = c?.closest("tr[data-id]"), r = tr && LD.rows.find((x) => x.id == tr.dataset.id); if (!r || c.querySelector("input")) return;
  const f = c.dataset.f, inp = document.createElement("input");
  inp.className = "ldin"; if (f === "start_day" || f === "need_since") inp.type = "date"; inp.value = f === "start_day" ? LDC.parseDay(r[f]) ?? "" : r[f] ?? ""; inp.placeholder = { name: "이름", phone: "010-0000-0000", start_day: "2026-10-26", note: "특이사항", slot: "시간대·업무", level: "레벨", seat: "자리", avail: "예) 화목 저녁 · 주말 오전" }[f] ?? "";
  c.replaceChildren(inp); inp.focus(); inp.select();
  let done = false;
  const save = async () => {
    if (done) return; done = true; const val = inp.value.trim();
    if (val === (r[f] ?? "") || (f === "name" && !val)) return LD.render();
    const { data: nr, error } = await sb.from("leaders").update({ [f]: f === "need_since" ? val || null : val }).eq("id", r.id).select(f).single(); if (fail(error)) return LD.render(); // 구해야 함 시작일 비우면 서버가 오늘로
    r[f] = nr[f]; toast("저장했어요"); LD.render();
  };
  inp.onkeydown = (k) => { if (k.key === "Enter" && !k.isComposing) { k.preventDefault(); save(); } if (k.key === "Escape") { done = true; LD.render(); } };
  inp.onblur = save;
}
// 🔍 리더 찾기: 이름 일부·전화 뒷자리 → 보드에서 그 줄로 이동·깜빡 (Enter 또 누르면 다음 사람) · 지금 보기에 없으면 어디 있는지 알려 줌
function findLeader(q) {
  const n = (x) => String(x ?? "").replace(/\s/g, "").toLowerCase(), k = n(q), dg = q.replace(/\D/g, "");
  if (!k) return;
  const hit = LD.rows.filter((r) => r.name !== VACANT && (n(r.name).includes(k) || (dg.length >= 4 && String(r.phone ?? "").replace(/\D/g, "").includes(dg))));
  if (!hit.length) return toast(`'${q}' 리더가 없어요`);
  const trs = hit.map((r) => V().querySelector(`.ldblk tr[data-id="${r.id}"]`)).filter(Boolean);
  if (!trs.length) { const r = hit[0]; return toast(`${r.name}: ${r.end_day ? `${md(r.end_day)} 그만둔 리더 — 그 달로 가 보세요` : "지금 보기(필터·달)에는 없어요 — 전체 · 오늘로 바꿔 보세요"}`); }
  LD.findI = LD.findQ === q ? (LD.findI + 1) % trs.length : 0; LD.findQ = q;
  const t = trs[LD.findI]; t.scrollIntoView({ behavior: "smooth", block: "center" }); t.classList.add("flash"); setTimeout(() => t.classList.remove("flash"), 1600);
  if (trs.length > 1) toast(`${LD.findI + 1}/${trs.length}번째 — Enter 누르면 다음`);
}
document.addEventListener("keydown", (e) => { if (e.target.id === "ldFind" && e.key === "Enter" && !e.isComposing) { e.preventDefault(); findLeader(e.target.value.trim()); } });
document.addEventListener("change", (e) => { if (e.target.id === "ldFind" && LD.rows.some((r) => r.name === e.target.value)) findLeader(e.target.value); }); // 자동완성 목록에서 고르면 바로
document.addEventListener("contextmenu", (e) => {
  const v = V(); if (!v || !v.contains(e.target) || e.target.closest("input")) return;
  const tr = e.target.closest("tr[data-id]"), r = tr && LD.rows.find((x) => x.id == tr.dataset.id); if (!r) return;
  e.preventDefault(); editDlg(r);
});
document.addEventListener("change", async (e) => {
  const id = e.target.dataset?.nn; if (!id) return; // 🔴 현황표 팀 특이사항 (칸에서 나가면 저장)
  const r = LD.rows.find((x) => x.id == id), val = e.target.value.trim();
  const { error } = await sb.from("leaders").update({ need_note: val }).eq("id", id); if (fail(error)) return; if (r) r.need_note = val; toast("팀 특이사항 저장했어요");
});
document.addEventListener("change", (e) => { if (e.target.id === "ldTeam") { LD.team = +e.target.value; try { localStorage.setItem("ld-team", LD.team); } catch {} LD.load(); } });
})();
