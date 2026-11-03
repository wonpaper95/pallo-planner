// 🧪 체험판 샘플: 블로그 · 마케팅 · 게시물 · Q&A · 톡톡·인스타 봇 (이름·숫자·글 전부 지어낸 가상 데이터)
// 날짜는 전부 오늘 기준 상대값. 시계열(일일 현황)은 작은 생성 함수로 만든다.
(() => {
const { U, T, tables: t, rpc, fn, day, at, month, monday, uuid } = DEMO;
const FX = 1380; // 가상 환율 (달러 → 원)

// ── 도구 ──
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };
const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const R = Math.round;
const pick = (r, a) => a[Math.floor(r() * a.length)];
const dayDiff = (iso) => R((new Date(iso + "T12:00:00") - new Date(day(0) + "T12:00:00")) / 864e5); // iso 가 오늘에서 며칠 뒤인지
const addDay = (iso, n) => day(dayDiff(iso) + n);
const dow = (iso) => new Date(iso + "T12:00:00").getDay();
const nextId = (arr) => Math.max(0, ...arr.map((x) => +x.id || 0)) + 1;

// 지점 한눈표: sc = 규모(영어점 1.0 기준), subs = 과목, tags = 광고 이름 앞 [태그]
const TM = [
  { k: "en", id: T.en, name: "서울영어점", sc: 1, subs: ["영어회화", "오픽·토스"], tags: ["영어", "영어"], staff: ["이서연", "한지우", "김대표"], langs: [["영어", .8], ["스페인어", .2]], area: "강남", spot: "강남역 도보 3분", grp: "en", branch: "DAEGUDSR" },
  { k: "jp", id: T.jp, name: "서울일중점", sc: .72, subs: ["일본어", "중국어"], tags: ["일본어", "중국어"], staff: ["박지훈", "김대표"], langs: [["일본어", .6], ["중국어", .4]], area: "강남", spot: "역삼역 인근", grp: "jpcn", branch: "DAEGUJPCH" },
  { k: "bs", id: T.bs, name: "부산점", sc: .8, subs: ["영어회화", "일본어"], tags: ["영어", "일본어"], staff: ["최수빈", "김대표"], langs: [["영어", .62], ["일본어", .28], ["스페인어", .1]], area: "서면", spot: "서면역 7번 출구 앞", grp: "en", branch: "ULSAN" },
  { k: "sw", id: T.sw, name: "수원점", sc: .42, subs: ["영어회화"], tags: ["영어"], staff: ["정민재", "김대표"], langs: [["영어", .75], ["일본어", .25]], area: "영통", spot: "영통역 도보 5분", grp: "en", branch: "ULSAN" },
];
const TMK = Object.fromEntries(TM.map((x) => [x.k, x]));
const tmOf = (id) => TM.find((x) => x.id == id) ?? TM[0];

// ── 썸네일: 캔버스로 그린 가짜 JPEG (마케팅 화면은 data:image/jpeg 만 받는다) ──
const PAL = [["#493087", "#8c6fd6"], ["#d9a400", "#f3d21c"], ["#2a7f9e", "#6cc4a1"], ["#b3235a", "#ff8a65"], ["#33415c", "#5c7aea"], ["#00796b", "#a5d6a7"], ["#6a1b9a", "#ce93d8"], ["#e65100", "#ffcc80"]];
const _th = {};
const thumb = (i, w = 240, h = 240) => {
  const key = (i % PAL.length) + ":" + w;
  if (_th[key] !== undefined) return _th[key];
  try {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), [a, b] = PAL[i % PAL.length], gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,.2)"; g.beginPath(); g.arc(w * (.25 + ((i * 37) % 50) / 100), h * (.3 + ((i * 53) % 40) / 100), h * .32, 0, 7); g.fill();
    g.fillStyle = "rgba(255,255,255,.9)"; g.font = `bold ${Math.round(h / 9)}px system-ui,sans-serif`; g.textAlign = "center"; g.fillText("SAMPLE", w / 2, h * .56);
    return (_th[key] = c.toDataURL("image/jpeg", .7));
  } catch { return (_th[key] = ""); }
};

// 인스타 식 짧은 id (대문자·소문자·숫자 11자)
const code = (s, n = 11) => { const r = rng(hash(s)), A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; return Array.from({ length: n }, () => A[Math.floor(r() * A.length)]).join(""); };
const digits = (s, n = 16) => { const r = rng(hash(s)); return "1" + Array.from({ length: n - 1 }, () => Math.floor(r() * 10)).join(""); };

// ═══════════════════════════════ 📊 마케팅 › 일일 현황 (mkd_*) ═══════════════════════════════
// 56일치 × 지점 4곳 × 채널 7개. 맥미니가 매일 새벽 쌓는 숫자를 흉내 낸 생성 함수 하나.
const KW = { // [키워드, 통합검색 기준 순위(null=밖), 블로그탭 기준 순위]
  en: { on: [["서울 영어회화", 3, 5], ["강남 영어회화", 5, 9], ["서울 성인영어", 7, 14], ["강남 오픽학원", null, 17], ["서울 토익스피킹", null, 26]], off: ["서울 영어학원 추천", "강남 영어스터디"] },
  jp: { on: [["서울 일본어학원", 4, 8], ["강남 중국어학원", 6, 12], ["서울 JLPT", 9, 15], ["서울 HSK", null, 21]], off: ["서울 일본어회화", "강남 일본어스터디"] },
  bs: { on: [["부산 영어회화", 2, 6], ["서면 영어학원", 4, 10], ["부산 일본어학원", 8, 13], ["서면 성인영어", null, 19], ["부산 오픽", null, 23]], off: ["부산 토익스피킹"] },
  sw: { on: [["수원 영어회화", null, null], ["영통 영어학원", null, null], ["수원 성인영어", null, null]], off: ["수원 오픽", "영통 일본어"] },
};
const SRC = [["meta", .42], ["nad_파워링크", .2], ["네이버 예약", .19], ["홈페이지", .12], ["gads_검색", .07]]; // 전산 유입경로별 비중
const mkd = [];
{
  const row = (tm, date, channel, unit, metrics, status = "ok") => mkd.push({ team_id: tm.id, date, channel, unit, metrics, status });
  for (let d = -55; d <= -1; d++) {
    const date = day(d), wk = dow(date), prog = (d + 55) / 55;
    for (const tm of TM) {
      const r = rng(hash(tm.k + date)), n = () => 0.84 + r() * 0.32;
      const tr = (0.88 + 0.26 * prog) * tm.sc * (wk === 0 ? .78 : wk === 6 ? .9 : 1);
      const sum = (arr, f) => arr.reduce((s, x) => s + (x[f] ?? 0), 0);
      // 네이버 검색광고: 파워링크(과목별) + 플레이스
      const nv = [...tm.subs.map((s, i) => [`파워링크_${s}`, [16000, 9000][i] ?? 7000, [540, 610][i] ?? 560, .034]), ["플레이스_예약", 5000, 380, .06]].map(([u, sp, cpc, ctr]) => {
        const spend = R(sp * tr * n() / 10) * 10, clicks = R(spend / cpc), impressions = R(clicks / (ctr * n()));
        return { u, impressions, clicks, spend };
      });
      nv.forEach((x) => row(tm, date, "naver_ad", x.u, { impressions: x.impressions, clicks: x.clicks, spend: x.spend }));
      row(tm, date, "naver_ad", "전체", { impressions: sum(nv, "impressions"), clicks: sum(nv, "clicks"), spend: sum(nv, "spend") });
      // 구글 검색광고 (수원점은 아직 안 함)
      if (tm.k !== "sw") {
        const gg = tm.subs.map((s, i) => [`검색_${s}`, [10000, 6000][i] ?? 5000, [700, 650][i] ?? 650]).map(([u, sp, cpc]) => {
          const spend = R(sp * tr * n() / 10) * 10, clicks = R(spend / cpc);
          return { u, impressions: R(clicks / (.04 * n())), clicks, spend, conversions: R(clicks * .08 * n()) };
        });
        gg.forEach((x) => row(tm, date, "google_ad", x.u, { impressions: x.impressions, clicks: x.clicks, spend: x.spend, conversions: x.conversions }));
        row(tm, date, "google_ad", "전체", { impressions: sum(gg, "impressions"), clicks: sum(gg, "clicks"), spend: sum(gg, "spend"), conversions: sum(gg, "conversions") });
      }
      // 메타 광고: 리드 캠페인(과목별) + 랜딩 트래픽
      const mt = [...tm.subs.map((s, i) => [`[${tm.tags[i]}] ${i ? "무료 체험 신청" : "직장인 잠재고객"}`, [26000, 16000][i] ?? 12000, [4800, 5200][i] ?? 5000, .012, [17000, 21000][i] ?? 20000]), ["[랜딩] 사이트 트래픽", 9000, 3800, .016, 0]].map(([u, sp, cpm, ctr, cpl]) => {
        const spend = R(sp * tr * n() / 100) * 100, impressions = R(spend / cpm * 1000);
        return { u, impressions, reach: R(impressions * .78), clicks: R(impressions * ctr * n()), leads: cpl ? R(spend / cpl * n()) : 0, spend };
      });
      mt.forEach((x) => row(tm, date, "meta_ad", x.u, { impressions: x.impressions, reach: x.reach, clicks: x.clicks, leads: x.leads, spend: x.spend }));
      row(tm, date, "meta_ad", "전체", { impressions: sum(mt, "impressions"), reach: sum(mt, "reach"), clicks: sum(mt, "clicks"), leads: sum(mt, "leads"), spend: sum(mt, "spend") });
      // 당근 광고·당근 소식 (수원점 제외)
      if (tm.k !== "sw") {
        const spend = R(7000 * tr * n() / 10) * 10, clicks = R(spend / 260), impressions = R(clicks / (.012 * n())), chats = R(clicks * .05 * n());
        row(tm, date, "daangn_ad", "당근_동네소식", { impressions, clicks, spend, chats });
        row(tm, date, "daangn_ad", "전체", { impressions, clicks, spend, chats });
        const views = R(900 * tr * n());
        row(tm, date, "daangn", "전체", { views, visitors: R(views * .22), followers: R(140 * tm.sc + (d + 55) * 1.3) });
      }
      // 네이버 블로그 (수원점은 블로그 없음): 키워드별 순위 + 전체
      if (tm.k !== "sw") {
        let top = 0, tab = 0;
        KW[tm.k].on.forEach(([kw, rk, tb], i) => {
          const wob = () => Math.round((r() - .5) * 2.4);
          let rank = rk === null ? (r() < .12 ? 10 + wob() : null) : Math.max(1, rk + wob()), tabRank = Math.max(1, tb + wob() * 2);
          if (tm.k === "en" && kw === "서울 성인영어" && d >= -2) { rank = 11; tabRank = 17; } // 이틀째 하락 (이상 징후 예시)
          if (rank !== null && rank > 10) rank = rank > 11 ? null : rank;
          if (rank !== null) top++; if (tabRank <= 30) tab++;
          row(tm, date, "blog", kw, { rank, tab_rank: tabRank, our_url: rank !== null || tabRank <= 12 ? `https://blog.naver.com/pallo_${tm.k}/2230${String(10000 + hash(kw) % 80000)}` : undefined });
        });
        const visitors = R(190 * tr * n());
        row(tm, date, "blog", "전체", { visitors, subscribers: R(420 * tm.sc + (d + 55) * 2.2), kw_tracked: KW[tm.k].on.length, kw_top: top, kw_tab: tab, views: R(visitors * 1.7) });
      }
      // 전산 문의: 유입경로별 + 전체
      const total = 3.5 * tr, srcs = SRC.filter(([u]) => tm.k !== "sw" || u !== "gads_검색").map(([u, w]) => ({ u, inquiries: Math.max(0, R(total * w + (r() - .45))) }));
      srcs.forEach((x) => row(tm, date, "jeonsan", x.u, { inquiries: x.inquiries }));
      row(tm, date, "jeonsan", "전체", { inquiries: sum(srcs, "inquiries") });
    }
  }
}
// 한 곳은 하루 수집 실패 (과거) — 표가 이런 날을 건너뛰는 걸 보여준다
mkd.filter((x) => x.team_id === T.bs && x.channel === "daangn_ad" && x.date === day(-12)).forEach((x) => { x.status = "failed"; x.metrics = {}; });
t.mkd_daily = mkd;
t.mkd_keywords = TM.flatMap((tm) => [...KW[tm.k].on.map(([kw]) => [kw, true]), ...KW[tm.k].off.map((kw) => [kw, false])].map(([keyword, enabled]) => ({ team_id: tm.id, keyword, enabled, added_by: U.boss, created_at: at(-40) })))
  .map((x, i) => ({ id: i + 1, ...x }));

