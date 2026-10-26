// 사용: node scripts/mkc/build-creative.mjs <en|jpcn> [--week YYYY-MM-DD] > creative-<grp>.json
// 월요일 소재 추천의 "입력"을 모은다: 지난 7일 경쟁사 패턴(오래 도는 소재·이번 주 새 광고·형식/CTA/랜딩 분포) × 우리 쪽(주간 판정·페르소나·지점 프로필) × 지난 추천 제목.
// 추천(ideas)은 스킬(Claude)이 이 JSON 을 읽고 쓴다. 숫자는 이 스크립트가 만든다.
import { createRequire } from "node:module";
import { select, run } from "../mk/db.mjs";
const C = createRequire(import.meta.url)("../../mkc-core.js");
const MK = createRequire(import.meta.url)("../../mk-core.js");
const argv = process.argv.slice(2), grp = argv[0];
if (!C.GROUPS.includes(grp)) { console.error("그룹은 en 또는 jpcn"); process.exit(2); }
const wi = argv.indexOf("--week");
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const week = MK.weekStart(wi >= 0 ? argv[wi + 1] : today);
const since = C.addDays(week, -7);
const hook = (s) => String(s ?? "").split("\n").map((l) => l.trim()).filter(Boolean)[0]?.slice(0, 90) ?? "";
const korean = (a) => /[가-힣]/.test(`${a.body}${a.headline}${a.page_name}`);
// 훅 유형 (대략): 질문 / 숫자·기간 / 오퍼(무료·할인·환급) / 후기·결과 / 공감·상황 / 위치·모집
const HOOK_TYPES = [["question", /\?|\？|궁금|일까|할까/], ["offer", /무료|0원|할인|환급|장학|선착순|한정|쿠폰/], ["number", /\d+\s*(일|주|개월|분|시간|%|명|문장|단어)/], ["review", /후기|합격|성공|됐어요|했어요|달라졌/], ["relate", /퇴근|직장|야근|출근|초보|울렁|부끄|포기|작심/], ["local", /역|도보|분 거리|위치|모집|오픈|지점|점\b/]];
const hookType = (t) => HOOK_TYPES.filter(([, re]) => re.test(t)).map(([k]) => k);

await run(async () => {
  const teams = (await select("teams", "select=id,name", "id")).filter((t) => C.groupOfTeamName(t.name) === grp);
  const tids = teams.map((t) => t.id);
  const [ads, comps, weekly, personas, profiles, prevCreative] = await Promise.all([
    select("mkc_ads", `select=library_id,page_name,page_id,competitor_id,start_date,first_seen,active,multi_version,n_ads,platforms,media_type,duration_s,body,headline,description,cta,landing_domain,thumb_path&grp=eq.${grp}&active=is.true`, "library_id"),
    select("mkc_competitors", `select=id,page_name,page_id,status,team_id&grp=eq.${grp}`, "id"),
    tids.length ? select("mk_reports", `select=team_id,week,data&kind=eq.weekly&team_id=in.(${tids.join(",")})&order=week.desc`, "week.desc") : [],
    tids.length ? select("mk_reports", `select=team_id,week,data&kind=eq.persona&team_id=in.(${tids.join(",")})&order=week.desc`, "week.desc") : [],
    tids.length ? select("blog_profiles", `select=team_id,data&team_id=in.(${tids.join(",")})`, "team_id") : [],
    select("mkc_reports", `select=day,data&grp=eq.${grp}&kind=eq.creative&order=day.desc`, "day.desc"),
  ]);
  const compOf = (a) => comps.find((c) => c.id === a.competitor_id || c.page_name === a.page_name || (c.page_id && c.page_id === a.page_id));
  const theirs = ads.filter((a) => !C.isOwnPage(a.page_name) && korean(a));
  const shape = (a) => ({ library_id: a.library_id, page_name: a.page_name, competitor: compOf(a)?.status ?? null, days: a.start_date ? C.daysBetween(a.start_date, week) : null, verdict: C.verdict(a, week), hook: hook(a.body), hook_types: hookType(`${hook(a.body)} ${a.headline}`), headline: a.headline, description: a.description, cta: a.cta, landing_domain: a.landing_domain, media_type: a.media_type, duration_s: a.duration_s, multi_version: a.multi_version, n_ads: a.n_ads, platforms: a.platforms, url: C.libraryUrl(a.library_id), thumb_path: a.thumb_path, body: String(a.body ?? "").slice(0, 400) });
  const seen = new Set(), uniq = (list) => list.filter((a) => { const k = `${a.page_name}|${a.hook}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const rank = (a, b) => (b.competitor === "on") - (a.competitor === "on") || (b.days ?? 0) - (a.days ?? 0);
  const top = uniq(theirs.map(shape).filter((a) => a.verdict === "core").sort(rank)).slice(0, 20);
  const fresh = uniq(theirs.filter((a) => a.first_seen >= since).map(shape).sort(rank)).slice(0, 20);
  const dist = (key) => { const m = {}; for (const a of theirs) { const k = a[key] || "(없음)"; m[k] = (m[k] ?? 0) + 1; } return Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => ({ key: k, count: v })); };
  const hooks = {}; for (const a of theirs) for (const t of hookType(`${hook(a.body)} ${a.headline}`)) hooks[t] = (hooks[t] ?? 0) + 1;
  const ours = teams.map((t) => {
    const w = weekly.find((r) => r.team_id === t.id), p = personas.find((r) => r.team_id === t.id), pf = profiles.find((r) => r.team_id === t.id)?.data ?? {};
    return { team_id: t.id, team: t.name, profile: { location: pf.location, regions: pf.regions, subjects: pf.subjects, strengths: pf.strengths, mainKeywords: pf.mainKeywords, instagram: pf.links?.instagram },
      weekly: w ? { week: w.week, totals: w.data?.totals, ads: (w.data?.ads ?? []).map((a) => ({ ad_name: a.ad_name, verdict: a.verdict, reason: a.reason, leads4w: a.leads4w, enrolls4w: a.enrolls4w, cpe4w: a.cpe4w, note: w.data?.notes?.ads?.[a.ad_name] })), tests: w.data?.notes?.tests, summary: w.data?.notes?.summary } : null,
      persona: p ? { month: p.week, ...p.data?.persona, borrowed: p.data?.borrowed } : null };
  });
  console.log(JSON.stringify({ grp, week, since, teams: teams.map((t) => t.name), competitor: { active: theirs.length, competitorsOn: comps.filter((c) => c.status === "on").length, byMedia: dist("media_type"), byCta: dist("cta"), byLanding: dist("landing_domain"), hookTypes: hooks, top, fresh },
    ours, previous: prevCreative.slice(0, 4).map((r) => ({ week: r.day, titles: (r.data?.ideas ?? []).map((i) => i.title) })), ideas: [] }, null, 1));
});
