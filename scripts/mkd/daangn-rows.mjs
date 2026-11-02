// 당근 비즈프로필 통계 — 순수 모듈(DB·브라우저 안 씀, tests/mkd-daangn.test.mjs 로 검증). daangn.mjs 가 당근비즈니스 화면이 받은 JSON 을 넘겨 쓴다.
// 한 당근 계정(맥미니 자동 브라우저 프로필 ~/.cache/pallo-mkd/daangn)이 지점 비즈프로필 셋을 관리한다: 팔로 대구동성로점(dsr) · 팔로 일본어중국어회화 대구동성로점(jpcn) · 팔로 울산점(ulsan).
//   · 목록: business-account/api/v2/business_accounts/search → {data:{businessAccounts:[{id,name,status,followersCount}]}}
//   · 일별: business-crm/api/v1/statistics/statistic_detail (통계 화면 '일별 상세 내역' 30일) → {data:{details:[{date,inflowCount(조회수),inflowCustomerCount(방문 고객수),followerCount}]}}
//   · 단골: business-crm/api/v1/statistics/follow_summary → {data:{totalCount}}
// 당근은 "어제 데이터는 매일 오전 8시에 갱신" — 그 전엔 어제가 0 으로 보인다. 그래서 확정된 날(한국 시각 8시 전이면 그저께까지, 뒤면 어제까지)만 쓴다.
// 이미 ok 로 저장된 날은 다시 쓰지 않는다(그날 찍어 둔 현재 단골 수를 지우지 않게). 단골(followers)은 이번에 쓰는 가장 최근 날에만 '지금 값'으로 싣는다.
// 채팅·전화 수는 아직 못 읽는다(비즈프로필 홈은 다른 도메인이라 자동 로그인이 안 이어짐).
// 당근 광고(전문가모드, 2026-11-02 시작): 광고 계정이 지점마다 하나. 홈에서 그 계정으로 들어가고 '디스플레이 광고 관리' 화면이 받는 시계열(최근 7일, 쓴 날만 줄이 있음)을 읽는다.
//   비즈프로필과 달리 약 10분마다 갱신돼 하루 늦지 않다 → 그날(D)을 바로 쓴다. 줄이 없는 날은 0 원. 비용은 VAT 포함. 어제면 홈의 '어제 총 소진 비용'과 맞춰 보고 다르면 partial.

export const DAANGN_TEAMS = ["dsr", "jpcn", "ulsan"]; // 비즈프로필이 있는 지점 (구미점은 없음)
export const LOGIN_URL = "https://business.daangn.com/profile/login";
export const dashboardUrl = (id) => `https://business.daangn.com/profile/${encodeURIComponent(id)}/dashboard`;

// 비즈프로필 이름 → 지점
export function teamOfProfile(name) {
  const s = String(name ?? "");
  if (!/팔로|pallo/i.test(s)) return null;
  if (/구미/.test(s)) return "gumi";
  if (/일본어|중국어|일중/.test(s)) return "jpcn";
  if (/울산/.test(s)) return "ulsan";
  if (/대구|동성로/.test(s)) return "dsr";
  return null;
}
// 계정 목록 JSON → [{id, team_key}] (ACTIVE 이고 지점을 아는 것만, 지점마다 하나)
export function accountsFrom(json) {
  const list = Array.isArray(json?.data?.businessAccounts) ? json.data.businessAccounts : [], out = [];
  for (const a of list) {
    const team_key = teamOfProfile(a?.name);
    if (!team_key || a?.status !== "ACTIVE" || !/^\d+$/.test(String(a?.id ?? "")) || out.some((x) => x.team_key === team_key)) continue;
    out.push({ id: String(a.id), team_key });
  }
  return out;
}

// 로그인 화면인지: 당근 계정 주소(accounts.daangn.com)나 제목의 '로그인'
export function daangnLogin({ url = "", title = "" } = {}) {
  let host = ""; try { host = new URL(url).hostname; } catch { /* 없음 */ }
  return host === "accounts.daangn.com" || /로그인/.test(title ?? "");
}

