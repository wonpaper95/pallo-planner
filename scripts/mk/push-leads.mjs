// 사용: node scripts/mk/push-leads.mjs <team_id> <leads.json>
// leads.json = 전산에서 읽은 [{source_key, ad_name, lead_date, status, age_band?, subject?}] — 다른 필드는 버린다.
import { readFileSync } from "node:fs";
import { MK, upsert, arg } from "./db.mjs";
const team = +arg(2, "team_id"), raw = JSON.parse(readFileSync(arg(3, "leads.json"), "utf8"));
const ok = [], rejected = [];
for (const r of raw) { const s = MK.sanitizeLead(r); s.ok ? ok.push({ team_id: team, ...s.lead, updated_at: new Date().toISOString() }) : rejected.push({ source_key: r?.source_key ?? null, reason: s.reason }); }
await upsert("mk_leads", ok, "team_id,source_key");
console.log(JSON.stringify({ saved: ok.length, rejected }));
