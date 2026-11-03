// 🧪 체험판 샘플: 돈·사람 쪽 탭 — 매출(sales) · 재무(fn) · 조교 근무기록(wr) · 리더 현황(ld). 이름·번호·금액은 전부 지어낸 값.
// 날짜는 전부 오늘 기준 상대값. 결제 목록(pays)을 한 번 만들어 매출 달력 · 시트 합계 · 재무 장부가 같은 숫자를 보게 한다.
(() => {
const { U, T, tables: t, rpc, fn, day, at, month, uuid } = DEMO;
const TD = day(0), NOWMS = Date.now(), iso = (d, hm = "18:00") => { const x = new Date(`${d}T${hm}:00`); return new Date(Math.min(+x, NOWMS - 60000)).toISOString(); };
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed) => { let a = hash(seed); return () => { a = (a + 0x6D2B79F5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; };
const pick = (r, l) => l[Math.floor(r() * l.length)];
const dow = (d) => new Date(d + "T00:00:00").getDay();
const addD = (d, n) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const mDays = (m) => { const [y, mo] = m.split("-").map(Number); return Array.from({ length: new Date(y, mo, 0).getDate() }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`); };
const work = (m) => mDays(m).filter((d) => dow(d) !== 5); // 영업일 (금요일 휴무)
const M = [-3, -2, -1, 0].map(month), CUR = M[3], NEXT = month(1);
const put = (name, rows) => { t[name] = (t[name] || []).concat(rows); };
const ph = (r) => `010-0000-${String(1000 + Math.floor(r() * 9000))}`;
const SUR = "김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허유남심노하곽성차주".split("");
const NF = "서윤 하은 지안 유나 채원 다은 소율 나연 예린 수빈 지우 하린 서아 윤아 은서 다인 시은 아린 세아 예나".split(" ");
const NM = "민준 지호 도현 시우 현우 태양 승민 서준 지훈 세훈 하준 예준 건우 이안 주원 우진 시현 재윤 정우 도하".split(" ");
const PK = (k, p) => (DEMO.pk[k] = p);
PK("sales_plans", ["team_id", "month"]); PK("sales_days", ["team_id", "day"]); PK("sales_sheet_days", ["team_id", "day"]); PK("sales_sheet_sync", ["team_id", "month"]);
PK("month_goals", ["user_id", "month"]); PK("fin_config", ["team_id"]); PK("fin_access", ["team_id"]);
PK("work_months", ["team_id", "ym"]); PK("work_cells", ["row_id", "day", "slot"]); PK("work_people", ["team_id", "name"]);
PK("leader_att", ["leader_id", "day"]); PK("leader_awards", ["leader_id", "month"]); PK("leader_months", ["leader_id", "month"]); PK("leader_certs", ["leader_id", "grade"]);
PK("leader_rapports", ["leader_id", "month", "user_id"]); PK("leader_confirm", ["leader_id", "day"]); PK("leader_mix", ["team_id", "month"]); PK("leader_ai", ["team_id", "month"]);

// ───────── 지점별 기준값 ─────────
const PRICE = [2470000, 1900000, 1140000, 760000], TIER = ["Premium", "Pro Max", "Pro", "Plus"];
const TM = [
  { id: T.en, key: "en", mgr: "이서연", mgrId: U.m1, goal: [44e6, 46e6, 48e6, 50e6], hit: [0.91, 1.04, 0.96, 1.08], reply: 35, consult: 65, pay: 36, arpu: 1520000, refund: 3, mix: [25, 20, 35, 20], labor: 3200000, ads: 4500000, rent: 6800000, sheet: true, lang: ["영어"], cons: ["이서연", "한지우", "오하린"] },
  { id: T.jp, key: "jp", mgr: "박지훈", mgrId: U.m2, goal: [30e6, 31e6, 32e6, 34e6], hit: [0.84, 0.95, 1.06, 0.92], reply: 38, consult: 62, pay: 34, arpu: 1380000, refund: 4, mix: [20, 20, 35, 25], labor: 2600000, ads: 3200000, rent: 4900000, sheet: true, lang: ["일본어", "중국어"], cons: ["박지훈", "차유진"] },
  { id: T.bs, key: "bs", mgr: "최수빈", mgrId: U.m3, goal: [36e6, 36e6, 38e6, 38e6], hit: [0.97, 1.02, 0.89, 1.15], reply: 33, consult: 68, pay: 38, arpu: 1450000, refund: 2, mix: [22, 20, 33, 25], labor: 2400000, ads: 3800000, rent: 5200000, sheet: false, lang: ["영어"], cons: ["최수빈", "고은채"] },
  { id: T.sw, key: "sw", mgr: "정민재", mgrId: U.m4, goal: [24e6, 25e6, 26e6, 28e6], hit: [0.8, 0.88, 0.94, 0.74], reply: 30, consult: 60, pay: 35, arpu: 1300000, refund: 5, mix: [15, 20, 35, 30], labor: 1800000, ads: 2600000, rent: 3600000, sheet: false, lang: ["영어"], cons: ["정민재", "편다은"] },
];
const RATE = 10500; // 조교 시급 (지어낸 값)

// ───────── 결제 목록 (지점 × 달) — 모든 숫자의 뿌리 ─────────
function pay(tm, d, r, type) {
  let w = r() * 100, ti = 0; for (; ti < 3 && (w -= tm.mix[ti]) > 0; ti++);
  const price = PRICE[ti], g = r() < 0.7 ? "여" : "남", card = r() < 0.68, how = card ? "카드" : pick(r, ["링크페이", "링크페이", "개인이체", "스탭페이"]);
  const amount = type === "환불" ? -price : type === "차액결제(분할납부)" ? Math.round(price * 0.4 / 10000) * 10000 : price, sign = type === "가입";
  return { d, type, amount, vals: {
    날짜: d, 멤버쉽: TIER[ti], 매출: amount, 이름: pick(r, SUR) + pick(r, g === "여" ? NF : NM), 언어: pick(r, tm.lang), 거래형태: type, 결제수단: how,
    카드사: card ? pick(r, ["삼성", "현대", "국민", "신한", "비씨", "하나", "롯데", "농협", "우리"]) : "", 할부개월: card ? String(pick(r, [1, 1, 3, 3, 6, 10, 12])) : "",
    결제상세: how === "링크페이" ? "링크 결제 완료" : how === "개인이체" ? "계좌 입금 확인" : "",
    코멘트: type === "환불" ? pick(r, ["개인 사정으로 환불", "이사로 인한 환불", "수강 전 단순 변심"]) : r() < 0.12 ? pick(r, ["지인 동반 등록", "재등록 회원", "체험수업 후 당일 결제", "직장인 저녁반 희망"]) : "",
    가입경로: sign ? pick(r, ["인스타", "네이버", "메타광고", "지인소개", "블로그", "당근", "구글", "유튜브"]) : "", Lv: sign ? String(pick(r, [0, 1, 1, 2, 2, 3, 4])) : "",
    전화번호: ph(r), 상담자: pick(r, tm.cons), 전산입력: "O", 성별: g, 나이: String(22 + Math.floor(r() * 22)) } };
}
const PAYS = {}; // `${key}|${달}` → 결제 목록
for (const tm of TM) M.forEach((m, mi) => {
  const days = work(m), avg = tm.mix.reduce((a, p, i) => a + p / 100 * PRICE[i], 0);
  let lam = tm.goal[mi] * tm.hit[mi] / (avg * (1 - tm.refund / 100)) / days.length;
  if (m === CUR) lam = Math.max(lam, 1.6); // 월초에 열어도 화면이 비지 않게
  const out = [];
  for (const d of days) {
    if (d > TD) break;
    const r = rng(tm.key + d + "s"), x = lam * (0.35 + 1.3 * r()), n = Math.floor(x) + (r() < x % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) out.push(pay(tm, d, r, "가입"));
    if (r() < 0.07) out.push(pay(tm, d, r, "차액결제(분할납부)"));
    if (r() < 0.05) out.push(pay(tm, d, r, "환불"));
  }
  PAYS[tm.key + "|" + m] = out;
});

// ───────── 매출 탭: 월 계획 · 일일 달력 · 시트 합계 ─────────
const lastDay = (m) => mDays(m).at(-1), mon = (m) => +m.slice(5) + "월";
const STRAT = {
  en: "마케팅: 메타·네이버 광고 소재를 주 1회 교체하고 반응 좋은 광고 예산을 늘립니다.\n회신 관리: 문의 후 30분 안에 첫 연락, 미회신자는 당일 문자+전화로 재연락합니다.\n달력: 평일 하루 상담 최소 7명, 금요일 휴무 전날 예약을 집중해서 잡습니다.\n결제율: 상담 후 24시간 안에 후속 연락, 상담자 목적에 맞는 멤버십 1개만 추천합니다.\n멤버십: Premium 25% / Pro Max 20% 비율을 유지해 객단가 152만원을 지킵니다.",
  jp: "마케팅: 일본어·중국어 문의 분리 대응, 인스타 후기 영상 광고를 늘립니다.\n회신 관리: 오전 문의는 점심 전, 저녁 문의는 다음 날 오전 첫 업무로 연락합니다.\n달력: 하루 상담 최소 6명, 오후 6시 이후 상담 시간 2개를 항상 열어 둡니다.\n결제율: 체험수업 직후 당일 결제 혜택 안내, 미결제자는 3일 안에 재상담합니다.\n멤버십: Pro 비율이 높아 Pro Max 업셀을 상담마다 먼저 제안합니다.",
  bs: "마케팅: 서면·전포 지역 키워드 광고와 지인 소개 이벤트를 병행합니다.\n회신 관리: 문의 즉시 문자, 1시간 안 전화 회신으로 상담 예약률을 올립니다.\n달력: 하루 상담 최소 6명, 주말 상담 슬롯을 늘립니다.\n결제율: 상담 후 미결제자에게 수업 샘플 영상과 후기를 보냅니다.\n멤버십: Pro 이상 비율 75%를 목표로 합니다.",
  sw: "마케팅: 영통·매탄 주변 당근 광고와 학원 앞 전단 병행, 광고비 효율이 낮은 소재는 중단합니다.\n회신 관리: 지원자 대비 회신율이 낮아 미회신 목록을 매일 오후 확인합니다.\n달력: 하루 상담 최소 5명, 직장인 저녁 시간대 예약을 집중해서 받습니다.\n결제율: 상담 후 3일 안 재연락, 분납 안내를 먼저 합니다.\n멤버십: Plus 비중이 높아 Pro 업셀 멘트를 정리해 사용합니다.",
};
function plan(tm, m, mi) {
  const prior = mi < 3 ? iso(addD(`${m}-01`, -5 + mi), "11:00") : iso(addD(`${CUR}-01`, -4), "11:00");
  const full = ["s1", "s2", "s5"].reduce((o, k, i) => ({ ...o, [k]: { by: tm.mgr, at: iso(addD(`${m}-01`, -6 + i), "14:00") } }), {});
  return { team_id: tm.id, month: m, updated_by: null, updated_at: prior, data: {
    goal: tm.goal[mi], reply: tm.reply, consult: tm.consult, pay: tm.pay, arpu: tm.arpu, refundRate: tm.refund, firstContact: 30,
    members: TIER.map((name, i) => ({ name, price: PRICE[i], n: 0, p: tm.mix[i] })), start: m + "-01", end: lastDay(m), labor: tm.labor, ads: tm.ads,
    problems: m === CUR && tm.key === "en" ? "평일 오후 상담 예약이 비는 날이 있어요 (화·수)." : "", strategyAdd: m === CUR && tm.key === "en" ? "이번 주 안에 미결제 상담자 12명 재연락 (24시간 안 후속)." : "",
    mgDone: m === CUR && tm.key === "sw" ? { s1: full.s1, s2: full.s2 } : full } };
}
const planRows = [];
for (const tm of TM) M.forEach((m, mi) => planRows.push(plan(tm, m, mi)));
{ const e = plan(TM[0], NEXT, 3), j = plan(TM[1], NEXT, 3); e.data.goal = 52e6; j.data.goal = 35e6; e.data.mgDone = { s1: e.data.mgDone.s1 }; j.data.mgDone = {}; e.data.problems = e.data.strategyAdd = j.data.problems = j.data.strategyAdd = ""; planRows.push(e, j); }
put("sales_plans", planRows);

const dayRows = [], sheetDays = [];
for (const tm of TM) for (const m of M) {
  const ps = PAYS[tm.key + "|" + m];
  for (const d of work(m)) {
    if (d > TD) break;
    const ds = ps.filter((p) => p.d === d), su = ds.filter((p) => p.type === "가입"), r = rng("f" + tm.key + d);
    const payers = su.length, amount = ds.filter((p) => p.amount > 0).reduce((a, p) => a + p.amount, 0), refund = -ds.filter((p) => p.amount < 0).reduce((a, p) => a + p.amount, 0);
    let consults = payers ? Math.max(payers, Math.round(payers / (tm.pay / 100) * (0.75 + 0.5 * r()))) : Math.floor(r() * 3);
    let replies = Math.max(consults, Math.round(consults / (tm.consult / 100) * (0.8 + 0.4 * r())));
    const apps = Math.max(replies, Math.round(replies / (tm.reply / 100) * (0.8 + 0.4 * r())));
    if (d === TD) { consults = payers ? consults : null; }
    dayRows.push({ team_id: tm.id, day: d, apps: d === TD ? null : apps, replies, consults, payers: tm.sheet ? null : payers, amount: tm.sheet ? null : amount, refund: tm.sheet ? null : refund, updated_by: null, updated_at: iso(d, "19:30") });
    if (tm.sheet && (amount || refund)) sheetDays.push({ team_id: tm.id, day: d, amount, refund, payers, signup: su.reduce((a, p) => a + p.amount, 0), synced_at: iso(d, "23:50") });
  }
}
for (const tm of TM) for (const k of [1, 2]) { const d = addD(TD, k); if (dow(d) !== 5) dayRows.push({ team_id: tm.id, day: d, apps: null, replies: 4 + Math.floor(rng(tm.key + d)() * 6), consults: null, payers: null, amount: null, refund: null, updated_by: null, updated_at: iso(TD, "09:00") }); } // 예약
put("sales_days", dayRows); put("sales_sheet_days", sheetDays);
put("sales_sheet_sync", TM.filter((x) => x.sheet).flatMap((tm) => M.map((m) => ({ team_id: tm.id, month: m, tab: m.replace("-", "") + " 매출(플래너)", skipped: 0, error: null, synced_at: new Date(NOWMS - 7 * 60000).toISOString() }))));

// ───────── 월말 보고 (month_goals) ─────────
const MGS = (tm, m, mi) => `${mon(m)} 목표 ${(tm.goal[mi] / 1e4).toLocaleString("ko-KR")}만원.\n${STRAT[tm.key]}`;
const goals = [];
const g1 = (tm, m, mi, o = {}) => goals.push({ user_id: tm.mgrId, month: m, team_id: tm.id, team_goal: tm.goal[mi], my_goal: tm.goal[mi], strategy: MGS(tm, m, mi), submitted_at: iso(addD(`${m}-01`, -3), "17:40"), notified_at: iso(addD(`${m}-01`, -3), "17:41"), updated_at: iso(addD(`${m}-01`, -3), "17:40"), ...o });
for (const [i, tm] of TM.entries()) g1(tm, M[2], 2, i === 1 ? { submitted_at: iso(`${M[2]}-02`, "10:15"), updated_at: iso(`${M[2]}-02`, "10:15"), my_goal: tm.goal[2] } : {});
g1(TM[0], CUR, 3); // 제출 (정시)
g1(TM[1], CUR, 3, { my_goal: 30e6, submitted_at: iso(`${CUR}-01`, "10:30"), notified_at: iso(`${CUR}-01`, "10:31"), updated_at: iso(`${CUR}-01`, "10:30") }); // 월초 제출 · 팀 목표보다 부족
g1(TM[2], CUR, 3, { submitted_at: iso(addD(`${CUR}-01`, -1), "20:05"), notified_at: iso(addD(`${CUR}-01`, -1), "20:06"), updated_at: iso(addD(`${CUR}-01`, -1), "20:05") });
goals.push({ user_id: U.m4, month: CUR, team_id: T.sw, team_goal: 28e6, my_goal: 22e6, strategy: "영통·매탄 당근 광고 효율 점검, 미회신 목록 매일 확인", submitted_at: null, notified_at: null, updated_at: iso(addD(TD, -1), "21:10") }); // 쓰는 중
goals.push({ user_id: U.m1, month: NEXT, team_id: T.en, team_goal: 52e6, my_goal: 52e6, strategy: "", submitted_at: null, notified_at: null, updated_at: iso(TD, "09:00") });
put("month_goals", goals);

// ───────── 재무 탭: 장부 (매출·비용) · 시트 설정 · 조교 보기 승인 · 첨부 ─────────
const num = (v) => { const s = String(v ?? "").replace(/[₩,\s원]/g, ""); return /^-?\d+(\.\d+)?$/.test(s) ? Math.round(+s) : null; };
const derive = (r) => { const v = r.vals; r.day = /^\d{4}-\d{2}-\d{2}$/.test(v.날짜 || "") ? v.날짜 : null; r.amount = num(v[r.kind === "sale" ? "매출" : "금액"]); r.section = r.kind === "cost" ? String(v.구분 || "").trim() || null : null; r.type = v.거래형태 ?? null; r.path = v.가입경로 ?? null; return r; }; // 서버 트리거 대신 (type·path = 마케팅 탭이 읽는 값)
const frow = (tm, m, kind, vals, sort, by) => derive({ id: uuid(), team_id: tm.id, month: m, kind, vals, sort, day: null, amount: null, section: null, files: 0, updated_at: iso(vals.날짜 || `${m}-01`, "18:00"), updated_by: by || tm.mgr, synced_at: tm.sheet ? iso(TD, "09:00") : null, synced_sig: null, deleted_at: null, synced_vals: null, sheet_diff: {}, sheet_flag: null });
const TEAMREC = { en: ["한지우", "오하린", "배시우", "류시아"], jp: ["차유진", "구도연", "성예서"], bs: ["고은채", "편하윤", "노지안"], sw: ["편다은", "곽서하"] };
const LEADERN = { en: ["김서린", "박도하", "강예지"], jp: ["백나은", "허시율", "남도영"], bs: ["서이든", "양가온"], sw: ["심우주"] };
const fin = [], files = [];
for (const tm of TM) M.forEach((m, mi) => {
  const rows = []; let s = 0;
  PAYS[tm.key + "|" + m].forEach((p) => rows.push(frow(tm, m, "sale", { ...p.vals }, s++, tm.key === "en" ? "시트" : tm.mgr)));
  const dt = (n) => { const dm = +TD.slice(8), x = m === CUR && n > dm ? 1 + (n % dm) : n; return `${m}-${String(x).padStart(2, "0")}`; }, f = tm.rent / 6.8e6, k = (sec, use, amt, extra = {}) => rows.push(frow(tm, m, "cost", { 구분: sec, 날짜: "", 사용처: use, 금액: Math.round(amt / 1000) * 1000, 비고: "", 근무시간: "", ...extra }, s++));
  const full = m < CUR || TD.slice(8) > "10";
  k("고정비", "월세 (건물주)", tm.rent); k("고정비", "관리비", tm.rent * 0.12); k("고정비", "인터넷·전화", 88000); k("고정비", "정수기·복합기 렌탈", 154000);
  k("변동비", "교재·비품", 420000 * f, { 날짜: dt(8) }); k("변동비", "청소 용역", 300000 * f, { 날짜: dt(15) }); k("변동비", "다과·음료", 180000 * f, { 날짜: dt(12), 비고: "상담 음료 포함" });
  k("광고비", "메타 광고", tm.ads * 0.55, { 날짜: dt(5), 비고: "인스타·페이스북" }); k("광고비", "네이버 검색광고", tm.ads * 0.3, { 날짜: dt(5) }); k("광고비", "당근·구글", tm.ads * 0.15, { 날짜: dt(6) });
  TEAMREC[tm.key].forEach((nm, i) => { const h = [84, 76, 62, 48][i] * (full ? 1 : 0.4); k("행정조교", nm, RATE * h, { 근무시간: String(Math.round(h * 10) / 10), 비고: i ? "" : "평일 오전" }); });
  k("전일조교", TEAMREC[tm.key][0] + " (전일)", 1800000 * (tm.key === "en" ? 1 : 0.6), { 비고: "상담 겸임" });
  k("상담조교", tm.cons.at(-1), 1500000 * f, { 날짜: "" });
  k("본사지출", "브랜드 사용료", tm.goal[mi] * 0.03, { 날짜: dt(5) }); k("본사지출", "본사 공동 광고 분담", 600000 * f, { 날짜: dt(10) });
  k("지점기타지출", "팀 회식", 240000 * f, { 날짜: dt(18), 비고: "분기 회식" }); k("지점기타지출", "택배·배송비", 38000, { 날짜: dt(9) });
  LEADERN[tm.key].slice(0, 2).forEach((nm, i) => k("리더 디파짓", nm, i ? -300000 : 300000, { 날짜: dt(3 + i * 11), 비고: i ? "계약 종료로 반환" : "신규 리더 디파짓" }));
  fin.push(...rows);
});
{ // 서울영어점 이번 달: 덜 쓴 줄 · 시트와 다른 곳 · 시트에서 새로 적은 줄 · 첨부
  const rows = fin.filter((r) => r.team_id === T.en && r.month === CUR), sale = rows.filter((r) => r.kind === "sale" && r.vals.거래형태 === "가입");
  if (sale[0]) sale[0].vals.상담자 = ""; if (sale[2]) sale[2].vals.가입경로 = "";
  if (sale[1]) sale[1].sheet_diff = { 결제수단: { sheet: "개인이체", planner: sale[1].vals.결제수단 }, 매출: { sheet: String(sale[1].vals.매출 + 100000), planner: sale[1].vals.매출 } };
  if (sale[3]) sale[3].sheet_flag = "new";
  const rent = rows.find((r) => r.kind === "cost" && r.vals.사용처.startsWith("월세")), ad = rows.find((r) => r.kind === "cost" && r.vals.사용처 === "메타 광고");
  for (const [r, nm] of [[rent, "월세_계약서사본.pdf"], [rent, "월세_입금확인.jpg"], [ad, "메타_결제내역.pdf"]]) if (r) { r.files++; files.push({ id: files.length + 1, row_id: r.id, team_id: T.en, path: `${T.en}/${r.id}/${nm}`, file_name: nm, by_name: "이서연", created_at: iso(addD(TD, -2), "11:00") }); }
}
put("fin_rows", fin); put("fin_files", files);
put("fin_config", TM.filter((x) => x.sheet).map((tm) => ({ team_id: tm.id, sheet_id: `DEMO-SHEET-${tm.key.toUpperCase()}-0001`, sale_tab: "{YYYYMM} 매출(플래너)", cost_tab: "{YYYYMM} 비용(플래너)", rate: RATE, fee_pct: 5, last_sync: new Date(NOWMS - 4 * 60000).toISOString(), last_error: null })));
put("fin_access", [{ team_id: T.en, status: "requested", requested_at: iso(TD, "09:10"), decided_at: null, notified_at: null }, { team_id: T.jp, status: "open", requested_at: iso(addD(TD, -6), "10:00"), decided_at: iso(addD(TD, -6), "13:00"), notified_at: null }, { team_id: T.bs, status: "closed", requested_at: null, decided_at: null, notified_at: null }]);
Object.assign(rpc, {
  consult_target: () => 8,
  fin_patch: ({ p_id, p_patch }) => { const r = t.fin_rows.find((x) => x.id === p_id && !x.deleted_at); if (!r) return null; r.vals = { ...r.vals, ...p_patch }; derive(r); r.updated_at = new Date().toISOString(); r.updated_by = "대표"; return r.vals; },
  fin_resolve: ({ p_id, p_col, p_use }) => { const r = t.fin_rows.find((x) => x.id === p_id); if (!r) return null; if (p_col == null) { r.sheet_flag = null; return null; } const d = r.sheet_diff?.[p_col]; if (!d) return null; if (p_use === "sheet") { r.vals = { ...r.vals, [p_col]: d.sheet }; derive(r); } else r.synced_vals = { ...(r.synced_vals || {}), [p_col]: d.sheet }; const { [p_col]: _x, ...rest } = r.sheet_diff; r.sheet_diff = rest; return null; },
  leader_sync_ticket: () => { const id = uuid(); (t.leader_sync_inbox ||= []).push({ ticket: id, payload: null, created_at: new Date().toISOString() }); return id; },
});
Object.assign(fn, {
  "planner-sheets": ({ month: m }) => { t.sales_sheet_sync.filter((x) => !m || x.month === m).forEach((x) => (x.synced_at = new Date().toISOString())); return { ok: true }; },
  "planner-fin": (b) => {
    let c = t.fin_config.find((x) => x.team_id === b.team);
    if (b.action === "setup") { const id = String(b.sheet || "").match(/\/d\/([^/]+)/)?.[1] ?? String(b.sheet || "").trim(); if (!c) t.fin_config.push((c = { team_id: b.team })); Object.assign(c, { sheet_id: id, sale_tab: b.sale_tab, cost_tab: b.cost_tab, rate: +b.rate || RATE, fee_pct: +b.fee_pct || 0, last_sync: new Date().toISOString(), last_error: null }); return { ok: true }; }
    if (c) { c.last_sync = new Date().toISOString(); c.last_error = null; }
    return { sale: { toSheet: 0, fromSheet: 0, removed: 0 }, cost: { toSheet: 0, fromSheet: 0, removed: 0 } };
  },
});

// ───────── 조교 근무기록 ─────────
const DW = { 평일: [1, 2, 3, 4], 월수: [1, 3], 화목: [2, 4], 월: [1], 화: [2], 수: [3], 목: [4], 주말: [6, 0], 토: [6], 일: [0] };
const smin = (s) => +s.slice(0, 2) * 60 + +s.slice(3);
const sh = (days, s, e, h) => ({ days, s, e, h });
const shTxt = (l) => l.map(({ days, s, e, h }) => `${days}${/^(주말|토|일)$/.test(days) ? "" : smin(s) < 840 ? " 오전" : " 오후"} (${s}~${e})(${h}h)`).join("\n");
const planOf = (l) => { const p = {}; for (const { days, s, h } of l) for (const w of DW[days]) { const k = w + (w >= 1 && w <= 4 ? (smin(s) < 840 ? "am" : "pm") : "d"); p[k] = (p[k] ?? 0) + h; } return p; };
const STAFF = {
  en: [["한지우", [sh("평일", "09:00", "13:00", 4)], "상담 겸임"], ["오하린", [sh("평일", "14:00", "18:00", 4)], ""], ["배시우", [sh("월수", "18:00", "22:00", 4), sh("화목", "18:00", "21:00", 3)], ""], ["류시아", [sh("주말", "10:00", "16:00", 6)], "토요일 단체 상담"], ["문태리", [sh("월", "10:00", "13:00", 3), sh("토", "10:00", "14:00", 4)], ""], ["서해든", [], "백업 · 대타 우선 연락"]],
  jp: [["차유진", [sh("평일", "10:00", "14:00", 4)], ""], ["구도연", [sh("월수", "17:00", "21:00", 4), sh("화목", "17:00", "20:00", 3)], "일본어 상담"], ["성예서", [sh("주말", "11:00", "17:00", 6)], "중국어 상담"], ["양시온", [], "백업"]],
  bs: [["고은채", [sh("평일", "10:00", "14:00", 4)], ""], ["편하윤", [sh("화목", "17:00", "21:00", 4), sh("토", "10:00", "15:00", 5)], ""], ["노지안", [sh("월수", "17:00", "21:00", 4)], ""], ["모하늘", [], "백업"]],
  sw: [["편다은", [sh("평일", "13:00", "17:00", 4)], ""], ["곽서하", [sh("주말", "10:00", "16:00", 6), sh("수", "17:00", "21:00", 4)], ""], ["윤세린", [], "백업"]],
};
const wm = [month(-1), CUR].map((m) => m + "-01"), wrows = [], wcells = [], wpeople = [], wdocs = [], wshifts = [];
let wid = 0;
for (const tm of TM) {
  const st = STAFF[tm.key];
  [...new Set(st.map((s) => shTxt(s[1])).filter(Boolean))].forEach((b, i) => wshifts.push({ id: wshifts.length + 1, team_id: tm.id, body: b, sort: i + 1, created_at: iso(addD(TD, -60), "10:00") }));
  st.forEach(([name], i) => wpeople.push({ team_id: tm.id, name, phone: `010-0000-${String(2000 + hash(name) % 8000)}`, bank: `국민은행 000-00-${String(100000 + hash(name + "b") % 900000)}` }));
  if (tm.key === "en") for (const nm of ["한지우", "오하린", "배시우"]) wdocs.push({ id: wdocs.length + 1, team_id: tm.id, name: nm, path: `${tm.id}/${nm}.pdf`, file_name: `근무계약서_${nm}.pdf`, by_name: "이서연", created_at: iso(addD(TD, -40), "15:00") });
  for (const ym of wm) {
    const m = ym.slice(0, 7), mo = { team_id: tm.id, ym, rate: RATE, notice: "추가근무는 사유를 적지 않으면 인정하지 않아요.\n대타는 체크리스트 대타 명단에 이름을 먼저 넣어 주세요." };
    t.work_months = (t.work_months || []).concat(mo);
    const rr = st.map(([name, l, memo], i) => ({ id: ++wid, team_id: tm.id, ym, kind: "staff", name, shift: shTxt(l), memo, sort: i + 1, _plan: planOf(l) }));
    const need = { id: ++wid, team_id: tm.id, ym, kind: "need", name: "대타 필요한 사람", shift: "", memo: "", sort: 90 }, done = { id: ++wid, team_id: tm.id, ym, kind: "done", name: "대타 해준 사람", shift: "", memo: "", sort: 91 };
    const cell = (row, d, slot, c) => wcells.push({ row_id: row.id, day: d, slot, val: "", reason: "", mark: null, by_name: tm.mgr, updated_at: iso(d, "21:00"), ...c });
    const skip = new Set(); let ev = 0;
    for (const d of work(m)) {
      if (d > TD) break;
      const w = dow(d);
      for (const row of rr) for (const [k, h] of Object.entries(row._plan)) {
        if (+k[0] !== w || skip.has(`${row.id}|${d}`)) continue;
        const slot = k.slice(1);
        if (d === TD && slot === "pm") continue;
        const r = rng(`w${row.id}${d}`), x = r();
        if (x < 0.015 * 4 && ev < 2 && rr.length > 2) { // 빠짐 + 대타
          const sub = rr.find((o) => o !== row && !o._plan[k] && !skip.has(`${o.id}|${d}`));
          if (sub) { ev++; skip.add(`${sub.id}|${d}`);
            cell(row, d, slot, { val: "0", mark: "out", reason: pick(r, ["감기로 결근", "개인 사정", "시험 기간"]) });
            cell(sub, d, slot, { val: String(h), mark: "sub" });
            cell(need, d, slot, { val: row.name, mark: "out" }); cell(done, d, slot, { val: sub.name, mark: "sub" }); continue; }
        }
        if (x < 0.1) cell(row, d, slot, { val: String(h + 0.5), reason: pick(r, ["상담이 길어져 30분 연장", "신규 상담 마무리하느라 연장"]) });
        else if (x < 0.13) cell(row, d, slot, { val: String(h - 1), reason: "수업 일정으로 1시간 일찍 퇴근" });
        else cell(row, d, slot, { val: String(h) });
      }
    }
    rr.forEach((r) => delete r._plan); wrows.push(...rr, need, done);
  }
}
put("work_rows", wrows); put("work_cells", [...new Map(wcells.map((c) => [`${c.row_id}|${c.day}|${c.slot}`, c])).values()]); put("work_people", wpeople); put("work_docs", wdocs); put("work_shifts", wshifts);

// ───────── 리더 현황 ─────────
// [반, 시간대, 레벨, 자리, 이름, 시작한 지 며칠, 출석 유형(g 개근 · o 한 번 결석 · s 대타 · b 자주 결석 · n 신규 · v 빈자리)]
const LD_ = {
  en: [["월수", "11AM", "1", "A1", "김서린", 430, "g"], ["월수", "11AM", "패턴1", "A2", "박도하", 250, "o"], ["월수", "2PM", "2", "B1", "이하준", 120, "g"], ["월수", "6PM", "1", "C1", "최유나", 310, "s"], ["월수", "6PM", "패턴2", "C2", "정시현", 90, "b"], ["월수", "6PM", "3", "C3", "", 0, "v", 18],
    ["월수", "8PM", "2", "D1", "강예지", 200, "o"], ["월수", "8PM", "프토", "D2", "윤세아", 35, "g"], ["화목", "11AM", "1", "E1", "한채윤", 500, "g"], ["화목", "11AM", "2", "E2", "오지안", 60, "o"], ["화목", "6PM", "패턴1", "F1", "신다온", 150, "g"], ["화목", "6PM", "3", "F2", "", 0, "v", 6],
    ["화목", "8PM", "2", "G1", "권보라", 280, "g"], ["토일", "오전", "1", "H1", "송하람", 340, "g"], ["토일", "오전", "2", "H2", "임수현", -2, "n"], ["토일", "오후", "프토", "I1", "조은우", 75, "s"]],
  jp: [["월수", "일본어 오전", "1", "A1", "백나은", 380, "g"], ["월수", "일본어 오후", "2", "B1", "허시율", 220, "o"], ["월수", "중국어 오후", "1", "B2", "남도영", 140, "g"], ["월수", "일본어 저녁", "3", "C1", "", 0, "v", 11],
    ["화목", "일본어 오전", "2", "D1", "문채이", 410, "g"], ["화목", "중국어 오전", "1", "D2", "하수오", 95, "b"], ["화목", "일본어 저녁", "1", "E1", "류아인", 60, "s"], ["화목", "중국어 저녁", "2", "E2", "안서진", -1, "n"], ["토일", "일본어 오전", "프토", "F1", "전유리", 300, "g"], ["토일", "중국어 오후", "1", "F2", "양채원", 170, "o"]],
  bs: [["월수", "11AM", "1", "A1", "서이든", 330, "g"], ["월수", "7PM", "2", "B1", "양가온", 210, "o"], ["월수", "7PM", "패턴1", "B2", "", 0, "v", 9], ["화목", "11AM", "2", "C1", "고하율", 150, "g"], ["화목", "7PM", "1", "D1", "구시윤", 80, "s"], ["토일", "오전", "3", "E1", "황다솜", 260, "g"], ["토일", "오전", "1", "E2", "손예담", 25, "o"]],
  sw: [["월수", "6PM", "1", "A1", "심우주", 240, "g"], ["화목", "6PM", "2", "B1", "노나린", 120, "o"], ["화목", "11AM", "1", "B2", "", 0, "v", 4], ["토일", "오전", "패턴1", "C1", "곽도아", 190, "g"], ["토일", "오전", "2", "C2", "배소이", 45, "s"]],
};
const SUBS = {
  en: [["sub", "월수", "6PM", "2", "유하온", 200, "월·수 저녁, 토 오전", true], ["sub", "", "11AM", "1", "도겸이", 120, "평일 오전 가능", false], ["wait", "화목", "8PM", "프토", "지서윤", 14, "", false]],
  jp: [["sub", "화목", "일본어 저녁", "1", "채하은", 90, "화·목 저녁 / 일본어", true], ["wait", "월수", "중국어 오전", "2", "마루이", 10, "", false]],
  bs: [["sub", "", "7PM", "1", "탁이레", 70, "평일 저녁", false]], sw: [["wait", "토일", "오전", "1", "빈하루", 6, "", false]],
};
const STAFFL = { en: [["", "블로그 스텝", "표하랑", 220], ["월수", "SNS 스텝", "엄가을", 100]], jp: [["", "블로그 스텝", "맹소담", 150]], bs: [["", "SNS 스텝", "빈지유", 90]], sw: [] };
const L = [], att = [], conf = [], months = [], raps = [], certs = [], awards = [];
let lid = 0; const GDAYS = { 월수: [1, 3], 화목: [2, 4], 토일: [6, 0] };
const base = (tm, o) => ({ id: ++lid, team_id: tm.id, kind: "leader", grp: "", slot: "", level: "", seat: "", name: "", status: "확정", start_day: "", phone: "", note: "", edu: "", memo: "", rapport: null, rapport_by: "", sort: lid, edu_done: false, need_since: null, end_day: null, end_reason: "", end_note: "", source: "", need_note: "", avail: "", promote: false, created_at: iso(addD(TD, -90), "10:00"), ...o });
const NOTES = ["", "", "", "격주 일정 사전 공유", "영어 발음 코칭 강점", "시험 기간 한 달 쉬어요", "신규 회원 케어가 좋아요", "수업 준비 자료 꼼꼼"];
const FROM = addD(month(-2) + "-01", 0), SD = [];
for (let d = FROM; d <= addD(TD, 1); d = addD(d, 1)) SD.push(d);
for (const tm of TM) {
  const rows = [];
  for (const [grp, slot, level, seat, name, ago, prof, nd] of LD_[tm.key]) {
    const r = rng(tm.key + seat + slot), vac = prof === "v";
    const row = base(tm, { grp, slot, level, seat, name: vac ? "(구하는 중)" : name, status: vac ? "구해야 함" : "확정", need_since: vac ? addD(TD, -nd + 1) : null, start_day: vac ? "" : addD(TD, -ago),
      phone: vac ? "" : ph(r), note: vac ? `${name || "전임 리더"} 자리` : pick(r, NOTES), need_note: vac ? pick(r, ["저녁 시간 가능한 리더 우선 · 인스타 공고 올림", "레벨 맞는 지원자 면접 1명 대기", "기존 회원 중 후보에게 제안 중"]) : "",
      edu: vac ? "" : ago > 20 ? `${addD(TD, -ago + 7).slice(5).replace("-", "/")} 교육 참석` : "", edu_done: !vac && ago > 20 && r() > 0.12, source: vac ? "" : pick(r, ["회원 전환", "지인 추천", "알바몬", "인스타", "당근"]) });
    row._prof = prof; row._ago = ago; rows.push(row);
  }
  for (const [kind, grp, slot, level, name, ago, avail, promote] of SUBS[tm.key]) { const r = rng(tm.key + name); rows.push(base(tm, { kind, grp, slot, level, name, start_day: addD(TD, -ago), phone: ph(r), avail, promote, note: kind === "wait" ? "팀 배정 대기" : "" })); }
  for (const [grp, slot, name, ago] of STAFFL[tm.key]) rows.push(base(tm, { kind: "staff", grp, slot, name, start_day: addD(TD, -ago), phone: ph(rng(name)), note: slot.includes("블로그") ? "주 2회 포스팅" : "" }));
  // 그만둔 리더 한 명 (지난달)
  const gone = rows.find((x) => x._prof === "o"); if (gone && tm.key === "en") rows.push(base(tm, { grp: gone.grp, slot: gone.slot, level: "2", seat: "Z9", name: "남궁서하", start_day: addD(TD, -300), phone: ph(rng("gone")), end_day: addD(TD, -12), end_reason: "학업·시험", end_note: "시험 준비로 3개월 휴식, 복귀 의사 있음", edu_done: true }));
  L.push(...rows);
  const subNames = SUBS[tm.key].filter((s) => s[0] === "sub").map((s) => s[4]);
  for (const row of rows.filter((x) => x._prof && x._prof !== "v")) { // 출석
    const days = GDAYS[row.grp], sess = SD.filter((d) => days.includes(dow(d)) && d < TD && d >= row.start_day), r = rng("a" + row.id);
    const lastM = sess.filter((d) => d.slice(0, 7) === M[2]), thisM = sess.filter((d) => d.slice(0, 7) === CUR), p = row._prof;
    const xs = new Map(); // 날짜 → 대타 이름
    if (p === "o" && lastM[1]) xs.set(lastM[1], "");
    if (p === "s") { if (lastM[2]) xs.set(lastM[2], pick(r, subNames) || ""); if (thisM[0]) xs.set(thisM[0], pick(r, subNames) || ""); }
    if (p === "b") { [0, 2, 4].forEach((i) => lastM[i] && xs.set(lastM[i], "")); if (thisM[0]) xs.set(thisM[0], ""); if (thisM[1]) xs.set(thisM[1], ""); if (thisM[2]) xs.set(thisM[2], ""); }
    for (const d of sess) att.push({ leader_id: row.id, day: d, state: xs.has(d) ? "X" : "O", sub: xs.get(d) ?? "", by_name: d >= "2026-10-27" ? "전산" : tm.mgr, at: iso(d, "22:00") });
    if (p === "g" && lastM.length && awards.length < 12 && row.id % 2) awards.push({ leader_id: row.id, month: M[2] + "-01", note: "스타벅스 쿠폰 지급", by_name: tm.mgr, at: iso(addD(`${CUR}-01`, 1), "10:00") });
    // 자격증: 6개월(2급)·1년(1급) — 일부는 아직 발급 전으로 남김
    for (const [g, days_] of [[2, 183], [1, 365]]) if (row._ago >= days_ && row.id % 5 !== 2) certs.push({ leader_id: row.id, grade: g, issued_on: addD(row.start_day, days_ + 9), by_name: tm.mgr, at: iso(addD(row.start_day, days_ + 9), "12:00") });
    // 라포: 지난달은 전원, 이번 달은 일부 — 매니저(+대표 일부)
    for (const [mi, m] of [[2, M[2]], [3, CUR]]) { if (mi === 3 && row.id % 3 === 0) continue; if (row.start_day > addD(`${m}-01`, 27)) continue;
      const rate = Math.max(1, Math.min(5, ({ g: 5, o: 4, s: 4, b: 2, n: 3 }[p] ?? 4) + (r() < 0.3 ? -1 : 0)));
      raps.push({ leader_id: row.id, month: m + "-01", user_id: tm.mgrId, name: tm.mgr, rapport: rate, at: iso(addD(`${m}-01`, 12), "13:00") });
      if (row.id % 4 === 0) raps.push({ leader_id: row.id, month: m + "-01", user_id: U.boss, name: "김대표", rapport: Math.min(5, rate + 1), at: iso(addD(`${m}-01`, 14), "09:00") }); }
  }
  // 오늘·내일 온다 확인
  let nx = addD(TD, 1); while (!Object.values(GDAYS).some((v) => v.includes(dow(nx)))) nx = addD(nx, 1);
  for (const [d, share] of [[TD, 0.7], [nx, 0.35]]) { const g = Object.keys(GDAYS).find((k) => GDAYS[k].includes(dow(d)));
    rows.filter((x) => x.kind === "leader" && x.grp === g && x.status === "확정" && !x.end_day && x.start_day <= d).forEach((x, i) => { if (rng("c" + x.id + d)() < share) conf.push({ leader_id: x.id, day: d, by_name: tm.mgr, at: iso(d, "09:3" + (i % 10)), note: d === TD && i === 1 ? "10분 지각" : "" }); }); }
}
L.forEach((r) => { delete r._prof; delete r._ago; });
put("leaders", L); put("leader_att", att); put("leader_confirm", conf); put("leader_certs", certs); put("leader_awards", awards); put("leader_rapports", raps);
const syncMonths = () => { // leader_rapports → 평균 라포 (서버 트리거 대신)
  const g = new Map(); for (const x of t.leader_rapports) { const k = x.leader_id + "|" + x.month; g.set(k, [...(g.get(k) ?? []), x]); }
  for (const [k, xs] of g) { const [id, mo] = k.split("|"); let m = t.leader_months.find((r) => r.leader_id == id && r.month === mo); if (!m) t.leader_months.push((m = { leader_id: +id, month: mo, night: false, at: new Date().toISOString() }));
    m.rapport = Math.round(xs.reduce((a, x) => a + x.rapport, 0) / xs.length); m.rapport_by = xs.map((x) => x.name).sort().join("·"); }
  for (const m of t.leader_months) if (!g.has(m.leader_id + "|" + m.month)) { m.rapport = null; m.rapport_by = ""; }
};
t.leader_months = []; syncMonths();
for (const r of t.leaders) { const m = t.leader_months.filter((x) => x.leader_id === r.id && x.rapport).sort((a, b) => (a.month < b.month ? 1 : -1))[0]; if (m) { r.rapport = m.rapport; r.rapport_by = m.rapport_by; } }
put("leader_mix", [{ team_id: T.en, month: CUR + "-01", by_name: "이서연", updated_at: iso(addD(TD, -1), "16:20"), body: "월수 6PM C2 정시현 ↔ 화목 6PM F2 빈자리 : 레벨 맞춰 교체 검토\n월수 11AM A2 박도하 패턴1 → 월수 2PM B1 합류 제안\n신규 리더 임수현 토일 오전 H2: 첫 2주 멘토 김서린\n8PM 윤세아 프토 반 신설 가능한지 회원 수요 확인", who: ["이서연", "이서연", "한지우", "김대표"] }]);
const AI = (b) => { // 지점 데이터로 짧은 전략 글 (실제 AI 아님)
  const rs = t.leaders.filter((r) => r.team_id === b.team && r.kind === "leader" && !r.end_day), need = rs.filter((r) => r.status === "구해야 함"), ok = rs.filter((r) => r.status === "확정");
  const ms = b.month.slice(0, 7), xs = ok.map((r) => [r, t.leader_att.filter((a) => a.leader_id === r.id && a.day.startsWith(ms) && a.state === "X" && !a.sub).length]).filter((x) => x[1] >= 2).map((x) => x[0].name);
  const low = ok.filter((r) => { const q = t.leader_months.find((m) => m.leader_id === r.id && m.month === b.month); return q?.rapport && q.rapport <= 2; }).map((r) => r.name);
  const tn = t.teams?.find((x) => x.id === b.team)?.name ?? "우리 지점";
  return `**${+ms.slice(5)}월 ${tn} 리더 운영 요약**\n활동 리더 ${ok.length}팀, 빈자리 ${need.length}자리예요.\n\n**1. 공석 채우기**\n${need.length ? need.map((r) => `- ${r.grp} ${r.slot} ${r.level}레벨 자리 (${Math.round((new Date() - new Date(r.need_since)) / 864e5) + 1}일째)`).join("\n") + "\n오래 비어 있는 자리부터 서브리더 승격 후보에게 먼저 제안하세요." : "- 지금 빈자리 없음"}\n\n**2. 신경 쓸 리더**\n${xs.length ? `- 이번 달 결석이 반복되는 리더: ${xs.join(", ")} → 1:1 면담으로 일정 조정` : "- 결석이 반복되는 리더 없음"}\n${low.length ? `- 라포 낮음: ${low.join(", ")} → 수업 참관 후 피드백` : ""}\n\n**3. 이번 달 체크리스트**\n- 신규 리더 첫 2주 멘토 배정 확인\n- 개근 리더 혜택 지급 마무리\n- 근속 6개월·1년 자격증 발급 대상 확인`;
};
put("leader_ai", [T.en, T.jp].flatMap((team) => [CUR, M[2]].map((m) => ({ team_id: team, month: m + "-01", text: AI({ team, month: m + "-01" }), by_name: "대표", created_at: iso(addD(`${m}-01`, 2), "10:30") }))));
fn["planner-leader-ai"] = (b) => { const m = (b.month || CUR + "-01").slice(0, 10); const row = { team_id: b.team, month: m, text: AI({ team: b.team, month: m }), by_name: "대표", created_at: new Date().toISOString() }; const ex = t.leader_ai.find((x) => x.team_id === b.team && x.month === m); ex ? Object.assign(ex, row) : t.leader_ai.push(row); return { ok: true }; };

// ───────── 서버가 하던 일(트리거)을 체험판에서 흉내 ─────────
const HOOK = {
  leaders: { pre(q) { // 구해야 함이 된 날부터 며칠째
    const f = (v) => { v = { ...v }; if (v.status === "확정") v.need_since = null; else if ((v.status === "구해야 함" || "need_since" in v) && !v.need_since && (q.op === "insert" ? v.status === "구해야 함" : true)) v.need_since = day(0); return v; };
    if (q.op === "update" && q.val && ("status" in q.val || "need_since" in q.val)) q.val = f(q.val); if (q.op === "insert") q.val = [].concat(q.val).map(f); } },
  leader_rapports: { post(q) { if (q.op !== "select") syncMonths(); } },
  fin_rows: { pre(q) { if (q.op === "insert") q.val = [].concat(q.val).map((r) => derive({ files: 0, sheet_diff: {}, sheet_flag: null, deleted_at: null, updated_by: "대표", ...r })); } },
  fin_files: { post(q) { if (q.op !== "select") for (const r of t.fin_rows) r.files = t.fin_files.filter((f) => f.row_id === r.id).length; } },
};
const cc = window.supabase.createClient;
window.supabase.createClient = (...a) => {
  const c = cc(...a), from = c.from;
  c.from = (tb) => { const q = from(tb), h = HOOK[tb]; if (!h) return q; const run = q.run; q.run = function () { h.pre?.(this); const res = run.call(this); h.post?.(this, res); return res; }; return q; };
  return c;
};
})();
