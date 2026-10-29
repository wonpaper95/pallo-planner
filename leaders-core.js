// 🧑‍🏫 리더 현황 보드 계산 (브라우저·node 테스트 공용): 수업 날짜, 달마다 결석·개근, 구글시트 붙여넣기 해석
(() => {
const D = typeof module !== "undefined" ? require("./week.js") : W; // week.js 의 W (전역 const 라 window.W 아님)
const LDC = {
  GRPS: ["월수", "화목", "토일"],
  DAYS: { 월수: [1, 3], 화목: [2, 4], 토일: [6, 0] },
  ABSENT_LIMIT: 3, // 한 달에 3번 이상 빠지면 🚨 재관리
  // from~to(포함) 사이 그 반 수업 날짜
  sessions(grp, from, to) {
    const out = [], days = LDC.DAYS[grp] ?? [];
    for (let d = from; d <= to; d = D.add(d, 1)) if (days.includes(D.parse(d).getDay())) out.push(d);
    return out;
  },
  monthStart: (d) => d.slice(0, 8) + "01",
  monthEnd(d) { const p = D.parse(LDC.monthStart(d)); p.setMonth(p.getMonth() + 1); p.setDate(0); return D.ymd(p); },
  addMonths(d, n) { const p = D.parse(LDC.monthStart(d)); p.setMonth(p.getMonth() + n); return D.ymd(p); },
  // 그달 성적. att: Map(day → 'O'|'X'). 지난 수업만 셈 (오늘은 체크했을 때만)
  // cover = 그달 다른 리더 대신 와준(대타) 횟수 → 결석을 그만큼 메움 (시트 규칙: 빠지면 다른 시간대 대타 와줘야 함)
  monthStat(grp, month, att, today, cover = 0) {
    const all = LDC.sessions(grp, LDC.monthStart(month), LDC.monthEnd(month)), past = all.filter((d) => d < today || (d === today && att.has(d))); // 오늘 수업은 체크해야 셈
    const o = past.filter((d) => att.get(d) === "O").length, x = past.filter((d) => att.get(d) === "X").length;
    const made = Math.min(cover, x), ended = LDC.monthEnd(month) < today, perfect = past.length > 0 && o + made === past.length;
    return { total: all.length, past: past.length, o, x, blank: past.length - o - x, cover, net: x - made,
      recheck: x - made >= LDC.ABSENT_LIMIT, award: perfect && ended, onTrack: perfect && !ended };
  },
  // 시트 출석 칸 → { state, sub }. 'X / 소희'·'소희' = 빠짐 + 대타 소희
  attOf(v) {
    v = String(v ?? "").trim(); if (!v) return null;
    return /^o$/i.test(v) ? { state: "O", sub: "" } : { state: "X", sub: v.replace(/^[xo]\s*\/?\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 40) };
  },
  // 대타 이름 → 그 지점 리더 한 명 (못 찾거나 여러 명이면 null). '지우랑' → 지우, '김정화(목)' 같은 이름도
  matchSub(sub, rows) {
    const n = (x) => String(x).replace(/\(.*?\)|\s/g, ""), s = n(sub).replace(/(이랑|랑|님|리더)$/, "");
    if (s.length < 2) return null;
    const same = rows.filter((r) => n(r.name).split("/").some((p) => p === s)); if (same.length === 1) return same[0]; // 이름이 딱 맞으면 우선 ('민지' vs '민지2')
    const hit = rows.filter((r) => n(r.name).split("/").some((p) => p.includes(s)));
    return hit.length === 1 ? hit[0] : null;
  },
  // 이름 끝 숫자(예: '김주란4+', '백지훈 3+')는 시트에서 쓰던 라포 → 별점으로
  splitName(raw) {
    const m = String(raw ?? "").trim().match(/^(.*?)\s*([1-5])\s*[+-]?\s*$/);
    return m && m[1] ? { name: m[1].trim(), rapport: +m[2] } : { name: String(raw ?? "").trim(), rapport: null };
  },
  // 구글시트에서 복사한 줄(탭 구분) → 리더 목록. 시간대 칸이 비면 위(구역 제목·이전 줄) 것을 이어 씀
  parsePaste(text) {
    const rows = [], cur = { grp: "", slot: "" };
    const grpOf = (s) => (s.match(/월수|화목|토일/) ?? [s.includes("주말") ? "토일" : ""])[0];
    const slotOf = (s) => (s.match(/\d{1,2}(:\d{2})?\s*(AM|PM)/i) ?? [""])[0].replace(/\s+/g, "").toUpperCase();
    // 시간대: 11AM 같은 시각, 없으면 남은 말('주말 오후 15팀' → 오후, '대기', '중국어 스터디')
    const label = (s) => slotOf(s) || s.replace(/월수|화목|토일|주말|총|\d+\s*팀|[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20);
    for (const line of String(text).split(/\r?\n/)) {
      const c = line.split("\t").map((x) => x.trim());
      if (!c.some(Boolean)) continue;
      if (c[0].startsWith("시간대/업무")) { cur.staff = true; continue; } // 워킹스텝 시트 머리줄 → 아래는 스텝
      if (cur.staff) { if (!c[0] && !c[1]) continue; const st = LDC.splitName(c[1] || "(미정)");
        rows.push({ kind: "staff", grp: grpOf(c[0]), slot: label(c[0]), level: "", seat: "", name: st.name, rapport: st.rapport,
          status: /구해야/.test(c[2] + c[1]) ? "구해야 함" : "확정", start_day: c[3] ?? "", phone: c[4] ?? "", note: c[5] ?? "", edu: "", memo: "", att: [] });
        continue; }
      if (c[0].includes("|")) { const h = c[0].split("|")[1] ?? ""; cur.grp = grpOf(h) || cur.grp; cur.slot = label(h); } // 구역 제목 줄 (☀️ 오전 | 월수 11AM 9팀 | …)
      else if (grpOf(c[0])) { cur.grp = grpOf(c[0]); cur.slot = label(c[0]); } // 시간대 칸 ('월수 11AM', '주말 오전')
      if (c.length < 5 || c[3] === "리더" || c[1] === "레벨" || (!c[1] && !c[3])) continue; // 제목·머리줄·빈 줄
      if (!cur.grp) continue;
      const { name, rapport } = LDC.splitName(c[3] || "구해야됨");
      rows.push({ kind: "leader", grp: cur.grp, slot: cur.slot, level: c[1] ?? "", seat: c[2] ?? "", name, rapport,
        status: /구해야/.test(c[4] + c[3]) ? "구해야 함" : "확정", start_day: c[5] ?? "", phone: c[6] ?? "", note: c[7] ?? "",
        edu: [c[18], c[19]].filter(Boolean).join(" · "), memo: c[20] ?? "", att: c.slice(8, 18) }); // att: 1주①~5주② 칸 그대로 (저장 땐 뺌)
    }
    return rows;
  },
  // 🔄 전산 리더 출석 연동: 전산 지점 코드 ↔ 플래너 지점, 이 날부터 전산 값이 우선 (그 전은 시트에서 옮긴 기록 유지)
  JEONSAN: { DAEGUDSR: "대구영어점", DAEGUJPCH: "대구일중점", ULSAN: "울산점" },
  SYNC_START: "2026-10-27",
  // 전산 리더(이름·전화) → 플래너 리더: 전화 뒤 8자리 → 이름 정확히 → 이름 들어간 사람 한 명.
  // 같은 사람이 여러 줄(여러 시간대)이면 전산 수업과 반·시간대가 맞는 줄
  matchJeonsan(name, phone, rows, course = "") {
    const p8 = String(phone ?? "").replace(/\D/g, "").slice(-8), n = (x) => String(x).replace(/\(.*?\)|\s/g, "");
    const pick = (h) => { if (h.length < 2) return h[0] ?? null; const { grp, slot } = LDC.courseSlot(course, h); return h.find((r) => r.grp === grp && r.slot === slot) ?? h.find((r) => r.grp === grp) ?? h[0]; };
    if (p8.length === 8) { const h = rows.filter((r) => String(r.phone ?? "").replace(/\D/g, "").includes(p8)); if (h.length) return pick(h); }
    const e = rows.filter((r) => n(r.name).split("/").includes(n(name))); if (e.length) return pick(e);
    return LDC.matchSub(name, rows);
  },
  // 보기 필터 (3지점 공통): 평일 오전 = 월수·화목 12시 전, 평일 오후 = 12시부터(저녁 포함), 주말 = 토일
  FILTERS: [["all", "전체"], ["am", "평일 오전"], ["pm", "평일 오후"], ["we", "주말"], ["mw", "월·수"], ["tt", "화·목"]],
  passFilter(r, f) {
    if (!f || f === "all") return true;
    const wd = r.grp === "월수" || r.grp === "화목", t = LDC.slotMin(r.slot);
    return f === "am" ? wd && t < 720 : f === "pm" ? wd && t >= 720 && t < 9999 : f === "we" ? r.grp === "토일" : f === "mw" ? r.grp === "월수" : f === "tt" ? r.grp === "화목" : true;
  },
  // 첫 시작일 글자 → 'YYYY-MM-DD' (시트마다 형식이 다름: 2026-05-04 · 2025. 8. 6 · 26/3/4 · 20261026 · 260504). 못 읽으면 null
  parseDay(v) {
    const t = String(v ?? "").trim(); let m, y, mo, d;
    if ((m = t.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/))) [, y, mo, d] = m;
    else if ((m = t.match(/^(\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/))) [, y, mo, d] = ["", "20" + m[1], m[2], m[3]];
    else if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) [, y, mo, d] = m;
    else if ((m = t.match(/^(\d{2})(\d{2})(\d{2})$/))) [, y, mo, d] = ["", "20" + m[1], m[2], m[3]];
    else return null;
    if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
    return `${y}-${String(+mo).padStart(2, "0")}-${String(+d).padStart(2, "0")}`;
  },
  // 🎨 시간대 묶음 (구해야 함 현황표 색 구분): 평일 오전 < 12시 · 오후 12~18시 · 저녁 18시~ · 주말 · 기타(반 없음·시간 미정)
  BANDS: [["am", "평일 오전"], ["pm", "평일 오후"], ["ev", "평일 저녁"], ["we", "주말"], ["etc", "기타"]],
  band(r) {
    if (r.grp === "토일") return "we";
    const t = LDC.slotMin(r.slot);
    return !r.grp || t >= 9999 ? "etc" : t < 720 ? "am" : t < 1080 ? "pm" : "ev";
  },
  // 📊 기록용 고르기 칸 (DB check 와 같게)
  END_REASONS: ["취업·이직", "이사", "학업·시험", "건강", "개인 사정", "불만·갈등", "연락 두절", "기타"],
  SOURCES: ["회원 전환", "지인 추천", "알바몬", "인스타", "당근", "기타"],
  // 그 기간(from~to)에 활동한 리더인가: 시작일이 기간 끝 전 · 그만둔 날이 기간 시작 뒤 (시작일 모르면 있는 걸로)
  activeIn(r, from, to) {
    const s = LDC.parseDay(r.start_day);
    return (!s || s <= to) && (!r.end_day || r.end_day >= from);
  },
  // 첫 시작일부터 며칠 지났나: D+30 · 오늘이면 D-day · 앞으로면 D-3
  dPlus(start, today) {
    const s = LDC.parseDay(start); if (!s) return "";
    const n = Math.round((D.parse(today) - D.parse(s)) / 864e5);
    return n > 0 ? `D+${n}` : n === 0 ? "D-day" : `D${n}`;
  },
  // 📜 자격증: 첫 시작일부터 6개월 → 2급, 1년 → 1급. on = 받을 수 있는 날, ok = 오늘(그만뒀으면 그만둔 날)까지 채웠나. 시작일 모르면 []
  CERTS: [[2, 6], [1, 12]],
  certs(start, end, today) {
    const s = LDC.parseDay(start); if (!s) return [];
    const until = end && end < today ? end : today;
    return LDC.CERTS.map(([grade, n]) => { const p = D.parse(s), d = p.getDate(); p.setMonth(p.getMonth() + n); if (p.getDate() !== d) p.setDate(0); // 8/31 + 6개월 = 2/28
      const on = D.ymd(p); return { grade, on, ok: on <= until }; });
  },
  // 시간대 정렬용 (11AM < 6PM < 8PM, 오전 < 오후, 대기·스터디는 맨 뒤)
  slotMin(s) {
    s = String(s ?? ""); const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i), lang = s.includes("중국어") ? 1 : 0; // 같은 시간이면 일본어 → 중국어
    if (m) return ((+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + (+m[2] || 0) + lang;
    const pm = s.match(/오후\s*(\d{1,2})/); if (pm) return ((+pm[1] % 12) + 12) * 60 + lang;
    return (s.includes("오전") ? 600 : s.includes("오후") ? 840 : s.includes("저녁") ? 1140 : 9999) + lang; // 대기·스터디는 맨 뒤
  },
  // 📌 보드: 언어를 빼고 시간대로 묶음 ('일본어 오전'·'중국어 오전' → '오전') · 언어는 이름 옆에 작게
  langOf: (s) => (String(s ?? "").match(/일본어|중국어/) ?? [""])[0],
  timeKey: (s) => String(s ?? "").replace(/일본어|중국어/g, "").replace(/\s+/g, " ").trim(),
  // 레벨 정렬: 숫자(0 · 0.5 · 패턴1 · 2) 순, 숫자 없으면(프토 · 땜빵리더) 뒤
  lvNum(lv) { const m = String(lv ?? "").match(/\d+(\.\d+)?/); return m ? +m[0] : 99; },
  // 전산 수업 이름('월수 오전', '월수 오후6', '일본어 월수 18시', '영어 화목 11:00') → 반·시간대. 그 반에 비슷한 시간(±90분)·같은 언어 칸이 있으면 그걸 씀
  courseSlot(course, rows) {
    const c = String(course ?? ""), grp = (c.match(/월수|화목|토일/) ?? [c.includes("주말") ? "토일" : ""])[0], lang = (c.match(/일본어|중국어/) ?? [""])[0];
    const pm = c.match(/오후\s*(\d{1,2})/), hm = c.match(/(\d{1,2})\s*(?:시|:\d{2})/);
    const label = pm ? `${+pm[1]}PM` : hm ? (+hm[1] < 12 ? `${+hm[1]}AM` : `${+hm[1] === 12 ? 12 : +hm[1] - 12}PM`) : (c.match(/오전|오후|저녁/) ?? [""])[0];
    const want = LDC.slotMin(label); if (!grp || want >= 9999) return { grp, slot: label };
    let cand = [...new Set(rows.filter((r) => r.grp === grp).map((r) => r.slot))];
    if (cand.some((x) => /일본어|중국어/.test(x))) cand = cand.filter((x) => lang ? x.includes(lang) : !/일본어|중국어/.test(x)); // 언어별 칸이면 같은 언어만
    const near = cand.map((x) => [x, Math.abs(LDC.slotMin(x) - LDC.slotMin(label + (x.includes("중국어") ? " 중국어" : "")))]).filter(([, d]) => d <= 90).sort((a, b) => a[1] - b[1])[0];
    const word = want < 720 ? "오전" : want < 1080 ? "오후" : "저녁"; // 언어별 칸은 오전·오후·저녁 이름
    return { grp, slot: near ? near[0] : (lang && cand.length ? `${lang} ${word}` : label) };
  },
};
if (typeof module !== "undefined") module.exports = LDC; else window.LDC = LDC;
})();
