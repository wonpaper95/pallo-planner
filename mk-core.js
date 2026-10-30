// 📣 마케팅 계산 모음 (브라우저 window.MKCORE · Node require 겸용). 화면·DB와 무관한 순수 함수만 둔다.
// CSV 헤더는 메타가 언어·버전마다 이름을 바꿔서, 별칭 목록으로 표준 필드에 맞춘다. 실제 파일에서 못 알아본 열은 ALIAS 에 추가.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.MKCORE = api;
})(typeof self !== "undefined" ? self : globalThis, function () {

const key = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "");
const ALIAS = {
  // 광고
  date: ["일", "날짜", "day"],
  period_from: ["보고시작", "reportingstarts"],
  period_to: ["보고종료", "reportingends"],
  campaign: ["캠페인이름", "campaignname"],
  adset: ["광고세트이름", "adsetname"],
  ad_name: ["광고이름", "adname"],
  impressions: ["노출", "impressions"],
  reach: ["도달", "reach"],
  clicks: ["링크클릭", "linkclicks", "클릭(전체)", "clicks(all)"],
  leads: ["리드", "leads", "잠재고객", "잠재고객(양식)", "on-facebookleads"],
  results: ["결과", "results"],
  result_type: ["결과표시도구", "resultindicator"],
  spend: ["지출금액(usd)", "amountspent(usd)", "지출금액(krw)", "amountspent(krw)", "지출금액", "amountspent"],
  age: ["연령", "age"],
  gender: ["성별", "성", "gender"],
  // 오가닉
  post_id: ["게시물id", "postid"],
  account: ["계정사용자이름", "accountusername"],
  page: ["페이지이름", "pagename"],
  caption: ["설명", "description", "제목", "title"],
  published_at: ["게시시간", "publishtime"],
  type: ["게시물유형", "posttype"],
  permalink: ["퍼머링크", "permalink"],
  views: ["조회", "조회수", "views"],
  likes: ["좋아요", "likes", "반응", "reactions"],
  comments: ["댓글", "댓글수", "comments"],
  saves: ["저장", "saves"],
  shares: ["공유", "shares"],
  follows: ["팔로우", "follows"],
};
const REQUIRED = {
  ads_daily: ["ad_name", "date", "spend"],
  ads_demo: ["ad_name", "spend"],
  organic: ["post_id", "published_at"],
};

function parseCsv(text) {
  const s = String(text).replace(/^﻿/, ""), rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const toNumber = (v) => { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) && /\d/.test(String(v)) ? n : 0; };
const pad = (n) => String(n).padStart(2, "0");
function toDate(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}

function columns(headers) {
  const idx = {};
  headers.forEach((h, i) => {
    const k = key(h);
    for (const [f, names] of Object.entries(ALIAS)) if (idx[f] === undefined && names.includes(k)) idx[f] = i;
  });
  return idx;
}

function detectKind(headers) {
  const c = columns(headers);
  if (c.post_id !== undefined) return "organic";
  if (c.ad_name !== undefined && (c.age !== undefined || c.gender !== undefined)) return "ads_demo";
  if (c.ad_name !== undefined) return "ads_daily";
  return null;
}

// 파일 바이트 → 문자열. 인사이트·리드 다운로드는 UTF-16LE 일 수 있어 BOM 으로 가린다.
function decode(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder("utf-16le").decode(u.subarray(2));
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder("utf-16be").decode(u.subarray(2));
  return new TextDecoder("utf-8").decode(u).replace(/^﻿/, "");
}

// 광고 계정 하나를 4개 지점이 같이 써서, 캠페인·광고 이름의 지역 단어로 지점을 고른다. 키는 blog.js DEF 와 같다.
// 대구 계열: 일본·중국 표기(일본어·일본여행자·대일·일중 등)면 jpcn(대구일본어중국어점), 그 밖의 대구·동성로 는 dsr(대구동성로점).
// 지역 없는 일본어·중국어 캠페인(예: "팔로 일본어 잠재고객")은 대구일본어중국어점 — 울산·구미 캠페인은 이름에 지역이 붙는다.
function teamKeyOf(text) {
  const s = String(text ?? "");
  if (/울산/.test(s)) return "ulsan";
  if (/구미/.test(s)) return "gumi";
  // 대구 계열: 일본어·중국어 같은 명시 과목이 있으면 영어 말이 같이 있어도 jpcn. '평일중'(평일 중) 안의 '일중'은 일중 표기가 아님.
  // 영어·스페인어 제외는 '일본여행' 같은 느슨한 말(일본|중국)에만 적용한다.
  if (/대구|동성로|대일|(?<!평)일중/.test(s)) {
    if (/일본어|중국어|JLPT|HSK|대일|(?<!평)일중|\[일본어\]|\[중국어\]/i.test(s)) return "jpcn";
    return /일본|중국/.test(s) && !/영어|스페인어/.test(s) ? "jpcn" : "dsr";
  }
  // 지역 없는 일본어·중국어 캠페인(예: "팔로 일본어 잠재고객")은 대구일본어중국어점 — 울산·구미 캠페인은 이름에 지역이 붙는다
  if (/일본어|중국어/.test(s)) return "jpcn";
  return null;
}

// 지점 이름 → team_key. 운영(대구영어점·대구일중점)과 개발(대구동성로점·대구일본어중국어점) 이름을 모두 받는다. 어느 이름도 두 키에 걸리지 않는다.
const TEAM_NAME_RE = { dsr: /동성로|대구\s*영어/, jpcn: /일본어|중국어|일중/, ulsan: /울산/, gumi: /구미/ };
function teamKeyOfTeamName(name) {
  const n = String(name ?? "");
  return Object.keys(TEAM_NAME_RE).find((k) => TEAM_NAME_RE[k].test(n)) ?? null;
}

function normalize(text) {
  const [headers = [], ...body] = parseCsv(text);
  const kind = detectKind(headers), c = columns(headers);
  if (!kind) return { kind: null, rows: [], missing: [], headers, currency: null };
  // 일 열이 없는 내보내기는 보고 시작·종료 기간이 있으면 통과 (하루짜리 행만 날짜로 씀)
  const missing = REQUIRED[kind].filter((f) => c[f] === undefined && !(kind === "ads_daily" && f === "date" && c.period_from !== undefined && c.period_to !== undefined));
  const sk = c.spend !== undefined ? key(headers[c.spend]) : "";
  const currency = sk.includes("(usd)") ? "USD" : sk.includes("(krw)") ? "KRW" : null;
  const get = (r, f) => (c[f] === undefined ? "" : (r[c[f]] ?? "").trim());
  const num = (r, f) => toNumber(get(r, f));
  // 리드 열이 없으면 결과 값을 쓰되, 결과 표시 도구가 있으면 리드 종류(lead)일 때만 센다 (랜딩페이지 조회 등은 제외)
  const leads = (r) => (c.leads !== undefined ? num(r, "leads") : c.result_type !== undefined ? (/lead/i.test(get(r, "result_type")) ? num(r, "results") : 0) : num(r, "results"));
  const team = (r) => teamKeyOf(get(r, "campaign")) ?? teamKeyOf(get(r, "ad_name")) ?? teamKeyOf(get(r, "adset"));
  const dayOf = (r) => (c.date !== undefined ? toDate(get(r, "date")) : (toDate(get(r, "period_from")) === toDate(get(r, "period_to")) ? toDate(get(r, "period_from")) : null));
  let rows;
  if (kind === "ads_daily") {
    rows = body.map((r) => ({ date: dayOf(r), campaign: get(r, "campaign"), adset: get(r, "adset"), ad_name: get(r, "ad_name"),
      impressions: num(r, "impressions"), reach: num(r, "reach"), clicks: num(r, "clicks"), leads: leads(r), spend: num(r, "spend"), team_key: team(r) }))
      .filter((r) => r.ad_name && r.date);
  } else if (kind === "ads_demo") {
    rows = body.map((r) => ({ period_from: toDate(get(r, "period_from")), period_to: toDate(get(r, "period_to")), ad_name: get(r, "ad_name"),
      age: get(r, "age"), gender: get(r, "gender"), impressions: num(r, "impressions"), clicks: num(r, "clicks"), leads: leads(r), spend: num(r, "spend"), team_key: team(r) }))
      .filter((r) => r.ad_name);
  } else {
    const platform = c.account !== undefined ? "instagram" : "facebook";
    rows = body.map((r) => ({ platform, post_id: get(r, "post_id"), published_at: toDate(get(r, "published_at")), type: get(r, "type"),
      permalink: get(r, "permalink"), caption: [...get(r, "caption")].slice(0, 300).join(""), views: num(r, "views"), reach: num(r, "reach"),
      likes: num(r, "likes"), comments: num(r, "comments"), saves: num(r, "saves"), shares: num(r, "shares"), follows: num(r, "follows") }))
      .filter((r) => r.post_id && r.published_at);
  }
  return { kind, rows, missing, headers, currency };
}

// ── 리드 (전산) ── 이름·전화번호는 받지 않는다. 화이트리스트 밖 필드는 버린다.
const STATUS = ["lead", "consult", "visit", "enroll", "lost"];
// 전산 표시값 → 표준값. 실제 값은 docs/meta-marketing/jeonsan-leads.md 조사 후 보강.
const STATUS_MAP = { 신규: "lead", 리드: "lead", 접수: "lead", 상담: "consult", 상담완료: "consult", 진행중: "lead", 최후통첩: "lead", 예약확정: "consult", 전화상안함: "lost", 방문: "visit", 방문완: "visit", 방문완료: "visit", 등록: "enroll", 결제: "enroll", 결제완료: "enroll", 취소: "lost", 이탈: "lost", 부재: "lost" };
const PHONE = /(?<!\d)01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/;
function sanitizeLead(raw) {
  const status = STATUS.includes(raw?.status) ? raw.status : STATUS_MAP[String(raw?.status ?? "").replace(/\s+/g, "")];
  const lead = { source_key: String(raw?.source_key ?? "").trim(), ad_name: String(raw?.ad_name ?? "").trim(), lead_date: toDate(raw?.lead_date),
    status, age_band: raw?.age_band ? String(raw.age_band).trim() : null, subject: raw?.subject ? String(raw.subject).trim() : null };
  if (!lead.source_key) return { ok: false, reason: "source_key 없음" };
  if (!lead.lead_date) return { ok: false, reason: "날짜 없음" };
  if (!status) return { ok: false, reason: `모르는 상태값: ${raw?.status}` };
  if ([lead.ad_name, lead.subject, lead.age_band].some((v) => v && PHONE.test(v))) return { ok: false, reason: "전화번호로 보이는 값" };
  return { ok: true, lead };
}

// ── 날짜 ──
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const weekStart = (d) => { const t = new Date(d + "T00:00:00Z"); return addDays(d, -((t.getUTCDay() + 6) % 7)); };
const inRange = (d, from, to) => d && d >= from && d <= to;
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");

// ── 주간 리포트 ──
const MIN_SAMPLE = 5, ZERO_LEAD_SPEND = 70, // 달러
   FATIGUE = 1.3,
   ZERO_WEEK_MIN_SPEND = 5; // 이번 주 리드 0 피로도는 지출 5달러 이상일 때만 (소액은 우연)
function buildWeekly({ week, ads = [], organic = [], leads = [], sales = null, naver = [], fx = null }) {
  const end = addDays(week, 6), from4 = addDays(week, -21), prevEnd = addDays(week, -1);
  const sum = (rows, f) => rows.reduce((s, r) => s + (r[f] || 0), 0);
  const ads4 = ads.filter((r) => inRange(r.date, from4, end));
  const leads4 = leads.filter((l) => inRange(l.lead_date, from4, end));
  const names = [...new Set(ads4.map((r) => r.ad_name))], adSet = new Set(names);
  // 소재 품질 = 상담 예약(전산 '예약 확정' 이후 단계). 결제는 매출 시트에 광고명이 없어 소재별로 못 센다 → 지점·매체 단위로만(totals.sales4w).
  // 지점 평균은 4주 안에 광고가 돈 소재의 예약만.
  const BOOKED = ["consult", "visit", "enroll"];
  const booked = (name) => leads4.filter((l) => BOOKED.includes(l.status) && (name === undefined ? adSet.has(l.ad_name) : l.ad_name === name)).length;
  const teamSpend4 = sum(ads4, "spend"), teamBooked4 = booked(), teamCpb = teamBooked4 ? teamSpend4 / teamBooked4 : null;
  const out = names.map((ad_name) => {
    const mine = ads4.filter((r) => r.ad_name === ad_name);
    const wk = mine.filter((r) => r.date >= week), prev = mine.filter((r) => r.date <= prevEnd);
    const spend = sum(wk, "spend"), lw = sum(wk, "leads"), spend4w = sum(mine, "spend"), leads4w = sum(mine, "leads");
    const cpl = lw ? spend / lw : null, prevCpl = sum(prev, "leads") ? sum(prev, "spend") / sum(prev, "leads") : null;
    const booked4w = booked(ad_name), cpb4w = booked4w ? spend4w / booked4w : null;
    const myLeads = leads4.filter((l) => l.ad_name === ad_name), young = myLeads.filter((l) => l.lead_date > addDays(end, -7)).length; // 7일 이내 리드는 아직 예약 전일 수 있음
    const zeroWeek = spend >= ZERO_WEEK_MIN_SPEND && lw === 0 && prevCpl !== null; // 이번 주 돈만 쓰고 리드 0
    const cheap = booked4w >= 1 && teamCpb !== null && cpb4w <= teamCpb;
    let verdict, reason;
    if (leads4w === 0 && spend4w >= ZERO_LEAD_SPEND) [verdict, reason] = ["cut", `4주 지출 ${usd(spend4w)}, 리드 0`];
    else if (!leads4.length) [verdict, reason] = ["hold", "전산 리드 누락"];
    else if (leads4w < MIN_SAMPLE) [verdict, reason] = ["hold", `판단 보류 (표본 ${leads4w}건)`];
    else if (zeroWeek || (cpl !== null && prevCpl !== null && cpl >= prevCpl * FATIGUE)) {
      const up = zeroWeek ? `이번 주 지출 ${usd(spend)}, 리드 0 (피로도)` : `리드당 비용 ${Math.round((cpl / prevCpl - 1) * 100)}% 상승(피로도)`;
      [verdict, reason] = cheap ? ["watch", `예약은 좋지만 ${up}`] : ["cut", up];
    } else if (cheap) [verdict, reason] = ["keep", "예약당 비용 지점 평균 이하"];
    else if (!booked4w) [verdict, reason] = young * 2 > myLeads.length ? ["hold", `판단 보류 (최근 7일 리드 ${young}/${myLeads.length}건)`] : ["watch", "리드는 있으나 4주 예약 0"];
    else [verdict, reason] = ["watch", "예약당 비용 지점 평균 초과"];
    return { ad_name, spend, leads: lw, cpl, prevCpl, spend4w, leads4w, booked4w, cpb4w, verdict, reason };
  }).sort((a, b) => b.spend4w - a.spend4w);
  const wkAds = ads.filter((r) => inRange(r.date, week, end));
  const posts = organic.filter((p) => inRange(p.published_at, from4, end) && p.reach >= 100)
    .map((p) => ({ ...p, score: (p.saves + p.shares) / p.reach })).sort((a, b) => b.score - a.score);
  return {
    week,
    flags: { noAds: !ads4.length, noLeads: !leads4.length, noOrganic: !organic.length, noSales: !sales?.length },
    totals: { spend: sum(wkAds, "spend"), leads: sum(wkAds, "leads"), cpl: sum(wkAds, "leads") ? sum(wkAds, "spend") / sum(wkAds, "leads") : null,
      spend4w: teamSpend4, leads4w: sum(ads4, "leads"), booked4w: teamBooked4, cpb4w: teamCpb,
      // 4주 결제(매출 시트) — 지점 전체·매체별. 메타 광고비는 원화(fx), 네이버는 원.
      sales4w: sales ? (({ payers, paid, net, channels, spend, coverage }) => ({ payers, paid, net, channels, spend, coverage }))(periodStats({ from: from4, to: end, sales, meta: ads4.map((r) => ({ date: r.date, spend: r.spend })), naver, fx })) : null },
    ads: out,
    organic: { top: posts.slice(0, 3), bottom: posts.slice(3).slice(-3).reverse() }, // top 과 겹치지 않게 (게시물 6개 미만이면 bottom 이 짧다)
  };
}

// ── 페르소나 입력 (문장은 Claude 가 쓴다) ──
function buildPersonaInputs({ leads = [], demo = [] }) {
  const count = (arr, f) => arr.reduce((o, x) => (x[f] ? ((o[x[f]] = (o[x[f]] || 0) + 1), o) : o), {});
  const funnel = Object.fromEntries(STATUS.map((s) => [s, leads.filter((l) => l.status === s).length]));
  const enrolled = leads.filter((l) => l.status === "enroll");
  // 연령·성별: 여러 날 묶음(CSV) 기간 안에 든 하루치(API) 행은 같은 리드를 두 번 세는 것이라 뺀다
  const spans = demo.filter((d) => d.period_from && d.period_to > d.period_from);
  const once = demo.filter((d) => !(d.period_from && d.period_from === d.period_to && spans.some((s) => d.period_from >= s.period_from && d.period_from <= s.period_to)));
  const g = {};
  for (const d of once) { const k = `${d.age}|${d.gender}`; g[k] = (g[k] || 0) + (d.leads || 0); }
  const total = Object.values(g).reduce((a, b) => a + b, 0);
  const leadsByAgeGender = Object.entries(g).map(([k, n]) => { const [age, gender] = k.split("|"); return { age, gender, leads: n, share: total ? Math.round((n / total) * 1000) / 1000 : 0 }; })
    .sort((a, b) => b.leads - a.leads);
  const days = leads.map((l) => l.lead_date).filter(Boolean).sort();
  return { sample: leads.length, from: days[0] ?? null, to: days.at(-1) ?? null, funnel, enrolledBySubject: count(enrolled, "subject"), enrolledByAge: count(enrolled, "age_band"), leadsByAgeGender };
}

// ── 매출 시트·캘린더 통계 (주간 결제·월간 리포트) ──
// 결제(등록) = 매출 시트(플래너 재무 탭 fin_rows kind=sale) 거래형태 '가입' + 금액 > 0. 전산 '이미 등록된 회원'은 실제 결제와 안 맞아 쓰지 않는다.
// 매체 = 캘린더 통계 '동기'와 매출 시트 '가입경로'를 같은 네 묶음으로. 모르는 값은 기타.
const CHANNELS = ["메타", "네이버", "지인·재등록", "기타"];
function channelOf(v) {
  const s = String(v ?? "").replace(/\s+/g, "");
  if (/인스타|외부유입|페이스북|메타|랜딩/.test(s)) return "메타";
  if (/네이버/.test(s)) return "네이버";
  if (/지인|소개|재등록/.test(s)) return "지인·재등록";
  return "기타";
}
// 매출 시트 한 줄 → { day, amount, type, channel, lang, staff, who }. who = 같은 날 같은 사람을 한 번만 세는 불투명 키(스크립트가 만든다, 이름 아님)
function saleRow(r) {
  const v = r.vals ?? {};
  return { day: r.day, amount: Number(r.amount) || 0, type: String(v.거래형태 ?? "").trim(), channel: channelOf(v.가입경로), path: String(v.가입경로 ?? "").trim(),
    lang: String(v.언어 ?? "").trim() || "기타", staff: String(v.상담자 ?? "").trim() || "(빈칸)", who: r.who ?? null };
}
const isSignup = (s) => s.type === "가입" && s.amount > 0;
const isRefund = (s) => /환불/.test(s.type) && s.amount < 0;
// 결제자 수: 같은 날 같은 사람(who)은 한 명. who 가 없으면 줄 수
const payerCount = (rows) => new Set(rows.map((s, i) => (s.who ? `${s.day}|${s.who}` : `#${i}`))).size;

const monthEnd = (m) => { const t = new Date(m + "-01T00:00:00Z"); t.setUTCMonth(t.getUTCMonth() + 1); t.setUTCDate(0); return t.toISOString().slice(0, 10); };
const prevMonth = (m) => { const t = new Date(m + "-01T00:00:00Z"); t.setUTCMonth(t.getUTCMonth() - 1); return t.toISOString().slice(0, 7); };
const ratio = (a, b) => (b ? a / b : null);

// 기간 하나의 숫자. leads=mk_leads, visits=mk_visits, sales=saleRow[], meta=[{date,spend(USD)}], naver=[{date,spend(원)}], fx=USD→원
function periodStats({ from, to, leads = [], visits = [], sales = [], meta = [], naver = [], fx = null }) {
  const L = leads.filter((l) => inRange(l.lead_date, from, to)), V = visits.filter((v) => inRange(v.day, from, to)), S = sales.filter((s) => inRange(s.day, from, to));
  const sign = S.filter(isSignup), refunds = S.filter(isRefund), sum = (a, f) => a.reduce((x, r) => x + (Number(r[f]) || 0), 0);
  const metaUsd = sum(meta.filter((r) => inRange(r.date, from, to)), "spend"), naverKrw = sum(naver.filter((r) => inRange(r.date, from, to)), "spend");
  const booked = sum(V, "total"), done = sum(V, "done"), payers = payerCount(sign), paid = sum(sign, "amount");
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;
  const cover = (rows, f) => new Set(rows.filter((r) => inRange(r[f], from, to)).map((r) => r[f])).size;
  const out = {
    from, to, apps: L.length, adLeads: L.filter((l) => l.ad_name).length, booked, done, noshow: sum(V, "noshow"),
    payers, paid, net: sum(S, "amount"), refund: -sum(refunds, "amount"), refunders: payerCount(refunds),
    // 결제자가 방문완보다 많으면 캘린더 기록이 빠진 기간(지난달 방문자가 이번에 결제한 것도 섞임) → 결제율 비움
    doneRate: ratio(done, booked), payRate: payers <= done ? ratio(payers, done) : null, visitsShort: payers > done, payPerApp: ratio(payers, L.length), aov: ratio(paid, payers),
    spend: { meta: fx ? Math.round(metaUsd * fx) : null, metaUsd: Math.round(metaUsd * 100) / 100, naver: naverKrw },
    coverage: { days, leads: cover(leads, "lead_date"), visits: cover(visits, "day"), naver: cover(naver, "date"), meta: cover(meta, "date"), sales: cover(sales, "day") },
  };
  // 매체별: 예약(캘린더 동기) · 결제·매출(가입경로) · 광고비 → ROAS = 결제금액 / 광고비
  out.channels = CHANNELS.map((ch) => {
    const b = V.reduce((x, v) => x + Object.entries(v.data?.byMotive ?? {}).reduce((y, [k, n]) => y + (channelOf(k) === ch ? n : 0), 0), 0);
    const cs = sign.filter((s) => s.channel === ch), cPaid = sum(cs, "amount");
    const spend = ch === "메타" ? out.spend.meta : ch === "네이버" ? naverKrw : null;
    return { channel: ch, booked: b, payers: payerCount(cs), paid: cPaid, spend, roas: spend ? cPaid / spend : null, cpp: spend && cs.length ? spend / payerCount(cs) : null };
  });
  // 언어별: 예약(캘린더 언어) · 결제·매출(매출 시트 언어)
  const langs = [...new Set([...V.flatMap((v) => Object.keys(v.data?.byLang ?? {})), ...sign.map((s) => s.lang)])];
  out.langs = langs.map((lang) => { const ls = sign.filter((s) => s.lang === lang); return { lang, booked: V.reduce((x, v) => x + (v.data?.byLang?.[lang] ?? 0), 0), payers: payerCount(ls), paid: sum(ls, "amount") }; })
    .sort((a, b) => b.paid - a.paid || b.booked - a.booked);
  // 상담자별: 결제자·환불자·실매출(그 사람 줄 합계)·결제 객단가. 상담 인원은 캘린더에 담당자가 없어 비운다.
  out.staff = [...new Set(S.map((s) => s.staff))].map((staff) => {
    const mine = S.filter((s) => s.staff === staff), sg = mine.filter(isSignup), rf = mine.filter(isRefund);
    return { staff, payers: payerCount(sg), paid: sum(sg, "amount"), refunders: payerCount(rf), refund: -sum(rf, "amount"), net: sum(mine, "amount"), aov: ratio(sum(sg, "amount"), payerCount(sg)) };
  }).filter((r) => r.payers || r.refunders).sort((a, b) => b.net - a.net);
  return out;
}

// 캘린더 통계 한 줄(jeonsan-visits.js 를 줄인 꼴) "YYYY-MM-DD|총예약|방문완|불참|방문|등록전환|상태=n,…|언어=n,…|동기=n,…" → mk_visits 행.
// 이름표는 글자(한글·영문·공백·괄호)만, 숫자는 0 이상 정수만 — 이름·전화번호가 섞일 틈을 막는다.
function parseVisitLine(line) {
  const p = String(line ?? "").trim().split("|");
  if (p.length !== 9 || !toDate(p[0]) || toDate(p[0]) !== p[0]) return { ok: false, reason: "형식" };
  const ints = p.slice(1, 6).map(Number);
  if (ints.some((n) => !Number.isInteger(n) || n < 0)) return { ok: false, reason: "숫자" };
  const map = (t) => { const o = {}; for (const kv of t ? t.split(",") : []) { const m = kv.match(/^([가-힣A-Za-z ()·]{1,20})=(\d{1,4})$/); if (!m) return null; o[m[1]] = +m[2]; } return o; };
  const [byStatus, byLang, byMotive] = [map(p[6]), map(p[7]), map(p[8])];
  if (!byStatus || !byLang || !byMotive) return { ok: false, reason: "이름표" };
  const [total, done, noshow, visit, enroll] = ints;
  return { ok: true, row: { day: p[0], total, done, noshow, data: { visit, enroll, byStatus, byLang, byMotive } } };
}

// 월간 리포트. half: "first"(1~15일) | "full"(한 달). 비교 = 지난달 같은 날짜 구간. trend = months(오래된 순)의 달별 숫자(이번 달은 to 까지)
function buildMonthly({ month, half = "full", months = [], ...data }) {
  const from = month + "-01", to = half === "first" ? month + "-15" : monthEnd(month);
  const pm = prevMonth(month), pTo = half === "first" ? pm + "-15" : monthEnd(pm);
  const cur = periodStats({ from, to, ...data }), prev = periodStats({ from: pm + "-01", to: pTo, ...data });
  const halves = half === "full" ? { first: periodStats({ from, to: month + "-15", ...data }), second: periodStats({ from: month + "-16", to, ...data }) } : null;
  const trend = months.map((m) => { const s = periodStats({ from: m + "-01", to: m === month ? to : monthEnd(m), ...data }); return { month: m, ...s }; });
  return { month, half, from, to, cur, prev, halves, trend };
}

return { ALIAS, decode, teamKeyOf, parseVisitLine, CHANNELS, channelOf, saleRow, isSignup, isRefund, periodStats, buildMonthly, monthEnd, prevMonth, teamKeyOfTeamName, parseCsv, toNumber, toDate, detectKind, normalize, STATUS, STATUS_MAP, sanitizeLead, addDays, weekStart,
  MIN_SAMPLE, ZERO_LEAD_SPEND, ZERO_WEEK_MIN_SPEND, FATIGUE, buildWeekly, buildPersonaInputs };
});
