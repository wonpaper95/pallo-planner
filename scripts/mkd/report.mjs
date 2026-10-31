// 일일 리포트 계산·저장 검증 — 순수 모듈(DB·환경파일 안 읽음, tests/mkd-report.test.mjs 로 검증).
// build-report.mjs 가 mkd_daily 행을 읽어 buildReport 로 계산하고, save-report.mjs 가 prepareSave 로 저장할 모양을 만든다.
// 숫자·플래그는 여기서 끝난다(스킬이 고치지 않는다). Claude 는 comment 만 붙인다.
import { D, looksPersonal } from "./rows.mjs";

const WINDOW_DAYS = 56; // 28일(4주) 창의 직전 같은 길이까지 보려면 56일치가 필요하다
const COMMENT_MAX = 600, WEEKLY_MAX = 3000;

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
// sales([{team_id, day, signup, channel}], 매출 장부 '가입')를 주면 등록·등록당 비용·매체별 등록을 그걸로 센다(D.enrollRows). 없으면 예전처럼.
export function buildReport(allRows, teams, date, sales) {
  const from = reportFrom(date), rows = allRows.filter((r) => r.date >= from && r.date <= date);
  const enr = sales ? D.enrollRows(sales, date) : undefined, enrOf = (id) => enr?.filter((r) => r.team_id === id);
  const perTeam = teams.map((t) => {
    const tr = rows.filter((r) => r.team_id === t.id);
    return { team_id: t.id, team: t.name, days: new Set(tr.map((r) => r.date)).size, status: D.status(tr, date), summary: D.summary(tr, date, enrOf(t.id)).map(slim), flags: D.flags(tr, date).map((f) => ({ ...f, team_id: t.id, team: t.name })) };
  });
  const flags = perTeam.flatMap((t) => t.flags);
  return { date, days: new Set(rows.map((r) => r.date)).size, status: D.status(rows, date), summary: D.summary(rows, date, enr).map(slim), flags, flagCounts: count(flags), teams: perTeam };
}

// build-report 를 파일로 낼 때 stdout 에 찍는 짧은 요약: 상태·플래그 수·플래그([수준, 지점, 문장])·핵심 4개([이름, d1 칸, d3 칸]). Claude 는 이것만 보고 comment 를 쓴다.
export const shortSummary = (r) => ({ status: r.status, flagCounts: r.flagCounts, flags: r.flags.map((f) => [f.level, f.team, f.msg]), summary: r.summary.map((s) => [s.label, s.cells.d1, s.cells.d3]) });

// 리포트 파일의 date 가 저장 날짜와 다르면 메시지, 아니면 null. date 가 없으면(손으로 쓴 파일) 여기서는 보지 않는다 — 객체가 아닌 파일도 prepareSave 가 거부한다.
export const dateMismatch = (r, date) => (r !== null && typeof r === "object" && !Array.isArray(r) && Object.hasOwn(r, "date") && r.date !== date ? `리포트 날짜(${String(r.date)})와 저장 날짜(${date})가 달라요` : null);

// 저장할 모양 만들기. 반환: {data} 또는 {error}(한국어 — 호출자가 종료 2 로 알린다). kind 가 틀리면 프로그래밍 오류라 던진다.
//   daily : build-report 출력에 Claude 가 붙인 comment(1~3줄). teams 상세·summary 는 빼고 status·flags·flagCounts·days·comment 만(화면은 숫자를 mkd_daily 로 다시 계산, 코멘트·플래그만 읽는다).
//   weekly: build-report --weekly 출력 + Claude 의 body(3000자 안). media·summary 가 없으면(숫자 없는 파일) 거부.
// 컬컴/CULCOM·전화번호 검사는 Claude 가 쓴 글(daily comment · weekly body)에만 건다 — 캠페인 이름(flags·unit)에는 옛 브랜드가 실제로 들어 있고, 전화번호는 저장할 때 이미 걸렀다.
export function prepareSave(kind, r) {
  if (kind !== "daily" && kind !== "weekly") throw new Error(`kind 는 daily 또는 weekly: ${kind}`);
  if (r === null || typeof r !== "object" || Array.isArray(r)) return { error: "리포트 파일은 JSON 객체여야 해요" };
  const field = kind === "daily" ? "comment" : "body";
  if (typeof r[field] !== "string" || !r[field].trim()) return { error: `${field} 가 비어 있어요` };
  const text = r[field].trim();
  if (/컬컴|culcom/i.test(text)) return { error: `${field} 에 '컬컴/CULCOM' 이 들어 있어요. 빼고 다시 저장해 주세요.` };
  if (looksPersonal(text)) return { error: `${field} 에 전화번호처럼 보이는 값이 있어요. 빼고 다시 저장해 주세요.` }; // 값은 메시지에 싣지 않는다
  if (kind === "weekly") {
    if (!Array.isArray(r.summary) || !Array.isArray(r.media)) return { error: "summary·media 가 없어요. build-report --weekly 출력에 body 만 붙여 저장해 주세요." };
    return { data: { ...r, body: text.slice(0, WEEKLY_MAX) } };
  }
  // 숫자 없는 코멘트 파일로 기존 리포트를 덮어쓰지 않게: build-report 출력(status·summary)이 있어야 한다 — summary 는 확인용일 뿐 저장하지 않는다
  if (r.status === null || typeof r.status !== "object" || !Array.isArray(r.summary)) return { error: "status·summary 가 없어요. build-report 출력에 comment 만 붙여 저장해 주세요." };
  return { data: { status: r.status, flags: r.flags ?? [], flagCounts: r.flagCounts ?? {}, days: r.days ?? 0, comment: text.slice(0, COMMENT_MAX) } };
}

