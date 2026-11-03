// 🧪 체험판 샘플: 지점·사람 (공용) — 주간·월간 등 나머지 핵심 탭은 아래에 채움
(() => {
  const { U, T, tables: t } = DEMO;
  t.teams = [
    { id: T.en, name: "서울영어점", sort: 1 }, { id: T.jp, name: "서울일중점", sort: 2 },
    { id: T.bs, name: "부산점", sort: 3 }, { id: T.sw, name: "수원점", sort: 4 },
  ];
  t.profiles = [
    { user_id: U.boss, name: "김대표", role: "admin", phone: "", team_id: null, prefs: { skin: "glass" }, temp_pw: false },
    { user_id: U.m1, name: "이서연", role: "manager", phone: "", team_id: T.en, prefs: {}, temp_pw: false },
    { user_id: U.m2, name: "박지훈", role: "manager", phone: "", team_id: T.jp, prefs: {}, temp_pw: false },
    { user_id: U.m3, name: "최수빈", role: "manager", phone: "", team_id: T.bs, prefs: {}, temp_pw: false },
    { user_id: U.m4, name: "정민재", role: "manager", phone: "", team_id: T.sw, prefs: {}, temp_pw: false },
    { user_id: U.a1, name: "한지우", role: "assistant", phone: "", team_id: T.en, prefs: {}, temp_pw: false },
  ];
})();

