// 당근 비즈프로필 통계 — 순수 모듈(DB·브라우저 안 씀, tests/mkd-daangn.test.mjs 로 검증). daangn.mjs 가 당근비즈니스 화면이 받은 JSON 을 넘겨 쓴다.
// 한 당근 계정(맥미니 자동 브라우저 프로필 ~/.cache/pallo-mkd/daangn)이 지점 비즈프로필 셋을 관리한다: 팔로 대구동성로점(dsr) · 팔로 일본어중국어회화 대구동성로점(jpcn) · 팔로 울산점(ulsan).
//   · 목록: business-account/api/v2/business_accounts/search → {data:{businessAccounts:[{id,name,status,followersCount}]}}
//   · 일별: business-crm/api/v1/statistics/statistic_detail (통계 화면 '일별 상세 내역' 30일) → {data:{details:[{date,inflowCount(조회수),inflowCustomerCount(방문 고객수),followerCount}]}}
//   · 단골: business-crm/api/v1/statistics/follow_summary → {data:{totalCount}}
// 당근은 "어제 데이터는 매일 오전 8시에 갱신" — 그 전엔 어제가 0 으로 보인다. 그래서 확정된 날(한국 시각 8시 전이면 그저께까지, 뒤면 어제까지)만 쓴다.
// 이미 ok 로 저장된 날은 다시 쓰지 않는다(그날 찍어 둔 현재 단골 수를 지우지 않게). 단골(followers)은 이번에 쓰는 가장 최근 날에만 '지금 값'으로 싣는다.
// 채팅·전화 수는 아직 못 읽는다(비즈프로필 홈은 다른 도메인이라 자동 로그인이 안 이어짐).

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
