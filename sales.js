// 💰 매출 목표 탭: 월 목표 → 필요 지원자·회신·상담·결제 역산, 일일 실적 달력(상담 최소·행동 요령), 자동 문제점·실행 전략·보고문.
// 지점(팀)·월마다 sales_plans 1줄 + 날마다 sales_days 1줄. 같은 지점 매니저끼리 실시간 공유, 대표는 전 지점.
// index.html 의 sb·me·$·esc·toast·fail·isBoss·previewTeam·teams 를 씀. 이름 충돌 막으려고 전부 감쌈 → window.SL
(() => {
const MEMBERS = () => [{ name: "Premium", price: 2470000, n: 8 }, { name: "Pro Max", price: 1900000, n: 6 }, { name: "Pro", price: 1140000, n: 13 }, { name: "Plus", price: 760000, n: 6 }];
const RATES = { goal: 50000000, reply: 35, consult: 65, pay: 36.3, arpu: 1531515, refundRate: 0, firstContact: 30 };
const OFF = [5]; // 휴무 요일 (0=일 … 5=금)

const won = (n) => Math.round(n || 0).toLocaleString("ko-KR");
const num = (s) => +String(s).replace(/[^\d.-]/g, "") || 0;
const pct = (n) => (Math.round(n * 10) / 10).toLocaleString("ko-KR");
const D = (s) => new Date(s + "T00:00:00");
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = D(s); d.setDate(d.getDate() + n); return iso(d); };
const md = (s) => `${D(s).getMonth() + 1}월 ${D(s).getDate()}일`;
const todayIso = () => iso(new Date());
const isOff = (d) => OFF.includes(D(d).getDay());
const mStart = (s) => s.month + "-01";
// 집계 시작일: 그 달 안의 날짜면 그날부터, 아니면 1일 (예: 10/15~31 목표)
const pStart = (s) => s.start && s.start.slice(0, 7) === s.month ? s.start : mStart(s);
const mEnd = (s) => { const [y, m] = s.month.split("-").map(Number); return iso(new Date(y, m, 0)); };
// from 다음 날부터 to까지 영업일 수
const workDays = (from, to) => { let n = 0; for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (!isOff(d)) n++; return n; };
const newPlan = (month, prev) => ({ ...RATES, members: MEMBERS(), ...(prev ? pick(prev) : {}),
  month, start: month + "-01", current: 0, base: addDays(month + "-01", -1), end: mEnd({ month }), problems: "", strategyAdd: "" });
const pick = (p) => Object.fromEntries(["goal", "reply", "consult", "pay", "arpu", "refundRate", "firstContact", "members"].filter((k) => p[k] != null).map((k) => [k, p[k]]));

// 목표 금액에서 거꾸로: 결제자 → 상담자 → 회신자 → 지원자 (단계마다 올림)
function need(s, amount) {
  const rf = Math.min(0.99, (s.refundRate || 0) / 100), up = (x, r) => r > 0 ? Math.ceil(x / r - 1e-9) : 0;
  const payers = amount > 0 ? up(amount, s.arpu * (1 - rf)) : 0;
  const consults = up(payers, s.pay / 100), replies = up(consults, s.consult / 100), apps = up(replies, s.reply / 100);
  const revenue = Math.round(payers * s.arpu), refundAmt = Math.round(revenue * rf);
  return { apps, replies, consults, payers, revenue, refundAmt, netAdd: revenue - refundAmt };
}
function calc(s) {
  const remain = Math.max(0, s.goal - s.current);
  const days = Math.max(1, workDays(s.base, s.end));
  const r = need(s, remain);
  const month = { ...need(s, s.goal), days: Math.max(1, workDays(addDays(pStart(s), -1), mEnd(s))) };
  month.needApps = month.apps; if (s.appsGoal > 0) month.apps = s.appsGoal; // 지원자수 직접 입력하면 그 숫자가 목표 (비우면 계산값)
  return { ...r, remain, days, month, final: s.current + r.netAdd, rate: s.goal ? s.current / s.goal * 100 : 0,
    perDay: { apps: r.apps / days, replies: r.replies / days, consults: r.consults / days, payers: r.payers / days } };
}
// 기준일 다음 날~오늘 달력 실적 합계 (앞날 입력은 예약이라 뺌)
function actuals(s) {
  const t = { apps: 0, replies: 0, consults: 0, payers: 0, amount: 0, refund: 0, signup: 0, days: 0, appDays: 0 }, td = todayIso();
  for (const [d, e] of Object.entries(s.log)) {
    if (d <= (s.linked ? addDays(pStart(s), -1) : s.base) || d > s.end || d > td) continue; // 시트 연동이면 집계 시작일부터 (휴무일 매출도 포함)
    t.days++; if (e.apps != null) t.appDays++;
    for (const k of ["apps", "replies", "consults", "payers", "amount", "refund", "signup"]) t[k] += e[k] || 0;
  }
  t.arpu = t.payers ? (s.linked ? t.signup : t.amount) / t.payers : 0; // 객단가 = 가입 금액 ÷ 가입 인원 (시트 연동)
  t.net = s.linked ? t.amount - t.refund : s.current + t.amount - t.refund;
  return t;
}
// 오늘까지 실적을 반영해 남은 영업일에 필요한 인원을 다시 계산
function catchUp(s, a) {
  const td = todayIso(), from = td < s.base ? s.base : td;
  const left = Math.max(0, workDays(from, s.end)) || 1;
  const n = Math.max(0, s.goal - (a.days ? a.net : s.current)), x = need(s, n);
  return { left, need: n, payN: x.payers, conN: x.consults, repN: x.replies, appN: x.apps };
}
const minConsult = (c) => Math.max(1, Math.round(c.perDay.consults));

// 재무 시트가 연결된 지점: 결제자·결제금액·환불은 시트 값(직접 입력 안 씀), 현재 순매출 = 시트의 1일~기준일 합계
function compose(plan, log, sheet) {
  const linked = !!sheet?.sync && !sheet.sync.error;
  if (!linked) return { ...plan, log, linked };
  const out = {};
  for (const [d, e] of Object.entries(log)) out[d] = { ...e, amount: 0, refund: 0, payers: 0 };
  for (const [d, v] of Object.entries(sheet.days)) out[d] = { ...(out[d] || {}), amount: v.amount, refund: v.refund, payers: v.payers, signup: v.signup, sheet: true };
  // 기준일 = 오늘(자동). 집계 시작 전이면 시작 전날, 달이 지났으면 말일 → 현재 순매출이 늘 오늘까지 시트 합계
  const td = todayIso(), base = td < pStart(plan) ? addDays(pStart(plan), -1) : td > mEnd(plan) ? mEnd(plan) : td;
  let current = 0;
  for (const [d, v] of Object.entries(sheet.days)) if (d >= pStart(plan) && d <= base) current += v.amount - v.refund;
  return { ...plan, base, log: out, linked, current };
}
// 이 달 1일~오늘 누계 (기준일과 무관)
function mtd(s) {
  const t = { apps: 0, replies: 0, consults: 0, payers: 0, amount: 0, refund: 0, signup: 0 }, to = todayIso() < mEnd(s) ? todayIso() : mEnd(s);
  for (const [d, e] of Object.entries(s.log)) if (d >= pStart(s) && d <= to) for (const k in t) t[k] += e[k] || 0;
  t.net = s.linked ? t.amount - t.refund : actuals(s).net;
  return t;
}
// [1] 목표(직접 입력) vs 현재(자동): 회신·상담은 달력 입력, 결제·금액은 시트(없으면 달력)
// 비율은 직접 입력. 0·빈칸이면 계산이 전부 0명이 되므로 그 칸만 회사 기본값으로 계산 (s.zero 에 표시)
const RATE_KEYS = ["reply", "consult", "pay", "arpu", "refundRate"];
function applyAuto(s) {
  s.zero = RATE_KEYS.filter((k) => k !== "refundRate" && !(s[k] > 0));
  for (const k of s.zero) s[k] = RATES[k];
  return s;
}

// 기능 2: 비율을 조금씩 올렸을 때 남은 목표에 필요한 지원자가 얼마나 줄어드는지 → 효과 큰 순서
function levers(s) {
  const left = Math.max(0, s.goal - mtd(s).net), base = need(s, left);
  const netAt = (x, apps) => apps * x.reply / 100 * x.consult / 100 * x.pay / 100 * x.arpu * (1 - Math.min(0.99, (x.refundRate || 0) / 100));
  const rf = s.refundRate || 0, p = (v) => pct(v) + "%";
  const L = [["reply", `회신율 ${p(s.reply)} → ${p(s.reply + 5)}`, { reply: s.reply + 5 }],
    ["consult", `상담률 ${p(s.consult)} → ${p(Math.min(100, s.consult + 5))}`, { consult: Math.min(100, s.consult + 5) }],
    ["pay", `결제율 ${p(s.pay)} → ${p(Math.min(100, s.pay + 5))}`, { pay: Math.min(100, s.pay + 5) }],
    ["arpu", `객단가 ${won(s.arpu)} → ${won(s.arpu + 100000)}원`, { arpu: s.arpu + 100000 }]];
  if (rf > 0) L.push(["refund", `환불율 ${p(rf)} → ${p(Math.max(0, rf - 10))}`, { refundRate: Math.max(0, rf - 10) }]);
  const rows = L.map(([k, lab, ch]) => { const x = { ...s, ...ch }, n = need(x, left);
    return { k, lab, apps: n.apps, payers: n.payers, save: base.apps - n.apps, gain: Math.round(netAt(x, base.apps) - netAt(s, base.apps)) }; })
    .sort((x, y) => y.save - x.save || y.gain - x.gain);
  return { left, base, rows };
}
function leverHtml(s) {
  const { left, base, rows } = levers(s);
  if (!left) return `<p>이번 달 목표를 이미 채웠습니다 🎉</p>`;
  return `<p class="slhint">지금 비율 그대로면 남은 ${won(left)}원에 <b>지원자 ${base.apps}명 · 결제자 ${base.payers}명</b>이 필요합니다. 하나씩 올렸을 때:</p>
  <ol class="sllever">${rows.map((r, i) => `<li class="${i === 0 ? "top" : ""}"><b>${r.lab}${i === 0 ? " 🥇" : ""}</b>
    <span>필요 지원자 ${base.apps}명 → ${r.apps}명 <em class="up">(−${r.save}명)</em> · 필요 결제자 ${base.payers}명 → ${r.payers}명 · 같은 지원자 ${base.apps}명이면 순매출 <em class="up">+${won(r.gain)}원</em></span></li>`).join("")}</ol>
  <p class="slhint">실행 전략은 이 순서(효과 큰 순)대로 정렬됩니다. 비율은 [1]에 입력한 값 기준입니다.</p>`;
}

// [3] 멤버십 비율: Premium(가장 비싼) 비율을 가장 높게, 나머지는 똑같이. [1] 객단가 A 에 맞춰 Premium = (A − 나머지 평균) ÷ (Premium − 나머지 평균).
// Premium 이 가장 높으려면 최소 1/(멤버십 수) → 그보다 낮은 A 면 전부 고르게(객단가는 목표보다 조금 높아짐)
// 인원 = 필요 결제자 × 비율 (내림 후 남는 인원은 비싼 멤버십부터)
function memberMix(s, payers) {
  const ms = s.members.map((m, i) => ({ ...m, i, w: 0 })), live = ms.filter((m) => m.price > 0);
  const sumP = ms.reduce((t, m) => t + (m.p || 0), 0);
  if (ms.every((m) => typeof m.p === "number") && sumP > 0) for (const m of ms) m.w = m.p / sumP; // 직접 정한 비율
  else if (live.length) {
    const hi = live.reduce((a, b) => (b.price > a.price ? b : a)), rest = live.filter((m) => m !== hi);
    if (!rest.length) hi.w = 1;
    else {
      const q = rest.reduce((t, m) => t + m.price, 0) / rest.length;
      hi.w = Math.min(1, Math.max(1 / live.length, (s.arpu - q) / (hi.price - q)));
      for (const m of rest) m.w = (1 - hi.w) / rest.length;
    }
  }
  const raw = ms.map((m) => m.w * payers), n = raw.map(Math.floor);
  let rest = payers - n.reduce((a, b) => a + b, 0);
  ms.filter((m) => m.w > 0 && raw[m.i] > n[m.i]).sort((a, b) => b.price - a.price).slice(0, rest).forEach((m) => n[m.i]++); // 남는 인원은 비싼 멤버십부터 → 객단가가 목표 밑으로 안 내려감
  return ms.map((m, i) => ({ ...m, n: n[i] }));
}

// 비율(0~1) → 소수 첫째 자리 %, 합계 정확히 100 (차이는 가장 비싼 멤버십에서)
const toPct = (ms) => { const v = ms.map((m) => Math.round(m.w * 1000) / 10), hi = ms.reduce((a, m, i) => (m.price > ms[a].price ? i : a), 0);
  v[hi] = Math.round((v[hi] + 100 - v.reduce((t, x) => t + x, 0)) * 10) / 10; return v; };
// [3] 직접 정한 비율로 객단가·필요 결제자 계산 + 목표 객단가 맞추는 가이드(싼 멤버십 → Premium 으로 옮기기)
function mixPlan(s, c) {
  const base = memberMix(s, 0), mixA = base.reduce((t, m) => t + m.w * m.price, 0) || s.arpu;
  const pN = need({ ...s, arpu: mixA }, c.remain).payers, mix = memberMix(s, pN);
  const sumP = s.members.every((m) => typeof m.p === "number") ? s.members.reduce((t, m) => t + m.p, 0) : 100;
  let guide = null;
  if (mixA < s.arpu - 1) {
    const w = base.map((m) => ({ ...m })), live = w.filter((m) => m.price > 0), hi = live.reduce((a, b) => (b.price > a.price ? b : a));
    let gap = s.arpu - mixA;
    for (const m of live.filter((x) => x !== hi).sort((a, b) => a.price - b.price)) {
      if (gap <= 0) break;
      const take = Math.min(m.w, gap / (hi.price - m.price)); m.w -= take; hi.w += take; gap -= take * (hi.price - m.price);
    }
    guide = { ok: gap <= 1, w: toPct(w), moves: w.map((m, i) => ({ name: m.name, d: Math.round((m.w - base[i].w) * 1000) / 10 })).filter((x) => x.d) };
  }
  return { mix, mixA, pN, sumP, guide };
}

function compareFill(s, c) {
  const m = mtd(s), r = (x, y) => y ? x / y * 100 : null;
  const arpu = m.payers ? (s.linked ? m.signup : m.amount) / m.payers : null;
  const el = workDays(addDays(pStart(s), -1), todayIso() < mEnd(s) ? todayIso() : mEnd(s)), planNet = s.goal / c.month.days * el;
  const f = (v, u) => v == null ? "-" : u === "원" ? won(v) + "원" : pct(v) + "%";
  const cell = (g, v, u, dir, k) => { if (v == null) return `<b>-</b><small>아직 데이터 없음</small>`; const d = v - g, good = d * dir >= 0;
    return `<b>${f(v, u)}</b><small class="${good ? "up" : "dn"}">${d >= 0 ? "▲" : "▼"} ${u === "원" ? won(Math.abs(d)) + "원" : pct(Math.abs(d)) + "%p"} ${good ? "목표 이상" : "목표 미달"}</small>`; };
  const nd = m.net - planNet;
  setH("slCur_goal", `<b>${won(m.net)}원 (${pct(m.net / s.goal * 100)}%)</b><small class="${nd >= 0 ? "up" : "dn"}">오늘까지 계획 ${won(planNet)}원 대비 ${nd >= 0 ? "▲" : "▼"} ${won(Math.abs(nd))}원</small>`);
  const ag = $v('[data-k="appsGoal"]'); if (ag !== document.activeElement) ag.value = c.month.apps; // 비워 두면 월 목표에서 계산한 값
  const ap = workDays(addDays(pStart(s), -1), todayIso() < mEnd(s) ? todayIso() : mEnd(s)) * c.month.apps / c.month.days;
  setH("slCur_apps", m.apps ? `<b>${m.apps.toLocaleString()}명</b><small class="${m.apps >= ap ? "up" : "dn"}">오늘까지 계획 ${Math.round(ap)}명 대비 ${m.apps >= ap ? "▲" : "▼"} ${Math.abs(Math.round(m.apps - ap))}명</small>` : `<b>-</b><small>달력에 지원자 입력 없음</small>`);
  setH("slCur_reply", cell(s.reply, r(m.replies, m.apps), "%", 1, "reply"));
  setH("slCur_consult", cell(s.consult, r(m.consults, m.replies), "%", 1, "consult"));
  setH("slCur_pay", cell(s.pay, r(m.payers, m.consults), "%", 1, "pay"));
  setH("slCur_arpu", cell(s.arpu, arpu, "원", 1, "arpu"));
  setH("slCur_refundRate", cell(s.refundRate || 0, r(m.refund, m.amount), "%", -1, "refundRate"));
  setH("slCompare", `<p class="slhint">현재 = ${md(pStart(s))}~오늘 누계 · 회신·상담은 달력 입력${s.linked ? ", 결제·금액은 재무 시트" : ", 결제·금액도 달력 입력"}</p>`);
}

// 📅 일일 / 🗓 주간 목표 카드: 목표(월 목표에서 자동으로 나눔) | 현재 | 차이. days = 그 기간의 날짜들
const monOf = (d) => { const k = (D(d).getDay() + 6) % 7; return addDays(d, -k); };
function periodCard(s, c, days, title, nav) {
  const td = todayIso(), wd = c.month.days, work = days.filter((d) => !isOff(d)).length;
  const per = (n) => n / wd * work, past = days.filter((d) => d <= td);
  const sum = (k) => past.reduce((x, d) => x + (s.log[d]?.[k] || 0), 0), has = (k) => past.some((d) => s.log[d]?.[k] != null);
  const act = { net: sum("amount") - sum("refund"), apps: sum("apps"), replies: sum("replies"), consults: sum("consults"), payers: sum("payers") };
  const goal = { net: per(s.goal), apps: per(c.month.apps), replies: per(c.month.replies), consults: per(c.month.consults), payers: per(c.month.payers) };
  const future = days[0] > td, off = !work;
  const n1 = (v) => (Math.round(v * 10) / 10).toLocaleString("ko-KR");
  const row = (lab, g, a, ok, u = "명") => {
    const gs = u === "원" ? won(g) + "원" : n1(g) + "명";
    if (future || !ok) return `<tr><td>${lab}</td><td>${gs}</td><td class="mut">${future ? "아직 안 옴" : "입력 없음"}</td><td></td></tr>`;
    const d = a - g, good = d >= 0;
    return `<tr><td>${lab}</td><td>${gs}</td><td><b>${u === "원" ? won(a) + "원" : a + "명"}</b></td><td class="${good ? "up" : "dn"}">${good ? "▲" : "▼"} ${u === "원" ? won(Math.abs(d)) + "원" : n1(Math.abs(d)) + "명"}</td></tr>`; };
  const rate = (lab, g, x, y) => { if (future || !y) return `<tr><td>${lab}</td><td>${pct(g)}%</td><td class="mut">-</td><td></td></tr>`;
    const v = x / y * 100, d = v - g; return `<tr><td>${lab}</td><td>${pct(g)}%</td><td><b>${pct(v)}%</b></td><td class="${d >= 0 ? "up" : "dn"}">${d >= 0 ? "▲" : "▼"} ${pct(Math.abs(d))}%p</td></tr>`; };
  const pctDone = goal.net ? act.net / goal.net * 100 : 0;
  const head = `<div class="slphead">${nav}<b>${title}</b>${off ? `<span class="mut">휴무</span>` : future ? "" : `<span class="${act.net >= goal.net ? "up" : "dn"}">${pct(pctDone)}% ${act.net >= goal.net ? "✓ 달성" : "✗ 미달"}</span>`}</div>`;
  const bar = off || future ? "" : `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pctDone))}%"></i></div>`;
  const strip = days.length > 1 ? `<div class="slstrip">${days.map((d) => { const e = s.log[d], v = e ? (e.amount || 0) - (e.refund || 0) : 0;
    const cls = isOff(d) ? "o" : d > td ? "f" : v >= s.goal / wd ? "y" : "n";
    return `<span class="${cls}" title="${md(d)} ${won(v)}원"><small>${"일월화수목금토"[D(d).getDay()]}</small>${isOff(d) ? "휴" : d > td ? D(d).getDate() : cls === "y" ? "✓" : "✗"}</span>`; }).join("")}</div>` : "";
  return head + bar + strip + `<table class="slt slcmp"><tr><th></th><th>목표</th><th>현재</th><th>차이</th></tr>
    ${row("순매출", goal.net, act.net, has("amount") || s.linked, "원")}${row("지원자", goal.apps, act.apps, has("apps"))}${row("회신자", goal.replies, act.replies, has("replies"))}
    ${row("상담자", goal.consults, act.consults, has("consults"))}${row("결제자", goal.payers, act.payers, has("payers") || s.linked)}
    ${rate("회신율", s.reply, act.replies, act.apps)}${rate("상담률", s.consult, act.consults, act.replies)}${rate("결제율", s.pay, act.payers, act.consults)}</table>
    <p class="slhint">목표 = 월 목표 ÷ 영업일 ${wd}일${days.length > 1 ? ` × 이 주 영업일 ${work}일` : ""}${days.length > 1 ? " · 오늘까지 합계" : ""}</p>`;
}
function dayWeekCards(s, c) {
  const td = todayIso(), inM = (d) => d >= pStart(s) && d <= mEnd(s);
  let d = SL.day && inM(SL.day) ? SL.day : (inM(td) ? td : pStart(s));
  const navD = `<button class="rtnav" data-slday="-1">‹</button><button class="rtnav" data-slday="1">›</button>${d !== td && inM(td) ? `<button class="rtnav wk" data-slday="0">오늘</button>` : ""}`;
  const dayHtml = periodCard(s, c, [d], `${md(d)}(${"일월화수목금토"[D(d).getDay()]})${d === td ? " · 오늘" : ""}`, navD);
  let w = SL.week && SL.week <= mEnd(s) && addDays(SL.week, 6) >= pStart(s) ? SL.week : monOf(inM(td) ? td : pStart(s));
  const wDays = []; for (let x = w; x <= addDays(w, 6); x = addDays(x, 1)) if (inM(x)) wDays.push(x);
  const navW = `<button class="rtnav" data-slweek="-1">‹</button><button class="rtnav" data-slweek="1">›</button>${!wDays.includes(td) && inM(td) ? `<button class="rtnav wk" data-slweek="0">이번 주</button>` : ""}`;
  const weekHtml = periodCard(s, c, wDays, `${md(wDays[0])}~${D(wDays[wDays.length - 1]).getDate()}일${wDays.includes(td) ? " · 이번 주" : ""}`, navW);
  SL.day = d; SL.week = w;
  setH("slDay", dayHtml); setH("slWeek", weekHtml);
}

// 📈 일일·주간 기준: 하루 기준 = 월 목표 ÷ 영업일. 매일 이만큼 채우면 월 목표 달성
function paceHtml(s, c) {
  const td = todayIso(), wd = c.month.days, dGoal = s.goal / wd, dPay = c.month.payers / wd, dCon = c.month.consults / wd;
  const list = []; for (let d = pStart(s); d <= mEnd(s); d = addDays(d, 1)) list.push(d);
  const net = (d) => { const e = s.log[d]; return e && (e.amount != null || e.refund != null) ? (e.amount || 0) - (e.refund || 0) : null; };
  const done = (d) => d <= td;
  // 주: 월요일 시작, 그 달 안의 날만
  const weeks = [];
  for (const d of list) { const dow = D(d).getDay(); if (!weeks.length || dow === 1) weeks.push([]); weeks[weeks.length - 1].push(d); }
  const m = mtd(s), left = Math.max(1, workDays(td < pStart(s) ? addDays(pStart(s), -1) : td, mEnd(s))), need = Math.max(0, s.goal - m.net);
  const tE = s.log[td], tNet = net(td) ?? 0, thisW = weeks.find((w) => w.includes(td));
  const wGoal = (w) => dGoal * w.filter((d) => !isOff(d)).length, wAct = (w) => w.filter(done).reduce((x, d) => x + (net(d) ?? 0), 0);
  const ok = (a, g) => `<b class="${a >= g ? "up" : "dn"}">${a >= g ? "✓" : "✗"}</b>`;
  let head = `<div class="slpace">`;
  if (td >= pStart(s) && td <= mEnd(s)) {
    head += isOff(td) ? `<div><small>오늘</small><b>휴무</b></div>`
      : `<div><small>오늘 매출 기준</small><b>${won(dGoal)}원</b><span>실제 ${won(tNet)}원 ${ok(tNet, dGoal)}</span></div>`;
    if (thisW) { const g = wGoal(thisW), a = wAct(thisW); head += `<div><small>이번 주 기준 (${md(thisW[0])}~)</small><b>${won(g)}원</b><span>실제 ${won(a)}원 · ${pct(g ? a / g * 100 : 0)}%</span></div>`; }
    head += `<div><small>남은 날로 다시 나누면</small><b>하루 ${won(need / left)}원</b><span>남은 ${won(need)}원 ÷ 영업일 ${left}일</span></div>`;
    head += `<div><small>오늘 결제자·상담 기준</small><b>${pct(dPay)}명 · ${pct(dCon)}명</b><span>실제 ${tE?.payers ?? 0}명 · ${tE?.consults ?? "-"}명</span></div>`;
  }
  head += `</div>`;
  // 그래프: 날마다 실제 순매출 막대 + 하루 기준선
  const W = 720, H = 180, P = 28, bw = (W - P) / list.length, vals = list.map((d) => done(d) ? net(d) ?? 0 : null);
  const top = Math.max(dGoal * 1.6, ...vals.map((v) => v ?? 0), 1), y = (v) => H - 20 - Math.max(0, v) / top * (H - 34);
  const bars = list.map((d, i) => { const v = vals[i], x = P + i * bw + 1;
    if (isOff(d) && !v) return `<text x="${x + bw / 2 - 1}" y="${H - 24}" class="off" text-anchor="middle">휴</text>`;
    if (v == null) return `<rect x="${x}" y="${y(dGoal)}" width="${bw - 2}" height="${H - 20 - y(dGoal)}" class="fut"/>`;
    return `<rect x="${x}" y="${y(v)}" width="${bw - 2}" height="${Math.max(1, H - 20 - y(v))}" class="${v >= dGoal ? "okb" : "nob"}"><title>${md(d)} ${won(v)}원</title></rect>`; }).join("");
  const labels = list.map((d, i) => (i % 5 === 0 || d === td) ? `<text x="${P + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle" class="${d === td ? "td" : ""}">${D(d).getDate()}</text>` : "").join("");
  const svg = `<div class="slscroll"><svg viewBox="0 0 ${W} ${H}" class="slchart" role="img" aria-label="일일 순매출과 하루 기준">
    ${bars}<line x1="${P}" x2="${W}" y1="${y(dGoal)}" y2="${y(dGoal)}" class="goal"/><text x="${P}" y="${y(dGoal) - 4}" class="gl">하루 기준 ${won(dGoal)}원</text>${labels}</svg></div>
    <p class="slhint">막대 = 그날 순매출(초록 기준 이상 · 빨강 미만 · 옅은 칸 = 아직 안 온 날), 선 = 하루 기준</p>`;
  // 주간 표
  let cumG = 0, cumA = 0;
  const wk = `<h4>주간 기준</h4><div class="slscroll"><table class="slt"><tr><th>주</th><th>영업일</th><th>기준</th><th>실제</th><th>달성</th></tr>${weeks.map((w) => {
    const g = wGoal(w), a = wAct(w), past = w[w.length - 1] < td, now = w.includes(td);
    return `<tr class="${now ? "now" : ""}"><td style="white-space:nowrap">${D(w[0]).getMonth() + 1}/${D(w[0]).getDate()}~${D(w[w.length - 1]).getDate()}</td><td>${w.filter((d) => !isOff(d)).length}일</td><td>${won(g)}원</td><td>${w[0] > td ? "-" : won(a) + "원"}</td><td>${w[0] > td ? "" : `${pct(g ? a / g * 100 : 0)}% ${past ? ok(a, g) : ""}`}</td></tr>`; }).join("")}</table></div>`;
  // 일일 표
  const dt = `<details open><summary><h4 style="display:inline">일일 기준</h4> <small class="slhint">매출·결제자·상담 (기준 / 실제), 누적</small></summary><div class="slscroll"><table class="slt sldaily"><tr><th>날짜</th><th>매출 기준</th><th>실제</th><th>누적 기준</th><th>누적 실제</th><th>결제자</th><th>상담</th></tr>${list.map((d) => {
    const off = isOff(d), v = net(d), e = s.log[d] || {};
    if (!off) cumG += dGoal; if (done(d)) cumA += v ?? 0;
    if (off && !v) return `<tr class="offr"><td>${D(d).getDate()}일(금)</td><td colspan="6">휴무</td></tr>`;
    const fut = !done(d);
    return `<tr class="${d === td ? "now" : fut ? "fut" : ""}"><td>${D(d).getDate()}일(${"일월화수목금토"[D(d).getDay()]})</td><td>${won(dGoal)}</td>
      <td>${fut ? "-" : `${won(v ?? 0)} ${ok(v ?? 0, dGoal)}`}</td><td>${won(cumG)}</td><td>${fut ? "-" : `<span class="${cumA >= cumG ? "up" : "dn"}">${won(cumA)}</span>`}</td>
      <td>${pct(dPay)} / ${fut ? "-" : e.payers ?? 0}</td><td>${pct(dCon)} / ${fut ? "-" : e.consults ?? "-"}</td></tr>`; }).join("")}</table></div></details>`;
  return head + svg + wk + dt;
}

const TIPS = {
  apps: ["성과 낮은 광고 2개를 새 제목·이미지·문구로 교체", "반응 좋은 광고 예산을 올려 노출 확대", "SSO에서 지점 지원자 수가 제대로 들어왔는지 확인"],
  reply: ["미회신 지원자에게 오늘 안에 문자+전화로 재연락", "운영시간 내 첫 연락 {fc}분 이내로 맞추기", "학습 목적에 맞춘 답변 + 상담 가능 시간 2개 제시"],
  consult: ["회신자 중 미예약자에게 구체적인 상담 시간 제안", "내일 예약자에게 날짜·시간·위치 다시 안내", "미방문자에게 참여 의사 확인 후 다른 일정 제안"],
  pay: ["상담 후 미결제자에게 24시간 안에 후속 연락", "상담자 목적에 맞는 멤버십 1개를 골라 추천"],
};
const tipList = (s, k) => TIPS[k].map((t) => t.replace("{fc}", s.firstContact));
// 그날 상담이 목표보다 적으면 어느 단계가 막혔는지 보고 행동 요령을 고른다
function diagnose(s, c, e) {
  if (!e || e.consults == null) return null;
  const tgt = minConsult(c), res = { low: e.consults < tgt, tgt, why: [] };
  if (res.low) {
    if (e.apps != null && e.apps < Math.round(c.perDay.apps)) res.why.push(["지원자 부족", "apps"]);
    if (e.apps && e.replies != null && e.replies / e.apps * 100 < s.reply) res.why.push(["회신율 낮음", "reply"]);
    if (!res.why.length || (e.replies && e.consults / e.replies * 100 < s.consult)) res.why.push(["상담 연결 부족", "consult"]);
  }
  if (e.consults && e.payers != null && e.payers / e.consults * 100 < s.pay) res.why.push(["결제율 낮음", "pay"]);
  return res;
}

function strategies(s, c, a) {
  const { left, need: n, payN, conN, repN, appN } = catchUp(s, a), out = [], per = (x) => Math.ceil(x / left);
  const today = todayIso() < s.base ? s.base : todayIso();
  out.push(`(1) 남은 목표 재계산 (오늘 실적 반영): 남은 영업일 ${left}일 동안 순매출 ${won(n)}원이 더 필요합니다. [1]의 비율 기준으로 결제 ${payN}명(하루 ${per(payN)}명), 상담 ${conN}명(하루 ${per(conN)}명), 회신 ${repN}명(하루 ${per(repN)}명), 지원자 ${appN}명(하루 ${per(appN)}명)을 확보하겠습니다.`);
  const acts = [], lv = levers(s), has = a.days > 0, r = (x, y) => y ? pct(x / y * 100) + "%" : null;
  const tgt = (k, u) => ` (목표 ${u === "원" ? won(s[k]) + "원" : pct(s[k]) + "%"})`;
  const T = {
    reply: `회신: 회신율 ${r(a.replies, a.apps) ?? pct(s.reply) + "%"}${tgt("reply")}. ${has && a.apps > a.replies ? `미회신 지원자 ${a.apps - a.replies}명에게 ` : "미회신 지원자에게 "}오늘 안에 문자+전화로 재연락하고, 첫 연락은 ${s.firstContact}분 이내로 하겠습니다.`,
    consult: `상담 연결: 상담률 ${r(a.consults, a.replies) ?? pct(s.consult) + "%"}${tgt("consult")}. ${has && a.replies > a.consults ? `회신했지만 상담하지 않은 ${a.replies - a.consults}명에게 ` : "회신자에게 "}상담 가능 시간 2개를 제안하고, 예약자에게는 전날 날짜·시간·위치를 다시 안내하겠습니다.`,
    pay: `결제: 결제율 ${r(a.payers, a.consults) ?? pct(s.pay) + "%"}${tgt("pay")}. ${has && a.consults > a.payers ? `상담 후 미결제자 ${a.consults - a.payers}명에게 ` : "상담 후 미결제자에게 "}24시간 안에 후속 연락하겠습니다.`,
    arpu: (() => { const up = [...s.members].sort((x, y) => x.price - y.price).find((m) => m.price > s.arpu);
      return `객단가: 현재 ${won(a.payers ? a.arpu : s.arpu)}원${tgt("arpu", "원")}. 상담에서 ${up ? up.name + "(" + won(up.price) + "원) 이상" : "상위 멤버십"}을 먼저 제안하겠습니다.`; })(),
    refund: `환불: 환불율 ${r(a.refund, a.amount) ?? pct(s.refundRate || 0) + "%"}${tgt("refundRate")}. 환불 사유를 확인하고, 결제 직후 첫 수업 일정을 바로 잡아 이탈을 막겠습니다.`,
  };
  if (lv.left && lv.rows[0]) acts.push(`효과 1순위 — ${lv.rows[0].lab}: 필요 지원자 ${lv.base.apps}명 → ${lv.rows[0].apps}명(−${lv.rows[0].save}명), 같은 지원자면 순매출 +${won(lv.rows[0].gain)}원. 아래 순서대로 개선하겠습니다.`);
  for (const row of lv.rows.slice(0, 3)) acts.push(T[row.k]);
  const avgApps = a.apps / (a.appDays || 1);
  if (!has || avgApps < per(appN)) acts.push(`광고: ${has && a.appDays ? `하루 평균 지원자 ${pct(avgApps)}명, ` : ""}필요 하루 ${per(appN)}명. 성과 낮은 광고 2개를 새 제목·이미지·문구로 교체하고, 반응 좋은 광고 예산을 늘리겠습니다.`);
  acts.forEach((t, i) => out.push(`(${i + 2}) ${t}`));
  let off = addDays(today, 1); while (off <= s.end && !isOff(off)) off = addDays(off, 1);
  if (off <= s.end) out.push(`(${acts.length + 2}) 휴무 대비: 다음 휴무일 ${md(off)}(금) 전날까지 상담 예약을 집중해서 잡고, 휴무일에 들어온 지원자는 다음 날 오전에 가장 먼저 연락하겠습니다.`);
  out.push(`(${out.length + 1}) 일일 점검: 매일 마감 때 달력에 실적을 입력하고, 상담 최소 ${minConsult(c)}명에 못 미친 날은 다음 날 부족한 단계부터 조치하겠습니다.`);
  return out;
}
// 실적 누계를 목표·오늘까지 계획과 비교해 문제점 문장을 만든다
function problems(s, c, a) {
  if (!a.days) return ["아직 기준일 이후 실적이 입력되지 않았습니다."];
  const td = todayIso(), from = s.linked ? addDays(pStart(s), -1) : s.base, el = workDays(from, td < s.end ? td : s.end), out = [];
  const p = s.linked ? { apps: c.month.apps / c.month.days, consults: c.month.consults / c.month.days, payers: c.month.payers / c.month.days } : c.perDay;
  const planNet = s.linked ? s.goal / c.month.days * el : c.netAdd / c.days * el;
  const short = (name, act, plan) => { const g = Math.round(plan) - act; if (g > 0) out.push(`${name}: 오늘까지 계획 ${Math.round(plan)}명 대비 ${act}명으로 ${g}명 부족`); };
  short("지원자", a.apps, p.apps * el); short("상담자", a.consults, p.consults * el); short("결제자", a.payers, p.payers * el);
  const rate = (name, x, y, tgt) => { if (!y) return; const r = x / y * 100; if (r < tgt) out.push(`${name}: ${pct(r)}% (목표 ${pct(tgt)}%)로 ${pct(tgt - r)}%p 낮음`); };
  rate("회신율", a.replies, a.apps, s.reply); rate("상담률", a.consults, a.replies, s.consult); rate("결제율", a.payers, a.consults, s.pay);
  if (a.payers && a.arpu < s.arpu) out.push(`객단가: ${won(a.arpu)}원 (목표 ${won(s.arpu)}원)`);
  if (a.amount && a.refund / a.amount * 100 > (s.refundRate || 0)) out.push(`환불율: ${pct(a.refund / a.amount * 100)}% (목표 ${pct(s.refundRate || 0)}%)`);
  const tgt = minConsult(c);
  const low = Object.entries(s.log).filter(([d, e]) => d > from && d <= td && !isOff(d) && e.consults != null && e.consults < tgt).length;
  if (low) out.push(`상담 최소 ${tgt}명 미달: ${low}일`);
  const gap = Math.round(planNet) - (s.linked ? a.net : a.amount - a.refund);
  if (gap > 0) out.push(`순매출: 오늘까지 계획 대비 ${won(gap)}원 부족 (현재 ${won(a.net)}원, 달성률 ${pct(a.net / s.goal * 100)}%)`);
  return out.length ? out : ["오늘까지 계획 대비 모든 단계가 목표 이상입니다."];
}

function report(s, c, a, dailyRows) {
  const mp = mixPlan(s, c), mix = mp.mix, ms = mix.reduce((x, m) => x + m.n * m.price, 0), mn = mp.pN;
  return `팔로 ${SL.teamName} ${D(mEnd(s)).getMonth() + 1}월 매출 목표 및 실행 계획

보고 기준일: ${D(s.base).getFullYear()}년 ${md(s.base)}
목표 기간: ${D(pStart(s)).getFullYear()}년 ${md(pStart(s))}~${D(mEnd(s)).getDate()}일
[현재 문제점]
${problems(s, c, a).map((t) => "- " + t).join("\n")}${s.problems ? "\n" + s.problems : ""}
[실행 전략]
${strategies(s, c, a).join("\n")}${s.strategyAdd ? "\n" + s.strategyAdd : ""}
[1] 월별 목표
월 목표 순매출: ${won(s.goal)}원 (영업일 ${c.month.days}일)
필요 지원자 ${c.month.apps}명 → 회신 ${c.month.replies}명 → 상담 ${c.month.consults}명 → 결제 ${c.month.payers}명
[2] 순매출 현황
목표 순매출: ${won(s.goal)}원
현재 순매출: ${won(s.current)}원
남은 목표 금액: ${won(c.remain)}원
목표 달성률: ${(Math.round(c.rate * 100) / 100).toFixed(2)}%
[3] 남은 기간 목표
기간: ${md(addDays(s.base, 1))}~${D(s.end).getDate()}일, 영업일 ${c.days}일 (금요일 휴무 제외)
추가 지원자 수: ${c.apps}명
회신율: ${pct(s.reply)}%
회신자 수: ${c.replies}명
상담률: ${pct(s.consult)}%
상담자 수: ${c.consults}명
결제율: 약 ${pct(s.pay)}%
결제자 수: ${c.payers}명
객단가: 약 ${won(s.arpu)}원
추가 결제금액: ${won(c.revenue)}원
${s.refundRate ? `환불율: ${pct(s.refundRate)}%
예상 환불금액: ${won(c.refundAmt)}원
순 추가 매출: ${won(c.netAdd)}원
` : ""}예상 최종 순매출: ${won(c.final)}원
계산 기준
회신율 = 회신자 수 ÷ 지원자 수 × 100
상담률 = 상담자 수 ÷ 회신자 수 × 100
결제율 = 결제자 수 ÷ 상담자 수 × 100
객단가 = 총 결제금액 ÷ 결제자 수
환불율 = 환불금액 ÷ 총 결제금액 × 100
[4] 멤버십별 추가 결제 목표
${mix.filter((m) => m.n).map((m) => `${m.name} (${Math.round(m.w * 1000) / 10}%)\n단가: ${won(m.price)}원\n목표 인원: ${m.n}명\n목표 결제금액: ${won(m.n * m.price)}원`).join("\n")}
합계
목표 결제 인원: ${mn}명
목표 결제금액: ${won(ms)}원
멤버십 기준 객단가: ${mn ? won(ms / mn) : "-"}원
[5] 일일 실행 목표
${dailyRows.map((r) => `${r[0]}: 하루 평균 ${r[1]}`).join("\n")}
운영시간 내 첫 연락: ${s.firstContact}분 이내 목표
실적 점검: 매일 마감 시 1회
${a.days ? `[실적 누계] ${a.days}일 입력 기준
지원자 ${a.apps}명 / 회신 ${a.replies}명 / 상담 ${a.consults}명 / 결제 ${a.payers}명
결제금액 ${won(a.amount)}원, 환불·정산 ${won(a.refund)}원, 현재 순매출 ${won(a.net)}원 (달성률 ${pct(a.net / s.goal * 100)}%)
` : ""}`.trim();
}

// ── 화면 ──
const V = () => document.getElementById("salesView");
const SL = window.SL = { team: null, teamName: "", month: null, plan: null, log: {}, sheet: { days: {}, sync: null }, myTeam: undefined };
const S = () => applyAuto(compose(SL.plan, SL.log, SL.sheet));

V().innerHTML = `
<div class="slbar"><h2>💰 매출 목표</h2><select id="slTeam" class="adminonly" aria-label="지점"></select><b id="slTeamName"></b>
  <input type="month" data-k="month" aria-label="목표 월"><a href="https://sso.pallo.co.kr/select?pick=branch" target="_blank" rel="noopener" class="btn ghost">지원자 수 확인 (SSO)</a><button class="btn ghost hidden" id="slSync" type="button">🔄 시트 새로고침</button><small id="slSheet"></small><small id="slSaved"></small></div>
<div id="slEmpty" class="hidden"></div>
<div id="slBody">
<details class="slcard sldefs"><summary><b>📏 단계별 세는 법</b> <small>(모든 매니저가 같은 기준으로 입력)</small></summary><table>
  <tr><td><b>지원자</b></td><td>그날 SSO 지점 화면에 새로 들어온 신청 수 (하루치, 누계 아님)</td></tr>
  <tr><td><b>회신자</b></td><td>우리가 연락해서 답장이나 통화가 되어 전산 상담 일정에 들어간 사람</td></tr>
  <tr><td><b>상담자</b></td><td>전산 상담 일정에 있는 사람 중 실제로 방문해 상담한 사람</td></tr>
  <tr><td><b>결제자</b></td><td>결제를 마친 사람. 상담 당일이 아니어도 나중에 결제하면 포함하고, 결제한 날짜에 넣습니다. 분납은 첫 결제일 기준</td></tr>
  <tr><td><b>결제금액·환불</b></td><td>카드 승인 금액 기준. 환불은 환불 처리한 날짜에 넣습니다</td></tr></table></details>
<div class="slkpis" id="slKpis"></div>
<div class="slgrid">
  <section class="slcard"><h3>[1] 월별 목표 — 비율·객단가를 바꾸면 필요 인원이 바로 바뀝니다</h3>
    <div class="slrow"><label>집계 시작일<small>목표 기간 시작 (보통 1일)</small></label><input type="date" data-k="start"></div>
    <div class="slrow sl3 slhead"><span></span><small>목표 (직접 입력)</small><button type="button" class="slcurbtn" id="slCurBtn"></button></div>
    <div class="slrow sl3"><label>월 목표 순매출</label><span class="u"><input data-k="goal" data-money><i>원</i></span><div class="slcur" id="slCur_goal"></div></div>
    <div class="slrow sl3"><label>지원자수</label><span class="u"><input type="number" min="0" data-k="appsGoal"><i>명</i></span><div class="slcur" id="slCur_apps"></div></div>
    <div class="slrow sl3"><label>회신율</label><span class="u"><input type="number" step="0.1" min="0.1" data-k="reply"><i>%</i></span><div class="slcur" id="slCur_reply"></div></div>
    <div class="slrow sl3"><label>상담률</label><span class="u"><input type="number" step="0.1" min="0.1" data-k="consult"><i>%</i></span><div class="slcur" id="slCur_consult"></div></div>
    <div class="slrow sl3"><label>결제율</label><span class="u"><input type="number" step="0.1" min="0.1" data-k="pay"><i>%</i></span><div class="slcur" id="slCur_pay"></div></div>
    <div class="slrow sl3"><label>객단가</label><span class="u"><input data-k="arpu" data-money><i>원</i></span><div class="slcur" id="slCur_arpu"></div></div>
    <div class="slrow sl3"><label>환불율</label><span class="u"><input type="number" step="0.1" min="0" max="99" data-k="refundRate"><i>%</i></span><div class="slcur" id="slCur_refundRate"></div></div>
    <div id="slMonth"></div><div id="slCompare"></div></section>
  <section class="slcard"><h3>[2] 남은 기간 목표 <button type="button" class="slcurbtn" id="slR2Btn"></button></h3>
    <div class="slrow"><label>현재 순매출</label><span class="u"><input data-k="current" data-money><i>원</i></span></div>
    <div class="slr2">
    <p class="slhint" id="slCurHint">⚠ 기준일까지 들어온 순매출만 넣으세요. 기준일 다음 날부터는 달력에 입력합니다 (같은 매출을 두 번 넣지 않게). 기준일을 뒤로 옮기면 그 사이 달력 실적을 더할지 물어봅니다.</p>
    <div class="slrow"><label>보고 기준일</label><input type="date" data-k="base"></div>
    <div class="slrow"><label>목표 마감일</label><input type="date" data-k="end"></div>
    <p class="slhint" id="slPeriod"></p><div id="slRemain"></div>
    <p class="slhint">필요 인원은 목표 금액에서 거꾸로 계산합니다: 결제자 = 금액 ÷ (객단가 × (1−환불율)), 상담자 = 결제자 ÷ 결제율, 회신자 = 상담자 ÷ 상담률, 지원자 = 회신자 ÷ 회신율 (모두 올림).</p></div></section>
  <section class="slcard"><h3>[3] 멤버십별 추가 결제 목표 (남은 기간)</h3>
    <div class="slscroll"><table class="slt slmemt"><thead><tr><th>멤버십</th><th>단가</th><th>비율</th><th>인원</th><th>금액</th></tr></thead><tbody id="slMem"></tbody>
    <tfoot><tr><th>합계</th><th></th><th id="slMemSumP"></th><th id="slMemN"></th><th id="slMemSum"></th></tr></tfoot></table></div>
    <div class="slkpi" style="margin-top:12px"><small>이 구성의 객단가 (합계 금액 ÷ 인원)</small><b id="slMemArpu"></b><div class="slhint" id="slMemCmp"></div></div>
    <div id="slMemNote"></div><p class="slhint">비율은 직접 정합니다. 인원 = 이 비율의 객단가로 계산한 필요 결제자 × 비율.</p></section>
  <section class="slcard"><h3>[4] 일일 실행 목표</h3><div id="slDaily"></div>
    <div class="slrow"><label>첫 연락 목표</label><span class="u"><input type="number" min="1" data-k="firstContact"><i>분</i></span></div></section>
</div>
<div class="slgrid">
  <section class="slcard"><h3>📅 일일 목표 — 날짜별 목표 vs 현재</h3><div id="slDay"></div></section>
  <section class="slcard"><h3>🗓 주간 목표 — 주별 목표 vs 현재</h3><div id="slWeek"></div></section>
</div>
<section class="slcard"><h3>🎯 어디를 올리면 가장 효과적인가 — 개선 효과 순위</h3><div id="slLever"></div></section>
<section class="slcard"><h3>📈 일일·주간 기준 — 매일 이만큼 채우면 월 목표 달성</h3><div id="slPace"></div></section>
<section class="slcard"><h3>📅 일일 실적 달력 — 날짜를 눌러 실적을 입력하세요</h3>
  <p class="slhint" id="slCalNote" style="font-size:14px;color:var(--text)"></p><div id="slCal"></div>
  <p class="slhint">빨간 칸은 상담자 수가 하루 목표보다 적은 날입니다. 입력한 숫자를 보고 어느 단계가 막혔는지 판단해 행동 요령을 띄웁니다. 아직 오지 않은 날은 예약된 상담 수를 넣어두면 미리 확인할 수 있습니다.</p>
  <div id="slActual"></div></section>
<section class="slcard"><h3>현재 문제점 (보고문 맨 앞)</h3><pre id="slProblems"></pre>
  <p class="slhint">위 내용은 달력 실적과 목표를 비교해 자동으로 씁니다. 덧붙일 내용은 아래에 쓰세요.</p>
  <textarea data-k="problems" class="grow" placeholder="예: 주말 상담 예약이 몰려 평일 상담이 비어 있음"></textarea>
  <h3 style="margin-top:14px">실행 전략 (보고문 문제점 다음)</h3><pre id="slStrategy"></pre>
  <p class="slhint">위 전략은 목표와 실적 숫자를 보고 자동으로 씁니다. 덧붙일 실행 전략은 아래에 쓰세요.</p>
  <textarea data-k="strategyAdd" class="grow" placeholder="예: 이번 주 금요일 휴무 전날(목) 상담 예약을 집중 배치"></textarea></section>
<section class="slcard"><h3>📋 보고문</h3><pre id="slReport" style="max-height:420px;overflow:auto"></pre><button class="btn" id="slCopy" type="button">보고문 복사</button></section>
</div>
<dialog id="slDlg"><form method="dialog">
  <h3 id="slDlgTitle"></h3>
  <div class="slrow"><label>지원자<small>SSO 새 신청, 하루치</small></label><input type="number" min="0" name="apps"></div>
  <div class="slrow"><label>회신자<small>연락돼 전산 상담 일정에 들어간 사람</small></label><input type="number" min="0" name="replies"></div>
  <div class="slrow"><label>상담자<small>일정 중 실제 방문·상담한 사람</small></label><input type="number" min="0" name="consults"></div>
  <div class="slrow"><label>결제자<small>이날 결제한 사람 (분납은 첫 결제일)</small></label><input type="number" min="0" name="payers"></div>
  <div class="slrow"><label>결제금액<small>카드 승인 금액</small></label><input name="amount" data-money></div>
  <div class="slrow"><label>환불·정산<small>환불 처리한 날짜에 입력</small></label><input name="refund" data-money></div>
  <p class="slhint" id="slDlgNote" style="color:var(--red)"></p><div id="slTips"></div><p class="slhint" id="slDlgWho"></p>
  <div class="sltools"><button class="btn" value="save">저장</button><button class="btn ghost" value="clear">이 날 지우기</button><button class="btn ghost" value="cancel">닫기</button></div>
</form></dialog>`;

const $v = (s) => V().querySelector(s);
const setH = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
const setT = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };

