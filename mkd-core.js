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

// metrics 객체 배열(날짜순)에서 지표 하나를 합친다. 값이 하나도 없으면 null.
function aggregate(ms, metric) {
  const def = METRICS[metric]; if (!def) return null;
  if (def.agg === "ratio") { const a = aggregate(ms, def.of[0]), b = aggregate(ms, def.of[1]); return a === null || !b ? null : a / b; }
  const vals = ms.map((m) => num(m?.[metric])).filter((v) => v !== null);
  if (!vals.length) return null;
  if (def.agg === "sum") return vals.reduce((x, y) => x + y, 0);
  if (def.agg === "avg") return vals.reduce((x, y) => x + y, 0) / vals.length;
  return vals[vals.length - 1]; // last
}
// 증감 비율. 직전 값이 없거나 0이면 null (화면은 "데이터 n일" 또는 "–")
const pctChange = (cur, prev) => (cur === null || cur === undefined || prev === null || prev === undefined || prev === 0 ? null : (cur - prev) / Math.abs(prev));

// 한 채널 행들의 unit 목록(전체 제외) — 펼쳐 보기용
function unitsOf(rows) { return [...new Set(rows.map((r) => r.unit))].filter((u) => u !== ALL); }
// 채널 합계에 쓸 행: 날짜마다 쓸 수 있는 '전체' 행이 있으면 그것 하나, 없으면 그 날의 unit 행 전부 (실패 표시용 전체 행은 자연히 빠진다)
function totalRows(rows) {
  const dates = [...new Set(rows.map((r) => r.date))];
  return dates.flatMap((d) => { const day = rows.filter((r) => r.date === d), all = day.find((r) => r.unit === ALL && usable(r)); return all ? [all] : day.filter((r) => r.unit !== ALL); });
}

// 칸 하나: {value, prev, change, days, hold}. days = 기간 안에 데이터가 있는 날 수(첫 주엔 "데이터 n일" 표시용). 실패·로그인 필요 행은 세지 않는다.
function cell(rows, metric, end, days) {
  const w = windowRange(end, days), ok = rows.filter(usable).sort(byDate);
  const cur = ok.filter((r) => inRange(r.date, w.from, w.to)), prev = ok.filter((r) => inRange(r.date, w.pfrom, w.pto));
  const value = aggregate(cur.map((r) => r.metrics), metric), pv = aggregate(prev.map((r) => r.metrics), metric);
  const def = METRICS[metric];
  const hold = def.agg === "ratio" ? (aggregate(cur.map((r) => r.metrics), def.of[1]) ?? 0) < MIN_SAMPLE : false;
  return { value, prev: pv, change: hold ? null : pctChange(value, pv), days: new Set(cur.map((r) => r.date)).size, hold };
}

// 표: 채널마다 합계 지표 줄 + unit 별 줄. rows 는 한 팀 또는 여러 팀의 mkd_daily 행.
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
      units: unitsOf(cr).map((u) => { const ur = cr.filter((r) => r.unit === u); return { unit: u, metrics: present(channel, ur).map((m) => line(ur, m)) }; }) };
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
