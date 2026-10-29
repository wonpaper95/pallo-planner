// 메타 광고 일별 수집의 순수 부분 — 네트워크·DB·환경파일·자식 프로세스를 다루지 않는다(tests/mkd-meta.test.mjs). CLI 는 meta-ad.mjs.
// 데이터는 이미 운영 DB mk_ad_daily 에 있다(scripts/mk/pull-meta.mjs 가 메타 마케팅 API 로 적재, 광고 단위, 비용은 USD). 여기서는 그날 줄을 지점+캠페인으로 합치고 원화로 바꿔
// mkd_daily(meta_ad) 행 {team_id, unit, metrics, status?} 를 만든다 — rows.mjs 의 toRowsPure 가 검증·저장 형태로 바꾼다. 도달(reach)은 광고끼리 겹쳐 합이 부풀어서 싣지 않는다.
// 새로고침 결과(refresh)는 문자열: "ok" | "failed: <이유>" | "skipped (…)". 키·토큰은 어디에도 싣지 않는다 — 이유는 sanitizeReason 을 거친다.
import { D } from "./rows.mjs";
import { sanitizeNote } from "./naver-rows.mjs";

export const NO_CAMPAIGN = "(캠페인 없음)";
export const NO_TOKEN = "skipped (토큰 없음 — 맥북 적재 데이터 사용)";
export const SKIPPED_PRINT = "skipped (--print)";
export const NO_FX = "환율 못 받음";
const FX_BASE = "https://api.frankfurter.app";

const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const round2 = (x) => Math.round(x * 100) / 100;

// pull-meta 와 같은 토큰 파일 규칙 (파일 내용은 읽지 않는다 — 있는지만 본다)
export const tokenPath = (env, home) => env?.META_TOKEN_FILE || `${home}/Downloads/GEO:SEO 스킬/meta-ads/meta-token.txt`;
// USD→KRW 환율 주소. date 는 YYYY-MM-DD 또는 "latest" (휴일·주말은 가장 가까운 앞 영업일 값). base 는 시험용으로 바꿀 수 있다.
export const fxUrl = (date, base = FX_BASE) => `${String(base).replace(/\/+$/, "")}/${date}?from=USD&to=KRW`;
// 응답 → 환율. rates.KRW 가 0 보다 큰 유한한 숫자일 때만.
export const parseFx = (json) => { const v = json?.rates?.KRW; return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null; };
// 이미 저장된 meta_ad 행들({date, metrics}) 중 date 보다 앞선 날의 가장 최근 fx
export function lastKnownFx(rows, date) {
  let best = null;
  for (const r of rows ?? []) {
    const fx = r?.metrics?.fx;
    if (typeof fx !== "number" || !Number.isFinite(fx) || fx <= 0 || !(r.date < date)) continue;
    if (!best || r.date > best.date) best = { date: r.date, fx };
  }
  return best ? best.fx : null;
}

// 단위 이름: 캠페인 → 광고세트 → 광고 이름 → "(캠페인 없음)"
export const unitOf = (r) => {
  for (const k of ["campaign", "adset", "ad_name"]) { const s = typeof r?.[k] === "string" ? r[k].trim() : ""; if (s) return s.slice(0, 120); }
  return NO_CAMPAIGN;
};
// mk_ad_daily 줄(광고 단위, 한 날) → 지점+캠페인 합계. 지점 번호가 없는 줄은 건너뛴다. 비용은 소수 둘째 자리.
export function aggregateAds(rows) {
  const m = new Map();
  for (const r of rows ?? []) {
    if (r?.team_id === null || r?.team_id === undefined) continue;
    const unit = unitOf(r), k = `${r.team_id}\0${unit}`;
    if (!m.has(k)) m.set(k, { team_id: r.team_id, unit, impressions: 0, clicks: 0, leads: 0, spend_usd: 0 });
    const a = m.get(k);
    a.impressions += n0(r.impressions); a.clicks += n0(r.clicks); a.leads += n0(r.leads); a.spend_usd += n0(r.spend);
  }
  return [...m.values()].map((a) => ({ ...a, spend_usd: round2(a.spend_usd) })).sort((a, b) => a.team_id - b.team_id || a.unit.localeCompare(b.unit, "ko"));
}

// 합계 → mkd_daily 행. 환율이 있으면 원 = round(USD × fx). 없으면 spend·fx 는 null, 행은 partial + note.
export const metaRows = (aggs, fx) => aggs.map((a) => {
  const base = { impressions: a.impressions, clicks: a.clicks, leads: a.leads, spend_usd: a.spend_usd };
  return typeof fx === "number" && Number.isFinite(fx) && fx > 0
    ? { team_id: a.team_id, unit: a.unit, metrics: { ...base, fx, spend: Math.round(a.spend_usd * fx) } }
    : { team_id: a.team_id, unit: a.unit, metrics: { ...base, fx: null, spend: null, note: NO_FX }, status: "partial" };
});

