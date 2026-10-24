// 스킬 전용: 서비스 키로 Supabase REST 호출. 키는 MK_ENV(기본 ~/.config/pallo/marketing.env)에서만 읽고 출력하지 않는다.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
export const MK = createRequire(import.meta.url)("../../mk-core.js");

const file = process.env.MK_ENV || `${homedir()}/.config/pallo/marketing.env`;
let env;
try { env = Object.fromEntries(readFileSync(file, "utf8").split("\n").map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]])); }
catch { console.error(`설정 파일이 없어요: ${file} (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`); process.exit(2); }
const URL_ = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error(`${file} 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어요`); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

export async function select(table, query) {
  const r = await fetch(`${URL_}/rest/v1/${table}?${query}`, { headers: H });
  if (!r.ok) throw new Error(`${table} 읽기 실패 ${r.status}: ${await r.text()}`);
  return r.json();
}
export async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${URL_}/rest/v1/${table}?on_conflict=${onConflict}`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows.slice(i, i + 500)) });
    if (!r.ok) throw new Error(`${table} 쓰기 실패 ${r.status}: ${await r.text()}`);
  }
}
export const arg = (i, name) => { const v = process.argv[i]; if (!v) { console.error(`인자 없음: ${name}`); process.exit(2); } return v; };
