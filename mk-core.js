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
  spend: ["지출금액(krw)", "amountspent(krw)", "지출금액", "amountspent"],
  age: ["연령", "age"],
  gender: ["성별", "gender"],
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

function normalize(text) {
  const [headers = [], ...body] = parseCsv(text);
  const kind = detectKind(headers), c = columns(headers);
  if (!kind) return { kind: null, rows: [], missing: [], headers };
  const missing = REQUIRED[kind].filter((f) => c[f] === undefined);
  const get = (r, f) => (c[f] === undefined ? "" : (r[c[f]] ?? "").trim());
  const num = (r, f) => toNumber(get(r, f));
  const leads = (r) => (c.leads !== undefined ? num(r, "leads") : num(r, "results"));
  let rows;
  if (kind === "ads_daily") {
    rows = body.map((r) => ({ date: toDate(get(r, "date")), campaign: get(r, "campaign"), adset: get(r, "adset"), ad_name: get(r, "ad_name"),
      impressions: num(r, "impressions"), reach: num(r, "reach"), clicks: num(r, "clicks"), leads: leads(r), spend: num(r, "spend") }))
      .filter((r) => r.ad_name && r.date);
  } else if (kind === "ads_demo") {
    rows = body.map((r) => ({ period_from: toDate(get(r, "period_from")), period_to: toDate(get(r, "period_to")), ad_name: get(r, "ad_name"),
      age: get(r, "age"), gender: get(r, "gender"), impressions: num(r, "impressions"), clicks: num(r, "clicks"), leads: leads(r), spend: num(r, "spend") }))
      .filter((r) => r.ad_name);
  } else {
    const platform = c.account !== undefined ? "instagram" : "facebook";
    rows = body.map((r) => ({ platform, post_id: get(r, "post_id"), published_at: toDate(get(r, "published_at")), type: get(r, "type"),
      permalink: get(r, "permalink"), caption: [...get(r, "caption")].slice(0, 300).join(""), views: num(r, "views"), reach: num(r, "reach"),
      likes: num(r, "likes"), comments: num(r, "comments"), saves: num(r, "saves"), shares: num(r, "shares"), follows: num(r, "follows") }))
      .filter((r) => r.post_id && r.published_at);
  }
  return { kind, rows, missing, headers };
}

return { ALIAS, parseCsv, toNumber, toDate, detectKind, normalize };
});