// ───────────────────────────────────────────────────────────────────────────
// 아래: 주간·월간·팀·바로가기·연락처·시뮬레이터·현황 + 첫 화면 공통(소식·신고·언젠가·메모·브리핑) + 공용 rpc
// 날짜는 전부 오늘 기준 상대값. 표 배열은 삭제 때 통째로 바뀌므로 항상 DEMO.tables[이름] 으로 다시 찾는다.
(() => {
  const { U, T, rpc, fn, day, at, uuid } = DEMO;
  const rows = (n) => (DEMO.tables[n] ||= []);
  const pad = (n) => String(n).padStart(2, "0");
  const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const plus = (s, n) => { const d = new Date(`${s}T00:00:00`); d.setDate(d.getDate() + n); return ymdOf(d); };
  const dow = (s) => new Date(`${s}T00:00:00`).getDay();
  const iso = (s, hm = "10:00") => new Date(`${s}T${hm}:00`).toISOString();
  const md = (s) => `${+s.slice(5, 7)}/${+s.slice(8, 10)}`;
  const KD = "일월화수목금토";
  const mondayOf = (s) => plus(s, -((dow(s) + 6) % 7));
  const hash = (...a) => { let x = 2166136261; for (const c of a.join("|")) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } return ((x >>> 0) % 10000) / 10000; };
  const rot = (a, k) => a.map((_, i) => a[(i + k) % a.length]);
  const prof = (id) => rows("profiles").find((p) => p.user_id === id);
  const nameOf = (id) => prof(id)?.name ?? null;
  const teamName = (id) => rows("teams").find((x) => x.id === id)?.name ?? null;
  const TODAY = day(0), M0 = mondayOf(TODAY), WK = [1, 2, 3, 4, 5];
  const MGR = { [T.en]: U.m1, [T.jp]: U.m2, [T.bs]: U.m3, [T.sw]: U.m4 };

  // 지점 설정: 시뮬레이션 메모 켬 · 내일 상담 목표
  for (const x of rows("teams")) { x.sim_note = true; x.consult_target = { [T.en]: 8, [T.jp]: 8, [T.bs]: 7, [T.sw]: 6 }[x.id]; }

  // 서버가 채워 주는 값(로그인한 대표 기준) + 서버 트리거 흉내
  const D = DEMO.defaults, H = DEMO.hooks;
  D.tasks = () => ({ user_id: U.boss, title: "", note: "", done: false, sort: Date.now() / 1000, deadline: null, remind_min: 60, deadline_log: [], notified_at: null, important: false, must_do: false, start_time: null, estimate_min: null, spent_sec: 0, started_at: null, countdown: false, assigned_by: null, assign_log: [], refs: [] });
  D.someday = () => ({ user_id: U.boss, done: false, refs: [] });
  D.feedback = () => ({ user_id: U.boss, kind: "bug", status: "new", photos: [] });
  D.app_updates = () => ({ created_by: U.boss, feedback_id: null, to_all: true, to_author: true });
  D.my_notes = () => ({ user_id: U.boss, body: "", plan: {} });
  D.briefs = () => ({ user_id: U.boss });
  D.team_tasks = () => ({ created_by: U.boss, done_by: null, done_at: null, deadline: null });
  D.routine_items = () => ({ weeks: null, color: "", sort: Date.now() / 1000, carry: false, need_link: false, need_photo: false, need_count: false, team_id: null, from_day: null, to_day: null });
  D.links = () => ({ user_id: U.boss, scope: "me", team_id: null });
  D.branch_docs = () => ({ uploaded_by: U.boss });
  D.contacts = () => ({ branch: "", phone: "", note: "", sort: Date.now() / 1000 });
  D.roster = () => ({ sort: Date.now() / 1000 });
  D.month_goals = () => ({ user_id: U.boss });
  D.push_subs = () => ({ user_id: U.boss });
  Object.assign(DEMO.pk, { my_notes: ["user_id", "day"], team_notes: ["team_id", "day"], briefs: ["user_id", "day"], roster: ["name"], team_routine_checks: ["team_id", "item_id", "day"], push_subs: ["endpoint"] });
  DEMO.pk.month_goals ||= ["user_id", "month"];
  H["links.insert"] = (r) => { r.profiles = { name: nameOf(r.user_id) ?? "" }; };
  H["my_notes.insert"] = H["my_notes.update"] = (r) => { r.at = r.updated_at; }; // 기록 목록의 '마지막 저장' 시각
  H["app_updates.insert"] = (r) => { const f = rows("feedback").find((x) => x.id === r.feedback_id); if (f) f.status = "done"; }; // 반영 공지를 보내면 그 제안은 처리완료
  H["tasks.update"] = (n, o) => {
    if (n.deadline !== o.deadline) { // 데드라인을 바꾸면 기록을 남기고 알람을 다시 켠다
      if (o.deadline) n.deadline_log = [...(o.deadline_log || []), { from: o.deadline, to: n.deadline, at: new Date().toISOString() }];
      n.notified_at = null;
    }
    if (n.done && !o.done && o.started_at) { n.spent_sec = o.spent_sec + Math.max(0, Math.round((Date.now() - new Date(o.started_at)) / 1000)); n.started_at = null; } // 완료하면 타이머 자동 정지
  };

  // ── 📌 고정업무 ──
  let rid = 0;
  const RI = (title, days, o = {}) => ({ id: ++rid, title, days, weeks: null, color: "", sort: rid, carry: false, need_link: false, need_photo: false, need_count: false, team_id: null, from_day: null, to_day: null, created_at: at(-40), ...o });
  const routine = [
    RI("조교 요청사항 확인하고 달력에 반영하기", WK),
    RI("리더 현황 확인하고 오늘 스터디 준비하기", WK),
    RI("오전 신규 문의 전화 회신하기", WK, { color: "red" }),
    RI("수강증·출석증 발급 요청 처리하기", WK),
    RI("상담 예약 확정 문자 보내고 미참석자 연락 돌리기", WK),
    RI("인스타 DM 확인하고 답장하기", WK),
    RI("다음날 상담 예약 수 확인해서 입력하기", [1, 2, 3, 4], { need_count: true, color: "yellow" }),
    RI("내일 스터디 시뮬레이션 작성하기", WK),
    RI("창고·복도 정리하고 인증샷 남기기", [1, 4], { color: "green", need_photo: true }),
    RI("비품 재고 확인하고 주문하기", [4], { color: "green" }),
    RI("블로그 글 1개 발행하고 링크 올리기", [3], { color: "green", need_link: true, carry: true }),
    RI("달력 미참석자 전화 돌리기 (오전·오후 한 번씩)", [3], { color: "green", weeks: [1, 3] }),
    RI("상담 기록 누락된 것 채워 넣기", [3], { color: "green", weeks: [2, 4] }),
    RI("주말 스터디 출석 확인하고 사진 공유하기", [6], { color: "green" }),
    RI("대표에게 보고하고 퇴근하기", WK, { color: "yellow", sort: 99 }),
    // 대표가 업무 배정에서 '지점 고정업무(그날만)'으로 보낸 일
    RI("정수기 점검 기사 방문 맞이하기 (오후 3시)", [0, 1, 2, 3, 4, 5, 6], { team_id: T.sw, from_day: day(0), to_day: day(0), color: "red", sort: 50 }),
    RI("간판 조명 교체 업체 방문 확인하기", [0, 1, 2, 3, 4, 5, 6], { team_id: T.en, from_day: day(1), to_day: day(1), sort: 51 }),
    RI("소방 안전 점검표 사진 찍어 공유하기", [0, 1, 2, 3, 4, 5, 6], { team_id: T.bs, from_day: day(-2), to_day: day(-2), sort: 52 }),
  ];
  DEMO.tables.routine_items = routine;
  const on = (i, team, d) => i.days.includes(dow(d)) && (!i.weeks || i.weeks.includes(Math.floor((+d.slice(8, 10) - 1) / 7) + 1))
    && (!i.team_id || i.team_id === team) && (!i.from_day || d >= i.from_day) && (!i.to_day || d <= i.to_day);
  const sorted = () => [...rows("routine_items")].sort((a, b) => a.sort - b.sort || a.id - b.id);

  // 지점마다 최근 2주 체크 기록 (오늘은 지점별로 진행 정도가 다르게)
  const PHOTO = (label, c) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'><rect width='320' height='240' fill='${c}'/><circle cx='160' cy='96' r='34' fill='#ffffff' fill-opacity='.35'/><text x='160' y='170' font-size='26' text-anchor='middle' fill='#fff' font-family='sans-serif'>${label}</text></svg>`)}#/routine-photos/demo.jpg`;
  const PROG = { [T.en]: 0.7, [T.jp]: 1, [T.bs]: 0.4, [T.sw]: 0.85 }, BASE_NUM = { [T.en]: 9, [T.jp]: 6, [T.bs]: 7, [T.sw]: 6 };
  let lastWed = plus(TODAY, -1); for (let k = 1; k <= 7; k++) if (dow(plus(TODAY, -k)) === 3) { lastWed = plus(TODAY, -k); break; }
  const checks = [];
  for (const tm of rows("teams")) for (let off = -14; off <= 0; off++) {
    const d = plus(TODAY, off), its = routine.filter((i) => on(i, tm.id, d)).sort((a, b) => a.sort - b.sort);
    const doneN = off === 0 ? Math.round(PROG[tm.id] * its.length) : its.length;
    its.forEach((it, idx) => {
      if (off === 0 ? idx >= doneN : (hash(tm.id, it.id, d) < 0.06 || (it.carry && tm.id === T.bs && d === lastWed))) return;
      const mins = Math.min(19 * 60 + 30, 9 * 60 + 40 + idx * 37 + Math.floor(hash(it.id, d, "m") * 15));
      checks.push({ team_id: tm.id, item_id: it.id, day: d, done_by: MGR[tm.id], link: it.need_photo ? PHOTO("정리 완료", "#8b79c4") : it.need_link ? `https://blog.example.com/${tm.id}/post-${d.slice(5)}` : null,
        num: it.need_count ? Math.max(2, BASE_NUM[tm.id] + (off === 0 ? 0 : hash(tm.id, d, "n") < 0.3 ? 1 : hash(tm.id, d, "n") > 0.8 ? -1 : 0)) : null,
        done_at: off === 0 ? new Date(Date.now() - (doneN - idx) * 14 * 60000).toISOString() : iso(d, `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`) });
    });
  }
  DEMO.tables.team_routine_checks = checks;

  // ── 👥 팀 업무 · 명단 ──
  let kid = 0;
  const KT = (team, off, title, o = {}) => ({ id: ++kid, team_id: team, day: day(off), title, deadline: null, done_by: null, done_at: null, created_by: U.boss, created_at: at(off - 2, "09:00"), notified_at: null, ...o });
  const dn = (team, off, hm) => ({ done_by: MGR[team], done_at: iso(day(off), hm) });
  DEMO.tables.team_tasks = [
    KT(T.en, -3, "이번 주 전단지 50장 비치하기", dn(T.en, -3, "15:20")),
    KT(T.en, 0, "수강생 만족도 설문 링크 돌리기", { deadline: iso(day(0), "18:00") }),
    KT(T.en, 2, "신규 리더 오리엔테이션 자료 인쇄하기", { created_by: U.m1 }),
    KT(T.en, 6, "분기 소방 점검 확인서 준비하기"),
    KT(T.jp, -2, "게시판 공지 새로 교체하기", dn(T.jp, -2, "11:10")),
    KT(T.jp, 0, "일본어 입문반 교재 재고 세어 보기", { created_by: U.m2 }),
    KT(T.jp, 3, "중국어 레벨테스트 문제지 인쇄하기", { deadline: iso(day(3), "12:00") }),
    KT(T.bs, -1, "스터디룸 청소 상태 사진 찍어 올리기", dn(T.bs, -1, "17:45")),
    KT(T.bs, 0, "월말 보고 초안 정리하기", { deadline: iso(day(0), "17:00") }),
    KT(T.bs, 4, "주말 특강 현수막 달기", { created_by: U.m3 }),
    KT(T.sw, -4, "오픈 이벤트 포스터 출력하기", dn(T.sw, -4, "14:30")),
    KT(T.sw, 0, "정수기 점검 후 필터 교체 일정 받기"),
    KT(T.sw, 1, "신규 등록 안내 문자 문구 확정하기", { created_by: U.m4, deadline: iso(day(1), "16:00") }),
    KT(T.sw, 5, "오픈 이벤트 경품 포장하기"),
  ];
  DEMO.tables.roster = [
    { name: "이서연", team_id: T.en, sort: 1 }, { name: "박지훈", team_id: T.jp, sort: 2 }, { name: "최수빈", team_id: T.bs, sort: 3 }, { name: "정민재", team_id: T.sw, sort: 4 },
    { name: "오하린", team_id: T.en, sort: 5 }, { name: "강도현", team_id: T.sw, sort: 6 },
  ];

  // ── ✅ 할 일 (대표 + 매니저들 — 👀 매니저 화면 보기에서 그대로 보임) ──
  let tid = 0;
  const TK = (user, d, title, o = {}) => ({ id: ++tid, user_id: user, day: d, title, note: "", done: false, sort: tid, deadline: null, remind_min: 60, deadline_log: [], notified_at: null, created_at: iso(plus(d, -3), "09:00"),
    important: false, must_do: false, start_time: null, estimate_min: null, spent_sec: 0, started_at: null, countdown: false, assigned_by: null, assign_log: [], assign_notified_at: null, refs: [], ...o });
  const tasks = [];
  const BOSS_POOL = ["지점별 지난주 매출 확인", "광고 성과 시트 점검", "신규 매니저 면접 일정 정리", "교재 인쇄 발주 확인", "블로그 발행 현황 보기", "회원 후기 이벤트 문구 검토", "거래처 견적서 회신하기",
    "리더 현황 주간 점검", "수강생 재등록률 확인", "세무 자료 정리해서 전달", "운영 매뉴얼 고칠 곳 메모", "지점 매니저와 15분 통화", "경쟁 학원 이벤트 살펴보기", "인스타 게시물 시안 확인", "비품 구매 내역 승인",
    "상담 전환율 점검", "다음 주 업무 배정 초안", "교육 자료 개정본 읽어 보기", "조교 근무표 확인", "월간 목표 대비 진행률 확인", "수강생 불만 접수 내역 확인", "이벤트 경품 재고 확인"];
  // 이번 주는 손으로: [제목, 옵션] (i 중요 · m 꼭 · dl 마감 시각 · st 시작 · es 예상분 · nd 안 끝냄)
  const THIS = [
    [["지점별 지난주 매출 정리 확인", { sp: 1500 }], ["주간 업무 배정 보내기", { i: 1, st: "09:30", es: 30, sp: 1620 }], ["광고 성과 시트 점검", { es: 60, sp: 3300 }]],
    [["서울영어점 상담 전환율 점검", { st: "10:00", es: 45 }], ["신규 매니저 채용 공고 문구 검토"], ["거래처 견적서 회신하기", { m: 1, dl: "18:00", nd: 1 }]],
    [["월간 목표 대비 진행률 확인", { i: 1 }], ["부산점 운영 점검 통화", { st: "14:00", es: 30 }], ["블로그 발행 현황 확인"], ["교재 인쇄 발주 마무리", { dl: "17:00" }]],
    [["수원점 오픈 이벤트 기획안 검토", { i: 1, es: 90, dl: "16:00" }], ["세무 자료 전달", { dl: "18:00" }], ["리더 현황 주간 점검", { st: "11:00", es: 30 }]],
    [["이번 주 업무 회고 쓰기", { es: 30 }], ["다음 주 업무 배정 초안 작성", { i: 1 }], ["지점별 고정업무 완료율 확인"]],
    [["주말 특강 현장 둘러보기"]], [["다음 주 계획 훑어보기"]],
  ];
  THIS.forEach((list, i) => list.forEach(([title, o = {}], k) => {
    const d = plus(M0, i), done = !o.nd && (d < TODAY ? true : d === TODAY ? k % 2 === 0 : false);
    tasks.push(TK(U.boss, d, title, { done, important: !!o.i, must_do: !!o.m, start_time: o.st ?? null, estimate_min: o.es ?? null, spent_sec: done ? (o.sp ?? 0) : 0, deadline: o.dl ? iso(d, o.dl) : null }));
  }));
  tasks.push(TK(U.boss, day(-1), "수원점 임대 계약서 검토 의견 보내기", { must_do: true, important: true, deadline: iso(day(-1), "18:00"), deadline_log: [{ from: iso(day(-3), "18:00"), to: iso(day(-1), "18:00"), at: at(-3, "17:10") }] }));
  tasks.push(TK(U.boss, day(1), "세무사 전화 상담 일정 확정하기", { deadline: iso(day(1), "15:00") }));
  tasks.push(TK(U.boss, day(2), "다음 달 광고 예산 확정하기", { important: true, deadline: iso(day(2), "12:00"), es: 60, estimate_min: 60 }));
  tasks.push(TK(U.boss, day(4), "분기 교육 일정표 확정하기", { deadline: iso(day(4), "17:00") }));
  tasks.push(TK(U.boss, day(0), "오늘 저녁 매니저 회식 장소 예약", { start_time: "15:30", note: "7명, 지하철역에서 가까운 곳으로" }));
  // 그 밖의 주(지난 5주 ~ 앞으로 5주)는 풀에서 돌려가며
  for (let w = -5; w <= 5; w++) {
    if (w === 0) continue;
    for (let i = 0; i < 7; i++) {
      const d = plus(M0, w * 7 + i), n = i < 5 ? 3 : i === 5 ? 1 : (w + 5) % 3 === 0 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const title = BOSS_POOL[Math.floor(hash("b", w, i, k) * 997) % BOSS_POOL.length];
        tasks.push(TK(U.boss, d, title, { done: d < TODAY && hash("bd", w, i, k) < (w === -1 ? 0.9 : 0.85), important: hash("bi", w, i, k) < 0.12, start_time: hash("bs", w, i, k) < 0.2 ? "10:00" : null,
          estimate_min: hash("be", w, i, k) < 0.2 ? 30 : null }));
      }
    }
  }
  // 달마다 정해진 일 (월간 달력이 비지 않게)
  for (let m = -1; m <= 1; m++) {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + m);
    const first = ymdOf(base), last = ymdOf(new Date(base.getFullYear(), base.getMonth() + 1, 0));
    for (const [d, title, imp] of [[first, "이번 달 목표 지점별로 공유하기", 1], [plus(first, 9), "부가세·세무 자료 전달", 0], [plus(first, 14), "중간 점검 회의 준비", 0], [plus(first, 24), "급여 정산 확인", 1], [last, "월말 보고 취합해서 읽기", 1]])
      tasks.push(TK(U.boss, d, title, { done: d < TODAY, important: !!imp }));
  }
  // 매니저들 (미리보기용)
  const MGR_POOL = ["신규 문의 회신 리스트 정리", "리더 스터디 준비물 확인", "상담 예약 확정 문자 보내기", "환불·양도 요청 처리", "이번 주 이벤트 게시물 올리기", "비품 재고 체크", "수강생 출석 점검",
    "후기 이벤트 안내 보내기", "교재 재고 확인", "회원 만족도 통화 5명", "미참석자 재안내 연락", "조교 업무 요청 확인", "상담 기록 빠진 곳 채우기", "시뮬레이션 내용 점검"];
  for (const [mid, tm] of Object.entries({ [U.m1]: "m1", [U.m2]: "m2", [U.m3]: "m3", [U.m4]: "m4" }).map(([k, v]) => [k, v]))
    for (let w = -3; w <= 5; w++) for (let i = 0; i < 6; i++) {
      const d = plus(M0, w * 7 + i), n = i < 5 ? (Math.abs(w) <= 2 ? 3 : 2) : 1;
      for (let k = 0; k < n; k++) tasks.push(TK(mid, d, MGR_POOL[Math.floor(hash(tm, w, i, k) * 991) % MGR_POOL.length], { done: d < TODAY ? hash("md", tm, w, i, k) < 0.88 : d === TODAY ? k === 0 : false,
        start_time: hash("ms", tm, w, i, k) < 0.15 ? "14:00" : null, important: hash("mi", tm, w, i, k) < 0.08 }));
    }
  // 📨 대표가 배정한 일
  const AS = (user, off, title, o = {}) => tasks.push(TK(user, day(off), title, { assigned_by: U.boss, assign_notified_at: at(off - 1, "10:00"), done: off < 0 || !!o.done, ...o }));
  AS(U.m1, -3, "지난달 환불 내역 정리해서 공유하기", { important: true, done: true });
  AS(U.m2, -1, "일본어 입문반 안내문 수정본 보내기", { assign_log: [{ from: day(-3), to: day(-1), reason: "개강 준비 일정이 겹쳐서 이틀 미룹니다", at: at(-3, "15:10") }] });
  AS(U.m2, 0, "일중 교재 재고 확인해서 보고하기", { done: true });
  AS(U.m3, 0, "신규 등록자 후기 요청 문자 10명 보내기", { important: true, deadline: iso(day(0), "17:00") });
  AS(U.m4, 0, "오픈 이벤트 현수막 시안 확인하기");
  AS(U.m1, 0, "리더 모집 공고 올리기");
  AS(U.m2, 1, "수강생 재등록 안내 전화 8명", { important: true, deadline: iso(day(1), "18:00") });
  AS(U.m3, 2, "월말 보고서 초안 작성하기");
  AS(U.m4, 3, "비품 주문 내역 공유하기");
  DEMO.tables.tasks = tasks;

  // ── 🧠 시뮬레이션 타임박스 (지점 공용) · 내 시뮬레이터 ──
  const SIMSET = {
    [T.en]: { pri: ["오늘 상담 8명 확정 연락 마무리", "신규 리더 오리엔테이션 자료 준비", "인스타 게시물 1개 + 블로그 1개 발행"], asst: "한지우",
      body: ["회신 못 받은 3명 재연락", "B반 교재 12부 인쇄", "마커·지우개 비품 주문", "출석부 정리 조교님께 요청", "내일 상담 예약자 확인 문자", "스터디룸 의자 배치 점검"],
      tbl: { "09:00": "출근 · 캘린더 전달사항 확인", "10:00": "신규 문의 전화 회신", "11:00": "리더 현황 점검", "14:00": "상담 1~3", "15:00": "상담 4~5", "16:00": "상담 6~8", "17:00": "블로그 발행", "18:00": "내일 시뮬레이션 · 대표 보고" } },
    [T.jp]: { pri: ["일본어 입문반 개강 안내 문자 발송", "중국어 레벨테스트 일정 확정", "오후 상담 6명 준비"], asst: "조교 · 서울일중점",
      body: ["입문반 교재 재고 확인", "체험 수업 참석자 리마인드", "후기 이벤트 게시물 초안", "조교 근무표 확인", "상담 자료(레벨표) 출력"],
      tbl: { "09:00": "출근 · 전달사항 확인", "10:00": "체험 수업 참석자 리마인드 문자", "11:00": "레벨테스트 일정 조율", "13:00": "교재 재고 세기", "14:00": "상담 1~3", "16:00": "상담 4~6", "17:00": "내일 시뮬레이션 · 대표 보고" } },
    [T.bs]: { pri: ["월말 보고 초안 쓰기", "미참석자 전화 돌리기", "주말 특강 사전 준비"], asst: null,
      body: ["특강 강사님께 시간표 전달", "현수막 문구 확정", "수강생 설문 응답 정리", "비품 재고 사진 찍어 두기"],
      tbl: { "09:00": "출근 · 전달사항 확인", "10:00": "미참석자 전화 1차", "11:00": "월말 보고 초안", "14:00": "상담", "16:00": "미참석자 전화 2차", "17:00": "특강 준비물 챙기기", "18:00": "대표 보고" } },
    [T.sw]: { pri: ["오픈 이벤트 참가자 명단 정리", "현수막 시안 최종 확인", "블로그 발행하고 링크 올리기"], asst: null,
      body: ["경품 개수 다시 세기", "정수기 점검 기사님 시간 확인", "신규 등록 안내 문자 문구", "전단지 배포 지역 정하기"],
      tbl: { "09:00": "출근 · 전달사항 확인", "10:00": "참가자 명단 정리", "11:00": "현수막 시안 확인", "13:00": "전단지 배포 준비", "15:00": "정수기 점검 맞이", "16:00": "블로그 작성", "18:00": "내일 시뮬레이션 · 보고" } },
  };
  const notes = [];
  for (const tm of rows("teams")) {
    const S = SIMSET[tm.id], mg = nameOf(MGR[tm.id]);
    for (let off = -5; off <= 3; off++) {
      if (off !== 0 && off !== 1 && hash("skip", tm.id, off) < 0.25) continue; // 안 적은 날도 있게
      const k = off + 5, body = rot(S.body, k % S.body.length).slice(0, off === 1 ? 3 : 4 + (k % 2)), pri = rot(S.pri, k % 3);
      const tbl = Object.fromEntries(Object.entries(S.tbl).filter(([, v], i) => off === 0 || off === 1 || (i + k) % 5 !== 0));
      const whoLine = body.map((_, i) => (S.asst && i % 3 === 2 ? S.asst : mg));
      const d = plus(TODAY, off);
      notes.push({ team_id: tm.id, day: d, body: body.join("\n"), updated_by: MGR[tm.id], updated_at: off === 0 ? new Date(Date.now() - 25 * 60000).toISOString() : iso(plus(d, off > 0 ? -1 : 0), off > 0 ? "18:20" : "17:50"),
        plan: { p: pri, t: tbl, w: { body: whoLine, p0: mg, p1: mg, p2: mg, ...Object.fromEntries(Object.keys(tbl).map((hm) => [`t${hm}`, mg])) } } });
    }
  }
  DEMO.tables.team_notes = notes;
  const MINE = {
    pri: ["지점별 월간 목표 대비 점검", "다음 달 광고 예산 확정", "수원점 오픈 이벤트 최종 확인"],
    body: ["세무사 연락 (부가세 자료)", "매니저 면담 일정 정하기", "블로그 키워드 순위 확인", "채용 면접 질문지 수정", "교재 개정본 인쇄소 문의"],
    tbl: { "09:00": "하루 계획 · 지점 현황 훑기", "10:00": "광고 성과 시트 점검", "11:00": "매니저 통화 (부산·수원)", "13:00": "점심 · 산책", "14:00": "면접 / 외부 미팅", "16:00": "오픈 이벤트 최종 점검", "18:00": "내일 시뮬레이션" },
  };
  DEMO.tables.my_notes = [];
  for (let off = -6; off <= 2; off++) {
    if (off !== 0 && off !== 1 && hash("mine", off) < 0.3) continue;
    const k = off + 6, d = plus(TODAY, off), upd = off === 0 ? new Date(Date.now() - 40 * 60000).toISOString() : iso(d, "08:40");
    DEMO.tables.my_notes.push({ user_id: U.boss, day: d, body: rot(MINE.body, k % 5).slice(0, 4).join("\n"), updated_at: upd, at: upd,
      plan: { p: rot(MINE.pri, k % 3), t: Object.fromEntries(Object.entries(MINE.tbl).filter(([, v], i) => off >= 0 || (i + k) % 4 !== 0)), w: {} } });
  }

  // ── 🧠 브리핑 · 📣 소식 · 🐞 신고·제안 ──
  const makeBrief = (user, d) => {
    const list = rows("tasks").filter((x) => x.user_id === user && x.day === d && x.title).sort((a, b) => (a.start_time ?? "99").localeCompare(b.start_time ?? "99") || a.sort - b.sort);
    const left = list.filter((x) => !x.done), first = left.find((x) => x.must_do) ?? left.find((x) => x.important) ?? left[0] ?? list[0];
    const dls = list.filter((x) => x.deadline && !x.done);
    const hm = (s) => { const x = new Date(s); return `${pad(x.getHours())}:${pad(x.getMinutes())}`; };
    return `**${md(d)}(${KD[dow(d)]}) 브리핑**\n` + (list.length ? `할 일 ${list.length}개${d <= TODAY ? ` 중 ${list.length - left.length}개를 끝냈어요` : "가 잡혀 있어요"}. ${first ? `**${first.title}**부터 시작하면 좋아요.` : ""}\n\n` : "잡힌 할 일이 없어요. 여유 있는 날이에요.\n\n")
      + (left.length ? `**먼저 챙길 것**\n${left.slice(0, 3).map((x) => `· ${x.must_do ? "🔥 " : x.important ? "⭐ " : ""}${x.title}${x.start_time ? ` (${x.start_time.slice(0, 5)} 시작)` : ""}`).join("\n")}\n\n` : "")
      + (dls.length ? `**마감 주의**\n${dls.slice(0, 3).map((x) => `· ${x.title} — ${hm(x.deadline)}까지`).join("\n")}\n\n` : "")
      + `**시간 배분 제안**\n오전에는 점검·검토처럼 집중이 필요한 일, 오후에는 통화·회신을 몰아서 처리하고, 퇴근 전 10분은 내일 시뮬레이션에 쓰세요.`;
  };
  DEMO.tables.briefs = [U.boss, U.m1, U.m2, U.m3, U.m4].flatMap((u) => (u === U.boss ? [0, 1] : [0]).map((o) => ({ user_id: u, day: day(o), text: makeBrief(u, day(o)), created_at: at(o, "08:50") })));
  const DEV = "00000000-0000-4000-8000-0000000000ff"; // 개발 담당 (공지를 쓴 사람이 대표가 아니어야 맨 위 배너로 보임)
  DEMO.tables.app_updates = [
    { id: 1, body: "고정업무 옆 [주간 기록]을 누르면 월~일 누가 몇 시에 끝냈는지 한 표로 볼 수 있어요", feedback_id: null, to_all: true, to_author: false, created_by: U.boss, created_at: at(-19, "11:00") },
    { id: 2, body: "💡 제안 반영: 팀 업무를 같은 지점 매니저끼리 적고 함께 볼 수 있어요", feedback_id: 2, to_all: true, to_author: true, created_by: U.boss, created_at: at(-9, "17:30") },
    { id: 3, body: "시뮬레이션 칸에 쓴 사람마다 글자색이 달라져요. 누가 적었는지 한눈에 보여요", feedback_id: null, to_all: true, to_author: false, created_by: DEV, created_at: at(-4, "10:20") },
    { id: 4, body: "월간 달력에서 할 일을 꾹 눌러 끌어서 다른 날로 옮길 수 있어요", feedback_id: null, to_all: true, to_author: false, created_by: DEV, created_at: at(-1, "16:00") },
  ];
  DEMO.tables.feedback = [
    { id: 1, user_id: U.m2, kind: "bug", body: "위젯에서 고정업무를 한 번만 눌렀는데 두 번 눌린 것처럼 체크가 풀려요", status: "done", photos: [], created_at: at(-12, "13:05") },
    { id: 2, user_id: U.m1, kind: "idea", body: "팀 업무를 같은 지점 매니저끼리도 적을 수 있으면 좋겠어요", status: "done", photos: [], created_at: at(-14, "18:40") },
    { id: 3, user_id: U.m3, kind: "idea", body: "지난주에 못 끝낸 일을 한 번에 이번 주로 옮기는 버튼이 있으면 좋겠어요", status: "new", photos: [], created_at: at(-2, "19:10") },
    { id: 4, user_id: U.m4, kind: "bug", body: "폰에서 월간 달력을 보면 할 일 글자가 겹쳐 보일 때가 있어요", status: "new", photos: [], created_at: at(-1, "12:30") },
    { id: 5, user_id: U.m2, kind: "idea", body: "고정업무 인증샷을 한 번에 여러 장 올릴 수 있으면 좋겠어요", status: "new", photos: [], created_at: at(0, "09:15") },
    { id: 6, user_id: U.m1, kind: "bug", body: "시뮬레이션에서 한글 입력 중에 글자가 한 번씩 사라져요", status: "done", photos: [], created_at: at(-21, "10:00") },
  ];
  DEMO.tables.someday = [
    { id: 1, user_id: U.boss, title: "상담 스크립트 처음부터 다시 정리하기", done: false, created_at: at(-12), refs: [{ k: "link", name: "참고: 상담 스크립트 초안", url: "https://example.com/script-draft", at: at(-12) }] },
    { id: 2, user_id: U.boss, title: "지점별 신규 매니저 교육 영상 만들기", done: false, created_at: at(-9), refs: [] },
    { id: 3, user_id: U.boss, title: "회원 후기 모아서 한 장짜리 소개 자료 만들기", done: false, created_at: at(-7), refs: [{ k: "link", name: "후기 모음 시트", url: "https://example.com/reviews", at: at(-7) }, { k: "link", name: "디자인 참고", url: "https://example.com/design", at: at(-7) }] },
    { id: 4, user_id: U.boss, title: "가을 이벤트 결과 정리해서 다음 기획에 반영", done: false, created_at: at(-5), refs: [] },
    { id: 5, user_id: U.boss, title: "사무실 책상 배치 바꿔 보기", done: false, created_at: at(-3), refs: [] },
    { id: 6, user_id: U.boss, title: "작년 월간 보고서 양식 개선", done: true, created_at: at(-20), refs: [] },
  ];

  // ── 📇 연락처 · 🔗 바로가기 ──
  let cs = 0;
  const C = (kind, name, branch, phone, note = "") => ({ id: ++cs, kind, name, branch, phone, note, sort: cs, updated_at: at(-10) });
  const BR = [["서울영어점", "1101", ""], ["서울일중점", "1102", "일본어·중국어"], ["부산점", "1103", ""], ["수원점", "1104", "오픈 준비 중, 전화는 오후에 받기 편해요"], ["인천 송도점", "1105", ""], ["대전 둔산점", "1106", ""],
    ["광주 상무점", "1107", ""], ["성남 분당점", "1108", ""], ["일산점", "1109", ""], ["창원점", "1110", "주말 휴무"], ["청주점", "1111", ""], ["전주점", "1112", ""]];
  DEMO.tables.contacts = [
    ...BR.map(([n, p, note]) => C("branch", n, "", `010-0000-${p}`, note)),
    C("boss", "김대표", "서울영어·서울일중·부산·수원", "010-0000-0001"), C("boss", "윤하준 (Harry)", "인천 송도·성남 분당", "010-0000-0002"), C("boss", "서다은 (Dana)", "대전 둔산·청주", "010-0000-0003"),
    C("boss", "백서린 (Serin)", "광주 상무·전주", "010-0000-0004"), C("boss", "노지안 (Jian)", "일산·창원", "010-0000-0005", "평일 낮에 통화 잘 돼요"),
    ...[["이서연 (Seoyeon)", "서울영어점", "1101"], ["박지훈 (Jihoon)", "서울일중점", "1102"], ["최수빈 (Subin)", "부산점", "1103"], ["정민재 (Minjae)", "수원점", "1104"], ["강하람 (Haram)", "인천 송도점", "1105"],
      ["오채원 (Chaewon)", "대전 둔산점", "1106"], ["임도하 (Doha)", "광주 상무점", "1107"], ["신유나 (Yuna)", "성남 분당점", "1108"], ["조민성 (Minsung)", "일산점", "1109"], ["한예린 (Yerin)", "창원점", "1110"],
      ["류시우 (Siwoo)", "청주점", "1111"], ["배다온 (Daon)", "전주점", "1112"]].map(([n, b, p]) => C("manager", n, b, `010-0000-${p}`, p === "1101" || p === "1102" ? "" : "")),
  ];
  let lid = 0;
  const L = (title, url, scope, team, user, off) => ({ id: ++lid, title, url, scope, team_id: team, user_id: user, created_at: at(off), profiles: { name: nameOf(user) } });
  DEMO.tables.links = [
    L("상담 일지 시트", "https://sheets.example.com/en-consult-log", "team", T.en, U.m1, -30), L("신규 문의 회신 현황", "https://sheets.example.com/en-reply", "team", T.en, U.m1, -22), L("월간 스케줄표", "https://docs.example.com/en-schedule", "team", T.en, U.boss, -18),
    L("상담 일지 시트", "https://sheets.example.com/jp-consult-log", "team", T.jp, U.m2, -28), L("레벨테스트 문제 모음", "https://docs.example.com/jp-level-test", "team", T.jp, U.m2, -15), L("입문반 시간표", "https://docs.example.com/jp-timetable", "team", T.jp, U.boss, -9),
    L("상담 일지 시트", "https://sheets.example.com/bs-consult-log", "team", T.bs, U.m3, -26), L("특강 신청 폼", "https://forms.example.com/bs-special", "team", T.bs, U.m3, -11),
    L("상담 일지 시트", "https://sheets.example.com/sw-consult-log", "team", T.sw, U.m4, -8), L("오픈 이벤트 체크리스트", "https://docs.example.com/sw-open-checklist", "team", T.sw, U.boss, -6), L("경품·비품 주문 시트", "https://sheets.example.com/sw-supplies", "team", T.sw, U.m4, -4),
    L("지점 매출 한눈에 보기", "https://sheets.example.com/sales-overview", "me", null, U.boss, -40), L("광고 성과 시트", "https://sheets.example.com/ads-performance", "me", null, U.boss, -35), L("세무사 공유 폴더", "https://drive.example.com/tax-share", "me", null, U.boss, -20),
    L("채용 지원자 목록", "https://sheets.example.com/hiring", "me", null, U.boss, -7),
  ];
  let did = 0;
  const BD = (team, name, kb, off) => ({ id: ++did, team_id: team, name, path: `${team}/demo-${did}.pdf`, size: kb * 1024, uploaded_by: U.boss, created_at: at(off, "11:00") });
  DEMO.tables.branch_docs = [
    BD(T.en, "임대차 계약서 사본.pdf", 820, -60), BD(T.en, "소방 점검 확인서.pdf", 310, -25), BD(T.en, "강사 계약서 양식.pdf", 150, -14),
    BD(T.jp, "임대차 계약서 사본.pdf", 790, -58), BD(T.jp, "교재 사용 허가서.pdf", 240, -33),
    BD(T.bs, "임대차 계약서 사본.pdf", 905, -52), BD(T.bs, "소방 점검 확인서.pdf", 280, -21),
    BD(T.sw, "임대차 계약서 사본.pdf", 860, -12), BD(T.sw, "오픈 인테리어 견적서.pdf", 1320, -9), BD(T.sw, "소방 점검 확인서.pdf", 295, -3),
  ];
  // 체험판에는 실제 파일이 없어서, 서류 내려받기를 누르면 앱이 사라지는 대신 안내만
  document.addEventListener("click", (e) => { if (!e.target.closest?.(".lkdl")) return; e.preventDefault(); e.stopImmediatePropagation(); window.toast?.("체험판에서는 서류를 내려받을 수 없어요"); }, true);

  // ── 🪄 공용 rpc ──
  const err = (m) => ({ error: { message: m } });
  const curTeam = () => prof(U.boss)?.team_id ?? null;
  const mgrNames = (tid) => rows("profiles").filter((p) => p.team_id === tid && p.role === "manager").map((p) => p.name).sort((a, b) => a.localeCompare(b, "ko")).join("·") || null;
  rpc.my_team = () => curTeam();
  rpc.assistant_team = () => null;
  rpc.vapid_public = () => null;
  rpc.kakao_status = () => [{ me: false, sender: false, receiver: null }];
  rpc.team_people = () => rows("profiles").map((p) => ({ user_id: p.user_id, name: p.name, team_id: p.team_id, role: p.role, has_phone: !!p.phone })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  rpc.manager_list = () => rows("profiles").filter((p) => p.role === "manager").map((p) => ({ user_id: p.user_id, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  rpc.roster_names = () => [...rows("roster")].map((r) => ({ name: r.name, team_id: r.team_id, team: teamName(r.team_id), taken: rows("profiles").some((p) => p.name === r.name), _t: rows("teams").find((x) => x.id === r.team_id)?.sort ?? 99, _s: r.sort }))
    .sort((a, b) => a._t - b._t || a._s - b._s || a.name.localeCompare(b.name, "ko")).map(({ _t, _s, ...r }) => r);
  rpc.claim_name = () => err("체험판에서는 가입하지 않아요");
  rpc.admin_temp_password = () => `demo-${Math.random().toString(36).slice(2, 8)}`;
  rpc.clear_temp_pw = () => null;
  rpc.rename_me = ({ p_name }) => {
    const n = String(p_name ?? "").trim(); if (n.length < 1 || n.length > 30) return err("이름은 1~30자로 적어 주세요");
    const me = prof(U.boss); if (n === me.name) return null;
    if (rows("profiles").some((p) => p.name === n) || rows("roster").some((r) => r.name === n)) return err("이미 있는 이름이에요 — 다른 이름으로 적어 주세요");
    me.name = n; return null;
  };
  rpc.consult_target = ({ p_team } = {}) => rows("teams").find((x) => x.id === (p_team ?? curTeam()))?.consult_target ?? 8;
  rpc.week_stats = ({ from_day, to_day, p_user } = {}) => {
    const u = p_user || U.boss, by = {};
    for (const r of rows("tasks")) if (r.user_id === u && r.day >= from_day && r.day <= to_day) { const s = mondayOf(r.day), v = (by[s] ||= { start: s, total: 0, done: 0 }); v.total++; if (r.done) v.done++; }
    return Object.values(by);
  };
  rpc.timer = ({ p_id, p_on }) => {
    const now = Date.now();
    for (const r of rows("tasks")) if (r.user_id === U.boss && r.started_at && (p_on || r.id == p_id)) { r.spent_sec += Math.max(0, Math.round((now - new Date(r.started_at)) / 1000)); r.started_at = null; }
    if (p_on) { const r = rows("tasks").find((x) => x.id == p_id && x.user_id === U.boss && !x.done); if (r) r.started_at = new Date(now).toISOString(); }
    return null;
  };
  rpc.move_assigned = ({ p_id, p_day, p_reason }) => {
    const why = String(p_reason ?? "").trim(); if (why.length < 2) return err("사유를 적어 주세요");
    const r = rows("tasks").find((x) => x.id == p_id && x.assigned_by && x.day !== p_day); if (!r) return err("바꿀 수 없는 일이에요");
    r.assign_log = [...(r.assign_log || []), { from: r.day, to: p_day, reason: why, at: new Date().toISOString() }]; r.day = p_day; return null;
  };
  rpc.feedback_list = () => {
    const all = rows("feedback").map((f) => {
      const up = [...rows("app_updates")].filter((u) => u.feedback_id === f.id).sort((a, b) => b.id - a.id)[0];
      return { id: f.id, kind: f.kind, body: f.body, status: f.status, created_at: f.created_at, who: nameOf(f.user_id), team: teamName(prof(f.user_id)?.team_id), mine: f.user_id === U.boss, reply: up?.body ?? null, replied_at: up?.created_at ?? null, photos: f.photos ?? [] };
    });
    return all.sort((a, b) => (a.status === "done") - (b.status === "done") || b.created_at.localeCompare(a.created_at)).slice(0, 200);
  };
  rpc.team_goal_sum = ({ p_month, p_team } = {}) => {
    let pt = p_team ?? null; try { pt ??= +localStorage.getItem("planner-preview") || null; } catch {} pt ??= curTeam();
    return rows("profiles").filter((p) => p.role === "manager" && p.team_id && p.team_id === pt).map((p) => { const g = rows("month_goals").find((x) => x.user_id === p.user_id && x.month === p_month); return { user_id: p.user_id, name: p.name, my_goal: g?.my_goal ?? null, submitted: !!g?.submitted_at }; });
  };
  // 팀 업무
  rpc.team_tasks_between = ({ p_from, p_to }) => rows("team_tasks").filter((k) => k.day >= p_from && k.day <= p_to).sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id)
    .map((k) => ({ id: k.id, team_id: k.team_id, team: teamName(k.team_id), day: k.day, title: k.title, deadline: k.deadline, done_by: k.done_by, done_name: nameOf(k.done_by), done_at: k.done_at, created_by: k.created_by, created_name: nameOf(k.created_by) }));
  rpc.set_team_task_done = ({ p_id, p_done }) => {
    const k = rows("team_tasks").find((x) => x.id == p_id); if (!k) return err("우리 팀 일이 아니에요");
    k.done_by = p_done ? U.boss : null; k.done_at = p_done ? new Date().toISOString() : null; return null;
  };
  // 고정업무
  rpc.routine_status = ({ p_day }) => [...rows("teams")].sort((a, b) => a.sort - b.sort).map((tm) => {
    const its = rows("routine_items").filter((i) => on(i, tm.id, p_day)), ids = new Set(its.map((i) => i.id));
    return { team_id: tm.id, team: tm.name, members: mgrNames(tm.id), done: rows("team_routine_checks").filter((c) => c.team_id === tm.id && c.day === p_day && ids.has(c.item_id)).length, total: its.length };
  });
  rpc.team_routine_checks_on = ({ p_day, p_team } = {}) => { const tm = p_team ?? curTeam(); if (!tm) return [];
    return rows("team_routine_checks").filter((c) => c.team_id === tm && c.day === p_day).map((c) => ({ item_id: c.item_id, done_name: nameOf(c.done_by), done_at: c.done_at, link: c.link ?? null, num: c.num ?? null })); };
  rpc.routine_carry = ({ p_day, p_team } = {}) => { const tm = p_team ?? curTeam(); if (!tm) return [];
    const out = [];
    for (const i of rows("routine_items").filter((x) => x.carry)) {
      let from = null;
      for (let k = 7; k >= 1; k--) { const d = plus(p_day, -k); if (d >= "2026-10-21" && on(i, tm, d) && !rows("team_routine_checks").some((c) => c.team_id === tm && c.item_id === i.id && c.day >= d)) from = d; }
      if (from) out.push({ item_id: i.id, from_day: from });
    }
    return out; };
  rpc.set_routine_done = ({ p_item, p_day, p_done, p_team, p_link, p_num }) => {
    const tm = p_team ?? curTeam(); if (!tm) return err("지점 팀이 정해져야 체크할 수 있어요 — 대표님께 말씀해 주세요");
    const list = rows("team_routine_checks"), i = list.findIndex((c) => c.team_id === tm && c.item_id == p_item && c.day === p_day);
    if (!p_done) { if (i >= 0) list.splice(i, 1); return null; }
    const it = rows("routine_items").find((x) => x.id == p_item), lk = String(p_link ?? "").trim() || null;
    if (it?.need_photo && !(lk && /^https?:\/\/\S+$|^data:/i.test(lk))) return err("인증샷을 올려야 완료돼요");
    if (it?.need_link && !(lk && /^https?:\/\/\S+$/i.test(lk))) return err("링크를 올려야 완료돼요 (https:// 로 시작하는 주소)");
    if (it?.need_count && p_num == null) return err("숫자를 넣어야 완료돼요");
    const row = { team_id: tm, item_id: p_item, day: p_day, done_by: U.boss, done_at: new Date().toISOString(), link: lk, num: p_num ?? null };
    i >= 0 ? (list[i] = row) : list.push(row); return null;
  };
  // 시뮬레이션 메모 (지점 공용)
  const noteTeam = (a) => { const id = a?.p_team ?? curTeam(); return rows("teams").find((x) => x.id === id); };
  rpc.team_note_get = (a) => { const tm = noteTeam(a); if (!tm) return []; const n = rows("team_notes").find((x) => x.team_id === tm.id && x.day === a.p_day);
    return [{ enabled: !!tm.sim_note, body: n?.body ?? null, who: nameOf(n?.updated_by), at: n?.updated_at ?? null, plan: n?.plan ?? {} }]; };
  rpc.team_note_days = (a = {}) => { const tm = noteTeam(a); if (!tm) return [];
    return rows("team_notes").filter((n) => n.team_id === tm.id && (n.body || Object.keys(n.plan ?? {}).length)).sort((x, y) => y.day.localeCompare(x.day)).slice(0, Math.min(a.p_limit ?? 90, 366))
      .map((n) => ({ day: n.day, body: n.body, plan: n.plan, who: nameOf(n.updated_by), at: n.updated_at })); };
  rpc.team_note_patch = ({ p_day, p_patch, p_team }) => {
    const tm = noteTeam({ p_team }); if (!tm || !tm.sim_note) return err("이 지점은 시뮬레이션 메모를 안 써요");
    let n = rows("team_notes").find((x) => x.team_id === tm.id && x.day === p_day);
    if (!n) rows("team_notes").push((n = { team_id: tm.id, day: p_day, body: "", plan: {}, updated_by: U.boss, updated_at: new Date().toISOString() }));
    const pl = (n.plan = { p: ["", "", ""], t: {}, w: {}, ...(n.plan ?? {}) });
    for (const [k, v] of Object.entries(p_patch?.p ?? {})) if (/^[0-2]$/.test(k)) pl.p[+k] = v ?? "";
    for (const [k, v] of Object.entries(p_patch?.t ?? {})) v == null || v === "" ? delete pl.t[k] : (pl.t[k] = v);
    for (const [k, v] of Object.entries(p_patch?.w ?? {})) v == null || v === "" || (Array.isArray(v) && !v.length) ? delete pl.w[k] : (pl.w[k] = v);
    if (p_patch && "body" in p_patch) n.body = p_patch.body ?? "";
    n.updated_by = U.boss; n.updated_at = new Date().toISOString(); return n.updated_at;
  };

  // ── 🤖 함수 (체험판용 샘플 답) ──
  fn["planner-brief"] = ({ day: d }) => {
    const text = makeBrief(U.boss, d), created_at = new Date().toISOString(), old = rows("briefs").find((b) => b.user_id === U.boss && b.day === d);
    old ? Object.assign(old, { text, created_at }) : rows("briefs").push({ user_id: U.boss, day: d, text, created_at });
    return { text, created_at };
  };
  fn["planner-assign"] = ({ text }) => {
    const mgrs = rows("profiles").filter((p) => p.role === "manager"), DK = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 0 };
    const items = String(text ?? "").split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = mgrs.find((x) => s.includes(x.name) || s.includes(x.name.slice(1))), nowD = new Date();
      let d = TODAY; const rel = s.match(/오늘|내일|모레/), wk = s.match(/([월화수목금토일])요일/), dm = s.match(/(\d{1,2})일(?!\S*요)/);
      if (rel) d = plus(TODAY, { 오늘: 0, 내일: 1, 모레: 2 }[rel[0]]);
      else if (wk) { const diff = (DK[wk[1]] - nowD.getDay() + 7) % 7; d = plus(TODAY, diff); }
      else if (dm) { const x = new Date(nowD.getFullYear(), nowD.getMonth(), +dm[1]); if (x < new Date(TODAY + "T00:00:00")) x.setMonth(x.getMonth() + 1); d = ymdOf(x); }
      const tm = s.match(/(오전|오후)?\s*(\d{1,2})시\s*(?:(\d{1,2})분)?/); let dl = "";
      if (tm) { let h = +tm[2]; if (tm[1] === "오후" || (!tm[1] && h <= 8)) h = h % 12 + 12; dl = `${pad(h)}:${pad(+(tm[3] ?? 0))}`; }
      const title = s.replace(m ? new RegExp(`${m.name}|${m.name.slice(1)}`) : /$^/, "").replace(/매니저님?|님/g, "").replace(/오늘|내일|모레|[월화수목금토일]요일|\d{1,2}일|(오전|오후)?\s*\d{1,2}시\s*(\d{1,2}분)?\s*(까지)?|까지/g, "")
        .replace(/(해|하여)\s*주세요|부탁(드려요|드립니다|해요)?|해줘|해 줘|주세요|[.!]+$/g, "").replace(/\s+/g, " ").trim() || s;
      return { manager_id: m?.user_id ?? "", title, day: d, deadline_time: dl, important: /중요|꼭|급히|긴급/.test(s) };
    });
    return { managers: mgrs.map((x) => ({ id: x.user_id, name: x.name })), items };
  };
  fn["planner-kakao"] = () => ({ error: { message: "체험판에서는 카카오톡 연결이 안 돼요", context: { json: async () => ({ error: "체험판에서는 카카오톡 연결이 안 돼요" }) } } });
})();
