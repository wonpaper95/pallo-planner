// 사용: node scripts/mkc/candidates.mjs <en|jpcn> [--min-ads 2] [--max 30] [--dry]
// 수집된 광고(mkc_ads)를 페이지별로 묶어 경쟁사 후보를 mkc_competitors 에 올린다(status=candidate). 기준: 활성 광고 2개+ 또는 30일+ 집행(🏆) 1개+. 이미 있는 페이지는 건너뛰고,
// 켜진/후보 경쟁사와 이름이 같은 광고에는 competitor_id 를 채운다. 우리 지점 페이지(팔로)는 올리지 않는다. 고르는 건 대표(플래너 경쟁사 페이지).
import { createRequire } from "node:module";
import { select, insert, patch, run } from "../mk/db.mjs";
const C = createRequire(import.meta.url)("../../mkc-core.js");
const MK = createRequire(import.meta.url)("../../mk-core.js");
const argv = process.argv.slice(2), grp = argv[0];
if (!C.GROUPS.includes(grp)) { console.error("그룹은 en 또는 jpcn"); process.exit(2); }
const flag = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? +argv[i + 1] : dflt; };
const MIN_ADS = flag("--min-ads", 2), MAX = flag("--max", 30), DRY = argv.includes("--dry"); // 한 번에 올리는 후보 상한 (나머지는 플래너 "키워드로만 본 페이지"에 보임)
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
// 지역 학원이면 지점 태그: 페이지 이름에 지역이 들어가면 그 지점 (대구는 그룹에 맞는 대구 지점)
const REGION = [["울산", "ulsan"], ["구미", "gumi"], ["대구", null]];

await run(async () => {
  const teams = await select("teams", "select=id,name", "id");
  const teamOf = (pageName) => {
    const hit = REGION.find(([r]) => pageName.includes(r)); if (!hit) return null;
    const key = hit[1] ?? (grp === "jpcn" ? "jpcn" : "dsr");
    return teams.find((t) => MK.teamKeyOfTeamName(t.name) === key)?.id ?? null;
  };
  const ads = await select("mkc_ads", `select=library_id,page_name,page_id,start_date,keywords,competitor_id,active,first_seen&grp=eq.${grp}`, "library_id");
  const existing = await select("mkc_competitors", `select=id,page_name,page_id,status&grp=eq.${grp}`, "id");
  const byPage = new Map();
  for (const a of ads) {
    if (!a.active || C.isOwnPage(a.page_name) || !a.page_name) continue;
    const g = byPage.get(a.page_name) ?? { page_name: a.page_name, page_id: "", ads: 0, oldest: null, keywords: new Set(), core: 0 };
    g.ads++; g.page_id ||= a.page_id; for (const k of a.keywords ?? []) g.keywords.add(k);
    if (a.start_date && (!g.oldest || a.start_date < g.oldest)) g.oldest = a.start_date;
    if (C.verdict(a, today) === "core") g.core++; // 30일+ 또는 여러 버전
    byPage.set(a.page_name, g);
  }
  const cands = [...byPage.values()].filter((g) => g.ads >= MIN_ADS || g.core >= 1).sort((a, b) => b.ads - a.ads || (a.oldest ?? "9") .localeCompare(b.oldest ?? "9"));
  const fresh = cands.filter((g) => !existing.some((e) => e.page_name === g.page_name || (e.page_id && e.page_id === g.page_id))).slice(0, MAX);
  const rows = fresh.map((g) => ({ grp, page_name: g.page_name, page_id: g.page_id, page_url: C.pageUrl(g.page_id) ?? "", team_id: teamOf(g.page_name), status: "candidate",
    found_by: `${g.ads}개 광고 · 30일+ ${g.core}개 · 검색어 ${[...g.keywords].slice(0, 4).join(", ")}${g.oldest ? ` · 가장 오래된 ${g.oldest}` : ""}` }));
  if (DRY) { console.log(JSON.stringify({ dry: true, grp, pages: byPage.size, candidates: cands.length, new: rows.map((r) => `${r.page_name} (${r.found_by})`) }, null, 1)); return; }
  const inserted = rows.length ? await insert("mkc_competitors", rows) : [];
  // 광고 ↔ 경쟁사 연결 (이름 또는 page_id 가 같은 것)
  const all = [...existing, ...inserted];
  let linked = 0;
  for (const c of all) {
    const ids = ads.filter((a) => !a.competitor_id && (a.page_name === c.page_name || (c.page_id && a.page_id === c.page_id))).map((a) => a.library_id);
    for (let i = 0; i < ids.length; i += 100) await patch("mkc_ads", `grp=eq.${grp}&library_id=in.(${ids.slice(i, i + 100).join(",")})`, { competitor_id: c.id });
    linked += ids.length;
  }
  console.log(JSON.stringify({ ok: true, grp, pages: byPage.size, candidates: cands.length, inserted: inserted.length, linked, existing: existing.length }));
});
