// 🧪 체험판 샘플: 성장 탭 — 인턴교육(edu) · 조교교육 및 가이드북(jg) · 조교체크리스트(jc) · 리포트(rp) · 출석 스캔(at) · 언어교환(gx)
// 이름·번호는 모두 지어낸 것. 날짜는 전부 오늘 기준 상대값. 교육·가이드북은 "앞부분만 공개" (맨 아래 DEMO.trim)
(() => {
  const { U, T, tables: t, rpc, day, at, monday, uuid } = DEMO;
  const nest = (row, key, get) => Object.defineProperty(row, key, { enumerable: true, configurable: true, get }); // 중첩 선택(select 'a(*, b(...))')용: 평평한 표에서 그때그때 계산
  const off = (s) => Math.round((new Date(s + "T00:00:00") - new Date(day(0) + "T00:00:00")) / 864e5); // YYYY-MM-DD → 오늘 기준 며칠
  const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
  const pick = (a, i) => a[((i % a.length) + a.length) % a.length];

  // ═══ 📚 인턴교육 (edu) ═══ 대상자 = 최근 들어온 매니저 2명 (교육 내용은 edu-data.js, 진행·평가만 여기)
  const W1 = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "boss"].map((x) => "w1-" + x);
  const W2 = [..."0123456789".slice(1).split("").map((x) => "0" + x), "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "boss"].map((x) => "w2-" + x);
  const ALL = [...W1, ...W2];
  t.edu_items = [];
  DEMO.pk.edu_progress = ["user_id", "item_id"]; DEMO.pk.edu_meta = ["user_id"]; DEMO.pk.edu_eval = ["user_id", "item_id"]; DEMO.pk.edu_final = ["user_id"];
  rpc.edu_people = () => [
    { user_id: U.m3, name: "최수빈", team_id: T.bs, started_on: day(-24), done_count: 38 },
    { user_id: U.m4, name: "정민재", team_id: T.sw, started_on: day(-9), done_count: 21 },
  ];
  // 최수빈: 1·2주차 거의 끝 / 정민재: 1주차 끝, 2주차 진행 중
  const prog = (u, doneIds, doingIds) => [...doneIds.map((id) => [id, "done"]), ...doingIds.map((id) => [id, "doing"])].map(([item_id, status], i) => ({ user_id: u, item_id, status, updated_at: at(-(i % 14), "18:10") }));
  t.edu_progress = [
    ...prog(U.m3, ALL.filter((id) => !["w2-20", "w2-04", "w2-boss"].includes(id)), ["w2-20", "w2-04"]),
    ...prog(U.m4, [...W1.slice(0, 17), "w2-01", "w2-02", "w2-03", "w2-05", "w2-06", "w2-07", "w2-08", "w2-09"], ["w1-boss", "w2-10", "w2-12", "w2-16"]),
  ];
  t.edu_meta = [
    { user_id: U.m3, started_on: day(-24), improvements: 0, kpi: {}, updated_at: at(-1),
      books: { emotion: { start: true, done: true, summary: true }, book1: { start: true, done: true, summary: true }, fourhour: { start: true, done: true }, giant: { start: true } },
      tools: Object.fromEntries(["erp", "macbook", "planner", "ai", "discord", "gmail", "icloud", "colortag", "rectangle", "keyrepl", "bookmark", "insta", "splace"].map((k) => [k, true])),
      improve_list: ["접수대 앞에 앉을 곳이 없음 → 신규 상담 대기 의자 2개 추가", "화요일 저녁 반 입구가 붐빔 → 입장 순서 안내판", "전화 회신 기록이 사람마다 다름 → 통화 직후 한 줄 양식", "비품 주문 때마다 재고를 새로 셈 → 월초 재고표 한 장", "리더 지각을 단톡에서 따로 확인 → 출석 화면에 지각 칸", "신규 멤버 첫 수업 안내가 구두뿐 → 한 장짜리 안내지", "마감 때 에어컨 리모컨 위치 제각각 → 보관함 표시", "상담 장표 인쇄본이 낡음 → 코팅본 교체"] },
    { user_id: U.m4, started_on: day(-9), improvements: 0, kpi: {}, updated_at: at(-2), books: { book1: { start: true }, emotion: { start: true, done: true } },
      tools: Object.fromEntries(["erp", "macbook", "planner", "ai", "discord", "gmail", "icloud"].map((k) => [k, true])),
      improve_list: ["수업 사이 쉬는 시간 안내 방송이 없음 → 타이머 알림", "신규 등록 서류 위치를 매번 찾음 → 서랍 라벨링", "", ""] },
  ];
  const ev = (u, id, level, comment, ago_) => ({ user_id: u, item_id: id, level, comment, rated_on: day(-ago_), updated_on: day(-ago_), rated_by: U.boss });
  t.edu_eval = [
    ev(U.m3, "w1-01", 1, "조직도를 보지 않고 파트별 역할을 설명함. 마케팅 파트 설명은 보강 필요.", 22),
    ev(U.m3, "w1-02", 2, "전산 연습 3회 모두 신규·스텝 매칭 오류 없음. 팀 변경 케이스까지 직접 해 봄.", 20),
    ev(U.m3, "w1-03", 1, "달력 소통 방식은 이해. 메모 문구가 아직 길다.", 20),
    ev(U.m3, "w1-07", 2, "청소 구역표를 직접 고쳐서 제안함. 비품 주문 보고에 재고 숫자가 들어 있음.", 18),
    ev(U.m3, "w1-12", 1, "LV1~4 세션 전부 참여, 후기 메모는 LV3까지만 있음.", 17),
    ev(U.m3, "w1-13", 0, "멘트를 보고 읽음. 연습 2회 모두 질문 유형 구분 없이 같은 답으로 마무리.", 17),
    ev(U.m3, "w1-15", 2, "평일·주말 고정업무를 혼자 끝냄. 누락 0건.", 15),
    ev(U.m3, "w2-01", 1, "스크립트 7개 구간 중 5개 구간이 숫자 없이 감상으로 끝남. 재작성 후 통과.", 12),
    ev(U.m3, "w2-09", 2, "참관 3회, 회차마다 '고객이 망설인 지점'을 적음.", 10),
    ev(U.m3, "w2-14", 1, "멤버→리더 제안 멘트 2종 작성. 거절 시 대응이 비어 있음.", 9),
    ev(U.m3, "w2-17", 2, "멤버십 4종을 고객 상황 3가지에 맞춰 추천 근거까지 설명.", 8),
    ev(U.m3, "w2-15", 0, "녹음본 제출은 했으나 분석 답변에 대한 수정본이 아직 없음.", 6),
    ev(U.m4, "w1-01", 1, "역할 구분은 잘 설명함.", 7),
    ev(U.m4, "w1-02", 1, "전산 연습 1회 완료, 팀 매칭에서 한 번 막힘.", 6),
    ev(U.m4, "w1-15", 2, "고정업무 누락 없이 혼자 마무리.", 4),
  ];
  t.edu_feedback = [
    { id: 1, user_id: U.m3, day: day(-20), week: 1, method: "면담", note: "1주차 첫 면담 — 전화 회신 멘트를 외우기보다 질문 유형부터 나누기로.", created_at: at(-20) },
    { id: 2, user_id: U.m3, day: day(-13), week: 1, method: "서면", note: "주간보고 #1 코멘트 전달: 숫자가 있는 문장이 늘었음, 다음 주는 판단 근거 한 줄 더.", created_at: at(-13) },
    { id: 3, user_id: U.m3, day: day(-6), week: 2, method: "면담", note: "스크립트 재작성본 확인. 녹음본 분석 답변 반영해서 다시 제출하기로.", created_at: at(-6) },
    { id: 4, user_id: U.m4, day: day(-5), week: 1, method: "구두", note: "전산 연습 막힌 부분(팀 매칭) 같이 풀어 봄. 내일 다시 혼자 해 보기.", created_at: at(-5) },
  ];
  t.edu_final = [{ user_id: U.m3, note: "1~2주차 기준으로 운영 기본기는 안정적. 상담 영역은 숫자와 판단을 문장에 넣는 연습을 계속.", updated_at: at(-3) }];
  t.edu_refs = [
    { id: 1, week: 1, title: "1주차 지점 하루 흐름 한눈에 보기", url: "https://docs.example.com/edu/week1-flow", path: null, created_at: at(-40) },
    { id: 2, week: 1, title: "전화 회신 기본 멘트 모음", url: "https://docs.example.com/edu/phone-basic", path: null, created_at: at(-40) },
    { id: 3, week: 1, title: "고정업무 체크표 (평일·주말)", url: "https://docs.example.com/edu/fixed-tasks", path: null, created_at: at(-39) },
    { id: 4, week: 2, title: "상담 장표 예시 모음", url: "https://docs.example.com/edu/consult-deck", path: null, created_at: at(-33) },
    { id: 5, week: 2, title: "환불·카드 무이자 안내표", url: "https://docs.example.com/edu/refund-card", path: null, created_at: at(-33) },
  ];
  t.edu_submits = [
    { id: 1, user_id: U.m3, item_id: "week-1", title: "주간보고 #1", url: "https://docs.example.com/s/choi-week1", path: null, created_at: at(-14) },
    { id: 2, user_id: U.m3, item_id: "w1-17", title: "데일리 리포트·업무 노트 1주차 모음", url: "https://docs.example.com/s/choi-daily1", path: null, created_at: at(-15) },
    { id: 3, user_id: U.m3, item_id: "w2-01", title: "내 인터뷰 스크립트 v2", url: "https://docs.example.com/s/choi-script2", path: null, created_at: at(-9) },
    { id: 4, user_id: U.m3, item_id: "w2-15", title: "스크립트 녹음본 (3회차)", url: "https://docs.example.com/s/choi-rec3", path: null, created_at: at(-7) },
    { id: 5, user_id: U.m3, item_id: "week-2", title: "주간보고 #2", url: "https://docs.example.com/s/choi-week2", path: null, created_at: at(-7) },
    { id: 6, user_id: U.m4, item_id: "week-1", title: "주간보고 #1", url: "https://docs.example.com/s/jung-week1", path: null, created_at: at(-3) },
  ];

  // ═══ 🧑‍🎓 조교교육 및 가이드북 (jg) ═══ 내용은 샘플 2~3장 분량만. 서버 rpc(jo_guide_full / jo_guide_pre)가 통째로 돌려주는 모양
  const LOCK = "🔒 체험판에서는 앞부분만 볼 수 있어요";
  const JG = {
    PRE: {
      goal: "첫 출근 전에 이 두 가지만 읽고 숙제 두 개를 해 오면 첫날이 훨씬 편해요.",
      read: [
        { t: "지점의 하루는 이렇게 흘러가요", min: 5, note: "오픈부터 마감까지 큰 흐름만 눈으로 훑어요. 외우지 않아도 돼요.", ref: ["r-open", "r-close"] },
        { t: "전화 받는 기본 순서", min: 5, note: "처음 보는 번호가 걸려 올 때 어떤 순서로 말하는지 봐요.", ref: ["r-phone"] },
      ],
      hw: [
        { id: "hw-ted", t: "TED 영상 하나 보고 독후감 쓰기", how: "10분 안팎 영상 1개를 골라 느낀 점을 A4 반 장으로 써 와요. 아래 [사전 숙제 제출]에서 올려요.", link: ["https://www.ted.com", "TED 열기"] },
        { id: "hw-read", t: "'지점의 하루' 글 읽고 궁금한 점 3개 적기", how: "읽다가 이해가 안 된 곳을 그대로 적어 와요. 첫날 같이 풀어요." },
      ],
      submit: { q: "우리 지점에서 일하면서 가장 기대되는 것 1가지와 그 이유를 적어 주세요.", ext: ["pdf", "doc", "docx", "hwp", "jpg", "jpeg", "png", "heic"] },
    },
    DAYS: [
      { day: 1, title: "지점 한 바퀴 돌아보기", goal: "하루 흐름을 눈으로 따라가고, 전화 받는 기본 순서를 한 번 해 본다.", tip: "모르는 건 바로 물어봐요. 첫날은 질문 개수가 곧 실력이에요.", files: [],
        steps: [
          { must: true, when: "출근 직후", t: "지점 구조와 하루 흐름 익히기", how: ["매니저와 함께 강의실·접수대·창고 위치를 한 바퀴 돌아요.", "오픈 전 점검 순서를 보면서 직접 하나씩 짚어 봐요."], ref: ["r-open"] },
          { must: true, when: "오전", t: "전화 받는 순서 따라 해 보기", how: ["매니저가 받는 전화를 옆에서 들어요.", "끝나고 기록 남기는 법까지 같이 해 봐요."], ref: ["r-phone"] },
          { must: true, when: "점심 전", t: "오늘 할 일 표 열어 보기", how: ["내 근무 시간대 표를 열어 오늘 칸에 내 이름이 있는지 확인해요."], go: "jc" },
          { must: false, when: "여유가 있으면", t: "마감 순서를 눈으로 따라가 보기", how: ["마감 때 확인하는 것 5가지를 읽어 보고 모르는 건 적어 둬요."], ref: ["r-close"] },
        ],
        pass: ["지점 구조를 보지 않고 말로 설명할 수 있다", "전화 기본 순서 4단계를 말할 수 있다", "내 근무 시간대 할 일 표를 열 수 있다", "마감 확인 5가지를 안다"] },
      { day: 2, title: "전화 연습과 등록 입력 보기", goal: "전화 회신을 혼자 한 번 해 보고, 등록 입력과 출석 확인을 눈으로 익힌다.", tip: "처음 하는 입력은 매니저와 같이. 혼자 하다 틀리는 것보다 같이 하는 게 빨라요.", files: [],
        steps: [
          { must: true, when: "오전", t: "전화 회신 혼자 해 보기", how: ["부재중 전화 목록에서 한 건을 골라 회신해요.", "통화가 끝나면 기록표에 한 줄 남겨요."], ref: ["r-phone"] },
          { must: true, when: "오후", t: "신규 등록 입력 순서 따라가기", how: ["연습용 회원으로 등록 화면을 끝까지 눌러 봐요."], ref: ["r-newreg"] },
          { must: false, when: "여유가 있으면", t: "출석·차감 확인해 보기", how: ["오늘 수업의 출석 명단을 열어 차감이 맞는지 봐요."], ref: ["r-attend"] },
        ],
        pass: ["전화 회신을 혼자 한 번 끝냈다", "등록 입력 순서를 매니저에게 설명할 수 있다", "출석과 차감이 어디서 맞춰지는지 안다"] },
      { day: 3, title: LOCK, goal: LOCK, tip: "", files: [], steps: [{ must: true, when: "—", t: LOCK, how: ["정식 버전에서 3일차 전체를 볼 수 있어요."], ref: [] }], pass: ["🔒 정식 버전에서 확인"] },
      { day: 4, title: LOCK, goal: LOCK, tip: "", files: [], steps: [{ must: true, when: "—", t: LOCK, how: ["정식 버전에서 4일차 전체를 볼 수 있어요."], ref: [] }], pass: ["🔒 정식 버전에서 확인"], after: "5일차부터는 매니저와 시간대를 나눠 혼자 근무해요." },
    ],
    QUIZ: [
      { q: "처음 보는 번호로 전화가 걸려 왔을 때 가장 먼저 하는 말은?", a: ["지점 이름과 내 이름을 말한다", "바로 가격을 안내한다", "상담 예약부터 잡는다"], ok: 0, why: "누구에게 걸었는지 상대가 확인할 수 있어야 대화가 안정돼요." },
      { q: "통화가 끝난 직후 가장 먼저 해야 할 일은?", a: ["다음 전화를 기다린다", "기록표에 한 줄 남긴다", "단톡방에 공유한다"], ok: 1, why: "기억은 10분만 지나도 흐려져요. 한 줄이면 충분해요." },
      { q: "모르는 입력 화면이 나왔을 때 올바른 행동은?", a: ["일단 눌러 보고 되돌린다", "매니저에게 물어보고 같이 한다", "다음 근무자에게 넘긴다"], ok: 1, why: "회원 정보는 되돌리기 어려운 입력이 있어서 처음엔 같이 해요." },
    ],
    REF: [
      { id: "r-open", ch: "하루 흐름", t: "오픈 전 점검 순서", body: ["출근하면 아래 순서대로 한 바퀴 돌아요.", "• 출입문·간판 조명 켜기, 환기 시작", "• 강의실 테이블·의자가 수업 배치인지 확인", "• 음료·간식 재고 보고 부족한 건 메모", "• 부재중 전화·톡톡 문의 확인", "❗ 문의 회신은 점검이 끝나기 전에 먼저 끝내요."] },
      { id: "r-close", ch: "하루 흐름", t: "마감 순서", body: ["마감 직전 5가지만 확인해요.", "• 빈 컵·쓰레기 정리", "• 화장실 휴지·비누 확인", "• 에어컨·조명·전자기기 끄기", "• 오늘 못 한 일은 인수인계 메모에 적기", "• 문단속 후 매니저에게 퇴근 보고"] },
      { id: "r-phone", ch: "전화·상담", t: "전화 받는 기본 순서", body: ["전화는 네 단계로 받아요. (중요!!)", "• 1단계: 지점 이름과 내 이름을 말한다", "• 2단계: 어떤 일로 전화했는지 끝까지 듣는다", "• 3단계: 바로 답할 수 있는 것만 답하고, 모르는 건 '확인 후 다시 연락드릴게요'", "• 4단계: 통화 직후 기록표에 한 줄 남긴다", "❗ 가격·환불 질문은 혼자 답하지 말고 매니저에게 넘겨요."] },
      { id: "r-newreg", ch: "등록·결제", t: "신규 등록 입력 순서", body: ["신규 등록은 연습용 회원으로 먼저 해 봐요.", "• 회원 기본 정보 입력 (이름·연락처)", "• 수강 상품과 시작일 고르기", "• 결제 수단 확인 후 결제 입력", "• 소속 팀과 반 배정", { table: [["단계", "확인할 것"], ["기본 정보", "연락처 끝 4자리가 맞는지"], ["상품", "시작일이 오늘 이후인지"], ["결제", "결제 수단·금액 일치"]], hi: [] }] },
      { id: "r-refund", ch: "등록·결제", t: "환불 요청을 받았을 때", body: ["환불은 조교가 처리하지 않아요.", "• 사유와 연락처만 정확히 듣고 기록", "• '매니저가 확인 후 연락드릴게요'라고 안내", "• 매니저에게 즉시 메시지로 전달", "❗ 금액을 말하거나 약속하지 않아요."] },
      { id: "r-delay", ch: "등록·결제", t: "수강 연기 요청", body: ["멤버가 일정 때문에 수강을 미루고 싶다고 하면:", "• 연기하고 싶은 기간과 이유를 묻는다", "• 연기 가능 여부는 매니저가 정하니 접수만 한다", "• 접수 내용을 연기 요청 기록에 남긴다"] },
      { id: "r-attend", ch: "수업·출석", t: "출석·차감 확인", body: ["수업이 끝나면 출석 명단과 차감을 같이 봐요.", "• 출석 표시가 빠진 사람이 없는지", "• 결석인데 차감된 사람이 있으면 메모", "• 이상한 건 마감 전에 매니저에게 보여 주기"] },
    ],
  };
  rpc.jo_guide_full = () => JG;
  rpc.jo_guide_pre = () => ({ doc: JG, team: T.en, exp: at(7) });
  rpc.jo_invite_new = () => "demo-invite-key";
  rpc.jo_hw_teams = () => (DEMO.tables.teams || []).map(({ id, name }) => ({ id, name }));
  rpc.jo_hw_submit = (a) => { (t.jo_hw ||= []).unshift({ id: Math.max(0, ...t.jo_hw.map((x) => x.id)) + 1, team_id: a.p_team, name: a.p_name, answer: a.p_answer, file_path: a.p_path, file_name: a.p_file_name, created_at: new Date().toISOString() }); return null; };
  t.jo_hw = [
    { id: 1, team_id: T.en, name: "노은채", answer: "여러 나라 말이 오가는 공간이라 직접 대화를 걸어 볼 기회가 많다는 점이 기대돼요. 영어를 쓰는 사람 옆에서 일하면서 자연스럽게 말문이 트이고 싶어요.", file_path: "1/demo_a.pdf", file_name: "TED 독후감_노은채.pdf", created_at: at(-1, "21:40") },
    { id: 2, team_id: T.en, name: "배도현", answer: "처음 보는 사람과 대화를 시작하는 연습을 하고 싶어요. 손님 응대를 반복하면서 침착하게 말하는 법을 배우고 싶습니다.", file_path: "1/demo_b.docx", file_name: "독후감_배도현.docx", created_at: at(-2, "13:15") },
    { id: 3, team_id: T.en, name: "윤서아", answer: "수업이 돌아가는 방식을 안쪽에서 보고 싶어요. 매니저님이 하루를 어떻게 정리하는지 배우는 것이 가장 기대돼요.", file_path: "1/demo_c.jpg", file_name: "TED 후기 손글씨.jpg", created_at: at(-5, "09:30") },
    { id: 4, team_id: T.jp, name: "문예서", answer: "일본어 수업을 가까이에서 보며 회화 감각을 키우고 싶어요. 일본어 멤버를 안내하면서 실제로 쓰는 표현을 익히고 싶습니다.", file_path: "2/demo_d.pdf", file_name: "독후감_문예서.pdf", created_at: at(-3, "20:05") },
    { id: 5, team_id: T.bs, name: "오지안", answer: "저녁에 오는 직장인 멤버들의 이야기를 듣는 것이 기대돼요. 하루를 마무리하는 시간을 함께하는 일이 의미 있어 보여요.", file_path: "3/demo_e.pdf", file_name: "독후감_오지안.pdf", created_at: at(-4, "18:50") },
  ];

  // ═══ ✅ 조교체크리스트 (jc) ═══ 4개 지점 모두. 이름·할일·이번 주 칸·메모·대타·링크·사진
  DEMO.pk.jc_cells = ["task_id", "day"]; DEMO.pk.jc_guide = ["name_id"];
  const STAFF = {
    [T.en]: ["한지우", "윤서아", "노은채", "배도현"], [T.jp]: ["류하린", "장시우", "문예서", "차민호"],
    [T.bs]: ["백다온", "임채원", "오지안", "탁세린"], [T.sw]: ["신유나", "허건우", "곽나연", "도하율"],
  };
  const MGR = { [T.en]: "이서연", [T.jp]: "박지훈", [T.bs]: "최수빈", [T.sw]: "정민재" };
  const COLORS = ["#ffb3ba", "#baffc9", "#bad7ff", "#ffffba"];
  const TASKS = {
    am: ["■ 오픈 전", "출입문·간판 조명 켜고 환기하기", "강의실 테이블·의자 수업 배치 확인", "음료·간식 재고 확인하고 채우기", "부재중 전화·톡톡 문의 확인하고 회신", "■ 수업 시간", "출석 체크하고 신규 멤버 맞이하기", "수업 사이 휴게 공간 정리", "■ 마무리", "오전 문의 내용 매니저에게 전달"],
    pm: ["■ 오후 시작", "오전 인수인계 메모 확인", "강의실 환기하고 자리 다시 맞추기", "■ 수업 시간", "출석 체크하고 신규 멤버 맞이하기", "리더 출석·지각 확인", "■ 마감", "빈 컵·쓰레기 정리", "화장실 휴지·비품 확인", "전기·문단속 확인하고 퇴근 보고"],
    we: ["■ 오픈", "출입문·조명 켜고 환기하기", "접수대 안내문·QR 확인", "■ 수업 시간", "출석 체크하고 신규 멤버 맞이하기", "상담 오는 분 응대하고 매니저 호출", "■ 마감", "강의실 정리와 쓰레기 비우기", "문단속 후 주말 근무 보고"],
  };
  const MEMOS = {
    manager: { am: ["이번 주 신규 상담이 많아요. 접수대 안내문 위치 먼저 확인해 주세요.", "수요일 오전 강의실 에어컨 점검이 있어요. 10시 전에 의자 정리해 두세요.", "음료 재고 부족하면 사진 찍어서 단톡에 올려 주세요."], pm: ["마감 때 화장실 휴지 남은 개수를 보고에 적어 주세요.", "리더 지각이 잦은 반은 출석표에 표시해 두세요."], we: ["토요일은 체험 수업이 있어요. 접수대에 체험용 안내지 올려 주세요."] },
    ta: { am: ["프린터 용지가 거의 없어요.", "신규 멤버 두 분이 반 위치를 헷갈려서 안내판 필요할 것 같아요."], pm: ["수요일 저녁 반 정원이 넘쳐서 의자 하나 더 놨어요."], we: ["체험 수업 후 음료 준비가 부족했어요."] },
  };
  const LINKS = [["네이버 예약 관리", "https://booking.example.com/manage"], ["지점 단톡 공지 정리", "https://docs.example.com/notice"], ["조교 근무표", "https://docs.example.com/shifts"], ["청소 구역표", "https://docs.example.com/clean"], ["비품 주문서", "https://docs.example.com/order"]];
  t.jc_names = []; t.jc_tasks = []; t.jc_cells = []; t.jc_memos = []; t.jc_subs = []; t.jc_links = []; t.jc_photos = []; t.jc_guide = [];
  let nid = 0, tid = 0, mid = 0;
  const mon = monday(0);
  for (const team of [T.en, T.jp, T.bs, T.sw]) {
    const names = STAFF[team].map((name, i) => ({ id: ++nid, team_id: team, name, color: COLORS[i], sort: i + 1 }));
    t.jc_names.push(...names);
    for (const page of ["am", "pm", "we"]) {
      let n = 0;
      TASKS[page].forEach((body, i) => {
        const task = { id: ++tid, team_id: team, page, body, sort: ++n };
        t.jc_tasks.push(task);
        if (body.startsWith("■")) return;
        for (let d = 0; d < 7; d++) {
          if (d === 4) continue; // 금 = 공식 휴무
          if (page === "we" && d < 5 && d !== 3) continue; // 주말 페이지는 목·토·일만
          const pickN = (k) => names[(i + d + k + (team % 2)) % names.length].id;
          t.jc_cells.push({ task_id: task.id, day: day(off(mon) + d), names: (i + d) % 3 === 0 ? [pickN(0), pickN(1)] : [pickN(0)] });
        }
      });
      const mg = MEMOS.manager[page] || [], ta = MEMOS.ta[page] || [];
      mg.slice(0, team === T.en ? 3 : 2).forEach((body, i) => t.jc_memos.push({ id: ++mid, team_id: team, page, kind: "manager", body, done: i === 1, pinned: i === 0, by_name: MGR[team], created_at: at(-(i + 1), "10:20") }));
      ta.slice(0, team === T.en ? 2 : 1).forEach((body, i) => t.jc_memos.push({ id: ++mid, team_id: team, page, kind: "ta", body, done: false, pinned: false, by_name: names[i + 1].name, created_at: at(-(i + 1), "17:05") }));
    }
    LINKS.slice(0, team === T.en ? 5 : 3).forEach(([label, url], i) => t.jc_links.push({ id: team * 10 + i, team_id: team, label, url, pinned: i === 0, sort: i }));
    t.jc_subs.push({ id: team * 10, team_id: team, out_name: names[1].name, in_name: names[2].name, lang: team === T.jp ? "중국어" : "일본어", start_day: day(1), end_day: day(1), slot: "17:40~20:10", created_at: at(-1) });
    if (team !== T.sw) t.jc_subs.push({ id: team * 10 + 1, team_id: team, out_name: names[3].name, in_name: names[0].name, lang: "일본어", start_day: day(3), end_day: day(5), slot: "10:40~13:10", created_at: at(-2) });
    ["강의실 세팅 완성 모습", "음료대 정리 기준", "마감 후 접수대"].slice(0, team === T.en ? 3 : 1).forEach((label, i) => t.jc_photos.push({ id: team * 10 + i, team_id: team, path: `${team}/demo_${i}.jpg`, label, pinned: i === 0, by_name: names[i].name, created_at: at(-3 - i * 2, "11:10") }));
  }
  // 조교 가이드 진행 (조교별: 사전 준비·1~4일차 체크) — jc_guide.c 키는 jo-guide.js 규칙: 숙제 id / `d{일차}-{번호}`
  const chk = (...ks) => Object.fromEntries(ks.map((k) => [k, true]));
  const nm = (team, i) => t.jc_names.find((n) => n.team_id === team && n.name === STAFF[team][i]).id;
  t.jc_guide = [
    { name_id: nm(T.en, 0), c: chk("hw-ted", "hw-read", "d1-0", "d1-1", "d1-2", "d1-3", "d2-0", "d2-1", "d2-2"), best: null },
    { name_id: nm(T.en, 1), c: chk("hw-ted", "hw-read", "d1-0", "d1-1", "d1-2"), best: null },
    { name_id: nm(T.en, 2), c: chk("hw-ted"), best: null },
    { name_id: nm(T.jp, 0), c: chk("hw-ted", "hw-read", "d1-0", "d1-1", "d1-2", "d1-3", "d2-0", "d2-1"), best: null },
    { name_id: nm(T.jp, 2), c: chk("hw-ted", "hw-read"), best: null },
    { name_id: nm(T.bs, 0), c: chk("hw-ted", "hw-read", "d1-0", "d1-1", "d1-2", "d1-3", "d2-0", "d2-1", "d2-2", "d3-0"), best: 80 },
  ].map((r) => ({ ...r, team_id: t.jc_names.find((n) => n.id === r.name_id).team_id, updated_at: at(-(r.name_id % 5), "15:30") }));

  // ═══ 📝 리포트 (rp) ═══ 대상 = 매니저 4명. 데일리(수·일, 정민재는 금 빼고 매일) · 주간 성장(일) · 대표 답변
  DEMO.pk.report_people = ["name"];
  t.report_people = ["이서연", "박지훈", "최수빈", "정민재"].map((name) => ({ name, daily_days: [0, 1, 2, 3, 4, 6], daily_until: day(24) })); // 한 달 매일(금 제외) 교육 기간
  const MG = [[U.m1, "이서연"], [U.m2, "박지훈"], [U.m3, "최수빈"], [U.m4, "정민재"]];
  const DAILY = [
    { learned: "신규 상담에서 가격부터 묻는 분께 바로 답하지 않고 '어떤 계기로 오셨는지'를 먼저 물었더니 대화가 훨씬 편했다. 순서가 결과를 바꾼다는 걸 느꼈다.", todo: "오후에 들어온 문의 3건 회신을 못 했다 → 내일 오전 첫 업무로 처리", ask: "무이자 할부가 되는 카드 목록이 바뀐 게 있는지 확인이 필요해요.", praise: "당황해서 서 있던 신규 멤버를 반 안내까지 끝까지 함께한 것", consult: { Premium: 1, Pro: 1, 미등록: 1 } },
    { learned: "리더가 지각하는 반은 시작 5분 동안 분위기가 흐트러진다는 걸 봤다. 지각 전날 개별로 한 번 더 연락하는 편이 낫겠다고 생각했다.", todo: "수요일 저녁 반 의자 추가 배치 → 조교와 내일 오픈 때 같이", ask: "리더에게 지각 사유를 직접 물어봐도 되는지 기준이 애매했다.", praise: "마감 전 비품 부족을 미리 발견해서 주문서에 올린 것", consult: { Pro: 1, Plus: 1 } },
    { learned: "환불 문의 전화에서 '정책'보다 '사정'을 먼저 들어주니 상대 목소리가 풀렸다. 공감 문장 한 줄이 통화 시간을 줄였다.", todo: "환불 문의 건 담당자에게 인계 메모 작성 → 퇴근 전", ask: "양도 가능 기간을 안내할 때 기준일을 언제로 말해야 하는지 헷갈린다.", praise: "어려운 통화를 끝까지 침착하게 마무리한 것", consult: { Premium: 1, 미등록: 2 } },
    { learned: "상담 장표 순서를 바꿔서 멤버십 비교를 뒤로 보냈더니 고객이 질문을 더 많이 했다. 질문이 나오는 상담이 등록으로 이어졌다.", todo: "바꾼 장표 인쇄본 3부 → 내일 오전", ask: "장표 수정본을 공유 폴더 어디에 올려야 하는지 확인하고 싶어요.", praise: "상담 후 고객에게 안내 문자까지 바로 보낸 것", consult: { "Pro Max": 1, Pro: 1 } },
    { learned: "마감할 때 체크표를 소리 내어 읽으면서 하니 누락이 없었다. 눈으로만 볼 때는 두 번이나 놓쳤던 항목이다.", todo: "체크표 코팅본 만들기 → 이번 주 안에", ask: "주말 근무 조교와 인수인계 메모를 어디에 남기면 좋은지 궁금해요.", praise: "조교의 첫 근무를 곁에서 도와 무사히 끝낸 것", consult: { Plus: 1, 미등록: 1 } },
    { learned: "신규 멤버가 반 선택을 못 하고 망설일 때 '수업을 한 번 구경해 보실래요?'가 가장 잘 통했다. 설명보다 체험이 빠르다.", todo: "체험 안내지 문구 다듬기 → 내일", ask: "체험 수업 참관 인원 제한이 있는지 확인이 필요해요.", praise: "체험 오신 분이 그날 바로 등록하도록 도운 것", consult: { Premium: 2, 미등록: 1 } },
    { learned: "하루 문의를 시간대별로 묶어 보니 점심 직후에 몰린다는 걸 알았다. 그 시간대에 전화 담당을 정해 두면 놓치는 문의가 줄 것 같다.", todo: "문의 시간대 표 매니저에게 공유", ask: "문의가 몰리는 시간대에 조교를 추가 배치할 수 있는지 궁금해요.", praise: "숫자로 정리해서 개선안을 제안한 것", consult: { Pro: 2 } },
    { learned: "멤버 불만을 들을 때 바로 해결책을 말하면 오히려 더 화를 낸다. 먼저 끝까지 듣고 '이해했다'를 말하면 해결책이 필요 없을 때도 있었다.", todo: "불만 접수 건 후속 연락 → 내일 오후", ask: "후속 연락은 누가 언제 하는 게 좋은지 기준이 필요해요.", praise: "화난 멤버를 웃으며 돌려보낸 것", consult: { Plus: 2, 미등록: 1 } },
  ];
  const WEEKLY = [
    { good: "신규 상담 때 질문 순서를 바꾼 뒤 등록으로 이어진 비율이 눈에 띄게 늘었다. 이번 주 상담 6건 중 4건이 등록으로 이어졌다.", regret: "화요일에 보고를 하루 미뤄서 매니저가 오전 일정을 급하게 바꿔야 했다.", worry: "상담과 운영을 번갈아 하다 보니 둘 다 어중간해진다는 느낌이 든다.", goal: "보고는 당일 퇴근 전에 끝낸다 (미루지 않기)", idea: "상담 후 고객에게 바로 보내는 안내 문자 템플릿을 3종으로 만들면 좋겠다.", mood: "🙂 괜찮음", mood_why: "일이 손에 익어서 마음은 편한데 체력이 조금 떨어진다." },
    { good: "리더 지각이 잦던 반의 리더와 따로 이야기해 지각이 이번 주엔 한 번뿐이었다.", regret: "비품 주문 시기를 놓쳐 이틀 동안 음료가 부족했다.", worry: "조교 두 명의 근무 시간이 겹치는 날이 많아 업무 분배가 애매하다.", goal: "비품 주문일을 월·목으로 고정하고 달력에 넣는다", idea: "비품 재고표를 사진 한 장으로 찍어 올리는 방식으로 바꾸자.", mood: "😄 매우 좋음", mood_why: "리더와 대화가 잘 풀려서 기분이 좋았다." },
    { good: "환불 문의를 담당자에게 정확히 인계해서 재문의 없이 마무리됐다.", regret: "상담 중 휴대폰 알림을 끄지 않아 고객 앞에서 한 번 울렸다.", worry: "한 번에 여러 문의가 겹칠 때 우선순위를 못 정한다.", goal: "문의가 겹치면 '마감 시간 있는 것'부터 한다는 기준을 하나 정한다", idea: "문의에 처리 기한 표시를 붙여 한눈에 보게 하면 좋겠다.", mood: "😐 보통", mood_why: "큰 일은 없었지만 이번 주는 변화가 없어 조금 지루했다." },
    { good: "신규 멤버 안내지를 직접 만들어 현장에서 써 봤고 질문이 줄었다.", regret: "안내지를 만들고 매니저 확인을 받지 않고 바로 썼다.", worry: "내가 한 개선이 정말 도움이 되는지 확인할 기준이 없다.", goal: "새로 만든 건 쓰기 전에 매니저 확인부터 받는다", idea: "개선안 결과를 한 달 뒤 숫자로 돌아보는 시간을 정례화하자.", mood: "😵 지침", mood_why: "마감 후 정리가 길어져 이번 주는 퇴근이 늦었다." },
  ];
  const REPLY = [
    "고객이 말을 꺼내기 전에 상황부터 묻는 순서는 정말 좋은 발견이에요. 내일부터 모든 상담에 같은 순서를 써 보고 결과를 숫자로 남겨 주세요.",
    "지각 전날 연락은 좋은 방법이에요. 다만 사유를 캐묻기보다 '내일 시간 괜찮으세요?' 정도로 가볍게 확인해 주세요.",
    "양도 가능 기간 기준일은 결제일이 아니라 '수업 시작일'이에요. 안내표에 한 줄 추가해 둘게요.",
    "개선안 좋아요. 이번 주 안에 직접 실행해 보고 다음 보고에서 결과 한 줄만 알려 주세요.",
    "보고를 미룬 날의 이유가 무엇이었는지 적어 주면 같이 방법을 찾아볼게요. 미룬 사실 자체보다 원인이 중요해요.",
  ];
  t.reports = []; t.report_replies = [];
  let rid = 0, pid = 0;
  const addReport = (u, kind, dayKey, body, submittedAt, withReply, k) => {
    const row = { id: ++rid, user_id: u, kind, day: dayKey, body, submitted_at: submittedAt, notified_at: submittedAt, updated_at: submittedAt || ago(1) };
    nest(row, "report_replies", () => { const r = DEMO.tables.report_replies.filter((x) => x.report_id === row.id); return r.length ? r : null; });
    t.reports.push(row);
    if (withReply && submittedAt) t.report_replies.push({ id: ++pid, report_id: row.id, body: pick(REPLY, k), created_at: new Date(new Date(submittedAt).getTime() + 36e5 * 5).toISOString() });
  };
  const dueDaily = (name, dow) => dow !== 5;
  for (let o = 0; o >= -14; o--) {
    const dow = new Date(day(o) + "T00:00:00").getDay();
    MG.forEach(([u, name], p) => {
      if (!dueDaily(name, dow)) return;
      const k = p * 3 + (-o), body = pick(DAILY, k);
      if (o === 0) { // 오늘: 일부만 제출 / 작성 중 / 아직
        if (p === 0 || p === 3) addReport(u, "daily", day(o), body, ago(2 + p), false, k);
        else if (p === 2) addReport(u, "daily", day(o), { learned: body.learned }, null, false, k);
        return;
      }
      if (name === "박지훈" && o === -1) return; // 한 명은 미제출
      addReport(u, "daily", day(o), body, at(o, `${20 + (p % 3)}:${10 + p * 7}`), (k + o) % 3 === 0 && o < -1, k);
    });
  }
  for (let w = 0; w >= -4; w--) {
    const m = monday(w), sunTs = at(w * 7 + 6 - ((new Date().getDay() + 6) % 7), "21:30"); // 그 주 일요일 밤
    MG.forEach(([u, name], p) => {
      const k = p + 2 * -w, body = pick(WEEKLY, k);
      if (w === 0) { if (p === 0) addReport(u, "weekly", m, body, ago(30), false, k); return; } // 이번 주는 일찍 낸 한 명만
      addReport(u, "weekly", m, body, sunTs, k % 2 === 0 && w < -1, k);
    });
  }

  // ═══ 📷 출석 스캔 (at) ═══ 서울일중점 5장 · 서울영어점 2장 · 부산점 1장
  const ROW = (read, name, phone, cls, table, state, act, why = "", role = "회원", res) => ({ role, read, name, phone, cls, table, state, act, why, ...(res ? { res } : {}) });
  const C1 = "일본어 회화 LV2 · 월수 19:40", C2 = "중국어 회화 LV1 · 화목 18:40";
  const scan = (id, team, status, class_day, slot, by, created, rows, extra = {}) => { const s = { id, team_id: team, path: `${team}/demo_${id}.jpg`, class_day, slot, by_name: by, status, rows, note: "", checked_by: null, checked_at: null, done_at: null, created_at: created, ...extra }; nest(s, "teams", () => ({ name: (DEMO.tables.teams.find((x) => x.id === team) || {}).name })); return s; };
  t.att_scans = [
    scan(1, T.jp, "review", day(0), "오후 6시", "류하린", at(0, "09:12"), [
      ROW("4821", "하서진", "010-0000-4821", C1, "3", "결석", "in", "", "리더"), ROW("7733", "백승아", "010-0000-7733", C1, "3", "결석", "in"), ROW("1190", "마지후", "010-0000-1190", C1, "5", "결석", "in"),
      ROW("0652", "구도영", "010-0000-0652", C1, "5", "출석", "skip", "이미 출석 처리됨"), ROW("9", "", "", C1, "7", "", "ask", "사진에서 뒷자리가 한 자리만 보여요"), ROW("3340", "민다율", "010-0000-3340", C1, "", "결석", "ask", "테이블 칸이 비어 있어요")]),
    scan(2, T.jp, "ok", day(-1), "오후 8시", "장시우", at(-1, "21:44"), [
      ROW("2218", "서해린", "010-0000-2218", C2, "2", "결석", "in", "", "리더"), ROW("5509", "임도훈", "010-0000-5509", C2, "2", "결석", "in"), ROW("8864", "정하은", "010-0000-8864", C2, "4", "결석", "in")], { checked_by: "박지훈", checked_at: at(-1, "22:30") }),
    scan(3, T.jp, "done", day(-2), "오전", "문예서", at(-2, "13:20"), [
      ROW("6027", "남궁솔", "010-0000-6027", C1, "1", "결석", "in", "", "리더", "출석 처리 완료"), ROW("1475", "안지호", "010-0000-1475", C1, "1", "결석", "in", "", "회원", "출석 처리 완료"), ROW("3902", "표나은", "010-0000-3902", C1, "2", "출석", "skip", "이미 출석", "회원", "건너뜀")], { checked_by: "박지훈", checked_at: at(-2, "14:00"), done_at: at(-2, "17:02") }),
    scan(4, T.jp, "done", day(-4), "오후 6시", "류하린", at(-4, "19:55"), [
      ROW("4108", "황보미", "010-0000-4108", C2, "6", "결석", "in", "", "리더", "출석 처리 완료"), ROW("2751", "육지안", "010-0000-2751", C2, "6", "결석", "in", "", "회원", "출석 처리 완료")], { checked_by: "류하린", checked_at: at(-4, "20:30"), done_at: at(-4, "23:03") }),
    scan(5, T.jp, "error", day(-6), "", "장시우", at(-6, "10:11"), [], { note: "사진이 흐려서 이름을 읽지 못했어요. 위에서 반듯하게 다시 찍어 올려 주세요." }),
    scan(6, T.en, "review", day(0), "오후 6시", "한지우", at(0, "08:48"), [
      ROW("3016", "고유빈", "010-0000-3016", "영어 회화 LV3 · 화목 18:40", "4", "결석", "in", "", "리더"), ROW("7582", "채도윤", "010-0000-7582", "영어 회화 LV3 · 화목 18:40", "4", "결석", "in"), ROW("0291", "엄나린", "010-0000-0291", "영어 회화 LV3 · 화목 18:40", "1", "결석", "in"), ROW("5", "", "", "영어 회화 LV3 · 화목 18:40", "1", "", "ask", "일치하는 전산 회원이 없어요")]),
    scan(7, T.en, "done", day(-3), "오후 8시", "윤서아", at(-3, "21:50"), [
      ROW("9143", "방서현", "010-0000-9143", "영어 회화 LV2 · 월수 19:40", "2", "결석", "in", "", "리더", "출석 처리 완료"), ROW("2680", "소은우", "010-0000-2680", "영어 회화 LV2 · 월수 19:40", "2", "결석", "in", "", "회원", "출석 처리 완료")], { checked_by: "이서연", checked_at: at(-3, "22:20"), done_at: at(-2, "11:03") }),
    scan(8, T.bs, "ok", day(-1), "오후 6시", "백다온", at(-1, "19:32"), [
      ROW("1357", "맹소라", "010-0000-1357", "영어 회화 LV1 · 월수 18:40", "3", "결석", "in", "", "리더"), ROW("8421", "예가온", "010-0000-8421", "영어 회화 LV1 · 월수 18:40", "3", "결석", "in")], { checked_by: "최수빈", checked_at: at(-1, "20:10") }),
  ];

  // ═══ 🌏 언어교환 (gx) ═══ 평평한 표를 만들고, 화면이 읽는 중첩(gx_applications/gx_matches/gx_events)은 getter 로 이어 붙임 → 매칭·상태 저장이 화면에 바로 반영
  const BRN = ["daegu-en", "daegu-jpcn", "ulsan"]; // gx.js 가 읽는 지점 id (화면에는 서울영어점·서울일중점·부산점 으로 보임)
  const MEM = (name, nation, g, age, lives, dur, kl, el, spoken, learn, ref, br, st, ago_, i, note) => ({ id: uuid(), created_at: at(-ago_, "14:20"), name, phone: `010-0000-${1000 + i * 37}`, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`, branch: br, nationality: nation, gender: g, age_range: age, lives_in_korea: lives, korea_duration: dur, korean_level: kl, english_level: el, languages_spoken: spoken, languages_learning: learn, referral_source: ref, consent: true, status: st, admin_note: note || "" });
  t.gx_members = [
    MEM("Liam Carter", "Canada", "Male", "20s", true, "3–12 months", "Beginner", "Native", "English", "Korean", "Instagram", BRN[0], "active", 48, 1, "수·금 저녁 가능, 영어 튜터 경험 있음"),
    MEM("Sofia Alvarez", "Spain", "Female", "20s", true, "1–3 years", "Intermediate", "Advanced", "Spanish, English", "Korean", "Friend", BRN[0], "active", 41, 2),
    MEM("Hiro Tanaka", "Japan", "Male", "30s", true, "3+ years", "Advanced", "Intermediate", "Japanese, English", "Korean, English", "Google", BRN[1], "active", 37, 3, "일본어 회화 보조 수업 요청"),
    MEM("Emma Johansson", "Sweden", "Female", "20s", true, "Less than 3 months", "Zero", "Native", "Swedish, English", "Korean", "Walked by", BRN[0], "new", 2, 4),
    MEM("Daniel Okafor", "Nigeria", "Male", "30s", true, "1–3 years", "Intermediate", "Native", "English, Igbo", "Korean", "Instagram", BRN[2], "active", 33, 5),
    MEM("Mei Lin Chen", "Taiwan", "Female", "20s", true, "3–12 months", "Beginner", "Intermediate", "Mandarin, English", "Korean", "Instagram", BRN[1], "new", 12, 6),
    MEM("Noah Fischer", "Germany", "Male", "20s", true, "3–12 months", "Beginner", "Advanced", "German, English", "Korean", "Google", BRN[0], "new", 1, 7),
    MEM("Isabella Rossi", "Italy", "Female", "30s", true, "1–3 years", "Intermediate", "Advanced", "Italian, English", "Korean", "Friend", BRN[2], "active", 26, 8),
    MEM("Ethan Brooks", "USA", "Male", "40s", true, "3+ years", "Advanced", "Native", "English", "Korean", "Other", BRN[0], "inactive", 70, 9, "출장으로 두 달 쉬기로"),
    MEM("Aiko Matsuda", "Japan", "Female", "20s", true, "Less than 3 months", "Zero", "Beginner", "Japanese", "Korean, English", "Instagram", BRN[1], "new", 1, 10),
    MEM("Lucas Moreau", "France", "Male", "20s", true, "3–12 months", "Beginner", "Advanced", "French, English", "Korean", "Instagram", BRN[2], "new", 8, 11),
    MEM("Priya Nair", "India", "Female", "30s", true, "1–3 years", "Intermediate", "Native", "English, Hindi", "Korean", "Walked by", BRN[0], "active", 19, 12),
  ];
  const M = Object.fromEntries(t.gx_members.map((m) => [m.name.split(" ")[0], m.id]));
  t.gx_events = [
    { id: uuid(), created_at: at(-20), title: "Friday Night Social", event_date: day(4), event_time: "19:00", location: "Seoul Gangnam branch lounge", description: "Casual mixer with Korean members. Snacks provided.", fee: "10,000 KRW", how_to_apply: "Apply here", is_active: true },
    { id: uuid(), created_at: at(-18), title: "Kimchi Making Day", event_date: day(11), event_time: "14:00", location: "Busan branch", description: "Make and take home your own kimchi.", fee: "15,000 KRW", how_to_apply: "Apply here", is_active: true },
    { id: uuid(), created_at: at(-10), title: "Language Exchange Speed Meeting", event_date: day(18), event_time: "18:30", location: "Seoul Gangnam branch", description: "Rotate every 10 minutes and meet new partners.", fee: "Free", how_to_apply: "Apply here", is_active: true },
    { id: uuid(), created_at: at(-60), title: "Halloween Party", event_date: day(-5), event_time: "20:00", location: "Seoul Gangnam branch", description: "Costume contest and games.", fee: "10,000 KRW", how_to_apply: "Apply here", is_active: false },
  ];
  const EV = Object.fromEntries(t.gx_events.map((e) => [e.title.split(" ")[0], e.id]));
  const APP = (mem, program, ago_, status, data, event, note) => ({ id: uuid(), created_at: at(-ago_, "15:05"), member_id: M[mem], program, event_id: event ? EV[event] : null, data, status, admin_note: note || "" });
  const LX = (days, times, style, mode, lvl, note) => ({ other_language_level: lvl, exchange_style: style, available_days: days, available_times: times, frequency: "Once a week", mode, note: note || "" });
  t.gx_applications = [
    APP("Liam", "language_exchange", 47, "matched", LX(["Wed", "Fri"], ["Evening"], "Casual conversation", "Offline (at Pallo)", "Native"), null, "첫 만남 완료"),
    APP("Sofia", "language_exchange", 40, "matched", LX(["Mon", "Thu"], ["Evening"], "Mixed", "Either", "Advanced")),
    APP("Hiro", "language_exchange", 36, "matched", LX(["Sat"], ["Afternoon"], "Structured study (textbook / topics)", "Offline (at Pallo)", "Intermediate")),
    APP("Hiro", "korean_class", 36, "attended", { level: "Beginner 2 · Tue/Thu 19:00", message: "Prefer small groups" }, null, "체험 후 등록"),
    APP("Emma", "language_exchange", 2, "applied", LX(["Tue", "Wed"], ["Evening"], "Casual conversation", "Offline (at Pallo)", "Native", "I'd like someone around my age.")),
    APP("Emma", "korean_class", 2, "confirmed", { level: "Beginner 1 · Mon/Wed 19:00", message: "Just arrived in Korea" }, null, "11월 반 배정"),
    APP("Daniel", "language_exchange", 32, "matched", LX(["Sat", "Sun"], ["Morning", "Afternoon"], "Mixed", "Either", "Native")),
    APP("Daniel", "socializing", 30, "attended", { days: ["Tue"], times: ["Evening"], english_level: "Native", note: "" }),
    APP("Mei", "language_exchange", 11, "applied", LX(["Fri", "Sat"], ["Afternoon"], "Structured study (textbook / topics)", "Online", "Intermediate")),
    APP("Noah", "language_exchange", 1, "applied", LX(["Mon", "Wed", "Fri"], ["Evening"], "Mixed", "Offline (at Pallo)", "Advanced")),
    APP("Noah", "event", 1, "applied", { note: "Bringing a friend" }, "Friday"),
    APP("Isabella", "language_exchange", 25, "confirmed", LX(["Thu"], ["Evening"], "Casual conversation", "Offline (at Pallo)", "Advanced")),
    APP("Isabella", "event", 24, "confirmed", { note: "" }, "Kimchi"),
    APP("Ethan", "socializing", 69, "cancelled", { days: ["Wed"], times: ["Evening"], english_level: "Native", note: "" }),
    APP("Aiko", "korean_class", 1, "applied", { level: "Beginner 1 · Tue/Thu 18:00", message: "" }),
    APP("Aiko", "language_exchange", 1, "applied", LX(["Tue", "Sat"], ["Afternoon"], "Casual conversation", "Offline (at Pallo)", "Beginner")),
    APP("Lucas", "event", 7, "confirmed", { note: "Dietary: vegetarian" }, "Language"),
    APP("Lucas", "language_exchange", 7, "applied", LX(["Wed", "Sat"], ["Evening"], "Mixed", "Either", "Advanced")),
    APP("Priya", "socializing", 18, "attended", { days: ["Thu"], times: ["Evening"], english_level: "Native", note: "" }),
    APP("Priya", "event", 17, "confirmed", { note: "" }, "Friday"),
    APP("Liam", "event", 14, "attended", { note: "" }, "Halloween"),
    APP("Sofia", "event", 14, "attended", { note: "" }, "Halloween"),
  ];
  const KOR = (name, tier, gender, age, br, lang, lvl, style, partner, days, times, freq, mode, note, st, ago_, i) => ({ id: uuid(), created_at: at(-ago_, "11:40"), name, phone: `010-0000-2${String(i).padStart(3, "0")}`, gender, age_range: age, branch: br, membership: tier, target_language: lang, target_level: lvl, exchange_style: style, preferred_partner: partner, available_days: days, available_times: times, frequency: freq, mode, note, consent: true, status: st, admin_note: "" });
  t.gx_koreans = [
    KOR("김하늘", "VVIP+", "여성", "20대", BRN[0], "영어", "중급", "가벼운 대화 위주", "비슷한 나이", ["Wed", "Fri"], ["Evening"], "주 1회", "오프라인 (지점에서)", "여행 영어가 목표", "matched", 46, 1),
    KOR("이도현", "VVIP", "남성", "30대", BRN[0], "영어", "초급", "섞어서", "성별 무관", ["Mon", "Thu"], ["Evening"], "주 1회", "둘 다 가능", "", "matched", 39, 2),
    KOR("박서윤", "Basic", "여성", "20대", BRN[1], "일본어", "입문", "교재/주제 정해서 공부", "일본 문화에 관심 있는 분", ["Sat"], ["Afternoon"], "주 1회", "오프라인 (지점에서)", "", "matched", 35, 3),
    KOR("정우진", "VVIP+", "남성", "20대", BRN[0], "영어", "중급", "가벼운 대화 위주", "", ["Tue", "Wed"], ["Evening"], "주 2회", "오프라인 (지점에서)", "회사 영어 면접 준비", "new", 28, 4),
    KOR("한소희", "Basic", "여성", "30대", BRN[0], "영어", "고급", "섞어서", "", ["Mon", "Wed", "Fri"], ["Evening"], "주 1회", "둘 다 가능", "", "new", 22, 5),
    KOR("오태민", "Lite", "남성", "40대", BRN[2], "영어", "초급", "가벼운 대화 위주", "", ["Sat", "Sun"], ["Morning", "Afternoon"], "격주", "오프라인 (지점에서)", "", "new", 20, 6),
    KOR("강예나", "VVIP", "여성", "20대", BRN[1], "중국어", "초급", "교재/주제 정해서 공부", "", ["Fri", "Sat"], ["Afternoon"], "주 1회", "온라인", "", "new", 16, 7),
    KOR("윤지후", "Basic", "남성", "20대", BRN[0], "영어", "중급", "섞어서", "음악 좋아하는 분", ["Thu", "Sat"], ["Evening", "Afternoon"], "주 1회", "둘 다 가능", "", "new", 9, 8),
    KOR("조은서", "Lite", "여성", "50대 이상", BRN[2], "영어", "입문", "가벼운 대화 위주", "", ["Tue"], ["Morning"], "격주", "오프라인 (지점에서)", "", "inactive", 55, 9),
    KOR("서민규", "Basic", "남성", "30대", BRN[0], "영어", "중급", "교재/주제 정해서 공부", "", ["Wed", "Sat"], ["Evening"], "주 1회", "오프라인 (지점에서)", "", "new", 5, 10),
    KOR("문채린", "VVIP", "여성", "20대", BRN[0], "영어", "초급", "가벼운 대화 위주", "", ["Mon", "Fri"], ["Evening"], "주 1회", "오프라인 (지점에서)", "", "new", 2, 11),
  ];
  const K = Object.fromEntries(t.gx_koreans.map((k) => [k.name, k.id]));
  const A = (mem, prog) => t.gx_applications.find((a) => a.member_id === M[mem] && a.program === prog).id;
  t.gx_matches = [
    { id: uuid(), created_at: at(-45), application_id: A("Liam", "language_exchange"), member_id: M.Liam, korean_id: K["김하늘"], started_at: day(-45), ended_at: null, note: "" },
    { id: uuid(), created_at: at(-38), application_id: A("Sofia", "language_exchange"), member_id: M.Sofia, korean_id: K["이도현"], started_at: day(-38), ended_at: null, note: "" },
    { id: uuid(), created_at: at(-34), application_id: A("Hiro", "language_exchange"), member_id: M.Hiro, korean_id: K["박서윤"], started_at: day(-34), ended_at: null, note: "" },
    { id: uuid(), created_at: at(-31), application_id: A("Daniel", "language_exchange"), member_id: M.Daniel, korean_id: K["한소희"], started_at: day(-31), ended_at: day(-12), note: "일정이 안 맞아 종료" },
  ];
  // 한소희는 지난 매칭이 끝나서 대기 상태로
  t.gx_koreans.find((k) => k.name === "한소희").status = "new";
  // 중첩 이어 붙이기: 화면이 읽는 모양 그대로
  const aOf = (a) => { const o = { ...a }; o.gx_events = a.event_id ? { title: (DEMO.tables.gx_events.find((e) => e.id === a.event_id) || {}).title } : null; o.gx_matches = DEMO.tables.gx_matches.filter((x) => x.application_id === a.id).map((x) => { const k = DEMO.tables.gx_koreans.find((y) => y.id === x.korean_id) || {}; return { ...x, gx_koreans: { name: k.name, membership: k.membership } }; }); return o; };
  t.gx_members.forEach((m) => nest(m, "gx_applications", () => DEMO.tables.gx_applications.filter((a) => a.member_id === m.id).map(aOf)));
  t.gx_koreans.forEach((k) => nest(k, "gx_matches", () => DEMO.tables.gx_matches.filter((x) => x.korean_id === k.id).map((x) => ({ ...x, gx_members: { name: (DEMO.tables.gx_members.find((m) => m.id === x.member_id) || {}).name } }))));
  t.gx_events.forEach((e) => nest(e, "gx_applications", () => DEMO.tables.gx_applications.filter((a) => a.event_id === e.id).map((a) => ({ id: a.id }))));

  // ═══ 🔒 맛보기: 인턴교육 12주·조교 채용 가이드는 앞부분만 (화면 기준) ═══
  // sb.js 가 DOMContentLoaded 에서 DEMO.trim 을 돌리고, 앱 boot 는 그 뒤에 등록돼 있어서 탭을 그리기 전에 잘린다.
  DEMO.trim.push(() => {
    const KEEP = [1, 2]; // 보여 줄 주차
    globalThis.EDU_ITEMS = (globalThis.EDU_ITEMS || []).filter((i) => KEEP.includes(i.week));
    globalThis.EDU_WEEKS = (globalThis.EDU_WEEKS || []).map((w) => KEEP.includes(w.week) ? w : { week: w.week, label: w.label, theme: LOCK, goals: ["체험판에서는 1~2주차만 공개돼요. 전체 12주 과정은 정식 사용 때 볼 수 있어요."], report: "—" });
    const H = window.JG_HIRE;
    if (H) {
      H.steps = [...H.steps.slice(0, 2), { t: "3단계 이후", body: ["🔒 체험판에서는 앞부분만 볼 수 있어요.", "• 면접 진행부터 첫 출근·교육 진행까지는 정식 사용 때 이어서 볼 수 있어요."] }];
      H.core = { t: "핵심 운영 원칙", body: ["🔒 체험판에서는 앞부분만 볼 수 있어요."] };
    }
  });
})();
