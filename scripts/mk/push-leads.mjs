// 사용: node scripts/mk/push-leads.mjs <team_id> <leads.json>
// leads.json = 전산에서 읽은 [{source_key, ad_name, lead_date, status, age_band?, subject?}] — 다른 필드는 버린다.
import { readFileSync } from "node:fs";
import { MK, upsert, arg, teamArg, run } from "./db.mjs";
const team = teamArg(2), file = arg(3, "leads.json");
await run(async () => {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const byKey = new Map(), rejected = [];
  // 같은 source_key 가 한 번에 둘 이상이면 마지막 것만 (Postgres 가 한 배치 안의 중복을 거부함)
  for (const r of raw) { const s = MK.sanitizeLead(r); s.ok ? byKey.set(s.lead.source_key, { team_id: team, ...s.lead, updated_at: new Date().toISOString() }) : rejected.push({ source_key: r?.source_key ?? null, reason: s.reason }); }
  const ok = [...byKey.values()];
  await upsert("mk_leads", ok, "team_id,source_key");
  console.log(JSON.stringify({ saved: ok.length, rejected }));
});