// 합산 도우미: 최근 7일 매체별 광고비·문의 (주간 종합이 일일 현황과 같은 숫자가 되게)
const spendOf = (ch) => mkd.filter((x) => x.channel === ch && x.unit === "전체" && x.date >= day(-7)).reduce((s, x) => s + (x.metrics.spend ?? 0), 0);
const inqOf = (re) => mkd.filter((x) => x.channel === "jeonsan" && x.date >= day(-7) && re.test(x.unit)).reduce((s, x) => s + (x.metrics.inquiries ?? 0), 0);
const per = (a, b) => (b ? R(a / b) : null);
{
  const m = [["메타", spendOf("meta_ad"), inqOf(/^meta$/), 7], ["네이버", spendOf("naver_ad"), inqOf(/^nad_|^네이버 예약/), 5], ["구글", spendOf("google_ad"), inqOf(/^gads_/), 2], ["당근", spendOf("daangn_ad"), 3, 1]];
  const wkFrom = addDay(monday(-1), 0), wkTo = addDay(monday(-1), 6);
  const inqAll = inqOf(/./), spAll = m.reduce((s, x) => s + x[1], 0), enAll = m.reduce((s, x) => s + x[3], 0);
  t.mkd_reports = [
    { id: 1, date: day(-1), kind: "daily", updated_at: at(0, "06:42"), data: {
      comment: `어제 전체 문의는 ${mkd.filter((x) => x.date === day(-1) && x.channel === "jeonsan" && x.unit === "전체").reduce((s, x) => s + x.metrics.inquiries, 0)}건으로 최근 4주 평균 수준이에요.\n메타 '직장인 잠재고객' 캠페인이 지점 세 곳 모두에서 리드를 가장 많이 만들었고, 네이버 예약 문의는 평일에 안정적으로 들어와요.\n블로그는 서울영어점 '서울 성인영어'가 7위에서 11위로 내려갔어요. 본문 첫 문단과 제목 키워드를 다시 볼 만해요.`,
      flags: [
        { level: "yellow", code: "rank_drop", channel: "blog", team_id: T.en, team: "서울영어점", msg: "'서울 성인영어' 7위 → 11위 (이틀째)" },
        { level: "yellow", code: "spend_spike", channel: "meta_ad", team_id: T.bs, team: "부산점", msg: "메타 3일 비용 ▲34%인데 문의는 줄었어요" },
        { level: "gray", code: "account_notice", channel: "google_ad", team_id: T.jp, team: "서울일중점", msg: "구글 검색광고 [안내] 결제 수단 만료 예정 알림이 있어요" },
      ] } },
    { id: 2, date: day(-2), kind: "daily", updated_at: at(-1, "06:40"), data: { comment: "어제 문의가 평소보다 조금 적었지만 주말 효과로 보여요. 광고 멈춤이나 계정 문제는 없어요.", flags: [{ level: "yellow", code: "rank_drop", channel: "blog", team_id: T.en, team: "서울영어점", msg: "'서울 성인영어' 7위 → 11위 (이틀째)" }] } },
    { id: 3, date: day(-3), kind: "daily", updated_at: at(-2, "06:41"), data: { comment: "이상 징후는 없어요. 수원점은 오픈 전 사전 상담 문의가 꾸준히 들어와요.", flags: [] } },
    { id: 4, date: monday(-1) <= day(-1) ? monday(-1) : day(-8), kind: "weekly", updated_at: at(-1, "09:10"), data: {
      from: wkFrom, to: wkTo,
      body: `지난주 전체 문의는 ${inqAll}건, 광고비는 약 ₩${(R(spAll / 1000) * 1000).toLocaleString("ko-KR")}이에요.\n메타는 리드 단가가 가장 안정적이고, 네이버는 파워링크보다 '플레이스 예약'에서 문의가 꾸준히 나왔어요.\n구글은 소액으로 브랜드 검색만 받치는 중이고, 당근 소식은 조회 대비 채팅 전환이 낮아 문구 테스트가 필요해요.\n이번 주 할 일: ① 서울영어점 '서울 성인영어' 글 제목 손보기 ② 부산점 메타 캠페인 소재 교체 ③ 수원점 오픈 안내 글 발행.`,
      media: m.map(([name, spend, inquiries, enrolls]) => ({ name, spend, inquiries, enrolls, perInquiry: per(spend, inquiries), perEnroll: per(spend, enrolls) })) } },
  ];
}

// ═══════════════════════════════ 📈 마케팅 › 주간·월간·페르소나 (mk_reports) ═══════════════════════════════
const dim = (m) => new Date(+m.slice(0, 4), +m.slice(5), 0).getDate();
const won0 = (v) => "₩" + R(v).toLocaleString("ko-KR");
const CHN = ["메타", "네이버", "지인·재등록", "기타"], CHSH = [.46, .22, .22, .10];
const GROW = { "-4": .78, "-3": .84, "-2": .92, "-1": 1 };
const split = (total, shares) => { const out = shares.map((s) => R(total * s)); out[out.length - 1] = Math.max(0, total - out.slice(0, -1).reduce((a, b) => a + b, 0)); return out; };
// 기간 하나의 숫자 (mk-core periodStats 와 같은 모양)
function period(tm, mi, a, b, opt = {}) {
  const days = b - a + 1, frac = days / 30, r = rng(hash(tm.k + mi + "|" + a + "|" + b)), g = GROW[mi] ?? 1, nz = () => .93 + r() * .14;
  const apps = R(105 * tm.sc * frac * g * nz()), booked = R(apps * .52), done = R(booked * (.66 + r() * .06));
  const payers = Math.max(1, R(done * (.48 + r() * .08))), aov = R((330000 + r() * 70000) / 1000) * 1000, paid = payers * aov;
  const refunders = payers > 5 ? R(payers * .06) : 0, refund = refunders * R(aov * .9 / 1000) * 1000;
  const metaUsd = R(1100 * tm.sc * frac * g * nz()), naver = R(900000 * tm.sc * frac * g * nz() / 1000) * 1000;
  const spend = { meta: R(metaUsd * FX), metaUsd, naver };
  const bk = split(booked, CHSH), py = split(payers, CHSH);
  const channels = CHN.map((channel, i) => { const sp = i === 0 ? spend.meta : i === 1 ? naver : null, pd = py[i] * aov; return { channel, booked: bk[i], payers: py[i], paid: pd, spend: sp, roas: sp ? pd / sp : null, cpp: sp && py[i] ? sp / py[i] : null }; });
  const lb = split(booked, tm.langs.map((x) => x[1])), lp = split(payers, tm.langs.map((x) => x[1]));
  const langs = tm.langs.map(([lang], i) => ({ lang, booked: lb[i], payers: lp[i], paid: lp[i] * aov })).sort((x, y) => y.paid - x.paid);
  const sh = tm.staff.length === 3 ? [.52, .33, .15] : [.62, .38], sp2 = split(payers, sh), rf = split(refunders, sh);
  const staff = tm.staff.map((s, i) => ({ staff: s, payers: sp2[i], paid: sp2[i] * aov, refunders: rf[i], refund: rf[i] * R(aov * .9 / 1000) * 1000, net: sp2[i] * aov - rf[i] * R(aov * .9 / 1000) * 1000, aov: sp2[i] ? aov : null })).filter((x) => x.payers || x.refunders).sort((x, y) => y.net - x.net);
  const cov = (n) => opt.cov?.[n] ?? days;
  return { from: opt.from ?? "", to: opt.to ?? "", apps, adLeads: R(apps * .6), booked, done, noshow: Math.max(0, R(booked * .1)), payers, paid, net: paid - refund, refund, refunders,
    doneRate: booked ? done / booked : null, payRate: done ? payers / done : null, visitsShort: false, payPerApp: apps ? payers / apps : null, aov, spend,
    coverage: { days, leads: cov("leads"), visits: opt.noVisits ? 0 : cov("visits"), naver: cov("naver"), meta: cov("meta"), sales: cov("sales") }, channels, langs, staff };
}

// ── 월간 ──
function monthly(tm, M, half) {
  const m = month(M), lastD = half === "first" ? 15 : dim(m), from = m + "-01", to = m + "-" + String(lastD).padStart(2, "0"), pm = month(M - 1);
  const mk = (mm, mi, a, b) => period(tm, mi, a, b, { from: mm + "-" + String(a).padStart(2, "0"), to: mm + "-" + String(b).padStart(2, "0"), noVisits: mi <= -4 });
  const cur = mk(m, M, 1, lastD), prev = mk(pm, M - 1, 1, half === "first" ? 15 : dim(pm));
  const halves = half === "full" ? { first: mk(m, M, 1, 15), second: mk(m, M, 16, lastD) } : null;
  const trend = [M - 2, M - 1, M].map((mi) => ({ month: month(mi), ...mk(month(mi), mi, 1, mi === M && half === "first" ? 15 : dim(month(mi))) }));
  const up = (a, b) => (b ? R((a / b - 1) * 100) : 0), label = half === "first" ? "전반(1~15일)" : "한 달", M1 = +m.slice(5);
  const top = cur.channels.reduce((x, y) => (y.paid > x.paid ? y : x)), best = cur.staff[0];
  return { month: m, half, from, to, cur, prev, halves, trend, notes: {
    summary: `${M1}월 ${label} 결제는 ${cur.payers}명, ${won0(cur.paid)}이에요. 지난달 같은 기간보다 결제금액이 ${Math.abs(up(cur.paid, prev.paid))}% ${up(cur.paid, prev.paid) >= 0 ? "늘었고" : "줄었고"}, 방문완 → 결제율은 ${Math.round(cur.payRate * 100)}%예요. 결제가 가장 많이 난 매체는 ${top.channel}(${top.payers}명)이에요.`,
    caution: "방문 기록은 전산 캘린더, 결제는 재무 탭 매출 시트 기준이라 월말에 늦게 입력한 결제는 다음 리포트에서 반영돼요. 샘플 숫자예요.",
    trend: `${trend.map((x) => `${+x.month.slice(5)}월 ${x.payers}명`).join(" → ")}로 완만하게 ${trend[2].payers >= trend[0].payers ? "늘고" : "줄고"} 있어요. 광고비 대비 결제는 메타가 가장 안정적이에요.`,
    compare: half === "first" ? `이번 달 전반이 지난달 전반보다 지원자 ${Math.abs(up(cur.apps, prev.apps))}% ${up(cur.apps, prev.apps) >= 0 ? "많아요" : "적어요"}. 후반 프로모션 전에 방문 일정을 미리 잡아 두면 좋아요.` : `전반(${halves.first.payers}명)보다 후반(${halves.second.payers}명)에 결제가 ${halves.second.payers >= halves.first.payers ? "더 몰렸어요" : "덜 났어요"}. 월말 상담 일정을 앞당기는 걸 테스트해 볼 만해요.`,
    channels: `메타 ROAS ${R(cur.channels[0].roas * 100)}%, 네이버 ${R(cur.channels[1].roas * 100)}%예요. 지인·재등록은 광고비가 없어 비교에서 빠져요.`,
    langs: `${cur.langs[0].lang} 결제가 ${cur.langs[0].payers}명으로 가장 많고, ${cur.langs[1] ? `${cur.langs[1].lang}은 ${cur.langs[1].payers}명이에요.` : ""}`,
    staff: `${best.staff} 상담자가 ${best.payers}명(${won0(best.paid)})으로 가장 많아요. 환불은 ${cur.refunders}건 처리됐어요.` } };
}

// ── 주간 ──
const ADS = {
  en: ["[영어] 직장인 퇴근 후 회화 영상", "[영어] 1:1 언어교환 체험 신청", "[영어] 오픽 IH 목표 후기", "[영어] 소수정예 스터디 카드뉴스", "[영어] 주말반 모집 이미지"],
  jp: ["[일본어] JLPT N2 합격반 영상", "[중국어] HSK 입문 직장인", "[일본어] 워킹홀리데이 준비반", "[중국어] 여행회화 캐러셀"],
  bs: ["[영어] 서면 직장인 회화 영상", "[일본어] 여행 일본어 카드뉴스", "[영어] 토익스피킹 단기반", "[영어] 주말 프리토킹"],
  sw: ["[영어] 오픈 사전예약 이벤트", "[영어] 영통 직장인 회화", "[일본어] 일본어 첫걸음 체험"],
};
const VPAT = { en: ["keep", "watch", "keep", "hold", "cut"], jp: ["keep", "watch", "hold", "cut"], bs: ["watch", "keep", "keep", "cut"], sw: ["hold", "keep", "watch"] };
const ORG = {
  en: { top: ["퇴근 후 1시간, 영어로 하루 정리하기 (릴스)", "처음 온 분도 편한 소수정예 수업 현장", "오픽 IH 가는 3단계 말하기 루틴 (저장해 두세요)"], bot: ["11월 휴무 안내", "수업 교재 소개", "새 강사 인사"] },
  jp: { top: ["JLPT N2 문법 5분 정리 (카드뉴스)", "중국어 성조, 이렇게 외우면 쉬워요", "일본어 회화 스터디 현장 스케치"], bot: ["시간표 변경 안내", "센터 위치 안내", "휴무 공지"] },
  bs: { top: ["서면에서 퇴근 후 영어회화, 수업 풍경", "여행 일본어 10문장 (저장용)", "토익스피킹 Part 5 시간 관리 팁"], bot: ["휴무 안내", "강사 소개", "교재 소개"] },
  sw: { top: ["영통 오픈 준비 현장 사진", "사전 상담 이벤트 안내", "오픈 기념 체험 수업 모집"], bot: ["오시는 길", "상담 시간 안내", "센터 내부 사진"] },
};
function weekly(tm, w) {
  const week = monday(-w), r = rng(hash(tm.k + "wk" + w)), g = 1 - (w - 1) * .05, nz = () => .9 + r() * .2, names = ADS[tm.k], pat = VPAT[tm.k];
  const S = 230 * tm.sc * g * nz(), W = [.34, .26, .18, .12, .10], CPL = [5.8, 7.4, 6.2, 9.5, 8];
  const ads = names.map((ad_name, i) => {
    const v = pat[i];
    let spend = R(S * W[i]), leads = v === "cut" ? 0 : R(spend / CPL[i] * nz());
    if (v === "hold") leads = 2;
    const cpl = leads ? spend / leads : null, prevCpl = v === "cut" ? null : (cpl ?? 8) * (v === "watch" ? .86 : 1.04);
    let spend4w = R(spend * (3.5 + r() * .8)); if (v === "cut") spend4w = Math.max(spend4w, 72);
    const leads4w = v === "cut" ? 0 : v === "hold" ? 3 : R(leads * (3.4 + r() * .6)), booked4w = v === "keep" ? Math.max(1, R(leads4w * .5)) : v === "watch" ? Math.max(1, R(leads4w * .28)) : 0;
    const reason = { keep: "예약당 비용 지점 평균 이하", watch: "예약당 비용 지점 평균 초과", hold: `판단 보류 (표본 ${leads4w}건)`, cut: `4주 지출 $${spend4w}, 리드 0` }[v];
    return { ad_name, verdict: v, reason, spend, leads, cpl, prevCpl, spend4w, leads4w, booked4w, cpb4w: booked4w ? spend4w / booked4w : null };
  });
  const sum = (f) => ads.reduce((s, a) => s + (a[f] || 0), 0), spend = sum("spend"), leads = sum("leads"), spend4w = sum("spend4w"), booked4w = sum("booked4w");
  const per = period(tm, -1, 1 + w, 28 + w, { cov: tm.k === "sw" ? { naver: 21 } : {} });
  const best = ads.filter((a) => a.verdict === "keep")[0] ?? ads[0], cut = ads.find((a) => a.verdict === "cut");
  const org = (list, hi) => list.map((caption, i) => { const reach = hi ? R(3000 + r() * 6000) : R(150 + r() * 250), saves = hi ? R(reach * (.02 + r() * .015)) : R(r() * 3), shares = hi ? R(reach * (.01 + r() * .01)) : R(r() * 2);
    return { post_id: code(tm.k + w + caption, 12), permalink: `https://www.instagram.com/p/${code(tm.k + w + caption)}/`, caption, type: pick(r, ["릴스", "카드뉴스", "이미지"]), published_at: day(-(w * 7 - 3 - i * 2 + 7)), reach, saves, shares, score: (saves + shares) / reach }; }).sort((a, b) => b.score - a.score);
  return { team_id: tm.id, week, kind: "weekly", updated_at: at(-(w - 1) * 7 - (dow(day(0)) + 6) % 7, "09:12"), data: {
    flags: { noAds: false, noLeads: false, noOrganic: false, noSales: false },
    totals: { spend, leads, cpl: leads ? spend / leads : null, spend4w, leads4w: sum("leads4w"), booked4w, cpb4w: booked4w ? spend4w / booked4w : null,
      sales4w: { payers: per.payers, paid: per.paid, net: per.net, channels: per.channels.map((c) => ({ channel: c.channel, payers: c.payers, paid: c.paid, spend: c.spend, roas: c.roas, cpp: c.cpp })), spend: per.spend, coverage: per.coverage } },
    ads,
    notes: { summary: `이번 주 광고비 $${spend}로 리드 ${leads}건(리드당 $${(spend / Math.max(1, leads)).toFixed(1)})이 들어왔어요. '${best.ad_name}'이 4주 기준 예약당 비용이 가장 낮아서 계속 가져가요.${cut ? ` '${cut.ad_name}'은 4주째 리드가 없어 끄는 걸 추천해요.` : ""}`,
      tests: [`${tm.area} 직장인 퇴근 시간(19~22시) 노출을 늘려 보기`, "후기 영상 첫 3초를 '점수가 오른 숫자'로 시작해 보기", "주말반 카드뉴스에 모집 마감 날짜를 넣어 보기"],
      caution: "최근 7일에 들어온 리드는 아직 상담 예약 전일 수 있어서, 소재 판정은 4주 기준이에요. 샘플 숫자예요.",
      ads: { [best.ad_name]: "퇴근 후·직장인 문구에 반응이 좋아요. 예산을 조금 올려 봐도 돼요.", [ads[ads.length > 3 ? 3 : 1].ad_name]: "리드는 있는데 예약으로 잘 이어지지 않아요. 랜딩 문구를 확인해 주세요." } },
    organic: { top: org(ORG[tm.k].top, true), bottom: org(ORG[tm.k].bot, false).reverse() } } };
}

