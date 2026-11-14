// 🌏 밋업(Meetup) 계산 모음 (브라우저 window.MEETUPCORE · Node require 겸용). 화면·DB·API와 무관한 순수 함수만 둔다.
// 행은 meetup_events / meetup_rsvps / meetup_members 그대로. 시각은 ISO 문자열, 날짜는 한국 시간 YYYY-MM-DD.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.MEETUPCORE = api;
})(typeof self !== "undefined" ? self : globalThis, function () {

const NETWORK = "pallofficial", GROUP = "pallo-language-exchange-gathering-english-japanese-korean";
// 이벤트 제목 맨 앞 [지점명] → 플래너 지점(teams 의 key). 여기 없는 지점은 team_id 없이 대표만 본다.
const TEAM_OF_BRANCH = { "Gumi": "gumi", "Daegu Dongseongno": "dsr", "Daegu Dongseongno JP": "jpcn", "Ulsan": "ulsan" };
// 전산(branch.pallo.co.kr)에 들어갈 수 있는 지점만 — 새 신청을 캘린더 임시 일정으로 넣는다
const JEONSAN_CODE = { dsr: "DAEGUDSR", jpcn: "DAEGUJPCH", ulsan: "ULSAN" };
const ACTIVE = ["YES", "WAITLIST"]; // 참석 예정으로 보는 상태
const STATUS_LABEL = { YES: "참석", WAITLIST: "대기", NO: "취소", ATTENDED: "왔음", NO_SHOW: "안 옴", EXCUSED_ABSENCE: "사정 결석", MAYBE: "미정", HAVENT: "미정", YES_PENDING_PAYMENT: "결제 대기" };

// 화면 표시용 지점 이름 (없으면 영어 그대로)
const BRANCH_KO = { "Seoul Yeonsinnae": "서울 연신내", "Seoul Yeongdeungpo": "서울 영등포", "Seoul Jamsil": "서울 잠실", "Seoul Gasan": "서울 가산", "Bundang": "분당", "Hanam": "하남",
  "Anyang Beomgye": "안양 범계", "Bucheon": "부천", "Ilsan": "일산", "Yongin Suji": "용인 수지", "Suwon Yeongtong": "수원 영통", "Guri Dasan": "구리 다산", "Daegu Dalseo": "대구 달서",
  "Daegu Dongseongno": "대구 동성로", "Daegu Dongseongno JP": "대구 동성로 일본어", "Gumi": "구미", "Ulsan": "울산", "Busan PNU": "부산 부산대", "Busan Suyeong": "부산 수영" };
const branchKo = (branch) => BRANCH_KO[branch] ?? branch ?? "지점 미상";
const branchOf = (title) => { const m = String(title ?? "").match(/^\s*\[([^\]]+)\]/); return m ? m[1].trim() : null; };
const teamKeyOfBranch = (branch) => TEAM_OF_BRANCH[branch] ?? null;
const jeonsanCodeOf = (teamKey) => JEONSAN_CODE[teamKey] ?? null;

// ISO 시각 → 한국 시간 {date:"YYYY-MM-DD", time:"HH:MM", dow:0~6(일~토)}
function kst(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  if (isNaN(d)) return null;
  const s = d.toISOString();
  return { date: s.slice(0, 10), time: s.slice(11, 16), dow: d.getUTCDay() };
}
const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);
// 그 주 월요일 (한국 날짜 기준)
const weekStart = (ymd) => { const dow = new Date(ymd + "T00:00:00Z").getUTCDay(); return addDays(ymd, -((dow + 6) % 7)); };

// API 이벤트 노드 → meetup_events 행. teams: [{id, key}]
function eventRow(node, teams) {
  const branch = branchOf(node.title), key = teamKeyOfBranch(branch);
  return {
    id: String(node.id), title: String(node.title ?? ""), branch, team_id: teams.find((t) => t.key === key)?.id ?? null,
    starts_at: node.dateTime, event_url: node.eventUrl ?? null, venue: node.venue?.name ?? null,
  };
}

// API 신청 노드 목록 → meetup_rsvps 행 (주최자 본인 신청은 뺀다). ev = eventRow 결과
function rsvpRows(ev, nodes) {
  return (nodes ?? []).filter((r) => r && !r.isHost && r.member).map((r) => ({
    id: String(r.id), event_id: ev.id, team_id: ev.team_id, branch: ev.branch, event_title: ev.title, starts_at: ev.starts_at,
    member_id: String(r.member.id), member_name: String(r.member.name ?? ""), member_city: r.member.city ?? null,
    status: r.status ?? null, is_first_event: !!r.isFirstEvent, guests: Number(r.guestsCount) || 0, rsvp_updated: r.updated ?? null,
  }));
}

