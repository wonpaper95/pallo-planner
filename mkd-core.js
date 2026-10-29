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

// 핵심 4개 (팀 안에서 채널을 가로지름): 전산 문의·등록, 총 광고비(광고 3채널 합), 문의당 비용. 5칸 모두.
function summary(rows, end) {
  const jt = totalRows(rows.filter((r) => r.channel === "jeonsan"));
  const ads = AD_CHANNELS.flatMap((c) => totalRows(rows.filter((r) => r.channel === c)));
  const line = (label, rs, metric, good, unit) => ({ label, good, unit, cells: WINDOWS.map((w) => ({ key: w.key, ...cell(rs, metric, end, w.days) })) });
  const inq = line("문의", jt, "inquiries", "up", "int"), enr = line("등록", jt, "enrolls", "up", "int"), sp = line("총 광고비", ads, "spend", "down", "krw");
  const div = (a, b) => (a === null || a === undefined || !b ? null : a / b); // 문의 0 이면 산출 불가(null)
  // 문의당 비용은 두 칸(광고비·문의)으로 만든 값이라, 증감도 두 칸 중 덜 찬 쪽 기준으로 cell 과 같은 절반 규칙을 따른다
  const cpi = { label: "문의당 비용", good: "down", unit: "krw", cells: WINDOWS.map((w, i) => { const s = sp.cells[i], q = inq.cells[i], v = div(s.value, q.value), p = div(s.prev, q.prev), pd = Math.min(s.prevDays, q.prevDays); return { key: w.key, value: v, prev: p, change: pd * 2 >= w.days ? pctChange(v, p) : null, days: Math.min(s.days, q.days), prevDays: pd, hold: false }; }) };
  return [inq, enr, sp, cpi];
}

// 채널별 기준일 수집 상태: ok / partial / failed / login_required / missing(행 없음)
function status(rows, end) {
  return Object.fromEntries(CHANNELS.map((c) => {
    const day = rows.filter((r) => r.channel === c && r.date === end); if (!day.length) return [c, "missing"];
    const st = day.map((r) => r.status);
    return [c, st.every((s) => s === "ok") ? "ok" : st.some((s) => s === "ok" || s === "partial") ? "partial" : st[0]];
  }));
}

// 전산 유입경로(unit) → 광고 채널. 코멘트 토큰 gads_* = 구글, nad_* = 네이버, 광고명 있는 리드폼 = meta.
function channelOfSource(unit) { const u = String(unit ?? ""); return /^gads_/.test(u) ? "google_ad" : /^nad_/.test(u) ? "naver_ad" : u === "meta" ? "meta_ad" : null; }

