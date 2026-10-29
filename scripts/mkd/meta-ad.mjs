// 사용: node scripts/mkd/meta-ad.mjs <YYYY-MM-DD> [--print]
// 메타(인스타·페북) 광고: 운영 DB mk_ad_daily(scripts/mk/pull-meta.mjs 가 메타 마케팅 API 로 적재, 광고 단위·USD)의 그날 줄을 지점+캠페인으로 합치고 환율(frankfurter, USD→KRW)로 원화를 구해 mkd_daily(meta_ad) 에 저장.
// 1) 새로고침: 토큰 파일(META_TOKEN_FILE 또는 ~/Downloads/GEO:SEO 스킬/meta-ads/meta-token.txt)이 있으면 pull-meta.mjs --from D --to D 를 자식 프로세스로(120초). 없으면 건너뜀(맥북이 적재한 데이터 사용). 실패해도 있는 데이터로 계속한다.
//    토큰 파일은 있는지만 보고 읽지 않는다. 자식 출력은 마지막 줄·종료코드만 쓰고 이유는 가려서(sanitizeReason) 남긴다.
// 2) 환율: D 날짜 → 실패하면 mkd_daily 의 직전 meta_ad fx → latest → 모두 실패하면 비용 null + partial.
// 3) 그날 줄이 0 이면 새로고침 결과에 따라 지점별 failed(데이터 아직 없음) / 0 행(집행 없음). 규칙은 meta-rows.mjs(순수, 테스트 있음).
// --print: 새로고침도 저장도 하지 않고(DB 읽기·환율 조회만) 행을 출력. failed 행이 하나라도 있으면 종료코드 1.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dateArg, run, select } from "../mk/db.mjs";
import { toRows, saveRows, teams, D } from "./lib.mjs";
import { NO_TOKEN, SKIPPED_PRINT, fxUrl, parseFx, lastKnownFx, tokenPath, refreshOutcome, activeTeamIds, buildInput, summarize } from "./meta-rows.mjs";

const date = dateArg(2, "date"), print = process.argv.includes("--print");
const PULL = process.env.MKD_PULL_META || fileURLToPath(new URL("../mk/pull-meta.mjs", import.meta.url)); // MKD_PULL_META·MKD_FX_BASE 는 시험용(가짜 스크립트·가짜 환율 서버)
const FX_BASE = process.env.MKD_FX_BASE || undefined; // 기본 api.frankfurter.app

// 1 새로고침 → "ok" | "failed: …" | "skipped (…)"
function refresh() {
  if (print) return SKIPPED_PRINT;
  if (!existsSync(tokenPath(process.env, homedir()))) return NO_TOKEN;
  return refreshOutcome(spawnSync(process.execPath, [PULL, "--from", date, "--to", date], { encoding: "utf8", timeout: 120_000, maxBuffer: 8 << 20, stdio: ["ignore", "pipe", "pipe"] }));
}

// 2 환율 → { fx, source }
async function fetchFx(day) {
  try { const r = await fetch(fxUrl(day, FX_BASE), { signal: AbortSignal.timeout(10_000) }); return r.ok ? parseFx(await r.json()) : null; } catch { return null; }
}
async function getFx() {
  const today = await fetchFx(date); if (today) return { fx: today, source: "당일" };
  let past = null; // 직전에 저장한 값 (읽기 실패는 다음 단계로)
  try { past = lastKnownFx(await select("mkd_daily", `select=date,metrics&channel=eq.meta_ad&date=lt.${date}&date=gte.${D.addDays(date, -60)}`, "date"), date); } catch { /* 다음 단계 */ }
  if (past) return { fx: past, source: "직전 저장값" };
  const latest = await fetchFx("latest"); if (latest) return { fx: latest, source: "최신" };
  return { fx: null, source: "없음" };
}

await run(async () => {
  const refreshed = refresh();
  const ads = await select("mk_ad_daily", `select=team_id,date,ad_name,campaign,adset,impressions,clicks,leads,spend&date=eq.${date}`, "date,team_id,ad_name");
  const activeIds = ads.length ? [] : activeTeamIds(await select("mk_ad_daily", `select=team_id,date&date=gte.${D.addDays(date, -7)}&date=lt.${date}`, "date,team_id"), date);
  const { fx, source } = ads.length ? await getFx() : { fx: null, source: "필요 없음" };
  const input = buildInput({ ads, fx, refresh: refreshed, activeIds });
  const rows = input ? await toRows("meta_ad", date, input) : []; // 한 번에 검증·저장해야 지점별 옛 실패 표시 정리가 맞다
  const failed = rows.filter((r) => r.status === "failed");
  const names = await teams(), summary = { ok: !failed.length, date, refresh: refreshed, fx, fxSource: source, saved: 0, teams: summarize(rows, names) };
  if (print) {
    const keyOf = new Map(names.map((t) => [t.id, t.key]));
    console.log(JSON.stringify(rows.map((r) => ({ team_key: keyOf.get(r.team_id), ...r })), null, 1));
  } else summary.saved = await saveRows(rows);
  console.log(JSON.stringify(summary));
  if (failed.length) throw new Error(`메타 광고 수집 실패 — ${failed.map((r) => `${names.find((t) => t.id === r.team_id)?.name ?? r.team_id}: ${r.metrics.note}`).join(" / ")}`);
});