// ── 불러오기·저장 ──
SL.load = async function () {
  if (!me) return;
  if (SL.myTeam === undefined) SL.myTeam = (await sb.from("profiles").select("team_id").eq("user_id", me.id).single()).data?.team_id ?? null;
  const boss = isBoss && !previewTeam;
  if (boss && !teams.length) teams = (await sb.from("teams").select("*").order("sort")).data ?? [];
  if (boss) {
    try { SL.team = SL.team ?? (+localStorage.getItem("sales-team") || null); } catch {}
    if (!teams.some((t) => t.id === SL.team)) SL.team = teams[0]?.id ?? null;
    $v("#slTeam").innerHTML = teams.map((t) => `<option value="${t.id}" ${t.id === SL.team ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  } else SL.team = previewTeam || SL.myTeam;
  $v("#slTeam").classList.toggle("hidden", !boss);
  if (!SL.team) { $v("#slBody").classList.add("hidden"); $v("#slEmpty").classList.remove("hidden");
    $v("#slEmpty").innerHTML = `<div class="slcard">아직 지점이 정해지지 않았어요. 대표님이 [팀] 탭에서 지점을 정해 주시면 매출 목표가 보여요.</div>`; return; }
  $v("#slBody").classList.remove("hidden"); $v("#slEmpty").classList.add("hidden");
  SL.teamName = (teams.find((t) => t.id === SL.team) ?? (await sb.from("teams").select("name").eq("id", SL.team).single()).data)?.name ?? "";
  $v("#slTeamName").textContent = boss ? "" : SL.teamName;
  SL.month = SL.month ?? todayIso().slice(0, 7);
  const [p, prev] = await Promise.all([
    sb.from("sales_plans").select("data").eq("team_id", SL.team).eq("month", SL.month).maybeSingle(),
    sb.from("sales_plans").select("data").eq("team_id", SL.team).lt("month", SL.month).order("month", { ascending: false }).limit(1).maybeSingle()]);
  if (fail(p.error || prev.error)) return;
  SL.plan = p.data ? { ...newPlan(SL.month), ...p.data.data, month: SL.month } : newPlan(SL.month, prev.data?.data); // 새 달은 지난달 비율·멤버십 이어받기
  await loadDays();
  render();
};
async function loadDays() {
  const s = SL.plan, from = s.base < mStart(s) ? s.base : mStart(s), to = s.end > mEnd(s) ? s.end : mEnd(s);
  const [m, sd, sy] = await Promise.all([sb.from("sales_days").select("*").eq("team_id", SL.team).gte("day", from).lte("day", to),
    sb.from("sales_sheet_days").select("*").eq("team_id", SL.team).gte("day", mStart(s)).lte("day", mEnd(s)),
    sb.from("sales_sheet_sync").select("*").eq("team_id", SL.team).eq("month", SL.month).maybeSingle()]);
  if (fail(m.error || sd.error || sy.error)) return;
  SL.log = Object.fromEntries(m.data.map((r) => [r.day, r]));
  SL.sheet = { days: Object.fromEntries(sd.data.map((r) => [r.day, r])), sync: sy.data };
}
let saveT;
function savePlan() {
  clearTimeout(saveT); setT("slSaved", "저장 중…");
  const team = SL.team, month = SL.month, data = { ...SL.plan }; delete data.month;
  saveT = setTimeout(async () => {
    const { error } = await sb.from("sales_plans").upsert({ team_id: team, month, data });
    if (!fail(error)) setT("slSaved", "저장됨 ✓");
  }, 600);
}
// 다른 매니저가 고치면 다시 불러옴 (입력 중이면 끝난 뒤)
let rtT;
SL.remote = (row) => {
  boardSoon(); // 📊 현황판도 갱신
  if (row && row.team_id !== SL.team) return;
  if (view !== "sales") return;
  clearTimeout(rtT);
  rtT = setTimeout(function again() {
    if (V().contains(document.activeElement) && document.activeElement.matches("input, textarea") || $v("#slDlg").open) return (rtT = setTimeout(again, 1500));
    SL.load();
  }, 400);
};

function render() {
  const s = S(), c = calc(s), a = actuals(s);
  V().querySelectorAll("[data-k]").forEach((el) => {
    if (el === document.activeElement) return;
    const v = s.zero?.includes(el.dataset.k) ? SL.plan[el.dataset.k] : s[el.dataset.k];
    el.value = el.hasAttribute("data-money") ? won(v) : typeof v === "number" ? Math.round(v * 100) / 100 : v ?? "";
  });
  const sy = SL.sheet.sync, curEl = $v('[data-k="current"]');
  curEl.readOnly = s.linked; if (s.linked) curEl.value = won(s.current);
  $v('[data-k="base"]').readOnly = s.linked; if (s.linked) $v('[data-k="base"]').value = s.base;
  setT("slCurHint", s.linked ? `📗 재무 시트 연동 중 — 기준일은 오늘로 자동, 현재 순매출은 시트의 ${md(pStart(s))}~오늘 합계(10분마다 갱신)입니다. 결제자·결제금액·환불도 시트 값을 씁니다.`
    : "⚠ 기준일까지 들어온 순매출만 넣으세요. 기준일 다음 날부터는 달력에 입력합니다 (같은 매출을 두 번 넣지 않게). 기준일을 뒤로 옮기면 그 사이 달력 실적을 더할지 물어봅니다.");
  $v("#slSync").classList.toggle("hidden", !sy);
  setT("slSheet", sy ? (sy.error ? `⚠ 시트: ${sy.error}` : `📗 시트 ${new Date(sy.synced_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준${sy.skipped ? ` · 못 읽은 줄 ${sy.skipped}` : ""}`) : "");
  const day = (n, d) => (Math.round(n / d * 10) / 10).toLocaleString("ko-KR");
  const mn1 = (n, d) => Math.ceil(n / d - 1e-9); // 하루 최소 = 하루 평균 올림
  const tbl = (x, d, lab) => `<table class="slt"><tr><th>필요</th><th>합계</th><th>하루 최소</th><th>${lab} (${d}일)</th></tr>
    <tr><td>지원자</td><td><b>${x.apps.toLocaleString()}명</b></td><td>${mn1(x.apps, d)}명</td><td>${day(x.apps, d)}명</td></tr>
    <tr><td>회신자 (${pct(s.reply)}%)</td><td><b>${x.replies.toLocaleString()}명</b></td><td title="전산 상담 일정(캘린더)에 하루 최소 이만큼 잡혀 있어야 함"><b>📅 ${mn1(x.replies, d)}명</b><small class="mut"> 캘린더</small></td><td>${day(x.replies, d)}명</td></tr>
    <tr><td>상담자 (${pct(s.consult)}%)</td><td><b>${x.consults.toLocaleString()}명</b></td><td>${mn1(x.consults, d)}명</td><td>${day(x.consults, d)}명</td></tr>
    <tr><td>결제자 (${pct(s.pay)}%)</td><td><b>${x.payers.toLocaleString()}명</b></td><td>${mn1(x.payers, d)}명</td><td>${day(x.payers, d)}명</td></tr>
    <tr><td>결제금액</td><td>${won(x.revenue)}원</td><td></td><td></td></tr>
    ${s.refundRate ? `<tr><td>환불 (${pct(s.refundRate)}%)</td><td>−${won(x.refundAmt)}원</td><td></td><td></td></tr>` : ""}
    <tr><td>순매출</td><td><b>${won(x.netAdd)}원</b></td><td></td><td></td></tr>
    <tr><td>하루 평균 목표매출</td><td><b>${won(x.netAdd / d)}원</b></td><td></td><td></td></tr></table>`;
  compareFill(s, c);
  setH("slPace", paceHtml(s, c));
  dayWeekCards(s, c);
  setH("slLever", leverHtml(s));
  setH("slMonth", `<p class="slhint">${md(pStart(s))}~${md(mEnd(s))}, 영업일 ${c.month.days}일 (금요일 휴무 제외)</p>` + tbl(c.month, c.month.days, "하루 평균"));
  setH("slRemain", tbl(c, c.days, "처음 계획 하루 평균") + `<p class="slhint">예상 최종 순매출 <b>${won(c.final)}원</b> (목표 대비 ${pct(c.final / s.goal * 100)}%)</p>`);
  setT("slPeriod", `현재 달성률 ${pct(c.rate)}% · 남은 목표 ${won(c.remain)}원 · ${md(addDays(s.base, 1))}~${md(s.end)}, 영업일 ${c.days}일 (금요일 휴무 제외)`);

  const kp = [["기준일 달성률 (현재 순매출 기준)", pct(c.rate) + "%", c.rate], ["예상 최종 순매출", won(c.final) + "원", c.final / s.goal * 100],
    ["오늘까지 순매출 (기준일 + 달력 실적)", won(a.net) + "원", a.net / s.goal * 100], ["남은 목표 금액", won(Math.max(0, s.goal - a.net)) + "원"], ["결제자 목표", c.payers + "명"]];
  setH("slKpis", kp.map(([l, v, b]) => `<div class="slkpi"><small>${l}</small><b>${v}</b>${b != null ? `<div class="bar"><i style="width:${Math.min(100, b || 0)}%"></i></div>` : ""}</div>`).join(""));

  const mp = mixPlan(s, c), mix = mp.mix, mn = mp.pN, ms = mix.reduce((x, m) => x + m.n * m.price, 0), mArpu = mn ? ms / mn : 0;
  const pctW = (w) => (Math.round(w * 1000) / 10).toLocaleString("ko-KR") + "%";
  if (!V().querySelector("#slMem").contains(document.activeElement)) setH("slMem", mix.map((m, i) =>
    `<tr><td><input value="${esc(m.name)}" data-m="${i}" data-f="name" style="text-align:left"></td><td><input value="${won(m.price)}" data-m="${i}" data-f="price" data-money></td>
     <td><span class="u"><input type="number" min="0" max="100" step="1" value="${Math.round(m.w * 1000) / 10}" data-m="${i}" data-f="p" style="width:74px"><i>%</i></span></td><td>${m.n}명</td><td>${won(m.n * m.price)}</td></tr>`).join(""));
  else V().querySelectorAll("#slMem tr").forEach((tr, i) => { const c2 = tr.children; c2[3].textContent = mix[i].n + "명"; c2[4].textContent = won(mix[i].n * mix[i].price); });
  setT("slMemN", mn + "명"); setT("slMemSum", won(ms)); setT("slMemArpu", mn ? won(mArpu) + "원" : "-");
  setT("slMemSumP", pct(mp.sumP) + "%");
  setT("slMemCmp", `이 비율의 객단가 ${won(mp.mixA)}원 · [1] 목표 객단가 ${won(s.arpu)}원 · 필요 결제자 ${mp.pN}명 ([1] 객단가 기준 ${c.payers}명)`);
  const g = mp.guide, off = Math.abs(mp.sumP - 100) > 0.05;
  setH("slMemNote", off ? `<div class="sltip">⚠ 비율 합계가 ${pct(mp.sumP)}%예요. <button class="btn ghost" data-mixfix="sum" type="button">100%로 맞추기</button></div>`
    : !g ? `<div class="sltip ok">✓ 이 비율이면 목표 객단가 이상입니다 (+${won(mp.mixA - s.arpu)}원). 목표매출 가이드 달성 가능</div>`
    : g.ok ? `<div class="sltip">이 비율은 목표 객단가보다 ${won(s.arpu - mp.mixA)}원 낮아서 결제자가 ${mp.pN - c.payers}명 더 필요합니다.<br>가이드: ${g.moves.map((x) => `${x.name} ${x.d > 0 ? "+" : ""}${pct(x.d)}%p`).join(", ")} 하면 목표 달성 <button class="btn ghost" data-mixfix="guide" type="button">가이드대로 맞추기</button></div>`
    : `<div class="sltip">Premium 100%여도 목표 객단가 ${won(s.arpu)}원에 못 미칩니다. [1] 객단가를 낮추거나 단가를 확인해 주세요.</div>`);

  const p = c.perDay, ab = (v) => Number.isInteger(+v.toFixed(2)) ? `${Math.round(v)}명` : `약 ${Math.ceil(v)}명`;
  const range = (v) => Number.isInteger(+v.toFixed(2)) ? `${Math.round(v)}명` : `${Math.floor(v)}~${Math.ceil(v)}명`;
  const dailyRows = [["신규 지원자", ab(p.apps)], ["회신자", ab(p.replies)], ["상담 진행", range(p.consults)], ["결제", ab(p.payers)]];
  setH("slDaily", `<table class="slt">${dailyRows.map((r) => `<tr><td>${r[0]}</td><td><b>하루 평균 ${r[1]}</b></td></tr>`).join("")}</table>`);

  renderCal(s, c);
  const cu = catchUp(s, a);
  setH("slCalNote", `달력의 <b>상담 최소 ${minConsult(c)}명</b>은 처음 계획 기준입니다.`
    + (a.days ? ` 오늘 실적을 반영하면 남은 영업일 ${cu.left}일 동안 <b style="color:var(--red)">하루 ${Math.ceil(cu.conN / cu.left)}명</b>이 필요합니다 (실행 전략 (1)과 같은 숫자).` : ""));

  // 시트 연동: 집계 시작일부터·월 전체 목표 기준 / 아니면 기준일 다음 날부터·남은 기간 목표 기준
  const td = todayIso(), el = workDays(s.linked ? addDays(pStart(s), -1) : s.base, td < s.end ? td : s.end), rr = (x, y) => y ? pct(x / y * 100) + "%" : "-";
  const T = s.linked ? { ...c.month, d: c.month.days } : { ...c, d: c.days }, pd = (k) => T[k] / T.d;
  setH("slActual", a.days ? `<table class="slt" style="margin-top:12px">
    <tr><th>실적 누계 (${a.days}일 입력)</th><th>실제</th><th>오늘까지 계획</th><th>전체 목표</th></tr>
    <tr><td>지원자</td><td>${a.apps}</td><td>${Math.round(pd("apps") * el)}</td><td>${T.apps}</td></tr>
    <tr><td>회신자 (회신율)</td><td>${a.replies} (${rr(a.replies, a.apps)})</td><td>${Math.round(pd("replies") * el)}</td><td>${T.replies} (${pct(s.reply)}%)</td></tr>
    <tr><td>상담자 (상담률)</td><td>${a.consults} (${rr(a.consults, a.replies)})</td><td>${Math.round(pd("consults") * el)}</td><td>${T.consults} (${pct(s.consult)}%)</td></tr>
    <tr><td>결제자 (결제율)</td><td>${a.payers} (${rr(a.payers, a.consults)})</td><td>${Math.round(pd("payers") * el)}</td><td>${T.payers} (${pct(s.pay)}%)</td></tr>
    <tr><td>객단가</td><td>${a.payers ? won(a.arpu) : "-"}</td><td></td><td>${won(s.arpu)}</td></tr>
    <tr><td>환불율</td><td>${rr(a.refund, a.amount)}</td><td></td><td>${pct(s.refundRate || 0)}%</td></tr>
    <tr><td>결제−환불</td><td>${won(a.amount - a.refund)}</td><td>${won(T.netAdd / T.d * el)}</td><td>${won(T.netAdd)}</td></tr></table>` : "");

  setT("slStrategy", strategies(s, c, a).join("\n"));
  setT("slProblems", problems(s, c, a).map((t) => "- " + t).join("\n"));
  setT("slReport", report(s, c, a, dailyRows));
}

function renderCal(s, c) {
  const first = D(mStart(s)), last = D(s.end), td = todayIso(), tgt = minConsult(c);
  let html = "";
  for (let m = new Date(first.getFullYear(), first.getMonth(), 1); m <= last; m.setMonth(m.getMonth() + 1)) {
    html += `<h4>${m.getFullYear()}년 ${m.getMonth() + 1}월</h4><div class="slcal">` + "일월화수목금토".split("").map((d) => `<div class="dow">${d}</div>`).join("");
    const dim = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    html += "<div></div>".repeat(m.getDay());
    for (let i = 1; i <= dim; i++) {
      const d = iso(new Date(m.getFullYear(), m.getMonth(), i)), e = s.log[d], inPeriod = d > s.base && d <= s.end;
      if (inPeriod && isOff(d)) { html += `<div class="day off"><div class="d">${i}</div><div class="big"><small>휴무</small></div></div>`; continue; }
      if (!inPeriod) { html += `<div class="day off"><div class="d">${i}</div>${e ? `<div class="c">상담 ${e.consults ?? "-"}</div>` : ""}</div>`; continue; }
      const g = diagnose(s, c, e);
      let cls = "day" + (d === td ? " today" : ""), body;
      if (g) {
        cls += g.low ? " low" : " good";
        body = `<div class="big"><small>상담 / 최소</small><b>${e.consults}<i> / ${tgt}명</i></b></div>`;
        if (g.low) body += `<div class="tip">⚠ ${g.why.slice(0, 2).map((w) => w[0]).join("·")}<br>${tipList(s, g.why[0][1])[0]}</div>`;
      } else body = `<div class="big"><small>상담 최소</small><b>${tgt}<i>명</i></b></div>` + (d < td ? '<div class="nil">미입력</div>' : "");
      html += `<div class="${cls}" data-day="${d}"><div class="d">${i}</div>${body}</div>`;
    }
    html += "</div>";
  }
  setH("slCal", html);
}

// ── 입력 ──
// 금액 칸: 입력하는 동안 바로 쉼표 (커서는 뒤에서부터 같은 자리 유지)
V().addEventListener("input", (ev) => {
  const el = ev.target; if (!el.hasAttribute("data-money")) return;
  const digits = el.value.replace(/[^\d]/g, ""); if (!digits) return;
  const fromEnd = el.value.length - el.selectionStart;
  el.value = Number(digits).toLocaleString("ko-KR");
  const pos = Math.max(0, el.value.length - fromEnd); el.setSelectionRange(pos, pos);
}, true);
V().addEventListener("input", (ev) => {
  const el = ev.target, s = SL.plan; if (!s || el.closest("dialog")) return;
  if (el.dataset.k) {
    if (el.dataset.k === "base" || el.dataset.k === "month") return; // change 에서 처리
    s[el.dataset.k] = (el.type === "date" || el.tagName === "TEXTAREA") ? el.value : num(el.value);
  } else if (el.dataset.m) {
    if (el.dataset.f === "p" && !s.members.every((m) => typeof m.p === "number")) { const v = toPct(memberMix(S(), 0)); s.members.forEach((m, i) => { m.p = v[i]; }); }
    const m = s.members[el.dataset.m]; m[el.dataset.f] = el.dataset.f === "name" ? el.value : num(el.value);
  } else return;
  render(); savePlan();
});
V().addEventListener("focusout", (ev) => { if ((ev.target.hasAttribute?.("data-money") || ev.target.dataset?.k === "appsGoal") && SL.plan) render(); });
V().addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.id === "slTeam") { SL.team = +el.value; try { localStorage.setItem("sales-team", el.value); } catch {} return SL.load(); }
  if (el.dataset.k === "month" && el.value) { SL.month = el.value; SL.day = SL.week = null; return SL.load(); }
  // 기준일을 뒤로 옮기면 그 사이 달력 실적을 현재 순매출에 넣을지 묻는다 (중복·누락 방지)
  if (el.dataset.k === "base" && el.value) {
    const s = SL.plan, old = s.base, nb = el.value;
    if (nb > old && !S().linked) {
      let net = 0, n = 0;
      for (const [d, e] of Object.entries(SL.log)) if (d > old && d <= nb && !isOff(d) && (e.amount || e.refund)) { net += (e.amount || 0) - (e.refund || 0); n++; }
      if (n && confirm(`기준일을 ${md(nb)}로 옮깁니다.\n${md(addDays(old, 1))}~${md(nb)} 달력에 입력한 ${n}일 실적(결제−환불 ${won(net)}원)을 현재 순매출에 더할까요?\n\n[확인] 더하기 — 현재 순매출을 아직 안 고쳤을 때\n[취소] 안 더하기 — 현재 순매출을 이미 새 숫자로 넣었을 때`)) s.current += net;
    }
    s.base = nb; await loadDays(); render(); savePlan();
  }
});
V().addEventListener("click", async (ev) => {
  const fx = ev.target.dataset.mixfix;
  if (fx) {
    const p = SL.plan, s2 = S(), c2 = calc(s2), mp = mixPlan(s2, c2), cur = memberMix(s2, 0);
    if (fx === "sum") { const v = toPct(cur); p.members.forEach((m, i) => { m.p = v[i]; }); }
    if (fx === "guide" && mp.guide) p.members.forEach((m, i) => { m.p = mp.guide.w[i]; });
    setH("slMem", ""); render(); savePlan(); return;
  }
  if (ev.target.closest("#slCurBtn")) return curToggle(!V().classList.contains("curopen"));
  if (ev.target.closest("#slR2Btn")) return r2Toggle(!V().classList.contains("r2open"));
  const nd = ev.target.dataset.slday, nw = ev.target.dataset.slweek;
  if (nd !== undefined) { SL.day = +nd === 0 ? todayIso() : addDays(SL.day, +nd); return render(); }
  if (nw !== undefined) { SL.week = +nw === 0 ? monOf(todayIso()) : addDays(SL.week, 7 * +nw); return render(); }
  if (ev.target.id === "slSync") {
    ev.target.disabled = true; setT("slSheet", "시트 가져오는 중…");
    const { data, error } = await sb.functions.invoke("planner-sheets", { body: { month: SL.month } });
    ev.target.disabled = false;
    if (error || data?.error) toast("시트를 못 가져왔어요: " + (data?.error || error.message)); else await SL.load();
    return;
  }
  if (ev.target.id === "slCopy") {
    try { await navigator.clipboard.writeText($v("#slReport").textContent); toast("보고문을 복사했어요"); }
    catch { const r = document.createRange(); r.selectNodeContents($v("#slReport")); getSelection().removeAllRanges(); getSelection().addRange(r); toast("선택된 글을 ⌘/Ctrl+C로 복사하세요"); }
    return;
  }
  const cell = ev.target.closest("#slCal [data-day]"); if (!cell) return;
  openDay(cell.dataset.day);
});

// [1] 현재(자동 측정) 열 접기·펴기 — 기본은 접힘, 기기에 기억
function curToggle(open) {
  V().classList.toggle("curopen", open);
  $v("#slCurBtn").textContent = open ? "현재 (자동 측정) ▾ 접기" : "현재 (자동 측정) ▸ 펼치기";
  try { localStorage.setItem("sales-cur-open", open ? "1" : ""); } catch {}
}
try { curToggle(localStorage.getItem("sales-cur-open") === "1"); } catch { curToggle(false); }
// [2] 남은 기간 목표 카드 접기·펴기 — 기본 접힘, 현재 순매출 줄은 늘 보임
function r2Toggle(open) {
  V().classList.toggle("r2open", open);
  $v("#slR2Btn").textContent = open ? "▾ 접기" : "▸ 펼치기";
  try { localStorage.setItem("sales-r2-open", open ? "1" : ""); } catch {}
}
try { r2Toggle(localStorage.getItem("sales-r2-open") === "1"); } catch { r2Toggle(false); }

// ── 달력 입력 창 ──
const dlg = $v("#slDlg"); let editDay = null;
const F = ["apps", "replies", "consults", "payers", "amount", "refund"], SHEET_F = ["payers", "amount", "refund"];
function openDay(d) {
  editDay = d; const linked = S().linked, e = { ...(SL.log[d] || {}), ...(linked ? S().log[d] || { payers: 0, amount: 0, refund: 0 } : {}) };
  $v("#slDlgTitle").textContent = `${md(d)} 실적 (${SL.teamName})`;
  for (const f of dlg.querySelectorAll("input")) { f.value = e[f.name] == null ? "" : f.hasAttribute("data-money") ? won(e[f.name]) : e[f.name]; f.readOnly = linked && SHEET_F.includes(f.name); }
  $v("#slDlgNote").textContent = (linked ? "📗 결제자·결제금액·환불은 재무 시트에서 자동으로 들어옵니다 (여기서 못 고침). " : "") + (d > todayIso() ? "앞날 입력은 예약으로만 봅니다. 칸 색깔만 바뀌고 실적에는 더해지지 않습니다. 그날이 지나면 실제 숫자로 고쳐주세요." : "");
  $v("#slDlgWho").textContent = e.updated_at ? `마지막 저장 ${new Date(e.updated_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "";
  showTips(); dlg.showModal();
}
const readDlg = () => Object.fromEntries([...dlg.querySelectorAll("input")].filter((f) => f.value !== "").map((f) => [f.name, num(f.value)]));
function showTips() {
  const s = S(), g = diagnose(s, calc(s), readDlg());
  $v("#slTips").innerHTML = !g ? "" : g.why.length
    ? `<div class="sltip">${g.low ? `<h4>상담 목표 ${g.tgt}명보다 부족합니다</h4>` : ""}${g.why.map(([w, k]) => `<b>${w}</b><ul>${tipList(s, k).map((t) => `<li>${t}</li>`).join("")}</ul>`).join("")}</div>`
    : `<div class="sltip ok"><b>상담 목표 달성 ✓</b></div>`;
}
dlg.addEventListener("input", showTips);
dlg.addEventListener("close", async () => {
  const v = dlg.returnValue, d = editDay, e = readDlg();
  if (S().linked) for (const k of SHEET_F) delete e[k];
  if (v === "save" && Object.keys(e).length) {
    const row = { team_id: SL.team, day: d, ...Object.fromEntries(F.map((k) => [k, e[k] ?? null])) };
    const { data, error } = await sb.from("sales_days").upsert(row).select().single();
    if (fail(error)) return;
    SL.log[d] = data; toast("저장했어요");
  } else if (v === "clear" || (v === "save" && SL.log[d])) {
    const { error } = await sb.from("sales_days").delete().eq("team_id", SL.team).eq("day", d);
    if (fail(error)) return;
    delete SL.log[d];
  }
  render();
});

// ── 📊 현황판 카드 (대표): 지점마다 이번 달 달성률·오늘 필요 상담 ──
SL.boardCards = async function (teamList) {
  const month = todayIso().slice(0, 7), last = mEnd({ month });
  const [p, d, sd, sy] = await Promise.all([sb.from("sales_plans").select("team_id, data").eq("month", month),
    sb.from("sales_days").select("*").gte("day", addDays(month + "-01", -1)).lte("day", last),
    sb.from("sales_sheet_days").select("*").gte("day", month + "-01").lte("day", last), sb.from("sales_sheet_sync").select("*").eq("month", month)]);
  if (p.error || d.error || sd.error || sy.error) return "";
  const cards = teamList.map((tm) => {
    const row = p.data.find((x) => x.team_id === tm.id);
    const own = (q) => q.data.filter((x) => x.team_id === tm.id);
    if (!row) { const sheetNet = own(sd).filter((x) => x.day <= todayIso()).reduce((t, x) => t + x.amount - x.refund, 0);
      return `<div class="bcard slb" data-slteam="${tm.id}"><div class="bh"><b>${esc(tm.name)}</b>${sy.data.some((x) => x.team_id === tm.id) ? `<span class="mem">📗 시트 순매출 ${won(sheetNet)}원</span>` : ""}</div><div class="bsub">이번 달 매출 목표 미설정 — 눌러서 입력</div></div>`; }
    const s = applyAuto(compose({ ...newPlan(month), ...row.data, month }, Object.fromEntries(own(d).map((x) => [x.day, x])),
      { days: Object.fromEntries(own(sd).map((x) => [x.day, x])), sync: sy.data.find((x) => x.team_id === tm.id) }));
    const c = calc(s), a = actuals(s), cu = catchUp(s, a), r = s.goal ? a.net / s.goal * 100 : 0, tdE = s.log[todayIso()];
    return `<div class="bcard slb" data-slteam="${tm.id}"><div class="bh"><b>${esc(tm.name)}</b><span class="mem">${won(a.net)} / ${won(s.goal)}원</span><span class="pct">${pct(r)}%</span></div>
      <div class="bar"><i style="width:${Math.min(100, r)}%"></i></div>
      <div class="bsub">남은 ${won(Math.max(0, s.goal - a.net))}원 · 남은 영업일 ${cu.left}일 · 하루 상담 <b>${Math.ceil(cu.conN / cu.left)}명</b> 필요 (처음 계획 ${minConsult(c)}명)${tdE?.consults != null ? ` · 오늘 상담 ${tdE.consults}명` : ""}</div></div>`;
  });
  return `<h3 style="margin:4px 0 10px">💰 이번 달 매출</h3><div class="bgrid" style="margin-bottom:18px">${cards.join("")}</div>`;
};
document.addEventListener("click", (ev) => { // 현황 카드 누르면 그 지점 매출 탭으로
  const c = ev.target.closest("[data-slteam]"); if (!c) return;
  SL.team = +c.dataset.slteam; try { localStorage.setItem("sales-team", c.dataset.slteam); } catch {}
  setView("sales");
});
})();