// 이상 징후 (rows 는 한 팀 것). 결과: [{level: red|yellow|gray, code, channel, unit, msg}]
function flags(rows, end) {
  const out = [], push = (level, code, channel, unit, msg) => out.push({ level, code, channel, unit, msg });
  const L = (c) => CHANNEL_LABEL[c], pct = (x) => Math.round(x * 100);
  const chRows = (c) => rows.filter((r) => r.channel === c);
  // 1 광고 멈춤: 직전 7일(3~9일 전) 안에 노출이 있던 캠페인이 노출 0 으로 3일 연속. 화면 상태가 일시중지면 의도된 것이라 뺀다.
  for (const c of AD_CHANNELS) for (const u of unitsOf(chRows(c))) {
    const ur = chRows(c).filter((r) => r.unit === u), at = (d) => ur.find((r) => r.date === d);
    if (/일시\s*중지|paused|중지됨/i.test(String(at(end)?.metrics?.status ?? ""))) continue;
    const last3 = [0, 1, 2].map((i) => num(at(addDays(end, -i))?.metrics?.impressions));
    const ranBefore = [3, 4, 5, 6, 7, 8, 9].some((i) => num(at(addDays(end, -i))?.metrics?.impressions) > 0);
    if (last3.every((v) => v === 0) && ranBefore) push("red", "ad_stopped", c, u, `${L(c)} '${u}' 노출 0이 3일째예요`);
  }
  // 2 승인/결제 문제: 구글·메타 화면에서 읽은 경고 문구(metrics.flags)
  for (const c of ["google_ad", "meta_ad"]) for (const r of chRows(c).filter((r) => r.date === end)) for (const f of Array.isArray(r.metrics?.flags) ? r.metrics.flags : []) push("red", "account_issue", c, r.unit, `${L(c)} ${r.unit === ALL ? "" : `'${r.unit}' `}${f}`);
  // 3 비용 급증: 채널 3일 비용 ▲30%↑ 인데 전체 문의 3일은 ▼ 또는 0. 문의 판단은 쓸 수 있는 전산 날이 3일 중 2일 이상일 때만 — 0건도 감소도 1일 값으로는 안 본다. 전산 결측·실패는 0건이 아니다.
  const inq3 = summary(rows, end)[0].cells.find((c) => c.key === "d3");
  for (const c of AD_CHANNELS) {
    const sp = cell(totalRows(chRows(c)), "spend", end, 3);
    if (sp.change !== null && sp.change >= 0.3 && inq3.days >= 2 && (inq3.value === 0 || (inq3.change !== null && inq3.change < 0))) push("yellow", "spend_spike", c, ALL, `${L(c)} 3일 비용 ▲${pct(sp.change)}%인데 문의는 ${inq3.value === 0 ? "0건이에요" : "줄었어요"}`);
  }
  // 4 문의 급감: 주간 문의가 4주 주평균 대비 ▼40%↑ (전산 데이터가 14일 이상, 이번 주엔 4일 이상일 때만). 주간도 데이터 있는 날 수로 7일 환산해 비교한다.
  const jt = totalRows(chRows("jeonsan")), w1 = cell(jt, "inquiries", end, 7), w4 = cell(jt, "inquiries", end, 28), r1 = (x) => Math.round(x * 10) / 10;
  if (w4.days >= 14 && w1.days >= 4 && w1.value !== null && w4.value) { const wk = w1.value / w1.days * 7, avg = w4.value / (w4.days / 7); if (avg > 0 && (wk - avg) / avg <= -0.4) push("yellow", "inquiry_drop", "jeonsan", ALL, `주간 문의 ${r1(wk)}건 — 4주 주평균 ${r1(avg)}건보다 ${pct(1 - wk / avg)}% 적어요`); }
  // 5 순위 하락: 키워드 순위 3계단↑ 하락(마지막으로 안 순위와 비교) 또는 1페이지 이탈(rank→null, 직전 쓸 수 있는 행에 순위가 있던 첫날만).
  for (const u of unitsOf(chRows("blog")).filter((u) => u !== "방문자")) {
    const ur = chRows("blog").filter((r) => r.unit === u && usable(r)).sort(byDate), today = ur.find((r) => r.date === end); if (!today) continue;
    const before = [...ur].reverse().filter((r) => r.date < end), last = before[0], prevR = before.find((r) => num(r.metrics?.rank) !== null); if (!prevR) continue;
    const cur = num(today.metrics?.rank), prev = num(prevR.metrics?.rank);
    if (cur === null) { if (last === prevR) push("yellow", "rank_drop", "blog", u, `'${u}' 우리 글이 1페이지에서 빠졌어요 (전 ${prev}위)`); }
    else if (cur - prev >= 3) push("yellow", "rank_drop", "blog", u, `'${u}' ${prev}위 → ${cur}위`);
  }
  // 6 클릭 있는데 문의 0: 채널 주간 클릭 ≥ 50 인데 전산의 그 채널 유입 주간 0 (이번 주에 쓸 수 있는 전산 날이 4일 이상일 때만).
  //   그 채널 유입이 전산에서 이번 주 전에 문의 > 0 으로 잡힌 적 있는 채널만 본다 — 추적이 되던 채널이 끊긴 것만 이상. 이력이 없으면(지금 네이버: 전산에 nad_ 태그가 없음) 판단 안 함.
  const thisWeekFrom = windowRange(end, 7).from;
  if (cell(jt, "inquiries", end, 7).days >= 4) for (const c of AD_CHANNELS) {
    if (!chRows("jeonsan").some((r) => usable(r) && r.date < thisWeekFrom && channelOfSource(r.unit) === c && num(r.metrics?.inquiries) > 0)) continue;
    const ck = cell(totalRows(chRows(c)), "clicks", end, 7); if ((ck.value ?? 0) < 50) continue;
    const q = cell(chRows("jeonsan").filter((r) => channelOfSource(r.unit) === c), "inquiries", end, 7);
    if (!q.value) push("yellow", "clicks_no_inquiry", c, ALL, `${L(c)} 주간 클릭 ${ck.value}인데 전산 문의 0건 — 추적·폼 확인`);
  }
  // 7 결측: 기준일·전날 모두 ok/partial 이 아닌 채널 (데이터가 한 번이라도 있던 채널만, 2일 이상일 때만). 며칠째인지는 기준일부터 거꾸로 세어 최대 28일, 단 채널의 첫 행 날짜 전은 세지 않는다.
  for (const c of CHANNELS) {
    if (!chRows(c).length) continue;
    const st = [status(rows, end)[c], status(rows, addDays(end, -1))[c]];
    if (!st.every((s) => s !== "ok" && s !== "partial")) continue;
    const first = chRows(c).map((r) => r.date).sort()[0], okDays = new Set(chRows(c).filter(usable).map((r) => r.date));
    let n = 0; while (n < 28 && addDays(end, -n) >= first && !okDays.has(addDays(end, -n))) n++;
    if (n < 2) continue; // 1일째(채널의 첫 행이 오늘 실패/로그인 필요)는 아직 결측이 아니다
    push("gray", "missing", c, ALL, `${L(c)} ${st.includes("login_required") ? "로그인 필요" : "수집 안 됨"} ${n}일째`);
  }
  return out;
}

// 표기 (화면·보고 공용)
function fmt(v, unit) {
  if (v === null || v === undefined) return "–";
  if (unit === "krw") return "₩" + Math.round(v).toLocaleString("ko-KR");
  if (unit === "pct") return (Math.round(v * 1000) / 10) + "%";
  if (unit === "rank") return (Math.round(v * 10) / 10) + "위";
  return Math.round(v).toLocaleString("ko-KR");
}

return { CHANNELS, CHANNEL_LABEL, AD_CHANNELS, STATUS, WINDOWS, METRICS, CHANNEL_METRICS, ALL, MIN_SAMPLE, addDays, windowRange, aggregate, pctChange, unitsOf, totalRows, cell, buildTable, summary, status, channelOfSource, flags, fmt };
});