const PERSONA = {
  en: { title: "퇴근 후 회화를 다시 시작하려는 30대 직장인", who: "서울 강남·역삼 일대 직장인, 30대 초중반. 회의·메일은 영어로 하지만 말하기에 자신이 없어서 '소수정예'와 '퇴근 후 시간'을 중요하게 봐요.", wants: "주 2회 저녁 수업, 처음 온 사람도 눈치 안 보는 분위기, 오픽·토스 같은 목표 점수 관리", messages: ["퇴근하고 편하게 말할 수 있는 소수정예", "처음 와도 어색하지 않은 1:1 언어교환", "오픽 IH 목표, 3개월 루틴"], times: "평일 20~23시, 일요일 저녁에 문의가 몰려요", caution: "후기성 문구는 확인된 사실만 쓰고, 점수 약속처럼 읽히는 표현은 피해요.", funnel: { lead: 14, consult: 9, visit: 7, enroll: 8, lost: 6 }, ages: [["30대", "여성", .31], ["30대", "남성", .22], ["20대", "여성", .19], ["40대", "여성", .11], ["20대", "남성", .1], ["40대", "남성", .07]] },
  jp: { title: "여행·자격증 때문에 일본어·중국어를 시작하는 20~30대", who: "서울 강남 주변 대학생·직장인. 일본 여행이나 JLPT·HSK 준비가 계기이고, 혼자 공부하다 말하기에서 막혀 찾아와요.", wants: "시험 일정에 맞춘 커리큘럼, 소규모 회화 스터디, 합리적인 수강료", messages: ["JLPT N2, 3개월 계획표 같이 짜기", "여행 회화 10문장부터 시작", "성조 때문에 막힌 분 환영"], times: "평일 점심·밤 22시 전후, 시험 접수 시즌에 급증", caution: "시험 합격을 약속하는 표현은 쓰지 않아요.", funnel: { lead: 11, consult: 6, visit: 5, enroll: 5, lost: 5 }, ages: [["20대", "여성", .36], ["30대", "여성", .2], ["20대", "남성", .17], ["30대", "남성", .12], ["40대", "여성", .09], ["10대", "여성", .06]] },
  bs: { title: "서면 근처에서 일하는 20~30대 회화 입문자", who: "부산 서면·전포 직장인. 영어와 여행 일본어에 관심이 많고, 퇴근길에 들를 수 있는 위치를 가장 먼저 따져요.", wants: "서면역 가까운 위치, 주말 반, 무료 체험 수업", messages: ["서면역 7번 출구 앞, 퇴근길에 바로", "주말 프리토킹으로 가볍게 시작", "여행 일본어 10문장 체험"], times: "평일 21~24시, 토요일 오전에 문의", caution: "위치 안내는 지점 주소와 도보 시간만 쓰고 과장하지 않아요.", funnel: { lead: 12, consult: 7, visit: 6, enroll: 6, lost: 5 }, ages: [["20대", "여성", .34], ["30대", "여성", .24], ["20대", "남성", .16], ["30대", "남성", .13], ["40대", "여성", .08], ["40대", "남성", .05]] },
  sw: { title: "영통 오픈을 기다리는 직장인·대학생", who: "수원 영통·매탄 일대. 지점이 오픈 준비 중이라 사전 상담과 체험 수업 안내에 반응해요.", wants: "오픈 기념 혜택, 가까운 위치, 소수정예 수업 방식 설명", messages: ["영통역 도보 5분, 곧 문 열어요", "사전 상담 신청하면 체험 수업 먼저", "오픈 기념 첫 달 안내"], times: "평일 저녁, 주말 낮", caution: "오픈 일정이 바뀔 수 있어 날짜는 확정된 것만 써요.", funnel: { lead: 8, consult: 4, visit: 2, enroll: 1, lost: 4 }, ages: [["20대", "여성", .3], ["30대", "여성", .22], ["20대", "남성", .18], ["30대", "남성", .14], ["40대", "여성", .1], ["40대", "남성", .06]], borrowed: true },
};
function persona(tm, M) {
  const p = PERSONA[tm.k], k = M === 0 ? 1 : .86, f = Object.fromEntries(Object.entries(p.funnel).map(([a, b]) => [a, R(b * k)]));
  return { team_id: tm.id, week: month(M) + "-01", kind: "persona", updated_at: at(M === 0 ? -2 : -33, "09:20"), data: { borrowed: !!p.borrowed, sample: Object.values(f).reduce((a, b) => a + b, 0) * 3, funnel: f, from: day(M === 0 ? -30 : -60), to: day(M === 0 ? -1 : -31),
    leadsByAgeGender: p.ages.map(([age, gender, share]) => ({ age, gender, leads: R(share * 60), share })), persona: { title: p.title, who: p.who, wants: p.wants, messages: p.messages, times: p.times, caution: p.caution } } };
}

t.mk_reports = TM.flatMap((tm) => [
  ...[1, 2, 3, 4].map((w) => weekly(tm, w)),
  persona(tm, 0), persona(tm, -1),
  { team_id: tm.id, week: month(-1) + "-01", kind: "monthly", updated_at: at(-(new Date().getDate() - 1), "09:05"), data: monthly(tm, -1, "full") },
  { team_id: tm.id, week: month(-2) + "-01", kind: "monthly", updated_at: at(-(new Date().getDate() + 29), "09:05"), data: monthly(tm, -2, "full") },
  { team_id: tm.id, week: month(-1) + "-01", kind: "monthly_first", updated_at: at(-(new Date().getDate() + 14), "09:03"), data: monthly(tm, -1, "first") },
]).map((x, i) => ({ id: i + 1, created_at: x.updated_at, ...x }));

t.mk_uploads = [
  { team_id: T.en, kind: "ads_daily", filename: "meta-ads-daily.csv", rows: 412, date_from: day(-28), date_to: day(-1), created_at: at(-1, "08:40") },
  { team_id: T.jp, kind: "ads_daily", filename: "meta-ads-daily.csv", rows: 236, date_from: day(-28), date_to: day(-1), created_at: at(-1, "08:40") },
  { team_id: T.bs, kind: "ads_demo", filename: "meta-ads-age-gender.csv", rows: 188, date_from: day(-28), date_to: day(-1), created_at: at(-8, "09:15") },
  { team_id: T.en, kind: "organic", filename: "instagram-insights.csv", rows: 34, date_from: day(-30), date_to: day(-1), created_at: at(-8, "09:20") },
];

// ═══════════════════════════════ 🔭 마케팅 › 경쟁사 (mkc_*) ═══════════════════════════════
// 경쟁사 이름은 전부 가상. 광고 목록은 경쟁사마다 작은 생성 함수로 만든다.
const libUrl = (id, pid) => pid ? `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=KR&view_all_page_id=${pid}` : "";
const COMP = [
  // [grp, 이름, 지점(team), 상태, 찾은 방법, 광고 수, 가장 오래 도는 일수]
  ["en", "가나다어학원 강남점", T.en, "on", "맥미니 수집기가 찾음", 7, 118],
  ["en", "라마바영어 서울", T.en, "on", "대표가 직접 추가", 5, 74],
  ["en", "사아자 스피킹랩", null, "on", "맥미니 수집기가 찾음", 6, 52],
  ["en", "차카타 English 부산", T.bs, "on", "대표가 직접 추가", 4, 61],
  ["en", "기니디 영어회화 수원", T.sw, "candidate", "키워드 검색에서 올림", 3, 33],
  ["en", "파하 온라인영어", null, "candidate", "키워드 검색에서 올림", 4, 21],
  ["en", "리미비 어학원", null, "off", "맥미니 수집기가 찾음", 2, 9],
  ["jpcn", "도레미일본어 강남", T.jp, "on", "맥미니 수집기가 찾음", 6, 96],
  ["jpcn", "시솔라 중국어학원", T.jp, "on", "대표가 직접 추가", 4, 57],
  ["jpcn", "라시도 JLPT 스터디", null, "candidate", "키워드 검색에서 올림", 3, 38],
  ["jpcn", "니하오 HSK 센터", null, "off", "맥미니 수집기가 찾음", 2, 12],
];
const HOOK = { en: ["회의는 영어인데 말은 안 나오죠?", "퇴근 후 2시간, 영어가 달라져요", "토익은 높은데 회화는 막막하다면", "소수정예 6명, 질문할 시간이 충분해요", "첫 수업은 무료 체험으로 시작하세요", "오픽 IH 목표, 3개월 로드맵 알려드려요", "원어민 말고 '말할 기회'가 중요해요", "이번 달 모집 마감 임박"],
  jpcn: ["JLPT N2, 혼자 하다 막힌 분들께", "여행 일본어 10문장으로 시작해요", "성조가 어렵다면 이렇게 외워 보세요", "HSK 4급까지 한 학기 커리큘럼", "일본어 스터디 모집, 주 2회 저녁", "중국어 회화는 말할수록 늘어요"] };
const BODY = { en: ["퇴근 후 편하게 말할 수 있는 소수정예 영어회화. 첫 수업은 무료로 체험하고, 레벨에 맞는 반을 추천해 드려요.", "문법 설명보다 말하는 시간을 더 많이. 한 반 6명 이하로 운영하고 수업마다 피드백을 드려요.", "오픽·토스 목표 점수에 맞춘 3개월 커리큘럼. 시험 일정에 맞춰 단계별로 준비해요.", "주말 오전반 모집 중입니다. 직장인 수강생이 많아 처음 오셔도 어색하지 않아요."],
  jpcn: ["JLPT N2·N3 대비 문법과 청해를 한 번에. 시험 일정에 맞춰 12주 계획을 짜 드려요.", "여행에서 바로 쓰는 일본어 회화 입문. 히라가나가 처음이어도 괜찮아요.", "HSK 4급까지 성조와 회화를 같이 잡는 소규모 수업을 운영합니다.", "직장인 저녁반, 주 2회 90분. 말하기 비중이 높은 수업이에요."] };
const CTA = ["지금 신청하기", "더 알아보기", "문의하기", "예약하기"];
const MEDIA = ["video", "image", "carousel", "image", "video"];
const FIRSTSEEN = (days) => Math.min(days, 54);

t.mkc_competitors = COMP.map(([grp, page_name, team_id, status, found_by], i) => ({ id: i + 1, grp, page_name, page_id: digits("pg" + page_name, 15), page_url: libUrl(digits("pg" + page_name, 15), digits("pg" + page_name, 15)), team_id, status, note: i === 0 ? "강남 지점 바로 앞 경쟁. 직장인 퇴근 후 각도 계속 테스트 중" : i === 7 ? "JLPT 시즌마다 소재를 바꿔요" : "", found_by, updated_at: at(-(i % 6) - 1, "05:10") }));