// 지난 상태(prev: id→행)와 이번에 읽은 행을 비교 → 새 신청 / 취소 / 상태 바뀜
function diffRsvps(prev, rows) {
  const fresh = [], cancelled = [], changed = [];
  for (const r of rows) {
    const p = prev[r.id];
    if (!p) { if (ACTIVE.includes(r.status)) fresh.push(r); continue; }
    if (p.status === r.status) continue;
    if (ACTIVE.includes(p.status) && r.status === "NO") cancelled.push(r); else changed.push({ ...r, prev_status: p.status });
  }
  return { fresh, cancelled, changed };
}

// 전산 캘린더에 넣어야 할 신청: 전산 지점 · 참석/대기 · 아직 처리 안 함 · 모임이 아직 안 지남
function jeonsanTodo(rows, teams, nowIso) {
  const keyOf = (id) => teams.find((t) => t.id === id)?.key ?? null;
  return rows.filter((r) => jeonsanCodeOf(keyOf(r.team_id)) && ACTIVE.includes(r.status) && !r.jeonsan_status && Date.parse(r.starts_at) > Date.parse(nowIso))
    .map((r) => ({ ...r, jeonsan_code: jeonsanCodeOf(keyOf(r.team_id)), ...kst(r.starts_at) }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// 전산 일정 제목·메모 (스킬이 그대로 입력)
function jeonsanTitle(r) { return `밋업 / ${r.member_name} / ${r.branch} 언어교환 참석${r.status === "WAITLIST" ? "(대기)" : ""}`; }
function jeonsanMemo(r) {
  return ["[밋업 자동등록]", `이벤트: ${r.event_title}`, `참석자: ${r.member_name}${r.member_city ? ` (${r.member_city})` : ""}${r.is_first_event ? " · 첫 참석" : ""}`,
    `밋업 신청 번호: ${r.id}`, `이벤트 주소: https://www.meetup.com/${GROUP}/events/${r.event_id}/`,
    "→ 외국인 참가자(무료)예요. 당일 응대해 주세요. 취소되면 이 일정은 직접 지워 주세요."].join("\n");
}

// 그날(한국 날짜) 참석 예정자를 지점·시간별로 묶기 → [{branch, team_id, time, event_id, event_title, people:[{name, status, first}]}]
function rosterOf(rows, ymd) {
  const groups = new Map();
  for (const r of rows) {
    const k = kst(r.starts_at); if (!k || k.date !== ymd || !ACTIVE.includes(r.status)) continue;
    const g = groups.get(r.event_id) ?? groups.set(r.event_id, { branch: r.branch, team_id: r.team_id, time: k.time, event_id: r.event_id, event_title: r.event_title, people: [] }).get(r.event_id);
    g.people.push({ name: r.member_name, status: r.status, first: !!r.is_first_event });
  }
  return [...groups.values()].sort((a, b) => a.time.localeCompare(b.time) || String(a.branch).localeCompare(String(b.branch)));
}

// 주간 요약: 모임 날짜가 그 주(월~일)인 신청을 지점별로 센다 → [{week, branch, rsvps, attended, noShow, cancelled}]
function weeklyStats(rows, weeks, todayYmd) {
  const start0 = weekStart(addDays(todayYmd, -7 * (weeks - 1)));
  const out = new Map();
  for (const r of rows) {
    const k = kst(r.starts_at); if (!k || k.date < start0) continue;
    const wk = weekStart(k.date), key = wk + "|" + (r.branch ?? "");
    const o = out.get(key) ?? out.set(key, { week: wk, branch: r.branch, rsvps: 0, attended: 0, noShow: 0, cancelled: 0 }).get(key);
    if (r.status === "NO") o.cancelled++; else o.rsvps++;
    if (r.status === "ATTENDED") o.attended++;
    if (r.status === "NO_SHOW") o.noShow++;
  }
  return [...out.values()].sort((a, b) => b.week.localeCompare(a.week) || b.rsvps - a.rsvps);
}

// JWT 클레임 (서명은 Node crypto 가 한다). 유효 120초.
function jwtParts({ clientKey, memberId, signingKeyId }, nowSec) {
  return { header: { kid: signingKeyId, typ: "JWT", alg: "RS256" }, claims: { sub: String(memberId), iss: clientKey, aud: "api.meetup.com", exp: nowSec + 120 } };
}

return { NETWORK, GROUP, TEAM_OF_BRANCH, JEONSAN_CODE, ACTIVE, STATUS_LABEL, BRANCH_KO, branchKo, branchOf, teamKeyOfBranch, jeonsanCodeOf, kst, addDays, weekStart,
  eventRow, rsvpRows, diffRsvps, jeonsanTodo, jeonsanTitle, jeonsanMemo, rosterOf, weeklyStats, jwtParts };
});
