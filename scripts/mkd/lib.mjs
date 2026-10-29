// 일일 현황 스크립트 공용: 팀 목록·team_key→id, 행 검증(rows.mjs), 저장, 채널 통째 상태 표시. 서비스 키는 ../mk/db.mjs 가 읽는다(출력 금지).
// 입력 JSON 규격·검증 규칙은 rows.mjs 맨 위 주석 — 순수 모듈이라 DB 없이 테스트한다(tests/mkd-rows.test.mjs).
import { select, upsert, del } from "../mk/db.mjs";
import { D, MK, cleanMetrics, toRowsPure, staleAllPlan } from "./rows.mjs";
export { D, MK, cleanMetrics };

let teamsCache;
export async function teams() { return (teamsCache ??= (await select("teams", "select=id,name", "sort,id")).map((t) => ({ id: t.id, name: t.name, key: MK.teamKeyOfTeamName(t.name) }))); }

// {rows:[{team_key|team_id, unit, metrics, status?}], status?, note?} → mkd_daily 행. channel·date 는 인자. 규칙은 rows.mjs.
export async function toRows(channel, date, input) { return toRowsPure(channel, date, input, await teams()); }

// 같은 (team,date,channel,unit) 은 덮어쓴다. 사라진 unit 의 옛 행은 지우지 않는다.
// 다만 (채널,날짜,지점)마다 이번에 '전체' 행 없이 쓸 수 있는(ok/partial) unit 행만 쓴 지점은 옛 '전체' 행(상태 무관 — "운영 캠페인 없음" 0 행·실패 표시)을 지운다:
// 합계 계산이 '전체' ok 행을 우선해 새 unit 행을 가리기 때문. 이번에 '전체' 행을 쓴 지점·배치에 없는 지점은 건드리지 않는다. 계획은 rows.mjs 의 staleAllPlan(순수, 테스트 있음).
export async function saveRows(rows) {
  if (!rows.length) return 0;
  const at = new Date().toISOString();
  await upsert("mkd_daily", rows.map((r) => ({ ...r, collected_at: at })), "team_id,date,channel,unit");
  for (const p of staleAllPlan(rows)) await del("mkd_daily", `channel=eq.${p.channel}&date=eq.${p.date}&unit=eq.${encodeURIComponent(D.ALL)}&team_id=in.(${p.teamIds.join(",")})`);
  return rows.length;
}
// 채널 통째 실패·로그인 필요: 모든 팀에 '전체' 행
export async function markChannel(channel, date, status, note) { return saveRows(await toRows(channel, date, { rows: [], status, note })); }