const adsList = [];
COMP.forEach(([grp, page_name, , status, , count, oldest], ci) => {
  const r = rng(hash(page_name)), comp = t.mkc_competitors[ci];
  for (let i = 0; i < count; i++) {
    const days = i === 0 ? oldest : Math.max(2, R(oldest * (0.1 + r() * .8) / (1 + i * .3))), hooks = HOOK[grp], bodies = BODY[grp];
    const library_id = digits(page_name + i, 16), multi = days >= 30 && r() < .45, nAds = multi ? 2 + R(r() * 3) : 1;
    adsList.push({ library_id, grp, page_name, page_id: comp.page_id, competitor_id: status === "off" && r() < .5 ? null : comp.id, start_date: day(-days), first_seen: day(-FIRSTSEEN(days)), last_seen: day(0), active: true,
      thumb_path: `mkc/${grp}/${library_id}.jpg`, multi_version: multi, n_ads: nAds, keywords: grp === "en" ? ["영어회화", "성인영어"] : ["일본어회화", "중국어학원"],
      headline: pick(r, hooks), body: `${pick(r, hooks)}\n${pick(r, bodies)}`, description: "무료 체험 신청 받아요", cta: pick(r, CTA), media_type: MEDIA[(ci + i) % MEDIA.length],
      landing_domain: page_name.replace(/[^가-힣A-Za-z]/g, "").length ? `ad-${hash(page_name) % 9000 + 1000}.example` : "", text_hash: code(page_name + i, 8), updated_at: at(0, "05:08") });
  }
});
// 키워드로만 본 페이지 (목록에는 아직 없음) — 광고 2개+ 또는 14일+ 집행
[["en", "미무수 영어교실", 3, 47], ["en", "우유 스피킹", 2, 29], ["jpcn", "타치츠 일본어", 2, 35]].forEach(([grp, page_name, count, oldest]) => {
  const r = rng(hash(page_name));
  for (let i = 0; i < count; i++) { const days = i ? R(oldest / 2) : oldest, library_id = digits(page_name + i, 16);
    adsList.push({ library_id, grp, page_name, page_id: digits("pg" + page_name, 15), competitor_id: null, start_date: day(-days), first_seen: day(-FIRSTSEEN(days)), last_seen: day(0), active: true, thumb_path: `mkc/${grp}/${library_id}.jpg`, multi_version: false, n_ads: 1,
      keywords: ["영어회화"], headline: pick(r, HOOK[grp]), body: `${pick(r, HOOK[grp])}\n${pick(r, BODY[grp])}`, description: "", cta: pick(r, CTA), media_type: MEDIA[i % 4], landing_domain: `ad-${hash(page_name) % 9000 + 1000}.example`, text_hash: code(page_name + i, 8), updated_at: at(0, "05:08") }); }
});
t.mkc_ads = adsList;
DEMO.pk.mkc_ads = ["library_id"];
t.mkc_runs = ["en", "jpcn"].flatMap((grp, gi) => [0, 1, 2].map((k) => ({ id: gi * 3 + (3 - k), grp, run_date: day(-k), status: k === 2 && grp === "jpcn" ? "partial" : "ok", counts: { cards: (grp === "en" ? 58 : 27) + k * 2, new: 3 - k, ended: 1 + (k % 2) }, error: null })));

// 일일 리포트 (최근 7일)
const verdictOf = (a, today) => { const d = dayDiff(a.start_date) * -1; return d >= 30 || a.multi_version || a.n_ads >= 3 ? "core" : d >= 14 ? "proven" : a.first_seen >= addDay(today, -7) ? "new" : "watch"; };
const adCard = (a, compById) => ({ library_id: a.library_id, thumb_path: a.thumb_path, url: `https://www.facebook.com/ads/library/?id=${a.library_id}`, page_name: a.page_name, verdict: a.active === false ? "ended" : verdictOf(a, day(0)), competitor: compById[a.competitor_id]?.status ?? null,
  hook: a.headline, headline: a.headline, days: -dayDiff(a.start_date), media_type: a.media_type, multi_version: a.multi_version, n_ads: a.n_ads, cta: a.cta, landing_domain: a.landing_domain });
const ENDED_NAMES = [["en", "가나다어학원 강남점", "퇴근 후 영어 2시간 집중반"], ["en", "라마바영어 서울", "토요 프리토킹 무료 체험"], ["en", "사아자 스피킹랩", "신규 수강생 첫 달 혜택"], ["jpcn", "도레미일본어 강남", "JLPT 모의고사 이벤트"], ["jpcn", "시솔라 중국어학원", "HSK 접수 대행 안내"]];
const tally = (arr, f) => Object.entries(arr.reduce((o, a) => { const k = f(a); if (k) o[k] = (o[k] || 0) + 1; return o; }, {})).sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
t.mkc_reports = ["en", "jpcn"].flatMap((grp, gi) => {
  const mine = adsList.filter((a) => a.grp === grp), byId = Object.fromEntries(t.mkc_competitors.map((c) => [c.id, c])), on = t.mkc_competitors.filter((c) => c.grp === grp && c.status === "on");
  const daily = [0, 1, 2, 3, 4, 5, 6].map((k) => {
    const date = day(-k), fresh = mine.filter((a) => a.first_seen >= addDay(day(0), -9)), news = fresh.filter((a, i) => i % 7 === k % 7 || (k < 2 && i % 2 === 0)).slice(0, 3), endedAds = ENDED_NAMES.filter((x) => x[0] === grp).slice(0, 1 + (k % 2)).map((x, i) => ({ library_id: digits(x[1] + k + i, 16), thumb_path: `mkc/${grp}/ended${i}.jpg`, page_name: x[1], active: false, start_date: day(-(40 + k + i * 9)), headline: x[2], n_ads: 1, multi_version: false, cta: "신청하기", landing_domain: "", media_type: "image", competitor_id: on[i]?.id }));
    const top = [...mine].sort((a, b) => a.start_date.localeCompare(b.start_date)).filter((a) => !byId[a.competitor_id] || byId[a.competitor_id].status !== "off").slice(0, 5);
    const comps = on.map((c) => { const mc = mine.filter((a) => a.competitor_id === c.id); return { page_name: c.page_name, active: mc.length, new_today: news.filter((a) => a.competitor_id === c.id).length, ended_today: endedAds.filter((a) => a.competitor_id === c.id).length, core: mc.filter((a) => verdictOf(a, day(0)) === "core").length, oldest_days: mc.length ? Math.max(...mc.map((a) => -dayDiff(a.start_date))) : null }; });
    return { grp, kind: "daily", day: date, updated_at: at(-k, "05:22"), data: { flags: k === 6 ? { firstDay: false } : {},
      totals: { active: mine.length, new: news.length, ended: endedAds.length, competitorsOn: on.length, own: grp === "en" ? 6 : 3,
        byMedia: tally(mine, (a) => a.media_type), byCta: tally(mine, (a) => a.cta), byLanding: tally(mine, (a) => a.landing_domain).slice(0, 4) },
      notes: { summary: grp === "en" ? `켜진 경쟁사 ${on.length}곳이 광고 ${mine.length}개를 돌리고 있어요. 이 중 30일 넘게 도는 핵심 소재는 ${mine.filter((a) => verdictOf(a, day(0)) === "core").length}개이고, '퇴근 후'·'소수정예' 각도가 가장 많이 반복돼요.` : `일본어·중국어 그룹은 활성 광고 ${mine.length}개예요. JLPT 접수 시즌이라 시험 관련 소재가 늘고 있어요.`,
        trend: grp === "en" ? ["영상(video) 소재가 절반 가까이이고 첫 3초에 질문을 던지는 구조가 많아요", "CTA는 '지금 신청하기'가 가장 많고, 무료 체험을 앞에 두는 광고가 오래 돌아요", "가나다어학원은 같은 문구를 여러 버전으로 돌리는 중이라 효과가 좋은 소재로 추정돼요"] : ["시험 일정을 앞세운 카드뉴스가 많아요", "중국어는 '성조' 키워드로 호기심을 거는 소재가 늘었어요"], caution: "성과 숫자는 광고 라이브러리에 없어서 집행 기간으로 추정한 값이에요. 샘플 데이터예요." },
      competitors: comps, new: news.map((a) => adCard(a, byId)), ended: endedAds.map((a) => adCard(a, byId)), top: top.map((a) => adCard(a, byId)) } };
  });
  const L = (i) => mine[i]?.library_id;
  const ideasEn = [
    { title: "퇴근 후 2시간, 질문으로 시작하는 영상", team: "서울영어점", format: "영상 15초", why: "경쟁사 장수 소재 대부분이 퇴근 후 시간대를 앞세워요. 우리는 '1:1 언어교환'을 같이 보여 차별화해요.", hook: "회의는 영어인데, 퇴근하고도 말이 안 나오죠?", copy: { body: "퇴근 후 2시간, 6명 이하 소수정예로 말하는 시간을 늘려요.\n1:1 언어교환까지 같이 하니까 처음 오셔도 어색하지 않아요.\n첫 수업은 무료로 체험해 보세요.", headline: "퇴근 후 소수정예 영어회화", description: "강남역 도보 3분 · 무료 체험", cta: "지금 신청하기" }, target: { objective: "잠재고객", age: "28–39", gender: "전체", location: "서울 강남구 반경 3km", interests: ["영어 학습", "자기계발", "직장인"], placements: "인스타그램 릴스·피드", budget: "일 $8", audience: "웹사이트 방문자 제외" }, production: "수업 장면 3컷 + 질문 자막. 얼굴은 동의받은 분만, 나머지는 블러 처리.", refs: [{ library_id: L(0), page_name: "가나다어학원 강남점" }, { library_id: L(8), page_name: "라마바영어 서울" }], ours: ["[영어] 직장인 퇴근 후 회화 영상: 4주 예약당 비용 지점 평균 이하"] },
    { title: "오픽 IH 목표, 3개월 로드맵 카드뉴스", team: "서울영어점", format: "카드뉴스 6장", why: "시험 목표형 소재는 오래 도는 경향이 있고, 우리 '오픽 후기' 소재는 저장률이 높았어요.", hook: "3개월 뒤 오픽 IH, 어디서부터 시작할까요?", copy: { body: "오픽 IH를 목표로 하는 분들을 위한 3개월 로드맵.\n1개월차 말하기 기본기, 2개월차 롤플레이, 3개월차 모의 인터뷰.\n레벨 테스트 후 나에게 맞는 반을 추천해 드려요.", headline: "오픽 3개월 로드맵", description: "저장해 두고 하나씩 따라 해 보세요", cta: "더 알아보기" }, target: { objective: "트래픽", age: "24–35", gender: "전체", location: "서울 전역", interests: ["OPIc", "토익스피킹"], placements: "인스타그램 피드", budget: "일 $5" }, production: "카드뉴스 6장 (표지·월별 3장·체크리스트·신청 안내). 퍼플/옐로 템플릿.", refs: [{ library_id: L(2), page_name: "가나다어학원 강남점" }], ours: ["오가닉: 오픽 루틴 게시물 저장+공유율 상위"] },
    { title: "주말반 모집 — 마감 날짜를 넣은 이미지", team: "부산점", format: "이미지 1장", why: "주말 문의가 늘어나는 시기인데, 경쟁사 주말반 광고에는 마감 일자가 없어요.", hook: "이번 주말반, 6자리 남았어요", copy: { body: "서면역 7번 출구 앞, 토요일 오전 프리토킹반.\n한 반 6명, 모집 마감은 이번 주 금요일이에요.\n무료 체험 신청하고 분위기부터 확인해 보세요.", headline: "서면 주말 프리토킹반", description: "무료 체험 신청", cta: "신청하기" }, target: { objective: "잠재고객", age: "25–40", gender: "전체", location: "부산 부산진구 반경 4km", interests: ["영어 회화", "주말 취미"], placements: "인스타그램·페이스북 피드", budget: "일 $6" }, production: "수업 분위기 사진 1장 + 마감 날짜 배지.", refs: [{ library_id: L(18), page_name: "차카타 English 부산" }], ours: ["[영어] 주말 프리토킹: 판단 보류(표본 부족)"] },
    { title: "오픈 사전 상담 이벤트 숏폼", team: "수원점", format: "영상 10초", why: "수원점은 오픈 준비 중이라 사전 상담 확보가 목표예요. 경쟁사는 오픈 전 광고가 거의 없어요.", hook: "영통에 영어회화 센터가 생겨요", copy: { body: "영통역 도보 5분, 소수정예 영어회화 센터가 곧 문을 열어요.\n사전 상담을 남겨 주시면 체험 수업을 먼저 안내해 드려요.", headline: "영통 오픈 사전 상담", description: "오픈 기념 체험 수업", cta: "문의하기" }, target: { objective: "잠재고객", age: "25–40", gender: "전체", location: "수원 영통구 반경 3km", interests: ["영어 학습"], placements: "인스타그램 릴스", budget: "일 $4", note: "오픈 일자는 확정 후 문구에 추가" }, production: "공사 중 공간 + 완공 예정 이미지 합성, 자막 위주.", refs: [{ library_id: L(22), page_name: "기니디 영어회화 수원" }], ours: [] },
  ];
  const ideasJp = [
    { title: "JLPT N2, 12주 계획표 카드뉴스", team: "서울일중점", format: "카드뉴스 5장", why: "접수 시즌이라 시험 일정을 앞세운 소재가 늘었어요. 우리는 '주차별 계획표'로 저장을 유도해요.", hook: "N2 접수 전에 이것만 정리하세요", copy: { body: "JLPT N2 12주 계획표를 공유해요.\n문법·독해·청해를 주차별로 나누고, 약한 부분은 소규모 수업에서 보완해요.\n레벨 테스트는 무료예요.", headline: "JLPT N2 12주 계획", description: "무료 레벨 테스트", cta: "더 알아보기" }, target: { objective: "트래픽", age: "20–35", gender: "전체", location: "서울 강남·서초", interests: ["JLPT", "일본어 공부"], placements: "인스타그램 피드", budget: "일 $5" }, production: "카드뉴스 5장 (표지·주차표 3장·신청).", refs: [{ library_id: L(0), page_name: "도레미일본어 강남" }], ours: ["[일본어] JLPT N2 합격반 영상: 계속"] },
    { title: "성조 외우기 15초 영상", team: "서울일중점", format: "영상 15초", why: "'성조' 호기심 각도가 늘고 있어서, 쉬운 암기법으로 차별화해요.", hook: "성조, 손동작으로 외우면 쉬워요", copy: { body: "중국어 4성, 손동작으로 외우는 법을 알려드려요.\n수업에서는 이런 방법으로 말하기까지 이어가요.", headline: "중국어 성조 10초 정리", description: "무료 체험 수업", cta: "지금 신청하기" }, target: { objective: "잠재고객", age: "20–34", gender: "전체", location: "서울 강남구", interests: ["중국어 배우기", "HSK"], placements: "인스타그램 릴스", budget: "일 $4" }, production: "강사 손동작 클로즈업 (얼굴 제외).", refs: [{ library_id: L(7), page_name: "시솔라 중국어학원" }], ours: [] },
    { title: "여행 일본어 10문장 저장용 이미지", team: "서울일중점", format: "이미지 1장", why: "여행 시즌 직전에는 저장·공유가 잘 나와요.", hook: "일본 가기 전에 이 10문장만", copy: { body: "여행에서 바로 쓰는 일본어 10문장.\n저장해 두고 공항에서 꺼내 보세요.", headline: "여행 일본어 10문장", description: "수업 문의는 프로필 링크로", cta: "더 알아보기" }, target: { objective: "트래픽", age: "20–40", gender: "전체", location: "서울 전역", interests: ["일본 여행"], placements: "인스타그램 피드·스토리", budget: "일 $3" }, production: "표 형태 이미지 1장.", refs: [], ours: [] },
  ];
  const creative = [0, 1, 2].map((k) => {
    const ideas = (grp === "en" ? ideasEn : ideasJp).slice(0, grp === "en" ? 4 - (k > 1 ? 1 : 0) : 3);
    const same = ideas.length > 1 ? [{ idea: 1, level: "info", msg: `${ideas[1].title}: ${grp === "en" ? "가나다어학원 강남점" : "도레미일본어 강남"} 광고와 비슷한 표현이 있어요 (유사도 38%)`, library_id: L(0) }] : [];
    const warn = grp === "en" ? [{ idea: 0, level: "warn", msg: "퇴근 후 2시간, 영어가 달라져요 — 유사도 62%로 경쟁사 문구와 거의 같아요. 구조만 가져오고 문장은 새로 쓰세요", library_id: L(1) }] : [];
    return { grp, kind: "creative", day: monday(-k), updated_at: at(-k * 7 - (dow(day(0)) + 6) % 7, "05:40"), data: { notes: { summary: grp === "en" ? "경쟁사가 오래 돌리는 '퇴근 후'·'소수정예' 각도에 우리 1:1 언어교환을 겹친 소재 위주로 골랐어요." : "시험 일정과 성조 호기심, 두 가지 각도로 3개를 골랐어요.", caution: "광고 집행은 대표님이 광고관리자에서 직접 해요. 샘플 추천이에요." }, ideas, warnings: [...warn, ...same] } };
  });
  return [...daily, ...creative];
}).map((x, i) => ({ id: i + 1, ...x }));