// ── 월요일 주간 종합 (5단계) ──
// 입력 만들기(순수): 기준일 date(일요일) 포함 7일(w1 칸)의 핵심 줄·채널 지표·매체별 비용·블로그·지점별 숫자 + 그 주 일일 리포트들의 플래그.
// Claude 는 이걸 보고 body(한 줄 결론 / 채널별 잘된 것·나쁜 것 / 비용 순위 / 권장 조치 3개 이내)만 쓴다. 숫자는 여기서 끝.
// dailyReports = [{date, data:{flags}}] (mkd_reports kind=daily). sales = buildReport 와 같은 모양.
const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
const wk = (line) => { const c = line.cells.find((x) => x.key === "w1"); return { label: line.label, unit: line.unit, value: r2(c.value), change: c.change === null ? null : Math.round(c.change * 1000) / 1000, days: c.days, prevDays: c.prevDays }; };
const MEDIA = [ // 매체별 비용: 광고 채널 · 전산 유입경로(문의) · 장부 가입경로(등록)
  { name: "메타", channel: "meta_ad", src: (u) => u === "meta", enroll: "메타" },
  { name: "네이버", channel: "naver_ad", src: (u) => /^nad_/.test(u), enroll: "네이버" },
  { name: "구글", channel: "google_ad", src: (u) => /^gads_/.test(u), enroll: null }, // 장부 가입경로 '구글'은 기타로 묶여 따로 못 센다
];
export function buildWeekly(allRows, teams, date, sales, dailyReports = []) {
  const from = D.addDays(date, -6), rows = allRows.filter((r) => r.date >= reportFrom(date) && r.date <= date);
  const enr = sales ? D.enrollRows(sales, date) : undefined;
  const sumW = (rs, metric) => D.cell(rs, metric, date, 7);
  // 매체별 ~당 비용은 광고비·건수가 둘 다 있는(지점·날짜) 날끼리 나눈다 (광고비는 9/1부터 백필, 전산 문의는 10/29부터)
  const key = (r) => r.team_id + "|" + r.date, on = (rs, days) => rs.filter((r) => days.has(key(r))), daysOf = (rs) => new Set(rs.filter((r) => r.status === "ok" || r.status === "partial").map(key));
  const jDays = daysOf(D.totalRows(rows.filter((r) => r.channel === "jeonsan"))), eDays = new Set((enr ?? []).map(key));
  const media = MEDIA.map((m) => {
    const ads = D.totalRows(rows.filter((r) => r.channel === m.channel)), adDays = daysOf(ads);
    const src = rows.filter((r) => r.channel === "jeonsan" && m.src(r.unit)), er = m.enroll && enr ? enr.filter((r) => r.unit === m.enroll) : null;
    const spend = sumW(ads, "spend").value, inquiries = sumW(src, "inquiries").value, enrolls = er ? sumW(er, "enrolls").value : null;
    const per = (a, b) => (a === null || a === undefined || !b ? null : Math.round(a / b));
    return { name: m.name, spend: r2(spend), inquiries, enrolls,
      perInquiry: per(sumW(on(ads, jDays), "spend").value, sumW(on(src, adDays), "inquiries").value),
      perEnroll: er ? per(sumW(on(ads, eDays), "spend").value, sumW(on(er, adDays), "enrolls").value) : null };
  }).sort((a, b) => (a.perEnroll ?? Infinity) - (b.perEnroll ?? Infinity));
  const table = D.buildTable(rows, date).map((c) => ({
    channel: c.channel, label: c.label, metrics: c.metrics.map(wk),
    // 세부는 광고 채널이면 주간 비용 큰 순 5개, 블로그는 키워드 순위(통합 순), 전산은 유입경로
    units: c.units.map((u) => ({ unit: u.unit, metrics: u.metrics.map(wk) }))
      .sort((a, b) => { const v = (u, m) => u.metrics.find((x) => x.label === m)?.value; return c.channel === "blog" ? (v(a, "통합검색 순위") ?? 999) - (v(b, "통합검색 순위") ?? 999) : (v(b, "비용") ?? v(b, "문의") ?? 0) - (v(a, "비용") ?? v(a, "문의") ?? 0); })
      .slice(0, c.channel === "blog" ? 30 : 5),
  }));
  const perTeam = teams.map((t) => {
    const tr = rows.filter((r) => r.team_id === t.id), te = enr?.filter((r) => r.team_id === t.id);
    return { team: t.name, summary: D.summary(tr, date, te).map(wk).filter((l) => l.value !== null) };
  }).filter((t) => t.summary.length);
  // 그 주 플래그: 날마다 저장된 것을 모아 같은 (지점·코드·대상)은 마지막 날 것 하나 + 며칠 떴는지
  const seen = new Map();
  for (const rep of [...dailyReports].filter((x) => x.date >= from && x.date <= date).sort((a, b) => (a.date < b.date ? -1 : 1)))
    for (const f of Array.isArray(rep.data?.flags) ? rep.data.flags : []) {
      const k = `${f.team_id}|${f.code}|${f.unit}`, prev = seen.get(k);
      seen.set(k, { level: f.level, team: f.team, msg: f.msg, last: rep.date, days: (prev?.days ?? 0) + 1 });
    }
  return { date, from, to: date, summary: D.summary(rows, date, enr).map(wk), media, channels: table, teams: perTeam, flags: [...seen.values()].sort((a, b) => ["red", "yellow", "gray"].indexOf(a.level) - ["red", "yellow", "gray"].indexOf(b.level)) };
}