// 이유 문장 → 저장·출력해도 되는 짧은 글: access_token 값·EAA… 토큰·24자 넘는 영숫자 덩어리는 ***, 4자리 이상 숫자는 #, 80자까지 (가린 뒤에 자른다)
export const sanitizeReason = (msg) => sanitizeNote(String(msg)
  .replace(/access_token=[^&\s"']*/gi, "access_token=***")
  .replace(/\bEAA[A-Za-z0-9_-]{8,}/g, "***")
  .replace(/[A-Za-z0-9_-]{24,}/g, "***")).slice(0, 80);
// pull-meta 자식 프로세스 결과 {status, signal, error, stdout, stderr} → "ok" | "failed: 이유". 마지막 stdout 줄이 {"ok":true,…} 일 때만 성공. 출력 전체는 싣지 않는다.
export function refreshOutcome(res) {
  if (!res) return "failed: 결과 없음";
  if (res.error) return res.error.code === "ETIMEDOUT" ? "failed: 시간 초과" : `failed: 실행 실패 (${String(res.error.code ?? "?").slice(0, 20)})`;
  const last = (t) => String(t ?? "").split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "";
  if (res.status !== 0) {
    if (res.status === null && res.signal) return `failed: 종료 신호 ${sanitizeReason(res.signal)}`;
    const why = last(res.stderr).replace(/^실패:\s*/, "");
    return `failed: ${why ? sanitizeReason(why) : `종료코드 ${res.status}`}`;
  }
  try { if (JSON.parse(last(res.stdout))?.ok === true) return "ok"; } catch { /* 아래 */ }
  return "failed: 응답 형식 이상";
}
export const refreshOk = (refresh) => refresh === "ok";

// 직전 7일(D-7~D-1)에 메타 줄이 있던 지점 번호 (rows = {team_id, date}) — 번호순, 중복 없음
export function activeTeamIds(rows, date) {
  const from = D.addDays(date, -7), to = D.addDays(date, -1);
  return [...new Set((rows ?? []).filter((r) => r?.team_id !== null && r?.team_id !== undefined && r.date >= from && r.date <= to).map((r) => r.team_id))].sort((a, b) => a - b);
}
// 그날 줄이 0 일 때 지점마다 '전체' 행: 새로고침이 성공했으면 정말 집행이 없던 날(0 행), 아니면 데이터가 아직 없는 것(failed — 0 으로 보이면 안 된다)
export const emptyRows = (teamIds, refresh) => teamIds.map((team_id) => refreshOk(refresh)
  ? { team_id, unit: D.ALL, metrics: { impressions: 0, clicks: 0, leads: 0, spend_usd: 0, spend: 0, note: "메타 집행 없음" } }
  : { team_id, unit: D.ALL, metrics: { note: sanitizeNote(`메타 데이터 아직 없음(${refresh})`) }, status: "failed" });

// toRows("meta_ad", D, …) 에 넣을 입력. 저장할 게 없으면 null (줄도 최근 지점도 없는데 새로고침은 성공 = 메타를 안 쓰는 상태).
//   줄 있음 → 캠페인 행 / 줄 없음 → emptyRows / 줄도 지점도 없는데 새로고침 실패·건너뜀 → 모든 지점에 failed
export function buildInput({ ads, fx, refresh, activeIds }) {
  const aggs = aggregateAds(ads);
  if (aggs.length) return { rows: metaRows(aggs, fx) };
  if (activeIds?.length) return { rows: emptyRows(activeIds, refresh) };
  return refreshOk(refresh) ? null : { rows: [], status: "failed", note: sanitizeNote(`메타 데이터 아직 없음(${refresh})`) };
}

// 저장할 행 → 지점 이름별 {spend(원), spend_usd, leads}. 값이 없는 지점(실패·환율 없음)은 null.
export function summarize(rows, teams) {
  const out = {};
  for (const r of rows) {
    const name = teams.find((t) => t.id === r.team_id)?.name ?? String(r.team_id), o = (out[name] ??= { spend: null, spend_usd: null, leads: null });
    for (const [k, mk] of [["spend", "spend"], ["spend_usd", "spend_usd"], ["leads", "leads"]]) {
      const v = r.metrics?.[mk]; if (typeof v === "number" && Number.isFinite(v)) o[k] = (o[k] ?? 0) + v;
    }
  }
  for (const o of Object.values(out)) o.spend_usd = o.spend_usd === null ? null : round2(o.spend_usd);
  return out;
}