// ═══════════════════════════════ 🤖 마케팅 › 에이전트 · 📈 트렌드 (mka_items) ═══════════════════════════════
const A = [];
const item = (kind, key, status, data, updated_at = new Date().toISOString()) => A.push({ id: A.length + 1, kind, key, status, data, updated_at });
item("control", "kill", "off", {});
// 상위 광고 (최근 72시간 안에 올라온 것만 화면에 나온다)
[["[영어] 직장인 퇴근 후 회화 영상", 31, 5.4, 168], ["[영어] 1:1 언어교환 체험 신청", 22, 7.1, 157], ["[일본어] JLPT N2 합격반 영상", 18, 6.3, 113], ["[영어] 서면 직장인 회화 영상", 15, 6.9, 104], ["[중국어] HSK 입문 직장인", 11, 8.2, 90], ["[영어] 오픈 사전예약 이벤트", 9, 5.6, 51]]
  .forEach(([name, leads, cpl, spend], i) => item("topad", "top" + i, "on", { name, link: `https://www.facebook.com/ads/library/?id=${digits(name, 16)}`, image: thumb(i), leads, cpl, spend, status: i === 5 ? "학습 중" : "게재 중" }));
// 광고 제안 (승인 단계별로 한 장씩)
const PROPS = [
  ["P-0436", "pending", { branch: "DAEGUDSR", angle: "퇴근 후 2시간 · 소수정예", hook: "회의는 영어인데, 퇴근하고도 말이 안 나오죠?", headline: "퇴근 후 소수정예 영어회화", replaces_ad_name: "[영어] 주말반 모집 이미지", experiment: "첫 3초를 질문형으로 바꿔 리드당 비용을 비교해요 (일 $8, 7일)", draft_name: "[영어] 질문형 훅 A_1103", trend_refs: [{ library_id: digits("trend-a", 16), page_name: "스터디카페 어반", image: thumb(3), why: "공부 장면을 3초 안에 보여 주는 구조" }] }],
  ["P-0435", "pending", { branch: "ULSAN", angle: "서면 주말 프리토킹", hook: "이번 주말반, 6자리 남았어요", headline: "서면 주말 프리토킹반", replaces_ad_name: "[영어] 주말 프리토킹", experiment: "마감 날짜 배지를 넣은 이미지 vs 기존 이미지 (일 $6)", draft_name: "[영어] 마감 배지_1103", trend_refs: [] }],
  ["P-0432", "approved", { branch: "DAEGUJPCH", angle: "JLPT 12주 계획표", hook: "N2 접수 전에 이것만 정리하세요", headline: "JLPT N2 12주 계획", replaces_ad_name: "[중국어] 여행회화 캐러셀", experiment: "카드뉴스 저장률과 리드당 비용 비교", draft_name: "[일본어] 12주 계획표_1031", stage: "drafted", trend_refs: [{ library_id: digits("trend-b", 16), page_name: "클래스링크", image: thumb(4), why: "주차별 체크리스트로 저장 유도" }] }],
  ["P-0430", "approved", { branch: "ULSAN", angle: "서면 오픽 입문", hook: "오픽, 첫 시험 전에 이것부터", headline: "오픽 입문 3주 코스", replaces_ad_name: "[영어] 토익스피킹 단기반", experiment: "시험 일정 문구 유무 비교", draft_name: "[영어] 오픽 입문_1030", trend_refs: [] }],
  ["P-0428", "activate", { branch: "DAEGUDSR", angle: "1:1 언어교환 체험", hook: "원어민 말고 '말할 기회'가 중요해요", headline: "1:1 언어교환 무료 체험", replaces_ad_name: "[영어] 소수정예 스터디 카드뉴스", experiment: "체험 신청 폼 단축 버전", draft_name: "[영어] 언어교환 체험_1029", stage: "drafted", trend_refs: [] }],
  ["P-0424", "approved", { branch: "DAEGUDSR", angle: "오픽 IH 후기형", hook: "3개월 뒤 오픽 IH, 어떻게 가능했을까요?", headline: "오픽 IH 3개월 로드맵", replaces_ad_name: "", experiment: "후기형 vs 정보형", draft_name: "[영어] 오픽 로드맵_1027", stage: "live", trend_refs: [] }],
  ["P-0420", "rejected", { branch: "ULSAN", angle: "수강료 할인 강조", hook: "이번 달만 할인", headline: "11월 할인", replaces_ad_name: "", experiment: "가격 문구 테스트", draft_name: "", trend_refs: [] }],
];
PROPS.forEach(([key, status, d], i) => item("proposal", key, status, { ...d, image: thumb(i + 2) }, at(-i, "10:30")));
// 스레드: 올라간 글 / 대기 글
const TH = [
  ["DAEGUDSR", "오늘 영어로 한 문장만 말해 보세요.\n'I'm trying to get better at speaking.' 이 한 문장이 시작이에요.", -1],
  ["DAEGUJPCH", "JLPT 접수 시즌! N2 문법은 접속 표현부터 정리하면 속도가 붙어요.\n오늘의 한 줄: 〜にもかかわらず", -2],
  ["ULSAN", "퇴근길에 3분, 소리 내어 읽기 5문장.\n입이 풀리면 말이 먼저 나와요.", -3],
  ["DAEGUDSR", "처음 온 분이 가장 많이 하는 말: '저 영어 진짜 못 하는데 괜찮을까요?'\n괜찮아요, 그래서 소수정예예요.", -5],
  ["DAEGUJPCH", "성조는 외우는 게 아니라 '손으로 그리면' 쉬워져요. 4성을 손동작으로 연습해 보세요.", -6],
];
TH.forEach(([branch, text, d], i) => item("thread", "th" + (i + 1), "posted", { branch, text, posted_at: at(d, "12:05"), permalink: `https://www.threads.net/@pallo_demo/post/${code("th" + i, 11)}` }, at(d, "12:06")));
[["DAEGUDSR", "공감형", "회화는 '아는 것'보다 '입 밖으로 꺼내는 횟수'가 더 중요해요. 오늘 퇴근길에 한 번만 소리 내어 말해 보세요."], ["ULSAN", "질문형", "여러분이 영어로 가장 처음 해 보고 싶은 말은 뭐예요? 댓글로 알려 주세요, 수업 때 같이 연습해 봐요."], ["DAEGUJPCH", "정보형", "JLPT N2 청해는 '선택지 먼저 읽기'만 해도 정답률이 올라요. 내일 12시에 더 자세히 정리해서 올릴게요."]]
  .forEach(([branch, angle, text], i) => item("thread", "rd" + (i + 1), "ready", { branch, angle, text }, at(0, "07:" + (10 + i))));

// 트렌드 (월요일마다 에이전트가 모아 오는 업종 밖 광고·릴스·쇼츠·틱톡)
const NOW = new Date().toISOString();
[["#공부자극 챌린지 7일차", "#챌린지", 18420, 312], ["하루 10분 습관 만들기", "#갓생", 12100, 205], ["밈으로 배우는 영어 표현", "#영어공부", 9860, 188], ["아침 루틴 브이로그", "#릴스", 8730, 97], ["스터디 위드 미 2시간", "#공부자극", 7420, 120], ["퇴근 후 취미 3가지", "#갓생", 6500, 88], ["30일 챌린지 결과", "#챌린지", 5890, 143], ["웃긴 회의 영어 모음", "#밈", 5400, 76]]
  .forEach(([caption, tag, likes, comments], i) => item("trend", "ig:" + code("ig" + i, 11), "on", { src: "ig", rank: i + 1, caption, tag, likes, comments, image: thumb(i), collected: NOW }));
[["한국 직장인 영어회화 챌린지", "스터디톡", 428000, 12400, 38], ["하루 5분 중국어 성조", "차이나로그", 312000, 9100, 44], ["출근 전 10분 루틴", "루틴연구소", 287000, 8800, 31], ["일본어 여행회화 쇼츠", "도쿄메이트", 251000, 7300, 52], ["영어 면접 밈 모음", "취준일기", 198000, 6100, 27], ["30일 습관 챌린지", "갓생러", 176000, 5400, 41]]
  .forEach(([title, channel, views, likes, duration_s], i) => item("trend", "yt:" + code("yt" + i, 11).replace(/[^\w-]/g, "a"), "on", { src: "yt", rank: i + 1, title, channel, views, likes, duration_s, image: thumb(i + 1), collected: NOW }));
[["공부자극", "1.2만", "340만", "교육"], ["갓생챌린지", "9,800", "280만", "라이프"], ["영어표현", "7,400", "190만", "교육"], ["퇴근후취미", "6,100", "150만", "라이프"], ["일본여행", "5,500", "410만", "여행"], ["30일챌린지", "4,900", "120만", "라이프"]]
  .forEach(([tag, posts, views, cat], i) => item("trend", "tt:" + (7400000000000000000n + BigInt(i * 1371)).toString(), "on", { src: "tt", rank: i + 1, tag: "#" + tag, posts, views, cat, vids: [], image: thumb(i + 2), collected: NOW }));
[["스터디카페 어반", "공부 장면을 3초 안에", "오늘부터 달라지는 1시간", 64, 4, "video"], ["클래스링크", "퇴근 후 취미 클래스", "원데이 클래스 첫 수업 무료", 48, 3, "image"], ["북클럽 마루", "한 달에 책 두 권", "독서모임 첫 달 무료 참여", 91, 5, "carousel"], ["핏데이", "운동 습관 만들기", "하루 20분 홈트 루틴", 37, 2, "video"], ["다이어트랩", "30일 변화 기록", "30일 챌린지 참가자 모집", 72, 6, "image"], ["온라인 클래스 모아", "퇴근 후 자기계발", "강의 3개 구독 시 혜택", 53, 3, "carousel"]]
  .forEach(([page_name, hook, headline, days, n_ads, media_type], i) => item("trend", digits("ad" + page_name, 16), "on", { rank: i + 1, page_name, hook, headline, days, n_ads, media_type, image: thumb(i + 4), collected: NOW }));
t.mka_items = A;

