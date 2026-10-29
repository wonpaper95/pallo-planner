// 일일 현황 스크립트 공용: 팀 목록·team_key→id, 행 검증(rows.mjs), 저장, 채널 통째 상태 표시. 서비스 키는 ../mk/db.mjs 가 읽는다(출력 금지).
// 입력 JSON 규격·검증 규칙은 rows.mjs 맨 위 주석 — 순수 모듈이라 DB 없이 테스트한다(tests/mkd-rows.test.mjs).
import { select, upsert, del } from "../mk/db.mjs";
import { D, MK, cleanMetrics, toRowsPure } from "./rows.mjs";
export { D, MK, cleanMetrics };

let teamsCache;
export async function teams() { return (teamsCache ??= (await select("teams", "select=id,name", "sort,id")).map((t) => ({ id: t.id, name: t.name, key: MK.teamKeyOfTeamName(t.name) }))); }

// {rows:[{team_key|team_id, unit, metrics, status?}], status?, note?} → mkd_daily 행. channel·date 는 인자. 규칙은 rows.mjs.
export async function toRows(channel, date, input) { return toRowsPure(channel, date, input, await teams()); }

// 같은 (team,date,channel,unit) 은 덮어쓴다. 사라진 unit 의 옛 행은 지우지 않는다.
// 다만 (channel,date)마다 이번에 ok/partial 로 쓴 지점의 옛 '전체' 실패 표시(failed/login_required)는 지운다 — 방금 쓴 행은 남긴다.
export async function saveRows(rows) {
  if (!rows.length) return 0;
  const at = new Date().toISOString();
  await upsert("mkd_daily", rows.map((r) => ({ ...r, collected_at: at })), "team_id,date,channel,unit");
  const groups = new Map(); // `${channel}|${date}` → { channel, date, good: Set(team_id), marked: Set(team_id) }
  for (const r of rows) {
    const k = `${r.channel}|${r.date}`;
    if (!groups.has(k)) groups.set(k, { channel: r.channel, date: r.date, good: new Set(), marked: new Set() });
    const g = groups.get(k);
    if (r.status === "ok" || r.status === "partial") g.good.add(r.team_id);
    if (r.unit === D.ALL && (r.status === "failed" || r.status === "login_required")) g.marked.add(r.team_id); // 방금 쓴 실패 표시
  }
  for (const g of groups.values()) {
    const ids = [...g.good].filter((id) => !g.marked.has(id));
    if (ids.length) await del("mkd_daily", `channel=eq.${g.channel}&date=eq.${g.date}&unit=eq.${encodeURIComponent(D.ALL)}&status=in.(failed,login_required)&team_id=in.(${ids.join(",")})`);
  }
  return rows.length;
}
// 채널 통째 실패·로그인 필요: 모든 팀에 '전체' 행
export async function markChannel(channel, date, status, note) { return saveRows(await toRows(channel, date, { rows: [], status, note })); }
