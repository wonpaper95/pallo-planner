// 사용: node scripts/mkc/build-daily.mjs <en|jpcn> [--date YYYY-MM-DD] > daily-<grp>.json
// 그날 수집 결과로 일일 리포트 숫자 부분을 만든다 (문장 notes 는 스킬이 붙인다). 우리 지점(팔로) 광고는 집계에서 뺀다.
import { createRequire } from "node:module";
import { select, run } from "../mk/db.mjs";
const C = createRequire(import.meta.url)("../../mkc-core.js");
const argv = process.argv.slice(2), grp = argv[0];
if (!C.GROUPS.includes(grp)) { console.error("그룹은 en 또는 jpcn"); process.exit(2); }
const di = argv.indexOf("--date");
const date = di >= 0 ? argv[di + 1] : new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) { console.error("--date 는 YYYY-MM-DD"); process.exit(2); }
const hook = (s) => String(s ?? "").split("\n").map((l) => l.trim()).filter(Boolean)[0]?.slice(0, 80) ?? "";
// 한국 시장 광고만 목록에 올린다 (HSK·JLPT 검색엔 베트남어·영어 광고도 섞여 들어온다). 집계 숫자는 전체.
const korean = (a) => /[가-힣]/.test(`${a.body}${a.headline}${a.page_name}`);
// 같은 페이지·같은 첫 줄(훅)이 여러 ID로 돌면 한 소재로 묶고(가장 오래된 것), 묶인 수를 n_ads 에 반영
function dedupe(list) {
  const m = new Map();
  for (const a of [...list].sort((x, y) => (x.start_date ?? "9").localeCompare(y.start_date ?? "9"))) { const k = `${a.page_name}|${hook(a.body) || a.text_hash}`; if (m.has(k)) m.get(k).n_ads = Math.max(m.get(k).n_ads, 1) + 1; else m.set(k, { ...a }); }
  return [...m.values()];
}

await run(async () => {
  const [runs, comps, ads] = await Promise.all([
    select("mkc_runs", `select=run_date,status,counts,error&grp=eq.${grp}&run_date=eq.${date}`, "id.desc"),
    select("mkc_competitors", `select=id,page_name,page_id,status,team_id&grp=eq.${grp}`, "id"),
    select("mkc_ads", `select=library_id,page_name,page_id,competitor_id,start_date,first_seen,last_seen,active,ended_on,multi_version,n_ads,platforms,media_type,duration_s,body,headline,cta,landing_domain,thumb_path,keywords,text_hash&grp=eq.${grp}`, "library_id"),
  ]);
  const last = runs[0];
  const compOf = (a) => comps.find((c) => c.id === a.competitor_id || c.page_name === a.page_name || (c.page_id && c.page_id === a.page_id));
  const shape = (a) => { const c = compOf(a); return { library_id: a.library_id, page_name: a.page_name, competitor: c ? c.status : null, team_id: c?.team_id ?? null, start_date: a.start_date, days: a.start_date ? C.daysBetween(a.start_date, date) : null,
    verdict: C.verdict(a, date), hook: hook(a.body), headline: a.headline, cta: a.cta, landing_domain: a.landing_domain, media_type: a.media_type, multi_version: a.multi_version, n_ads: a.n_ads, platforms: a.platforms, thumb_path: a.thumb_path, url: C.libraryUrl(a.library_id), keywords: a.keywords }; };
  const theirs = ads.filter((a) => !C.isOwnPage(a.page_name)), ours = ads.filter((a) => C.isOwnPage(a.page_name) && a.active);
  const active = theirs.filter((a) => a.active);
  const rank = (a, b) => (b.competitor === "on") - (a.competitor === "on") || (b.days ?? 0) - (a.days ?? 0);
  const fresh = dedupe(active.filter((a) => a.first_seen === date && korean(a))).map(shape).sort(rank);
  const ended = dedupe(theirs.filter((a) => a.ended_on === date && korean(a))).map(shape).sort(rank);
  const top = dedupe(active.filter(korean)).map(shape).filter((a) => a.verdict === "core").sort(rank).slice(0, 15);
  const count = (list, key) => { const m = {}; for (const a of list) { const k = a[key] || "(없음)"; m[k] = (m[k] ?? 0) + 1; } return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => ({ key: k, count: v })); };
  const competitors = comps.filter((c) => c.status === "on").map((c) => {
    const mine = theirs.filter((a) => compOf(a)?.id === c.id), act = mine.filter((a) => a.active);
    const oldest = act.map((a) => a.start_date).filter(Boolean).sort()[0] ?? null;
    return { id: c.id, page_name: c.page_name, active: act.length, new_today: act.filter((a) => a.first_seen === date).length, ended_today: mine.filter((a) => a.ended_on === date).length, oldest_days: oldest ? C.daysBetween(oldest, date) : null, core: act.filter((a) => C.verdict(a, date) === "core").length };
  }).sort((a, b) => b.active - a.active);
  const flags = { noRun: !last, failed: last?.status === "failed", partial: last?.status === "partial", firstDay: active.length > 0 && active.every((a) => a.first_seen === date) };
  console.log(JSON.stringify({ grp, date, run: last ?? null, flags, totals: { active: active.length, own: ours.length, new: fresh.length, ended: ended.length, competitorsOn: competitors.length, byMedia: count(active.map(shape), "media_type"), byCta: count(active.map(shape), "cta"), byLanding: count(active.map(shape), "landing_domain") },
    competitors, new: fresh.slice(0, 40), ended: ended.slice(0, 40), top }, null, 1));
});