// ═══════════════════════════════ ✍️ 블로그 (blog_*) · blog-write 함수 ═══════════════════════════════
const BLOG_MAIN = { en: "서울 영어회화", jp: "서울 일본어학원", bs: "부산 영어회화", sw: "수원 영어회화" };
const KIND_OF = (o = {}) => (o.concept === "event" || o.concept === "opening" || o.preset === "news" ? "event" : o.concept === "tip" || o.concept === "exam" || o.preset === "exam" || o.preset === "column" ? "tip" : "class");
// 글 하나: 지점·종류·키워드 → 제목 5안 · 대표 사진 문구 · 본문 블록 · 해시태그
function article(tm, kind, kw, o = {}) {
  const sub = tm.k === "jp" ? "일본어·중국어" : tm.k === "bs" ? "영어회화·일본어" : "영어회화", nPhoto = o.photos ?? 3;
  const T5 = { class: [`${kw}, 퇴근 후 소수정예 수업은 이렇게 진행돼요`, `퇴근하고 ${kw} 찾는다면 수업 현장부터 먼저 보세요`, `${kw} 소수정예, 실제 수업은 이렇게 진행돼요`, `처음 와도 어색하지 않은 ${kw} 수업`, `${kw} 고민 중이라면 — ${tm.name} 수업 스케치`],
    tip: [`${kw} 시작하기 전에 꼭 알아둘 3가지 기준`, `${kw}, 학원 고르기 전 체크리스트`, `혼자 하다 막힌 ${kw}, 이렇게 풀어 봤어요`, `${kw} 3개월 루틴 만들기`, `${kw} 준비하는 분들께 드리는 작은 팁`],
    event: [`${kw}, 이번 달 신규 반 모집 안내와 무료 체험`, `${kw} 새 반 모집합니다 — 무료 체험 있어요`, `${tm.name} ${kw} 신규반 오픈 소식`, `${kw} 체험 수업 신청하세요`, `${tm.spot}, ${kw} 새 반이 열려요`] }[kind];
  const PA = { class: [
      `${kw}를 알아보고 계신가요? 오늘은 ${tm.name}에서 진행한 저녁 수업 풍경을 가볍게 소개해 드릴게요.`,
      `수업은 한 반 6명 이하로 진행돼요. 강사가 설명하는 시간보다 수강생이 직접 말하는 시간이 더 길도록 짜 두었어요.`,
      `처음 오신 분들이 가장 많이 하시는 걱정은 '내가 너무 못 말하면 어쩌지'예요. 그래서 첫 10분은 서로 이름과 오늘의 기분을 말해 보는 워밍업으로 시작해요.`,
      `수업 후반에는 1:1 언어교환 시간이 있어요. 짝을 바꿔 가며 같은 주제를 두세 번 말해 보면, 처음엔 막히던 문장이 점점 매끄러워져요.`,
      `${kw}를 고를 때는 수업 인원, 말하는 시간, 피드백 방식을 꼭 비교해 보세요. 인원이 많으면 한 사람이 말할 기회가 줄어들고, 피드백이 늦으면 같은 실수를 반복하기 쉬워요.`,
      `저희 수업은 매 시간 끝에 강사가 한 사람씩 짧게 피드백을 드려요. 틀린 표현을 지적하기보다 더 자연스러운 표현을 하나씩 알려 드리는 방식이라 부담이 적어요. 수강생분들이 가장 만족하시는 부분이기도 해요.`,
      `수강생 대부분은 퇴근 후에 오시는 직장인이에요. 비슷한 처지의 분들과 함께하니 서로 자극이 되고, 수업이 끝나면 함께 복습 자료를 나누기도 해요. ${kw} 수업이 처음이어도 금방 분위기에 익숙해지실 거예요.`,
      `${sub}은 결국 말해 본 횟수가 실력이에요. 퇴근 후 부담 없이 들를 수 있도록 ${tm.spot} 거리에 있어요.`,
      `궁금한 점은 편하게 문의해 주세요. 첫 수업은 무료로 체험해 보실 수 있어요.`],
    tip: [
      `${kw}를 시작하려는 분들이 가장 먼저 부딪히는 건 '어디서부터 해야 할지 모르겠다'는 막막함이에요.`,
      `첫째, 목표를 숫자로 정해 보세요. 점수든 횟수든, 3개월 뒤의 모습을 한 줄로 적어 두면 공부 방향이 달라져요.`,
      `둘째, 듣기보다 말하기 비중을 늘려 보세요. 하루 5분이라도 소리 내어 말하면 입이 먼저 풀려요.`,
      `셋째, 같이 말할 사람을 찾으세요. 혼자 하면 3주를 넘기기 어려워요. 소규모 스터디나 언어교환이 도움이 돼요.`,
      `넷째, 틀리는 걸 두려워하지 마세요. ${kw}는 실수를 줄이는 공부가 아니라 실수를 많이 해 보는 공부예요. 안전한 분위기에서 틀려 볼 기회가 많을수록 실제 상황에서 입이 먼저 열려요.`,
      `마지막으로 기록을 남기세요. 일주일에 한 번, 오늘 말해 본 문장을 세 개만 적어 두면 한 달 뒤에 눈에 보이는 변화를 확인할 수 있어요. ${kw}를 꾸준히 이어 가는 가장 쉬운 방법이에요.`,
      `${tm.name}에서는 레벨 테스트 후 나에게 맞는 반을 추천해 드려요. 부담 없이 상담받아 보세요.`],
    event: [
      `${tm.name}에서 새 반 수강생을 모집해요. ${kw}를 알아보고 계신 분들께 소식 전합니다.`,
      `모집 대상은 퇴근 후나 주말에 말하기 연습이 필요한 성인이에요. 한 반 6명 이하 소수정예로 운영해요.`,
      `수업 시간은 평일 저녁반과 토요일 오전반 중에서 고를 수 있어요. 시간표는 상담 때 자세히 안내해 드려요.`,
      `첫 수업은 무료 체험이에요. 분위기를 보고 결정하셔도 괜찮아요.`,
      `이번 모집에서는 ${kw}에 관심 있는 분들을 위해 수업 구성도 조금 바꿨어요. 말하기 비중을 높이고, 수업마다 오늘의 표현을 하나씩 정리해 가져가실 수 있게 했어요. 시험 준비가 목표라면 상담 때 말씀해 주세요.`,
      `수강생분들이 자주 물어보시는 질문도 정리해 드려요. 레벨이 낮아도 괜찮은지, 중간에 시간표를 바꿀 수 있는지, 결석하면 보충이 가능한지 등은 상담 때 자세히 안내해 드려요.`,
      `위치는 ${tm.spot}예요. 네이버 예약이나 카카오톡 채널로 문의해 주세요.`] }[kind];
  const blocks = [], push = (b) => blocks.push({ text: "", photo: 0, caption: "", pid: 0, ...b });
  let ph = 0;
  if (o.topic) push({ type: "text", text: `오늘의 주제: ${o.topic}` });
  PA.forEach((p, i) => {
    push({ type: "text", text: p });
    if (i === 1 && kind === "class") push({ type: "quote", text: "“말은 아는 만큼이 아니라, 말해 본 만큼 늘어요.”" });
    if (ph < nPhoto && i < PA.length - 1) { ph++; push({ type: "photo", photo: o.photos ? ph : 0, text: ["수업 현장 전경", "짝 활동 장면", "교재와 필기구", "교실 입구"][ph - 1] ?? "수업 사진", caption: ["오늘 수업은 이런 분위기였어요", "짝을 바꿔 가며 말해 보는 시간", "교재는 수업 때 함께 준비해요", ""][ph - 1] ?? "" }); }
  });
  if (o.facts) push({ type: "text", text: `안내: ${o.facts}`, });
  push({ type: "divider" }); push({ type: "map" });
  const base = kw.replace(/\s/g, "");
  return { titles: T5, sel: 0, thumbnail_texts: ["소수정예 수업 현장", `${tm.area} 퇴근 후 수업`, "첫 수업 무료 체험"], main_keyword: kw, sub_keywords: [`${tm.area}${tm.subs[0]}`, `${tm.area} 성인영어`, "언어교환"].slice(0, tm.k === "jp" ? 2 : 3),
    blocks, hashtags: ["팔로", base, `${tm.area}${tm.subs[0].replace("·", "")}`, "소수정예", "언어교환", "성인어학원", "퇴근후공부", "회화스터디"],
    self_review: `- 메인 키워드 '${kw}'를 제목·첫 문단·마무리에 자연스럽게 배치했어요.\n- 과장·보장 표현과 확인되지 않은 후기·점수는 넣지 않았어요.\n- 문단 길이와 사진 간격을 고르게 맞췄어요. 사진 위치는 끌어서 바꿀 수 있어요.\n- 샘플 글이에요 — 체험판에서는 AI가 실제로 실행되지 않아요.` };
}
const plain = (p) => p.blocks.filter((b) => b.type === "text" || b.type === "quote").map((b) => b.text).join("\n\n");

t.blog_profiles = TM.map((tm) => ({ team_id: tm.id, data: { hours: "평일 10:00–22:00 · 토 10:00–18:00 · 일 휴무", contact: "네이버 예약 · 카카오톡 채널 상담", notes: tm.k === "sw" ? "오픈 준비 중 — 오픈 소식·사전 상담 위주" : "소수정예(6명 이하)와 1:1 언어교환을 꼭 언급" }, updated_at: at(-30, "11:00") }));
DEMO.pk.blog_profiles = ["team_id"]; DEMO.pk.blog_prefs = ["user_id"]; DEMO.pk.blog_limits = ["team_id"];
t.blog_prefs = []; t.blog_limits = TM.map((tm) => ({ team_id: tm.id, daily: 10 }));
t.blog_styles = [{ id: 1, name: "친근한 수업 스케치", team_id: null, created_at: at(-20) }, { id: 2, name: "정보형 체크리스트", team_id: T.en, created_at: at(-12) }];

// 보관함: 지점마다 3~6개 (발행함 / 초안)
const BP = [["en", "class", "서울 영어회화", 1, 12], ["en", "tip", "서울 성인영어", 1, 9], ["en", "event", "강남 영어회화", 1, 6], ["en", "tip", "강남 오픽학원", 0, 4], ["en", "class", "서울 토익스피킹", 0, 2], ["en", "event", "서울 영어회화", 0, 1],
  ["jp", "tip", "서울 JLPT", 1, 10], ["jp", "class", "서울 일본어학원", 1, 7], ["jp", "event", "강남 중국어학원", 0, 3], ["jp", "tip", "서울 HSK", 0, 1],
  ["bs", "class", "부산 영어회화", 1, 11], ["bs", "event", "서면 영어학원", 1, 5], ["bs", "tip", "부산 일본어학원", 0, 3], ["bs", "class", "서면 성인영어", 0, 1],
  ["sw", "event", "수원 영어회화", 0, 6], ["sw", "event", "영통 영어학원", 0, 2], ["sw", "tip", "수원 성인영어", 0, 1]];
t.blog_posts = BP.map(([k, kind, kw, pub, ago], i) => { const tm = TMK[k], post = article(tm, kind, kw, { photos: 3 }); return { id: i + 1, team_id: tm.id, title: post.titles[0], keyword: kw, body: plain(post), post: { ...post, opts: { mode: "photo", concept: kind === "class" ? "class" : kind === "event" ? "event" : "tip", preset: kind === "tip" ? "checklist" : "news", main_keyword: kw, sub_keywords: [] } }, status: pub ? "published" : "draft", url: pub ? `https://blog.naver.com/pallo_${k}/2230${String(20000 + hash(kw + i) % 70000)}` : null, created_at: at(-ago, "14:20"), updated_at: at(-ago, "15:05") }; });
// 사용량 (대표만 보는 탭): 이번 달 생성 기록
t.blog_gens = TM.flatMap((tm, ti) => Array.from({ length: 5 + ti * 2 }, (_, i) => ({ id: ti * 20 + i + 1, team_id: tm.id, kind: ["write", "write", "keywords", "convert", "sns", "style"][i % 6], cost_usd: [.21, .19, .01, .03, .06, .08][i % 6], created_at: at(-Math.min(i, new Date().getDate() - 1), "10:" + String(10 + i)) })));
try { localStorage.setItem("bl-open", JSON.stringify({ id: 1, team: T.en, at: Date.now() })); } catch {} // 블로그 탭을 열면 서울영어점 최근 글이 펼쳐져 있게

