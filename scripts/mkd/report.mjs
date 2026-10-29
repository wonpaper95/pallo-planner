// 일일 리포트 계산·저장 검증 — 순수 모듈(DB·환경파일 안 읽음, tests/mkd-report.test.mjs 로 검증).
// build-report.mjs 가 mkd_daily 행을 읽어 buildReport 로 계산하고, save-report.mjs 가 prepareSave 로 저장할 모양을 만든다.
// 숫자·플래그는 여기서 끝난다(스킬이 고치지 않는다). Claude 는 comment 만 붙인다.
import { D, looksPersonal } from "./rows.mjs";

const WINDOW_DAYS = 56; // 28일(4주) 창의 직전 같은 길이까지 보려면 56일치가 필요하다
const COMMENT_MAX = 600;

// 기준일 포함 56일의 첫날
export const reportFrom = (date) => D.addDays(date, -(WINDOW_DAYS - 1));

// 핵심 4개의 칸: 값·증감·데이터 일수(이번 days / 직전 prevDays)만. prevDays 가 있어야 "데이터 n일" 과 진짜 증감을 구분한다.
// (화면은 mkd_daily 로 다시 계산하므로 prev·hold 같은 나머지는 싣지 않는다)
export const slim = (line) => ({
  label: line.label, unit: line.unit,
  cells: Object.fromEntries(line.cells.map((c) => [c.key, { value: c.value === null ? null : Math.round(c.value * 100) / 100, change: c.change === null ? null : Math.round(c.change * 1000) / 1000, days: c.days, prevDays: c.prevDays }])),
});
const count = (fs) => fs.reduce((o, f) => ((o[f.level] = (o[f.level] ?? 0) + 1), o), {});

// mkd_daily 행(어느 팀·날짜든) + teams [{id,name,key}] + 기준일 → 리포트 객체. 기준일 밖(미래·56일 전) 행은 무시.
export function buildReport(allRows, teams, date) {
  const from = reportFrom(date), rows = allRows.filter((r) => r.date >= from && r.date <= date);
  const perTeam = teams.map((t) => {
    const tr = rows.filter((r) => r.team_id === t.id);
    return { team_id: t.id, team: t.name, days: new Set(tr.map((r) => r.date)).size, status: D.status(tr, date), summary: D.summary(tr, date).map(slim), flags: D.flags(tr, date).map((f) => ({ ...f, team_id: t.id, team: t.name })) };
  });
  const flags = perTeam.flatMap((t) => t.flags);
  return { date, days: new Set(rows.map((r) => r.date)).size, status: D.status(rows, date), summary: D.summary(rows, date).map(slim), flags, flagCounts: count(flags), teams: perTeam };
}

// build-report 를 파일로 낼 때 stdout 에 찍는 짧은 요약: 상태·플래그 수·플래그([수준, 지점, 문장])·핵심 4개([이름, d1 칸, d3 칸]). Claude 는 이것만 보고 comment 를 쓴다.
export const shortSummary = (r) => ({ status: r.status, flagCounts: r.flagCounts, flags: r.flags.map((f) => [f.level, f.team, f.msg]), summary: r.summary.map((s) => [s.label, s.cells.d1, s.cells.d3]) });

// 리포트 파일의 date 가 저장 날짜와 다르면 메시지, 아니면 null. date 가 없으면(손으로 쓴 파일) 여기서는 보지 않는다 — 객체가 아닌 파일도 prepareSave 가 거부한다.
export const dateMismatch = (r, date) => (r !== null && typeof r === "object" && !Array.isArray(r) && Object.hasOwn(r, "date") && r.date !== date ? `리포트 날짜(${String(r.date)})와 저장 날짜(${date})가 달라요` : null);

// 저장할 모양 만들기. 반환: {data} 또는 {error}(한국어 — 호출자가 종료 2 로 알린다). kind 가 틀리면 프로그래밍 오류라 던진다.
//   daily : build-report 출력에 Claude 가 붙인 comment(1~3줄). teams 상세·summary 는 빼고 status·flags·flagCounts·days·comment 만(화면은 숫자를 mkd_daily 로 다시 계산, 코멘트·플래그만 읽는다).
//   weekly: {body, …} 그대로(5단계).
// 컬컴/CULCOM·전화번호 검사는 Claude 가 쓴 글(daily comment · weekly body)에만 건다 — 캠페인 이름(flags·unit)에는 옛 브랜드가 실제로 들어 있고, 전화번호는 저장할 때 이미 걸렀다.
export function prepareSave(kind, r) {
  if (kind !== "daily" && kind !== "weekly") throw new Error(`kind 는 daily 또는 weekly: ${kind}`);
  if (r === null || typeof r !== "object" || Array.isArray(r)) return { error: "리포트 파일은 JSON 객체여야 해요" };
  const field = kind === "daily" ? "comment" : "body";
  if (typeof r[field] !== "string" || !r[field].trim()) return { error: `${field} 가 비어 있어요` };
  const text = r[field].trim();
  if (/컬컴|culcom/i.test(text)) return { error: `${field} 에 '컬컴/CULCOM' 이 들어 있어요. 빼고 다시 저장해 주세요.` };
  if (looksPersonal(text)) return { error: `${field} 에 전화번호처럼 보이는 값이 있어요. 빼고 다시 저장해 주세요.` }; // 값은 메시지에 싣지 않는다
  if (kind === "weekly") return { data: { ...r, body: text } };
  // 숫자 없는 코멘트 파일로 기존 리포트를 덮어쓰지 않게: build-report 출력(status·summary)이 있어야 한다 — summary 는 확인용일 뿐 저장하지 않는다
  if (r.status === null || typeof r.status !== "object" || !Array.isArray(r.summary)) return { error: "status·summary 가 없어요. build-report 출력에 comment 만 붙여 저장해 주세요." };
  return { data: { status: r.status, flags: r.flags ?? [], flagCounts: r.flagCounts ?? {}, days: r.days ?? 0, comment: text.slice(0, COMMENT_MAX) } };
}
