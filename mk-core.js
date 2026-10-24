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
  if (/대구|동성로|대일|일중/.test(s)) return /일본|중국|대일|일중|JLPT|HSK/i.test(s) ? "jpcn" : "dsr";
  // 지역 없는 일본어·중국어 캠페인(예: "팔로 일본어 잠재고객")은 대구일본어중국어점 — 울산·구미 캠페인은 이름에 지역이 붙는다
  if (/일본어|중국어/.test(s)) return "jpcn";
  return null;
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
const STATUS_MAP = { 신규: "lead", 리드: "lead", 접수: "lead", 상담: "consult", 상담완료: "consult", 진행중: "lead", 최후통첩: "lead", 예약확정: "consult", 전화상안함: "lost", 방문: "visit", 방문완료: "visit", 등록: "enroll", 결제: "enroll", 결제완료: "enroll", 취소: "lost", 이탈: "lost", 부재: "lost" };
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
   FATIGUE = 1.3;
function buildWeekly({ week, ads = [], organic = [], leads = [] }) {
  const end = addDays(week, 6), from4 = addDays(week, -21), prevEnd = addDays(week, -1);
  const sum = (rows, f) => rows.reduce((s, r) => s + (r[f] || 0), 0);
  const ads4 = ads.filter((r) => inRange(r.date, from4, end));
  const leads4 = leads.filter((l) => inRange(l.lead_date, from4, end));
  const enrolls = (name) => leads4.filter((l) => l.status === "enroll" && (name === undefined || l.ad_name === name)).length;
  const teamSpend4 = sum(ads4, "spend"), teamEnroll4 = enrolls(), teamCpe = teamEnroll4 ? teamSpend4 / teamEnroll4 : null;
  const names = [...new Set(ads4.map((r) => r.ad_name))];
  const out = names.map((ad_name) => {
    const mine = ads4.filter((r) => r.ad_name === ad_name);
    const wk = mine.filter((r) => r.date >= week), prev = mine.filter((r) => r.date <= prevEnd);
    const spend = sum(wk, "spend"), lw = sum(wk, "leads"), spend4w = sum(mine, "spend"), leads4w = sum(mine, "leads");
    const cpl = lw ? spend / lw : null, prevCpl = sum(prev, "leads") ? sum(prev, "spend") / sum(prev, "leads") : null;
    const enrolls4w = enrolls(ad_name), cpe4w = enrolls4w ? spend4w / enrolls4w : null;
    const cheap = enrolls4w >= 1 && teamCpe !== null && cpe4w <= teamCpe;
    let verdict, reason;
    if (leads4w === 0 && spend4w >= ZERO_LEAD_SPEND) [verdict, reason] = ["cut", `4주 지출 ${usd(spend4w)}, 리드 0`];
    else if (!leads4.length) [verdict, reason] = ["hold", "등록 데이터 누락"];
    else if (leads4w < MIN_SAMPLE) [verdict, reason] = ["hold", `판단 보류 (표본 ${leads4w}건)`];
    else if (cpl !== null && prevCpl !== null && cpl >= prevCpl * FATIGUE) {
      const up = `리드당 비용 ${Math.round((cpl / prevCpl - 1) * 100)}% 상승(피로도)`;
      [verdict, reason] = cheap ? ["watch", `등록은 좋지만 ${up}`] : ["cut", up];
    } else if (cheap) [verdict, reason] = ["keep", "등록당 비용 지점 평균 이하"];
    else if (!enrolls4w) [verdict, reason] = ["watch", "리드는 있으나 4주 등록 0"];
    else [verdict, reason] = ["watch", "등록당 비용 지점 평균 초과"];
    return { ad_name, spend, leads: lw, cpl, prevCpl, spend4w, leads4w, enrolls4w, cpe4w, verdict, reason };
  }).sort((a, b) => b.spend4w - a.spend4w);
  const wkAds = ads.filter((r) => inRange(r.date, week, end));
  const posts = organic.filter((p) => inRange(p.published_at, from4, end) && p.reach >= 100)
    .map((p) => ({ ...p, score: (p.saves + p.shares) / p.reach })).sort((a, b) => b.score - a.score);
  return {
    week,
    flags: { noAds: !ads4.length, noLeads: !leads4.length, noOrganic: !organic.length },
    totals: { spend: sum(wkAds, "spend"), leads: sum(wkAds, "leads"), cpl: sum(wkAds, "leads") ? sum(wkAds, "spend") / sum(wkAds, "leads") : null,
      spend4w: teamSpend4, leads4w: sum(ads4, "leads"), enrolls4w: teamEnroll4, cpe4w: teamCpe },
    ads: out,
    organic: { top: posts.slice(0, 3), bottom: posts.slice(-3).reverse() },
  };
}

// ── 페르소나 입력 (문장은 Claude 가 쓴다) ──
function buildPersonaInputs({ leads = [], demo = [] }) {
  const count = (arr, f) => arr.reduce((o, x) => (x[f] ? ((o[x[f]] = (o[x[f]] || 0) + 1), o) : o), {});
  const funnel = Object.fromEntries(STATUS.map((s) => [s, leads.filter((l) => l.status === s).length]));
  const enrolled = leads.filter((l) => l.status === "enroll");
  const g = {};
  for (const d of demo) { const k = `${d.age}|${d.gender}`; g[k] = (g[k] || 0) + (d.leads || 0); }
  const total = Object.values(g).reduce((a, b) => a + b, 0);
  const leadsByAgeGender = Object.entries(g).map(([k, n]) => { const [age, gender] = k.split("|"); return { age, gender, leads: n, share: total ? Math.round((n / total) * 1000) / 1000 : 0 }; })
    .sort((a, b) => b.leads - a.leads);
  return { sample: leads.length, funnel, enrolledBySubject: count(enrolled, "subject"), enrolledByAge: count(enrolled, "age_band"), leadsByAgeGender };
}

return { ALIAS, decode, teamKeyOf, parseCsv, toNumber, toDate, detectKind, normalize, STATUS, STATUS_MAP, sanitizeLead, addDays, weekStart,
  MIN_SAMPLE, ZERO_LEAD_SPEND, FATIGUE, buildWeekly, buildPersonaInputs };
});