// ── Edge Function: blog-write (블로그·게시물 공용). 체험판은 샘플 글만 돌려준다 ──
const quota = { limit: 10, used: 3 };
const KWBASE = { en: ["영어회화", "영어회화학원", "성인영어", "오픽학원", "토익스피킹", "영어학원", "토플학원", "아이엘츠", "영어스터디", "직장인영어"], jp: ["일본어학원", "중국어학원", "일본어회화", "중국어회화", "JLPT", "HSK", "일본어스터디", "직장인일본어"], bs: ["영어회화", "영어학원", "성인영어", "일본어학원", "오픽", "토익스피킹", "직장인영어"], sw: ["영어회화", "영어학원", "성인영어", "오픽", "직장인영어"] };
const AREAS = { en: ["서울", "강남", "역삼"], jp: ["서울", "강남"], bs: ["부산", "서면", "전포"], sw: ["수원", "영통"] };
const SEAS = [60, 72, 85, 70, 55, 52, 58, 68, 60, 56, 62, 66]; // 달별 검색 추이 (1월~12월)
const tr12 = (kw) => { const r = rng(hash(kw)); const raw = Array.from({ length: 12 }, (_, i) => { const mm = +month(-11 + i).slice(5); return SEAS[mm - 1] * (.82 + r() * .3); }); return raw; };
const TOPT = ["후기", "추천", "수강료", "비교", "현장", "스케치", "정리", "후기 모음", "가는 길", "체험기"], BLOG = ["영어톡톡", "하루한마디", "직장인말하기", "언어교환러", "회화노트", "스터디일기", "말문트기", "퇴근후공부"];
const SNS_TONE = { friendly: "~해요", polite: "~합니다" };
fn["blog-write"] = (b) => {
  const tm = tmOf(b.team_id), a = b.action, o = b.options ?? {};
  try {
    if (a === "usage") return { quota: { ...quota } };
    if (a === "write") {
      quota.used++;
      const kw = o.main_keyword?.trim() || BLOG_MAIN[tm.k], post = article(tm, KIND_OF(o), kw, { photos: (b.photos ?? []).length ? Math.min(b.photos.length, 6) : 2, topic: o.mode === "topic" ? o.topic : "", facts: o.facts?.trim() });
      if (!(b.photos ?? []).length) post.blocks.forEach((x) => { if (x.type === "photo") x.photo = 0; });
      return { post, quota: { ...quota } };
    }
    if (a === "keywords") {
      const hints = (b.hints ?? []).map((h) => String(h).replace(/\s/g, "")), r = rng(hash(tm.k + hints.join()));
      const list = [...new Set([...hints, ...AREAS[tm.k].flatMap((ar) => KWBASE[tm.k].map((w) => ar + w))])];
      return { keywords: list.map((keyword) => ({ keyword, total: R(40 + r() * (/영어회화|일본어학원/.test(keyword) ? 900 : 260)), comp: pick(r, ["낮음", "중간", "중간", "높음"]) })) };
    }
    if (a === "research") {
      const kws = (b.keywords ?? []).slice(0, 5), series = kws.map((k) => tr12(k)), mx = Math.max(...series.flat());
      const trend = kws.map((keyword, i) => ({ keyword, data: series[i].map((v, j) => ({ month: month(-11 + j), ratio: R(v / mx * 100) })) }));
      const kw0 = kws[0] ?? BLOG_MAIN[tm.k], r = rng(hash(kw0));
      return { trend, top: { total: 8000 + R(r() * 40000), items: Array.from({ length: 10 }, (_, i) => ({ title: `${kw0} ${TOPT[i]} — ${["직접 다녀온", "솔직한", "정리해 본", "꼼꼼히 비교한", "이번 달"][i % 5]} 이야기`, link: `https://blog.naver.com/${["engtalk", "daily_voice", "speakup_k", "study_note", "talk_more"][i % 5]}/${220000000 + i * 137}`, blogger: BLOG[i % BLOG.length], date: day(-(3 + i * 4)).replace(/-/g, ""), desc: `${kw0}에 대해 찾아보다가 직접 알아본 내용을 정리했어요. 수업 방식과 분위기, 위치, 체험 수업 여부까지 비교해 봤습니다...` })) } };
    }
    if (a === "similar") return { matches: [{ score: 8, team: TM[(TM.indexOf(tm) + 1) % 4].name, title: "퇴근 후 회화 수업 스케치", date: day(-9) }] };
    if (a === "convert") {
      const title = b.title ?? "", tags = "#팔로 #소수정예 #언어교환 #퇴근후공부 #회화스터디";
      return { channels: { instagram: `${title}\n\n퇴근 후 부담 없이 말해 보는 시간.\n한 반 6명 이하, 1:1 언어교환까지.\n첫 수업은 무료 체험이에요.\n\n${tags}`, kakao: `[${tm.name}] ${title}\n\n소수정예 수업과 1:1 언어교환으로 말하는 시간을 늘렸어요.\n첫 수업은 무료 체험! 아래 버튼으로 편하게 문의해 주세요.` }, quota: { ...quota, used: ++quota.used } };
    }
    if (a === "style") { const style = { id: nextId(t.blog_styles), name: "샘플 스타일 (체험판)", team_id: b.shared ? null : tm.id }; t.blog_styles.push({ ...style, created_at: new Date().toISOString() }); return { style, quota: { ...quota, used: ++quota.used } }; }
    if (a === "sns") {
      quota.used++;
      const topic = (b.topic ?? "").trim() || "이번 주 수업 스케치", pol = b.tone === "polite", e = pol ? "습니다" : "요";
      const sp = snsText(tm, topic, pol);
      return { result: { draft: sp.draft, self_review: `- 사진 ${(b.photos ?? []).length}장과 주제를 바탕으로 썼어요 (체험판 샘플).\n- 과장·보장 표현은 넣지 않았어요.`, instagram: { caption: sp.ig, hashtags: igTags(tm) }, google: { body: sp.google, type: "standard", button: "learn_more" }, naver: { title: sp.nTitle, body: sp.nBody } }, quota: { ...quota } };
    }
    if (a === "deco") {
      const L = { en: ["purple", "vivid", "💬", "English Talk"], ja: ["white", "warm", "🌸", "日本語"], zh: ["yellow", "vivid", "🏮", "中文"], es: ["polaroid", "warm", "☀️", "Español"] }[b.lang];
      return { result: { photos: (b.photos ?? []).map((_, i) => L ? { frame: L[0], filter: L[1], bright: 4, contrast: 4, text: L[3], text_pos: "bottom", text_color: "#ffffff", band: true, emoji: i % 2 ? "" : L[2], emoji_pos: "top-right" } : null) } };
    }
    if (a === "hf") return { error: { message: "체험판에서는 AI 다듬기가 실행되지 않아요" } };
    return { error: { message: DEMO.NOTE } };
  } catch (e) { console.warn("demo blog-write", e); return { error: { message: "체험판 샘플을 만들지 못했어요" } }; }
};

// ═══════════════════════════════ 📸 게시물 (sns_posts · sns_jobs) ═══════════════════════════════
const POLITE = [["해요", "합니다"], ["예요", "입니다"], ["이에요", "입니다"], ["있어요", "있습니다"], ["돼요", "됩니다"], ["주세요", "주십시오"], ["드려요", "드립니다"], ["늘렸어요", "늘렸습니다"], ["운영해요", "운영합니다"], ["열어요", "엽니다"], ["받아요", "받습니다"]];
const polite = (s, on) => (on ? POLITE.reduce((x, [a, b]) => x.split(a).join(b), s) : s);
const igTags = (tm) => ["팔로", `${tm.area}${tm.subs[0].replace("·", "")}`, `${tm.area}어학원`, "성인영어", "소수정예", "언어교환", "퇴근후공부", "직장인공부", "회화스터디", "영어공부", "외국어공부", "자기계발", "어학원", "스터디", "무료체험", `팔로${tm.area}`];
const snsText = (tm, topic, pol) => {
  const p = (s) => polite(s, pol), short = [...topic].slice(0, 18).join("");
  const draft = p(`${topic}\n${tm.name}은 ${tm.spot}에 있어요. 한 반 6명 이하 소수정예로 말하는 시간을 늘렸어요. 수업 후반에는 1:1 언어교환 시간이 있어요. 첫 수업은 무료 체험이에요.`);
  return { draft,
    ig: p(`${topic}\n\n${tm.name}에서 전하는 소식이에요.\n한 반 6명 이하로 말하는 시간을 늘렸고, 수업 후반에는 1:1 언어교환 시간이 있어요.\n첫 수업은 무료 체험이에요.\n\n📍 ${tm.spot}\n💬 문의는 프로필 링크의 네이버 예약이나 카카오톡 채널로 남겨 주세요.`),
    google: p(`${topic}\n\n${tm.name}은 ${tm.spot}에 있어요. 한 반 6명 이하 소수정예로 운영하고, 첫 수업은 무료 체험이에요. 전화나 네이버 예약으로 문의해 주세요.`),
    nTitle: short, nBody: p(`안녕하세요, ${tm.name}이에요.\n\n${topic}\n\n수업은 한 반 6명 이하로 운영해요. 강사가 설명하는 시간보다 직접 말하는 시간이 더 길고, 후반에는 짝을 바꿔 가며 1:1 언어교환을 해요.\n첫 수업은 무료 체험으로 분위기를 확인하실 수 있어요.\n\n위치: ${tm.spot}\n문의: 네이버 예약, 카카오톡 채널`) };
};
const SNS_T = { en: ["11월부터 토요일 오전 프리토킹반을 새로 열어요", "이번 주 1:1 언어교환 모임 스케치", "오픽 IH 목표, 3개월 루틴 공유", "체험 수업 신청 안내", "퇴근 후 수업 현장 스케치", "겨울방학 집중반 오픈 소식"],
  jp: ["JLPT N2 12주 계획표를 공유해요", "중국어 성조, 쉽게 외우는 법", "여행 일본어 10문장", "체험 수업 신청 안내"], bs: ["서면 주말 프리토킹반 모집", "여행 일본어 체험 수업", "퇴근 후 수업 현장 스케치"], sw: ["영통 오픈 사전 상담 안내", "오픈 기념 체험 수업 모집"] };
t.sns_jobs = [];
const snsRows = [];
TM.forEach((tm) => SNS_T[tm.k].forEach((topic, i) => {
  const id = snsRows.length + 1, x = snsText(tm, topic, false), ago = 1 + i * 3 + (tm.k === "en" ? 0 : 1), nph = 1 + (i % 3) + (i === 0 ? 1 : 0);
  snsRows.push({ id, team_id: tm.id, topic, tone: "friendly", draft: x.draft, photos: Array.from({ length: nph }, (_, k) => ({ path: `${tm.id}/demo-${id}-${k}.jpg`, w: 1080, h: 1350 })),
    channels: { instagram: { caption: x.ig, hashtags: igTags(tm) }, google: { body: x.google, type: i % 3 === 2 ? "event" : "standard", button: i % 2 ? "call" : "learn_more" }, naver: { title: x.nTitle, body: x.nBody } }, created_at: at(-ago, "16:10"), updated_at: at(-ago, "16:40") });
  ["instagram", "google", "naver"].forEach((channel, k) => t.sns_jobs.push({ id: t.sns_jobs.length + 1, post_id: id, team_id: tm.id, channel, method: "manual", status: i === 0 && k > 0 ? "waiting_copy" : "done_manual", run_at: null, result_url: null, error_ko: null, created_at: at(-ago, "16:12") }));
}));
// 목록 화면은 sns_posts 행 안에 sns_jobs 가 중첩돼 있어야 해서(가짜 서버는 안 풀어 준다), 새 글이 생겨도 jobs 를 표에서 읽어 오는 접근자를 달아 둔다
{
  const jobsOf = (id) => t.sns_jobs.filter((j) => j.post_id == id);
  const withJobs = (row) => (Object.getOwnPropertyDescriptor(row, "sns_jobs") ? row : Object.defineProperty(row, "sns_jobs", { enumerable: true, configurable: true, get() { return jobsOf(row.id); } }));
  let store = [];
  const wrap = (a) => { Object.defineProperty(a, "push", { value(...rs) { rs.forEach(withJobs); return Array.prototype.push.apply(this, rs); }, enumerable: false, configurable: true, writable: true }); return a; };
  Object.defineProperty(t, "sns_posts", { get: () => store, set: (v) => { store = wrap(v); v.forEach(withJobs); }, enumerable: true, configurable: true });
  t.sns_posts = snsRows;
}
try { localStorage.setItem("ps-open", JSON.stringify({ id: snsRows.find((x) => x.team_id === T.en).id, team: T.en, at: Date.now() })); } catch {} // 게시물 탭을 열면 서울영어점 최근 게시물이 펼쳐져 있게
// 지점 바로가기(인스타·구글·네이버) — 게시물 탭 상단 버튼. 블로그 지점 설정과 같은 줄(links)에 얹는다
t.blog_profiles.forEach((p) => { const tm = tmOf(p.team_id); p.data.links = { instagram: `https://www.instagram.com/pallo_${tm.k}_demo`, google: "https://business.google.com/", naver: "https://new.smartplace.naver.com/" }; });