const kst = (now) => new Date(now.getTime() + 9 * 3600e3);
const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
// 확정된 마지막 날: 한국 시각 8시 전이면 그저께, 8시부터 어제
export function lastFinal(now = new Date()) {
  const k = kst(now), today = k.toISOString().slice(0, 10);
  return addDays(today, k.getUTCHours() < 8 ? -2 : -1);
}
// 이번에 쓸 날짜: [D-(days-1), min(D, 확정된 마지막 날)] 중 아직 ok 로 없는 날 (오름차순)
export function datesToWrite(D, days, final, have = new Set()) {
  const to = D < final ? D : final, out = [];
  for (let d = addDays(D, -(days - 1)); d <= to; d = addDays(d, 1)) if (!have.has(d)) out.push(d);
  return out;
}

const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
// 한 지점: 일별 JSON + 지금 단골 수 + 쓸 날짜들 → { [date]: input } (save 입력, 날짜마다 '전체' 한 행). 그날 줄이 없으면 failed.
export function teamInputs(teamKey, detailJson, followersNow, dates) {
  const details = Array.isArray(detailJson?.data?.details) ? detailJson.data.details : [], last = dates[dates.length - 1], out = {};
  for (const d of dates) {
    const x = details.find((r) => r?.date === d), views = int(x?.inflowCount), visitors = int(x?.inflowCustomerCount);
    if (!x || views === null || visitors === null) { out[d] = { rows: [{ team_key: teamKey, unit: "전체", metrics: { note: "그날 통계 없음" }, status: "failed" }] }; continue; }
    const metrics = { views, visitors };
    if (d === last && int(followersNow) !== null) metrics.followers = followersNow;
    out[d] = { rows: [{ team_key: teamKey, unit: "전체", metrics, status: "ok" }] };
  }
  return out;
}
export const failInputs = (teamKey, dates, note, status = "failed") => Object.fromEntries(dates.map((d) => [d, { rows: [{ team_key: teamKey, unit: "전체", metrics: { note }, status }] }]));

// ── 당근 광고 ──
export const ADVERTISERS = { dsr: "3550500", jpcn: "4039007", ulsan: "3550506" };
export const adsHomeUrl = (id) => `https://ads-pro.business.daangn.com/?advertiserId=${encodeURIComponent(id)}&advertiser_id=${encodeURIComponent(id)}`;
export const ADS_LIST_URL = "https://ads-pro.business.daangn.com/display-home";
export const ADS_WINDOW = 7; // 화면 기본 기간 '최근 7일' (오늘 포함)
export const onSignIn = (url) => { try { const u = new URL(url); return u.hostname === "accounts.daangn.com" && u.pathname.startsWith("/sign-in"); } catch { return false; } };
export const adsAccountId = (text) => String(text ?? "").match(/ID\s*(\d{6,8})/)?.[1] ?? null;
export const homeYesterday = (text) => { const m = String(text ?? "").match(/어제 총 소진 비용\(VAT 포함\)\s*([\d,]+)원/); return m ? +m[1].replace(/,/g, "") : null; };
const kstDay = (iso) => { const t = new Date(iso); return isNaN(t) ? null : new Date(t.getTime() + 9 * 3600e3).toISOString().slice(0, 10); };
// 시계열 JSON + 날짜 D → save 입력. 그날 줄이 없으면 0(광고를 안 쓴 날). homeCost = 홈의 어제 소진 비용(D 가 어제일 때만).
export function adsInput(teamKey, json, D, homeCost = null) {
  const row = (metrics, status) => ({ rows: [{ team_key: teamKey, unit: "전체", metrics, status }] });
  if (!Array.isArray(json?.data)) return row({ note: "광고 숫자 못 읽음" }, "failed");
  const x = json.data.find((r) => kstDay(r?.duration) === D), p = x?.performance ?? {}, chat = p.conversions?.chat ?? 0;
  const metrics = x ? { impressions: int(p.impression), clicks: int(p.click), spend: int(p.cost), chats: int(chat) } : { impressions: 0, clicks: 0, spend: 0, chats: 0 };
  if (Object.values(metrics).some((v) => v === null)) return row({ note: "광고 숫자 형식 이상" }, "failed");
  if (homeCost !== null && homeCost !== metrics.spend) return row({ ...metrics, note: "홈의 어제 소진 비용과 달라요 — 검색 광고 등 다른 유형이 돌 수 있어요" }, "partial");
  return row(metrics, "ok");
}
