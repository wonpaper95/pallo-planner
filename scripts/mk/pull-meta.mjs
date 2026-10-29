// 사용: node scripts/mk/pull-meta.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry]
// 광고관리자 CSV 올리기 대신 메타 API(ads_read)로 광고 일별·연령+성별 데이터를 mk_ad_daily / mk_ad_demo 에 넣는다. 기본 기간 = 어제까지 35일(4주 판정 + 여유).
// 지점은 CSV 와 같은 규칙(MK.teamKeyOf: 캠페인 → 광고 → 광고세트 이름). 같은 줄은 덮어써서 여러 번 돌려도 안전하다.
// 토큰은 META_TOKEN_FILE(기본 ~/Downloads/GEO:SEO 스킬/meta-ads/meta-token.txt)에서만 읽고 출력하지 않는다.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { MK, select, upsert, insert, run } from "./db.mjs";

const ACT = "act_3542016502769477"; // "팔로 대구 동성로점" 광고 계정 — 4개 지점이 같이 쓴다
const G = "https://graph.facebook.com/v21.0";
const argv = process.argv.slice(2), flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const kst = (d = 0) => new Date(Date.now() + 9 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
const to = flag("--to") ?? kst(-1), from = flag("--from") ?? new Date(Date.parse(to) - 34 * 864e5).toISOString().slice(0, 10);
const DRY = argv.includes("--dry");
if (![from, to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d ?? "")) || from > to) { console.error("--from/--to 는 YYYY-MM-DD, from ≤ to"); process.exit(2); }
const token = readFileSync(process.env.META_TOKEN_FILE || `${homedir()}/Downloads/GEO:SEO 스킬/meta-ads/meta-token.txt`, "utf8").trim();

// 양식 리드: 'lead' 가 있으면 그것, 없으면 묶음 값. 둘을 더하면 같은 리드를 두 번 센다.
const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped"];
const leadsOf = (actions = []) => { for (const t of LEAD_TYPES) { const a = actions.find((x) => x.action_type === t); if (a) return Math.round(+a.value); } return 0; };

// 기간이 길면(연령+성별 35일) 메타가 "unknown error(1)" 로 거부한다 → 7일씩 나눠 받는다
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
async function insights(params) {
  const out = [];
  for (let since = from; since <= to; since = addDays(since, 7)) {
    const until = addDays(since, 6) < to ? addDays(since, 6) : to;
    const q = new URLSearchParams({ level: "ad", time_increment: "1", time_range: JSON.stringify({ since, until }), limit: "500",
      fields: "date_start,ad_name,campaign_name,adset_name,impressions,reach,inline_link_clicks,spend,actions", ...params, access_token: token });
    for (let url = `${G}/${ACT}/insights?${q}`; url; ) {
      const r = await fetch(url), j = await r.json();
      if (j.error) throw new Error(`메타 API ${j.error.code}: ${j.error.message} (${since}~${until})`);
      out.push(...j.data); url = j.paging?.next;
    }
  }
  return out;
}

// 같은 광고 이름이 광고세트 여러 개에 걸치면 키가 겹친다 → 숫자를 더해 한 줄로 (화면 CSV 올리기와 같은 처리)
function merge(rows, keyOf) {
  const m = new Map();
  for (const r of rows) { const k = keyOf(r), p = m.get(k); if (!p) m.set(k, { ...r }); else for (const f of ["impressions", "reach", "clicks", "leads", "spend"]) if (f in r) p[f] += r[f]; }
  return [...m.values()].map((r) => ({ ...r, spend: Math.round(r.spend * 100) / 100 }));
}

await run(async () => {
  const teams = await select("teams", "select=id,name", "id");
  const idOf = (key) => teams.find((t) => MK.teamKeyOfTeamName(t.name) === key)?.id ?? null;
  const teamOf = (r) => idOf(MK.teamKeyOf(r.campaign_name) ?? MK.teamKeyOf(r.ad_name) ?? MK.teamKeyOf(r.adset_name));
  const base = (r) => ({ team_id: teamOf(r), ad_name: r.ad_name, impressions: +r.impressions || 0, clicks: +r.inline_link_clicks || 0, leads: leadsOf(r.actions), spend: +r.spend || 0 });

  const [d, g] = [await insights({}), await insights({ breakdowns: "age,gender" })];
  const unknown = new Set([...d, ...g].filter((r) => !teamOf(r)).map((r) => r.campaign_name || r.ad_name));
  const daily = merge(d.map((r) => ({ ...base(r), date: r.date_start, campaign: r.campaign_name ?? "", adset: r.adset_name ?? "", reach: +r.reach || 0 })).filter((r) => r.team_id),
    (r) => `${r.team_id}|${r.date}|${r.ad_name}`);
  const demo = merge(g.map((r) => { const { impressions, clicks, leads, spend, team_id, ad_name } = base(r); return { team_id, ad_name, period_from: r.date_start, period_to: r.date_start, age: r.age ?? "", gender: r.gender ?? "", impressions, clicks, leads, spend }; }).filter((r) => r.team_id),
    (r) => `${r.team_id}|${r.period_from}|${r.ad_name}|${r.age}|${r.gender}`);

  const per = {};
  for (const r of daily) { const p = (per[teams.find((t) => t.id === r.team_id).name] ??= { rows: 0, spend: 0, leads: 0 }); p.rows++; p.spend += r.spend; p.leads += r.leads; }
  for (const p of Object.values(per)) p.spend = Math.round(p.spend * 100) / 100;
  if (!DRY) {
    if (daily.length) await upsert("mk_ad_daily", daily, "team_id,date,ad_name");
    if (demo.length) await upsert("mk_ad_demo", demo, "team_id,period_from,period_to,ad_name,age,gender");
    // 화면 '최근 올린 파일' 에 자동 적재도 보이게. uploaded_by 는 대표 계정(서비스 키에는 auth.uid() 가 없다).
    const admin = (await select("profiles", "select=id&role=eq.admin", "id"))[0]?.id;
    const log = [];
    for (const [kind, rows, day] of [["ads_daily", daily, (r) => r.date], ["ads_demo", demo, (r) => r.period_from]]) {
      const by = {}; for (const r of rows) (by[r.team_id] ??= []).push(day(r));
      for (const [team_id, ds] of Object.entries(by)) { ds.sort(); log.push({ team_id: +team_id, kind, filename: "메타 API 자동", rows: ds.length, date_from: ds[0], date_to: ds.at(-1), uploaded_by: admin }); }
    }
    if (admin && log.length) await insert("mk_uploads", log);
  }
  console.log(JSON.stringify({ ok: true, dry: DRY, from, to, daily: daily.length, demo: demo.length, perTeam: per, unknown: [...unknown].slice(0, 10) }));
});