// ═══════════════════════════════ 💬 Q&A (qna_*) ═══════════════════════════════
const FINAL = [ // [질문, 답, 비공개, 지점 한정, 출처, 물어본 사람]
  ["환불 요청이 들어오면 어떻게 처리하나요?", "먼저 수강 시작일과 이용 횟수를 확인하세요. 시작 전이면 전액, 시작 후면 이용한 만큼을 뺀 금액이에요. 계산은 재무 탭의 환불표를 쓰고, 예외 요청은 저한테 넘겨 주세요.", 0, null, "chat", U.m1],
  ["상담 일지는 상담 끝나고 바로 써야 하나요?", "네, 당일 안에 써 주세요. 기억이 남아 있을 때 써야 등록 전환 분석에 쓸 수 있어요. 길게 말고 3줄이면 충분해요.", 0, null, "chat", U.m2],
  ["체험 수업 후 등록 안 한 분께는 언제 연락하나요?", "체험 다음 날 한 번, 3일 뒤 한 번만 연락하세요. 그 이후는 먼저 연락이 올 때까지 기다려요. 카톡은 짧게, 혜택 얘기는 먼저 꺼내지 마세요.", 0, null, "chat", U.m3],
  ["수업 시간 변경 요청은 어디까지 받아 주나요?", "수업 시작 24시간 전까지는 지점 재량으로 바꿔 주세요. 그 이후이거나 월 2회를 넘는 요청은 저한테 넘겨 주세요.", 0, null, "chat", U.m1],
  ["조교 근무 시간을 잘못 입력했는데 어디서 고치나요?", "근무기록 탭에서 해당 날짜를 눌러 고치고, 사유를 한 줄 남겨 주세요. 이미 지급 처리된 달이면 저한테 말해 주세요.", 0, null, "chat", U.m4],
  ["SNS에 수강생 얼굴이 나와도 되나요?", "동의서를 받은 분만 가능해요. 받지 못한 분은 꼭 블러 처리하고, 게시물 탭의 얼굴 자동 블러를 쓴 뒤 눈으로 한 번 더 확인하세요.", 0, null, "chat", U.m2],
  ["교재가 부족할 때는 어떻게 하나요?", "교재 신청은 매주 목요일까지 단톡방에 올려 주세요. 급하면 PDF로 먼저 안내하고, 실물은 다음 수업에 드려요.", 0, null, "chat", U.m3],
  ["카드 결제 취소 요청은 어떻게 하나요?", "카드 취소 대행 보드에 요청을 올려 주세요. 영수증 번호와 사유를 적으면 처리 후 알림이 가요. 직접 카드사에 전화하지 마세요.", 0, null, "capture", null],
  ["레벨 테스트 결과가 애매하면 어느 반을 추천하나요?", "한 단계 낮은 반을 추천하고, 첫 2주 안에 반을 옮길 수 있다고 안내해 주세요.", 0, null, "chat", U.m1],
  ["블로그 글에 수강생 후기를 써도 되나요?", "서면 동의를 받은 후기만 쓸 수 있어요. 점수나 기간 같은 숫자는 확인된 것만 쓰고, '무조건'·'보장' 같은 표현은 쓰지 마세요.", 0, null, "chat", U.m2],
  ["주말 근무자가 갑자기 못 나오면 어떻게 하나요?", "먼저 같은 지점 조교에게 대체를 부탁하고, 안 되면 단톡방에 올려 주세요. 수업 취소는 최후의 수단이에요.", 0, T.bs, "chat", U.m3],
  ["오픈 준비 중인 지점은 광고를 어떻게 해야 하나요?", "오픈 일정이 확정되기 전에는 날짜를 쓰지 마세요. 사전 상담 신청만 받고, 체험 수업은 오픈 후에 안내해요.", 0, T.sw, "chat", U.m4],
  ["네이버 예약이 전산에 안 들어왔어요.", "임시 일정으로 먼저 들어가요. 10분 안에 안 보이면 새로고침하고, 그래도 없으면 예약 메일을 캡처해서 보내 주세요.", 0, null, "capture", null],
  ["수강료 문의에 가격을 바로 알려도 되나요?", "공식 가격표에 있는 금액만 안내하세요. 할인은 상담 때 제가 정한 범위 안에서만 말하세요.", 0, null, "capture", null],
  ["지인 소개 수강생에게 따로 혜택을 줘도 되나요?", "이번 분기는 소개 혜택을 따로 정하지 않았어요. 문의가 오면 저한테 넘겨 주세요.", 1, null, "chat", U.m1],
];
const TOF = { [U.m1]: T.en, [U.m2]: T.jp, [U.m3]: T.bs, [U.m4]: T.sw }, qa = [];
FINAL.forEach(([question, answer, priv, only_team, source, uid], i) => qa.push({ id: i + 1, user_id: uid, team_id: uid ? TOF[uid] : null, question, answer, ai_answer: i % 3 === 0 ? answer : "", status: "final", private: !!priv, only_team, source, asker_label: source === "capture" ? "카톡" : "", reviewed: true, resolved: false, escalated: false, auto_private: false, refs: [], ai_flags: {}, final_at: at(-(2 + i * 2), "11:20"), created_at: at(-(3 + i * 2), "17:40") }));
const WAIT = [ // 대표 확인 대기 (AI가 근거를 못 찾은 것)
  [U.m3, T.bs, "수강생이 병가로 한 달 쉬겠다는데 기간 연장 처리가 가능한가요?", { grounded: false, decision_request: true, reason: "기간 연장은 대표님 결정이 필요한 사항이에요" }, 0],
  [U.m1, T.en, "인스타 DM으로 단체 수강 문의가 왔는데 할인해도 되나요?", { grounded: false, decision_request: true, reason: "할인 허락 요청이에요" }, 0],
  [U.m4, T.sw, "오픈 전에 사전 등록금을 받아도 되나요?", { grounded: false, sensitive: true, reason: "금전 관련이라 대표님이 직접 답해야 해요" }, 1],
];
WAIT.forEach(([uid, team_id, question, ai_flags, esc], i) => qa.push({ id: qa.length + 1, user_id: uid, team_id, question, answer: "", ai_answer: "", status: "waiting", private: false, only_team: null, source: "chat", asker_label: "", reviewed: false, resolved: false, escalated: !!esc, auto_private: false, refs: [], ai_flags, final_at: null, created_at: at(-(i === 0 ? 0 : 1), String(9 + i).padStart(2, "0") + ":15") }));
[[U.m2, T.jp, "체험 수업 때 사진 찍어도 되나요?", "동의서를 받은 분만 찍을 수 있어요. 받지 못한 분이 화면에 나오면 올리기 전에 반드시 블러 처리하세요.", [6]],
  [U.m1, T.en, "레벨 테스트 점수가 애매하게 나왔는데 반 추천은?", "한 단계 낮은 반을 추천하고, 첫 2주 안에 반을 옮길 수 있다고 안내해 주세요.", [9]]]
  .forEach(([uid, team_id, question, answer, refs], i) => qa.push({ id: qa.length + 1, user_id: uid, team_id, question, answer, ai_answer: answer, status: "ai", private: false, only_team: null, source: "chat", asker_label: "", reviewed: false, resolved: false, escalated: false, auto_private: false, refs, ai_flags: { grounded: true, reason: "확정된 답 " + refs.length + "개를 참고했어요" }, final_at: null, created_at: at(0, "1" + i + ":05") }));
t.qna_items = qa;
t.qna_style = [{ id: 1, memo: "- 존댓말, 결론을 먼저 말하기\n- 환불·할인 얘기는 정해진 범위를 안내하고, 예외는 저한테 넘기기\n- 이모지는 거의 쓰지 않기\n- 숫자·기간은 확인된 것만 말하기\n- 사진·후기는 동의 여부부터 확인하기", updated_at: at(-6, "21:10") }];
t.qna_suggestions = [
  { id: 1, line: "답변 첫 문장에 '네/아니요'를 먼저 쓰기", why: "최근 확정한 5개 답변 중 4개에서 결론을 첫 문장에 고쳤어요", status: "pending", created_at: at(-1, "13:30") },
  { id: 2, line: "금액이 나오면 '공식 가격표 기준'이라고 덧붙이기", why: "수강료 답변을 고칠 때마다 같은 문구를 추가하셨어요", status: "pending", created_at: at(-3, "18:02") },
];
const qaSearch = (q, n = 5) => { const toks = String(q).split(/\s+/).filter((x) => x.length >= 2); return t.qna_items.filter((x) => x.status === "final" && !x.private).map((x) => ({ x, s: toks.reduce((s, k) => s + ((x.question + x.answer).includes(k) ? 1 : 0), 0) })).filter((y) => y.s).sort((a, b) => b.s - a.s).slice(0, n).map((y) => ({ question: y.x.question, answer: y.x.answer })); };
rpc.qna_search = (a) => qaSearch(a.q, a.n);
fn.qna = (b) => {
  try {
    if (b.action === "ask") {
      const hit = qaSearch(b.question, 1)[0], found = t.qna_items.find((x) => hit && x.question === hit.question), uid = DEMO.tables.profiles?.[0]?.user_id ?? U.boss;
      const item = { id: nextId(t.qna_items), user_id: uid, team_id: null, question: b.question, answer: hit?.answer ?? "", ai_answer: hit?.answer ?? "", status: hit ? "ai" : "waiting", private: !!b.private, only_team: null, source: "chat", asker_label: "", reviewed: false, resolved: false, escalated: false, auto_private: false, refs: found ? [found.id] : [], ai_flags: hit ? { grounded: true } : { grounded: false, reason: "비슷한 확정 답을 못 찾았어요" }, final_at: null, created_at: new Date().toISOString() };
      t.qna_items.push(item); return { item };
    }
    if (b.action === "extract") return { pairs: [
      { question: "수업 중간에 들어온 지각생은 어떻게 하나요?", answer: "수업 흐름이 끊기지 않게 조용히 자리 안내하고, 놓친 부분은 수업 끝나고 2~3분만 따로 알려 주세요.", asker_label: "카톡 · 매니저", sensitive: false },
      { question: "회원이 결제 금액이 다르다고 하면요?", answer: "영수증과 결제 내역을 같이 확인하고, 차이가 있으면 카드 취소 대행 보드에 올려 주세요. 제가 확인할게요.", asker_label: "카톡 · 매니저", sensitive: true },
      { question: "연락처 없이 방문한 분은 상담 일지를 어떻게 쓰나요?", answer: "이름 대신 방문 시간과 상담 내용만 적어 두세요. 연락처는 동의받은 뒤에만 받아요.", asker_label: "카톡 · 매니저", sensitive: false }] };
    if (b.action === "suggest") { const s = { id: nextId(t.qna_suggestions), line: "답변 끝에 '더 필요하면 알려 주세요'는 쓰지 않기", why: "방금 고친 답변에서 마무리 문장을 지우셨어요", status: "pending", created_at: new Date().toISOString() }; t.qna_suggestions.unshift(s); return { suggestion: s }; }
  } catch (e) { console.warn("demo qna", e); }
  return { error: { message: DEMO.NOTE } };
};

// ═══════════════════════════════ 💬 톡톡·인스타 봇 (talk_kb · talk_asks) ═══════════════════════════════
const KB = [ // [지점키, 주제, 답, 켜짐]
  ["all", "운영시간", "평일 오전 10시부터 밤 10시, 토요일은 오후 6시까지예요. 일요일은 쉬어요.", 1],
  ["all", "체험 수업", "첫 수업은 무료 체험이에요. 네이버 예약이나 카카오톡 채널로 신청해 주세요.", 1],
  ["all", "수강 인원", "한 반은 6명 이하로 운영해요. 수업 후반에는 1:1 언어교환 시간이 있어요.", 1],
  ["all", "레벨 테스트", "등록 전에 10분 정도 말하기 레벨 테스트를 해요. 결과에 맞는 반을 추천해 드려요.", 1],
  ["all", "환불 규정", "수강 시작 전에는 전액 환불, 시작 후에는 이용한 만큼을 뺀 금액을 돌려드려요. 자세한 건 상담 때 안내해 드려요.", 1],
  ["all", "결제 방법", "카드와 계좌이체 모두 가능해요. 현금영수증도 발급해 드려요.", 1],
  ["daegu", "위치", "강남역 도보 3분 거리예요. 건물 5층이고 엘리베이터가 있어요.", 1],
  ["daegu", "주차", "건물 주차는 어려워서 대중교통을 추천드려요. 근처 공영주차장은 도보 5분이에요.", 1],
  ["daegu", "수업 구성", "영어회화는 레벨별 반이 있고, 오픽·토스 준비반은 시험 일정에 맞춰 열어요.", 1],
  ["ulsan", "위치", "서면역 7번 출구 바로 앞 건물 7층이에요.", 1],
  ["ulsan", "주말반", "토요일 오전 프리토킹반이 있어요. 정원이 6명이라 미리 예약하시면 좋아요.", 1],
  ["ulsan", "주차", "건물 지하 주차장을 쓸 수 있어요. 수업 시간 동안 주차권을 드려요.", 1],
  ["daegu-jpcn", "시험 준비", "JLPT는 N5~N1, HSK는 1~4급 준비반이 있어요. 시험 접수 일정은 매달 공지해 드려요.", 1],
  ["daegu-jpcn", "위치", "역삼역 인근이에요. 건물 4층이고 간판에 '팔로'가 있어요.", 1],
  ["daegu-jpcn", "중국어 입문", "성조부터 차근차근 시작하는 입문반이 있어요. 무료 체험 수업으로 확인해 보세요.", 1],
  ["daegu", "단체 수강", "단체 수강은 인원에 따라 따로 안내해 드려요. 상담 때 말씀해 주세요.", 0],
];
t.talk_kb = KB.map(([branch, q, a, on], i) => ({ id: i + 1, branch, q, a, on: !!on, sort: i, created_at: at(-20 + i), updated_at: at(-10) }));
const ASKS = [["daegu", "일요일에도 수업 하나요?", 3, -1], ["ulsan", "초등학생도 수강할 수 있나요?", 1, -1], ["daegu-jpcn", "JLPT N1 반도 있나요?", 2, -2], ["daegu", "[인스타] 수강료가 얼마예요?", 2, 0], ["ulsan", "[인스타] 직장인 반은 몇 시에 시작해요?", 1, 0], ["daegu-jpcn", "[인스타] 온라인 수업도 하나요?", 1, -1], ["daegu", "법인카드로 결제되나요?", 1, -3], ["all", "스페인어 수업도 있나요?", 1, -2]];
t.talk_asks = ASKS.flatMap(([branch, q, n, off], i) => Array.from({ length: n }, (_, k) => ({ id: 0, branch, q, at: at(off, String(9 + ((i + k * 3) % 12)).padStart(2, "0") + ":" + String(10 + k * 7)), done: false, kb_id: null }))).map((x, i) => ({ ...x, id: i + 1 }));

// ═══════════════════════════════ 마무리 ═══════════════════════════════
// 블로그 탭의 '개선사항 보내기' 목록: 다른 담당이 신고함(feedback_list)을 이미 만들었으면 건드리지 않는다
if (!rpc.feedback_list) {
  t.feedback ||= [
    { id: 1, kind: "blog", body: "✍️ 블로그 💡 아이디어: 제목에 지점명이 자동으로 들어가는 옵션이 있으면 좋겠어요", status: "new", created_at: at(-2, "15:30"), who: "이서연", team: "서울영어점" },
    { id: 2, kind: "blog", body: "✍️ 블로그 🐞 불편·오류: 사진이 10장 넘으면 시안이 늦게 나와요", status: "done", created_at: at(-9, "11:05"), who: "최수빈", team: "부산점" },
  ];
  rpc.feedback_list = () => t.feedback.map((x) => ({ ...x })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}
// 일일 현황의 '등록' 줄: 재무 탭 매출 장부(fin_rows)에서 거래형태·가입경로를 type·path 칸으로 읽는다 (가짜 서버는 vals->>… 를 못 풀어서 같은 값을 칸으로도 둔다)
const finFix = () => (t.fin_rows ?? []).forEach((r) => { if (r.kind === "sale" && r.vals) { r.type ??= r.vals.거래형태 ?? ""; r.path ??= r.vals.가입경로 ?? ""; } });
finFix(); DEMO.trim.push(finFix);
})();
