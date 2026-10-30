// 구글 광고 3일 점검용: 전산(jeonsan) 일일 현황에서 구글 광고 유입(gads_ 토큰) 문의 건수를 기간으로 합산한다 — 순수 계산(DB·파일·브라우저를 건드리지 않음, tests/mkd-gads-check.test.mjs).
// CLI 는 gads-check.mjs. 입력 rows = mkd_daily 행 [{team_id,date,channel,unit,metrics,status}], teams = [{id,key}].
// 이름·전화번호는 애초에 일일 현황에 없다(건수뿐).
import { D } from "./rows.mjs";
import { BRANCHES, validDate } from "./browser-rows.mjs";

const usable = (r) => r.status === "ok" || r.status === "partial";
const BRANCH_KEYS = BRANCHES.map((b) => b.team_key); // 전산이 있는 지점(구미점 제외)
const count = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : 0);

// → {from, to, days, firstDate, incomplete, byTeam:{지점:{gads_토큰:건수}}, total}
//   days       기간 안에 전산 데이터(ok·partial 행)가 있는 날 수. 일일 현황은 2026-10-29 부터 쌓이니 그 전 날짜는 세지 않는다.
//   firstDate  그 중 가장 이른 날(없으면 null) — "10/29부터" 표시용.
//   incomplete 데이터는 있지만 세 지점 중 '전체' ok 행이 없는 지점이 있던 날(실패·로그인 필요·열 없음 partial·행 없음) — 그 날 gads_ 건수가 적게 잡혔을 수 있다.
export function gadsCheck(rows, teams, from, to) {
  if (!validDate(from) || !validDate(to)) throw new Error("날짜는 YYYY-MM-DD 형식이어야 해요");
  if (from > to) throw new Error("시작일이 끝일보다 늦어요");
  const keyOf = new Map((teams ?? []).map((t) => [t.id, t.key]));
  const inRange = (rows ?? []).filter((r) => r.channel === "jeonsan" && r.date >= from && r.date <= to && usable(r) && keyOf.has(r.team_id));
  const dates = [...new Set(inRange.map((r) => r.date))].sort();
  const incomplete = dates.filter((d) => BRANCH_KEYS.some((k) => !inRange.some((r) => r.date === d && keyOf.get(r.team_id) === k && r.unit === D.ALL && r.status === "ok")));
  const byTeam = Object.fromEntries(BRANCH_KEYS.map((k) => [k, {}]));
  let total = 0;
  for (const r of inRange) {
    if (D.channelOfSource(r.unit) !== "google_ad") continue;
    const n = count(r.metrics?.inquiries), t = (byTeam[keyOf.get(r.team_id)] ??= {});
    t[r.unit] = (t[r.unit] ?? 0) + n; total += n;
  }
  return { from, to, days: dates.length, firstDate: dates[0] ?? null, incomplete, byTeam, total };
}
