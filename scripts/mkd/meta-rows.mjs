// 메타 광고 일별 수집의 순수 부분 — 네트워크·DB·환경파일·자식 프로세스를 다루지 않는다(tests/mkd-meta.test.mjs). CLI 는 meta-ad.mjs.
// 데이터는 이미 운영 DB mk_ad_daily 에 있다(scripts/mk/pull-meta.mjs 가 메타 마케팅 API 로 적재, 광고 단위, 비용은 USD). 여기서는 그날 줄을 지점+캠페인으로 합치고 원화로 바꿔
// mkd_daily(meta_ad) 행 {team_id, unit, metrics, status?} 를 만든다 — rows.mjs 의 toRowsPure 가 검증·저장 형태로 바꾼다. 도달(reach)은 광고끼리 겹쳐 합이 부풀어서 싣지 않는다.
// 새로고침 결과(refresh)는 문자열: "ok" | "failed: <이유>" | "skipped (…)". 키·토큰은 어디에도 싣지 않는다 — 이유는 짧은 꼴(메타 API <코드> / 시간 초과 / 실행 실패 …)만 남기고 sanitizeReason 을 거친다.
import { D } from "./rows.mjs";
import { sanitizeNote } from "./naver-rows.mjs";

export const NO_CAMPAIGN = "(캠페인 없음)";
export const NO_TOKEN = "skipped (토큰 없음 — 맥북 적재 데이터 사용)";
export const NO_TOKEN_PERM = "skipped (토큰 읽기 권한 없음)";
export const SKIPPED_PRINT = "skipped (--print)";
export const NO_FX = "환율 못 받음";
export const PULL_TIMEOUT_MS = 90_000; // pull-meta 자식 제한시간 — Bash 도구 기본 120초보다 먼저 끝나야 부모가 실패 표시를 남긴다
const FX_BASE = "https://api.frankfurter.dev/v1"; // .app 도메인은 301 로 넘어간다
const FX_MIN = 500, FX_MAX = 3000; // 원/달러 로 말이 되는 범위 — 밖이면 잘못된 값으로 보고 다음 단계로

const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const round2 = (x) => Math.round(x * 100) / 100;

