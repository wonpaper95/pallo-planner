// 스킬 전용: 서비스 키로 Supabase REST 호출. 키는 MK_ENV(기본 ~/.config/pallo/marketing.env)에서만 읽고 출력하지 않는다.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
export const MK = createRequire(import.meta.url)("../../mk-core.js");

const file = process.env.MK_ENV || `${homedir()}/.config/pallo/marketing.env`;
let env;
// .env 형식: 주석(#)·앞쪽 export·값을 감싼 따옴표를 허용
const parseEnv = (t) => Object.fromEntries(t.split("\n").filter((l) => !/^\s*#/.test(l)).map((l) => l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^(["'])(.*)\1$/, "$2")]));
try { env = parseEnv(readFileSync(file, "utf8")); }
catch { console.error(`설정 파일이 없어요: ${file} (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`); process.exit(2); }
const URL_ = (env.SUPABASE_URL || "").replace(/\/+$/, ""), KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error(`${file} 에 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없어요`); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// PostgREST 기본 상한(1000줄)을 넘는 결과도 Range 헤더로 이어 읽는다. order 가 없으면 호출자가 넘긴 order 로 순서를 고정한다.
export async function select(table, query, order) {
  const q = /(^|&)order=/.test(query) ? query : `${query}&order=${order}`;
  if (!/(^|&)order=/.test(q) || q.endsWith("order=undefined")) throw new Error(`${table} 읽기: 정렬 기준(order)이 필요해요`);
  const PAGE = 1000, out = [];
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${URL_}/rest/v1/${table}?${q}`, { headers: { ...H, Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" } });
    if (r.status === 416) return out; // 범위 밖 = 데이터 끝 (딱 1000의 배수일 때)
    if (!r.ok) throw new Error(`${table} 읽기 실패 ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
export async function upsert(table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${URL_}/rest/v1/${table}?on_conflict=${onConflict}`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows.slice(i, i + 500)) });
    if (!r.ok) throw new Error(`${table} 쓰기 실패 ${r.status}: ${await r.text()}`);
  }
}
export const arg = (i, name) => { const v = process.argv[i]; if (!v) { console.error(`인자 없음: ${name}`); process.exit(2); } return v; };
// team_id: 양의 정수만
export const teamArg = (i) => { const v = arg(i, "team_id"); if (!/^[1-9]\d*$/.test(v)) { console.error(`team_id 는 양의 정수여야 해요: ${v}`); process.exit(2); } return +v; };
// 날짜: YYYY-MM-DD 이면서 실제 달력에 있는 날
export const dateArg = (i, name) => { const v = arg(i, name); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v + "T00:00:00Z")) || new Date(v + "T00:00:00Z").toISOString().slice(0, 10) !== v) { console.error(`${name} 는 YYYY-MM-DD 형식이어야 해요: ${v}`); process.exit(2); } return v; };
// CLI 공통 마무리: 오류는 메시지만 출력(헤더·키 노출 금지)하고 종료코드 1
export const run = async (fn) => { try { await fn(); } catch (e) { console.error(`실패: ${e?.message ?? e}`); process.exit(1); } };
