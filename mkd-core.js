// 📊 일일 현황 계산 모음 (브라우저 window.MKDCORE · Node require 겸용). 화면·DB와 무관한 순수 함수만 둔다.
// 행(row)은 mkd_daily 그대로: {team_id, date, channel, unit, metrics, status}. 날짜는 YYYY-MM-DD 문자열만 다룬다.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.MKDCORE = api;
})(typeof self !== "undefined" ? self : globalThis, function () {

const CHANNELS = ["naver_ad", "google_ad", "meta_ad", "blog", "daangn", "jeonsan"];
const CHANNEL_LABEL = { naver_ad: "네이버 검색광고", google_ad: "구글 검색광고", meta_ad: "메타 광고", blog: "네이버 블로그", daangn: "당근", jeonsan: "전산 문의" };
const AD_CHANNELS = ["naver_ad", "google_ad", "meta_ad"];
const STATUS = ["ok", "partial", "failed", "login_required"];
const WINDOWS = [{ key: "d1", label: "매일", days: 1 }, { key: "d3", label: "3일", days: 3 }, { key: "w1", label: "주간", days: 7 }, { key: "w2", label: "2주", days: 14 }, { key: "w4", label: "4주", days: 28 }];
const ALL = "전체";        // 채널 합계 행 / 채널 통째 실패 표시 행의 unit
const MIN_SAMPLE = 30;     // 비율 지표(CTR·CPC) 증감을 믿으려면 분모(노출·클릭)가 이만큼은

// 지표 정의. agg: sum(합계) / avg(평균) / last(기간 마지막 값) / ratio(합계끼리 나눔). good: 늘면 좋은지(up) 줄면 좋은지(down). unit: krw|pct|rank|int
const METRICS = {
  impressions: { label: "노출", agg: "sum", good: "up" },
  clicks: { label: "클릭", agg: "sum", good: "up" },
  spend: { label: "비용", agg: "sum", good: "down", unit: "krw" },
  conversions: { label: "전환", agg: "sum", good: "up" },
  leads: { label: "리드", agg: "sum", good: "up" },
  reach: { label: "도달", agg: "sum", good: "up" },
  ctr: { label: "CTR", agg: "ratio", of: ["clicks", "impressions"], good: "up", unit: "pct" },
  cpc: { label: "CPC", agg: "ratio", of: ["spend", "clicks"], good: "down", unit: "krw" },
  rank: { label: "순위", agg: "avg", good: "down", unit: "rank" },
  visitors: { label: "방문자", agg: "sum", good: "up" },
  views: { label: "조회", agg: "sum", good: "up" },
  followers: { label: "단골", agg: "last", good: "up" },
  chats: { label: "채팅", agg: "sum", good: "up" },
  inquiries: { label: "문의", agg: "sum", good: "up" },
  enrolls: { label: "등록", agg: "sum", good: "up" },
};
// 채널마다 보여줄 지표 순서. 실제 값이 있는 것만 표에 나온다.
const CHANNEL_METRICS = {
  naver_ad: ["impressions", "clicks", "spend", "ctr", "cpc"],
  google_ad: ["impressions", "clicks", "spend", "conversions", "ctr", "cpc"],
  meta_ad: ["impressions", "reach", "clicks", "leads", "spend"],
  blog: ["rank", "visitors", "views"],
  daangn: ["views", "followers", "chats"],
  jeonsan: ["inquiries", "enrolls"],
};

const addDays = (d, n) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
// 끝 날짜 end 를 포함한 days 일 {from,to} 와 그 직전 같은 길이 {pfrom,pto}
function windowRange(end, days) { return { from: addDays(end, -(days - 1)), to: end, pfrom: addDays(end, -(2 * days - 1)), pto: addDays(end, -days) }; }
const inRange = (d, from, to) => d >= from && d <= to;
const num = (v) => (v === null || v === undefined || v === "" || isNaN(+v) ? null : +v);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const usable = (r) => r.status === "ok" || r.status === "partial";

// 비율 지표의 분자·분모 합. 둘 다 있는 metrics 만 센다 (비용만 있고 클릭이 없는 partial 행이 CPC 를 부풀리지 않게)
function ratioParts(ms, def) {
  const both = ms.filter((m) => num(m?.[def.of[0]]) !== null && num(m?.[def.of[1]]) !== null);
  return [aggregate(both, def.of[0]), aggregate(both, def.of[1])];
}
// metrics 객체 배열(날짜순)에서 지표 하나를 합친다. 값이 하나도 없으면 null.
function aggregate(ms, metric) {
  const def = METRICS[metric]; if (!def) return null;
  if (def.agg === "ratio") { const [a, b] = ratioParts(ms, def); return a === null || !b ? null : a / b; }
  const vals = ms.map((m) => num(m?.[metric])).filter((v) => v !== null);
  if (!vals.length) return null;
  if (def.agg === "sum") return vals.reduce((x, y) => x + y, 0);
  if (def.agg === "avg") return vals.reduce((x, y) => x + y, 0) / vals.length;
  return vals[vals.length - 1]; // last
}
// 증감 비율. 직전 값이 없거나 0이면 null (화면은 "데이터 n일" 또는 "–")
const pctChange = (cur, prev) => (cur === null || cur === undefined || prev === null || prev === undefined || prev === 0 ? null : (cur - prev) / Math.abs(prev));

// 한 채널 행들의 unit 목록(전체 제외) — 펼쳐 보기용. 가나다 순으로 고정해 화면 순서가 흔들리지 않게
function unitsOf(rows) { return [...new Set(rows.map((r) => r.unit))].filter((u) => u !== ALL).sort((a, b) => a.localeCompare(b, "ko")); }
// 채널 합계에 쓸 행: 지점(team_id)·날짜마다 쓸 수 있는 '전체' 행이 있으면 그것 하나, 없으면 그 지점·날의 unit 행 전부
// (실패 표시용 전체 행은 자연히 빠진다). 여러 지점 행을 한꺼번에 넘기면 지점끼리는 서로 가리지 않고 합쳐진다.
function totalRows(rows) {
  const groups = new Map();
  for (const r of rows) { const k = r.team_id + "|" + r.date; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  return [...groups.values()].flatMap((day) => { const all = day.find((r) => r.unit === ALL && usable(r)); return all ? [all] : day.filter((r) => r.unit !== ALL); });
}

// 기간 행들(날짜순)에서 지표 하나. 'last'(단골 수)는 지점마다 마지막 값을 구해 지점끼리 더한다 (한 지점이면 그대로).
function valueOf(rs, metric) {
  if (METRICS[metric].agg !== "last") return aggregate(rs.map((r) => r.metrics), metric);
  const per = [...new Set(rs.map((r) => r.team_id))].map((t) => aggregate(rs.filter((r) => r.team_id === t).map((r) => r.metrics), metric)).filter((v) => v !== null);
  return per.length ? per.reduce((x, y) => x + y, 0) : null;
}

// 칸 하나: {value, prev, change, days, prevDays, hold}. days·prevDays = 이번·직전 기간 안에 데이터가 있는 날 수(첫 주엔 "데이터 n일" 표시용). 실패·로그인 필요 행은 세지 않는다.
// 증감(change)은 직전 기간이 절반 이상(prevDays×2 ≥ 기간 일수) 찼을 때만. 합계 지표는 덜 찬 날에 휘둘리지 않게 '하루 평균'끼리 비교한다.
// 비율 지표는 이번 분모가 MIN_SAMPLE 보다 적으면 hold(값이 있을 때만), 직전 분모가 적어도 증감은 보류.
function cell(rows, metric, end, days) {
  const w = windowRange(end, days), ok = rows.filter(usable).sort(byDate);
  const cur = ok.filter((r) => inRange(r.date, w.from, w.to)), prev = ok.filter((r) => inRange(r.date, w.pfrom, w.pto));
  const value = valueOf(cur, metric), pv = valueOf(prev, metric), def = METRICS[metric];
  const curDays = new Set(cur.map((r) => r.date)).size, prevDays = new Set(prev.map((r) => r.date)).size;
  const den = (rs) => (def.agg === "ratio" ? ratioParts(rs.map((r) => r.metrics), def)[1] ?? 0 : Infinity);
  const hold = value !== null && den(cur) < MIN_SAMPLE;
  const perDay = (v, n) => (v === null || !n ? null : v / n);
  let change = null;
  if (!hold && prevDays * 2 >= days && den(prev) >= MIN_SAMPLE) change = def.agg === "sum" ? pctChange(perDay(value, curDays), perDay(pv, prevDays)) : pctChange(value, pv);
  return { value, prev: pv, change, days: curDays, prevDays, hold };
}

// 표: 채널마다 합계 지표 줄 + unit 별 줄. rows 는 한 팀 또는 여러 팀의 mkd_daily 행. 전체 행만 실패한 채널도 머리줄(상태 표시용)로 남긴다.
function buildTable(rows, end) {
  const line = (rs, metric) => ({ metric, label: METRICS[metric].label, unit: METRICS[metric].unit ?? "int", good: METRICS[metric].good, cells: WINDOWS.map((w) => ({ key: w.key, ...cell(rs, metric, end, w.days) })) });
  // 그 행들에 실제 값이 있는 지표만 (비율 지표는 분자·분모 둘 다 있어야)
  const present = (channel, rs) => CHANNEL_METRICS[channel].filter((m) => { const d = METRICS[m], keys = d.agg === "ratio" ? d.of : [m]; return rs.some((r) => usable(r) && keys.every((k) => num(r.metrics?.[k]) !== null)); });
  return CHANNELS.map((channel) => {
    const cr = rows.filter((r) => r.channel === channel); if (!cr.length) return null;
    const total = totalRows(cr);
    // 순위는 키워드마다 봐야 의미가 있어서 채널 합계에선 뺀다
    const totalMetrics = present(channel, total).filter((m) => !(channel === "blog" && m === "rank"));
    return { channel, label: CHANNEL_LABEL[channel], metrics: totalMetrics.map((m) => line(total, m)),
      // unit 은 이름으로 묶는다 — 지점이 달라도 같은 이름이면 한 줄로 합쳐진다(키워드·캠페인 이름은 지점마다 다르게 쓰는 게 전제). 전부 실패해 지표가 없는 unit 은 뺀다.
      units: unitsOf(cr).map((u) => { const ur = cr.filter((r) => r.unit === u); return { unit: u, metrics: present(channel, ur).map((m) => line(ur, m)) }; }).filter((u) => u.metrics.length) };
  }).filter(Boolean);
}

// 표기 (화면·보고 공용)
function fmt(v, unit) {
  if (v === null || v === undefined) return "–";
  if (unit === "krw") return "₩" + Math.round(v).toLocaleString("ko-KR");
  if (unit === "pct") return (Math.round(v * 1000) / 10) + "%";
  if (unit === "rank") return (Math.round(v * 10) / 10) + "위";
  return Math.round(v).toLocaleString("ko-KR");
}

return { CHANNELS, CHANNEL_LABEL, AD_CHANNELS, STATUS, WINDOWS, METRICS, CHANNEL_METRICS, ALL, MIN_SAMPLE, addDays, windowRange, aggregate, pctChange, unitsOf, totalRows, cell, buildTable, fmt };
});