// pull-meta 와 같은 토큰 파일 규칙 (파일 내용은 읽지 않는다 — 읽을 수 있는지만 본다)
export const tokenPath = (env, home) => env?.META_TOKEN_FILE || `${home}/Downloads/GEO:SEO 스킬/meta-ads/meta-token.txt`;
// access(path) 는 읽을 수 없으면 던진다(CLI 는 accessSync(path, R_OK)). 읽을 수 있으면 null, 아니면 건너뜀 문장: 권한(EACCES·EPERM — macOS 보호 폴더 포함) / 그 밖(없음 등)
export function tokenSkip(path, access) {
  try { access(path); return null; } catch (e) { return e?.code === "EACCES" || e?.code === "EPERM" ? NO_TOKEN_PERM : NO_TOKEN; }
}
// 시험용 환경변수(MKD_PULL_META 가짜 스크립트, MKD_FX_BASE 가짜 환율 서버)는 MK_ENV 도 함께 있을 때만 쓴다 — 시험 하네스는 항상 MK_ENV 를 넣는다. 운영 실행에 새어 들어온 값은 무시.
export const testOverrides = (env) => env?.MK_ENV ? { pull: env.MKD_PULL_META || undefined, fxBase: env.MKD_FX_BASE || undefined } : { pull: undefined, fxBase: undefined };
// USD→KRW 환율 주소. date 는 YYYY-MM-DD 또는 "latest" (휴일·주말은 가장 가까운 앞 영업일 값). base 는 시험용으로 바꿀 수 있다.
export const fxUrl = (date, base = FX_BASE) => `${String(base).replace(/\/+$/, "")}/${date}?from=USD&to=KRW`;
// 응답 → 환율. rates.KRW 가 500~3000 사이의 유한한 숫자일 때만, 아니면 null.
const validFx = (v) => typeof v === "number" && Number.isFinite(v) && v >= FX_MIN && v <= FX_MAX;
export const parseFx = (json) => { const v = json?.rates?.KRW; return validFx(v) ? v : null; };
// 응답의 date 가 요청한 날(day)과 같을 때만 "당일", 아니면 가장 가까운 앞 영업일 값 — 응답 날짜를 같이 적는다 (날짜 모양이 아니면 "날짜 모름")
export const fxSourceOf = (jsonDate, day) => jsonDate === day ? "당일" : `직전 영업일(${typeof jsonDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(jsonDate) ? jsonDate : "날짜 모름"})`;
// 이미 저장된 meta_ad 행들({date, metrics}) 중 date 보다 앞선 날의 가장 최근 fx
export function lastKnownFx(rows, date) {
  let best = null;
  for (const r of rows ?? []) {
    const fx = r?.metrics?.fx;
    if (!validFx(fx) || !(r.date < date)) continue;
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

// 이유 문장 → 저장·출력해도 되는 짧은 글: access_token 값·EAA… 토큰·24자 넘는 영숫자 덩어리는 ***, 공백 없는 16자 이상 덩어리(경로·주소·긴 값)는 #, 4자리 이상 숫자는 #, 80자까지 (가린 뒤에 자른다)
export const sanitizeReason = (msg) => sanitizeNote(String(msg)
  .replace(/access_token=[^&\s"']*/gi, "access_token=***")
  .replace(/\bEAA[A-Za-z0-9_-]{8,}/g, "***")
  .replace(/[A-Za-z0-9_-]{24,}/g, "***")
  .replace(/\S{16,}/g, "#")).slice(0, 80);
// stderr → 짧은 이유(없으면 null): 메타 API 오류는 "메타 API <코드>" 만 (메타가 보낸 자유 문장·기간은 버린다), 자식이 죽었으면(스택) 처음 'Error:' 줄. 그 밖의 글은 쓰지 않는다.
function stderrReason(stderr) {
  const lines = String(stderr ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (const l of lines) { const m = l.match(/메타 API\s+(\d{1,9})(?!\d)/); if (m) return sanitizeReason(`메타 API ${m[1]}`); }
  const crash = lines.find((l) => l.includes("Error:"));
  return crash ? sanitizeReason(crash) : null;
}
// pull-meta 자식 프로세스 결과 {status, signal, error, stdout, stderr} → "ok" | "failed: 이유". 마지막 stdout 줄이 {"ok":true,…} 일 때만 성공. 출력 전체는 싣지 않는다.
export function refreshOutcome(res) {
  if (!res) return "failed: 결과 없음";
  if (res.error) return res.error.code === "ETIMEDOUT" ? "failed: 시간 초과" : `failed: 실행 실패 (${String(res.error.code ?? "?").slice(0, 20)})`;
  const last = (t) => String(t ?? "").split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? "";
  if (res.status !== 0) {
    if (res.status === null && res.signal) return `failed: 종료 신호 ${sanitizeReason(res.signal)}`;
    const why = stderrReason(res.stderr);
    return `failed: ${why ?? `종료코드 ${res.status}`}`;
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
  ? noDelivery(team_id)
  : { team_id, unit: D.ALL, metrics: { note: sanitizeNote(`메타 데이터 아직 없음(${refresh})`) }, status: "failed" });
const noDelivery = (team_id) => ({ team_id, unit: D.ALL, metrics: { impressions: 0, clicks: 0, leads: 0, spend_usd: 0, spend: 0, note: "메타 집행 없음" } });

// toRows("meta_ad", D, …) 에 넣을 입력. 저장할 게 없으면 null (줄도 최근 지점도 없는데 새로고침은 성공 = 메타를 안 쓰는 상태).
//   줄 있음 → 캠페인 행 + (최근 7일에 있었는데 그날 줄이 없는 지점마다 '메타 집행 없음' 0 행 — 계정 하나를 한 번에 받으므로 줄이 하나라도 있으면 받기는 끝난 것, 없는 지점 = 집행 없음. 새로고침 상태와 무관)
//   줄 없음 → emptyRows / 줄도 지점도 없는데 새로고침 실패·건너뜀 → 모든 지점에 failed
export function buildInput({ ads, fx, refresh, activeIds }) {
  const aggs = aggregateAds(ads);
  if (aggs.length) {
    const have = new Set(aggs.map((a) => a.team_id));
    return { rows: [...metaRows(aggs, fx), ...(activeIds ?? []).filter((id) => !have.has(id)).map(noDelivery)].sort((a, b) => a.team_id - b.team_id) };
  }
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
