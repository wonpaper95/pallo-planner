// 일일 현황 스크립트 공용: 팀 목록·team_key→id, 행 검증, 저장, 채널 통째 상태 표시. 서비스 키는 ../mk/db.mjs 가 읽는다(출력 금지).
import { createRequire } from "node:module";
import { MK, select, upsert } from "../mk/db.mjs";
export const D = createRequire(import.meta.url)("../../mkd-core.js");
export { MK };
const FALLBACK_KEY = "dsr"; // 지점을 못 정한 행이 가는 곳(대구영어점) — unit 앞에 [미분류]

let teamsCache;
export async function teams() { return (teamsCache ??= (await select("teams", "select=id,name", "sort,id")).map((t) => ({ id: t.id, name: t.name, key: MK.teamKeyOfTeamName(t.name) }))); }

// 허용된 키만, 숫자 키는 숫자로. 개인정보 비슷한 값(전화번호)은 막는다.
const NUM_KEYS = new Set(["impressions", "clicks", "spend", "spend_usd", "fx", "ctr", "cpc", "avg_rank", "conversions", "leads", "reach", "rank", "visitors", "views", "followers", "chats", "inquiries", "enrolls"]);
const STR_KEYS = new Set(["status", "note", "campaign_id", "top_url", "our_url"]);
export function cleanMetrics(m) {
  const out = {};
  for (const [k, v] of Object.entries(m ?? {})) {
    if (NUM_KEYS.has(k)) {
      if (v === null || v === undefined || v === "") { out[k] = null; continue; }
      const s = String(v).replace(/[,₩\s]/g, "");
      if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`${k} 는 숫자여야 해요: ${JSON.stringify(v)}`);
      out[k] = +s;
    } else if (STR_KEYS.has(k)) out[k] = String(v ?? "").slice(0, 200);
    else if (k === "flags") out[k] = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? "").slice(0, 120)).filter(Boolean);
    else throw new Error(`모르는 지표 키: ${k}`);
  }
  if (/\d{2,3}-\d{3,4}-\d{4}/.test(JSON.stringify(out))) throw new Error("전화번호처럼 보이는 값이 있어요 — 저장하지 않아요");
  return out;
}

// {rows:[{team_key|team_id, unit, metrics, status?}], status?, note?} → mkd_daily 행. channel·date 는 인자.
export async function toRows(channel, date, input) {
  if (!D.CHANNELS.includes(channel)) throw new Error(`채널은 ${D.CHANNELS.join("/")} 중 하나: ${channel}`);
  const ts = await teams();
  if (!Array.isArray(input?.rows) || !input.rows.length) {
    const status = input?.status && input.status !== "ok" ? input.status : "failed";
    if (!D.STATUS.includes(status)) throw new Error(`status 는 ${D.STATUS.join("/")}: ${status}`);
    return ts.map((t) => ({ team_id: t.id, date, channel, unit: D.ALL, metrics: { note: String(input?.note ?? "행 없음").slice(0, 200) }, status }));
  }
  return input.rows.map((r) => {
    let unit = String(r.unit ?? D.ALL).trim() || D.ALL;
    let team_id = r.team_id ?? (r.team_key ? ts.find((t) => t.key === r.team_key)?.id ?? null : null);
    if (!team_id) { const k = MK.teamKeyOf(unit); team_id = ts.find((t) => t.key === (k ?? FALLBACK_KEY))?.id; if (!k && unit !== D.ALL) unit = `[미분류] ${unit}`; }
    if (!team_id) throw new Error(`팀을 못 정했어요: ${JSON.stringify(r).slice(0, 100)}`);
    const status = r.status ?? "ok"; if (!D.STATUS.includes(status)) throw new Error(`status 는 ${D.STATUS.join("/")}: ${status}`);
    return { team_id, date, channel, unit: unit.slice(0, 120), metrics: cleanMetrics(r.metrics), status };
  });
}
// 같은 (team,date,channel,unit) 은 덮어쓴다. 사라진 unit 의 옛 행은 지우지 않는다.
export async function saveRows(rows) { if (!rows.length) return 0; await upsert("mkd_daily", rows.map((r) => ({ ...r, collected_at: new Date().toISOString() })), "team_id,date,channel,unit"); return rows.length; }
// 채널 통째 실패·로그인 필요: 모든 팀에 '전체' 행
export async function markChannel(channel, date, status, note) { return saveRows(await toRows(channel, date, { rows: [], status, note })); }
