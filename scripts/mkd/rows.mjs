// 일일 현황 입력 검증 — 순수 모듈(DB·환경파일 안 읽음, tests/mkd-rows.test.mjs 로 검증). lib.mjs 가 팀 목록을 넘겨 쓴다.
// 크롬 채널(구글 광고·전산 등)은 Claude 가 아래 JSON 을 만들고, 네이버 API 스크립트는 같은 모양의 rows 를 넘긴다. 나쁜 입력은 조용히 넘기지 않고 한국어 메시지로 던진다.
//
// 입력 규격
//   { "rows": [ { "team_key": "dsr", "unit": "대구_영어(검색광고)", "metrics": { "impressions": 120, "clicks": 9, "spend": 18200, "status": "운영 가능", "flags": [] }, "status": "ok" } ], "status": "ok" }
//   · 최상위 키는 rows·status·note 뿐, 행 키는 team_key·team_id·unit·metrics·status 뿐 (오타 키는 오류).
//   · rows 가 없거나 비면 최상위 status 가 failed|login_required 여야 하고, 그러면 모든 지점에 unit '전체' 행 {note} 가 생긴다. 그 밖엔 오류.
//   · 최상위 status(ok|partial)는 자기 status 가 없는 행의 기본값(없으면 ok).
//   · team_key 는 dsr|jpcn|ulsan|gumi. blog·daangn·jeonsan 채널과 unit '전체' 행은 지점(team_key|team_id)이 필수 — '전체' ok 행 = 그 지점의 그 채널 합계.
//     광고 채널(naver_ad|google_ad|meta_ad)만 지점이 없으면 unit 이름(MK.teamKeyOf)으로 추정하고, 못 하면 dsr + unit 앞에 '[미분류] '.
//   · unit 은 문자열(없으면 '전체'), 앞뒤 공백 제거, 접두어를 붙인 뒤 120자로 자른다. 같은 (지점, unit) 이 두 번 나오면 오류 — 같은 이름이면 숫자를 더해 한 행으로 보낸다.
//   · metrics 숫자 키: impressions clicks spend spend_usd fx ctr cpc avg_rank conversions leads reach rank visitors views followers chats inquiries enrolls
//     ('1,204' '₩18,200' '$12.50' 허용, '--' 는 null, 음수는 rank·avg_rank 만). 문자열 키: status note campaign_id top_url our_url (campaign_id 는 유한한 숫자로 와도 문자열로 바꿔 받는다). 배열 키: flags.
//   · 행 하나의 오류는 'rows[3]: …' 로 몇 번째 행인지 앞에 붙여 던진다(메시지 본문은 그대로). 봉투·중복 오류는 접두어 없음.
//   · 전화번호처럼 보이는 값은 unit·note·flags·문자열 지표에서 거부한다(top_url·our_url·campaign_id 는 제외). jeonsan unit 은 이름 규칙까지 본다.
//     단 광고 채널(naver_ad|google_ad|meta_ad)의 unit 은 캠페인 이름이라 거부하지 않고 숫자 덩어리를 #로 가려 저장한다. note·flags 는 광고 채널에서도 거부(스킬이 미리 가린다).
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
export const D = req("../../mkd-core.js");
export const MK = req("../../mk-core.js");

const FALLBACK_KEY = "dsr"; // 지점을 못 정한 광고 행이 가는 곳(대구영어점) — unit 앞에 [미분류]
const TEAM_KEYS = ["dsr", "jpcn", "ulsan", "gumi"];
const TOP_KEYS = new Set(["rows", "status", "note"]), ROW_KEYS = new Set(["team_key", "team_id", "unit", "metrics", "status"]);
const NUM_KEYS = new Set(["impressions", "clicks", "spend", "spend_usd", "fx", "ctr", "cpc", "avg_rank", "conversions", "leads", "reach", "rank", "visitors", "views", "followers", "chats", "inquiries", "enrolls"]);
const STR_KEYS = new Set(["status", "note", "campaign_id", "top_url", "our_url"]);
const SIGNED = new Set(["rank", "avg_rank"]); // 음수 허용
const NO_PERSONAL_CHECK = new Set(["top_url", "our_url", "campaign_id"]); // 긴 숫자가 정상인 값
const JEONSAN_UNIT = /^(전체|meta|homepage|기타|(gads|nad)_[a-z0-9_]+)$/;
const isObj = (x) => Object.prototype.toString.call(x) === "[object Object]";
const bad = (m) => new Error(`입력 형식 오류: ${m}`);

// 전화번호 모양(010 1234 5678 · 01012345678 · 053-123-4567 · (053) 123-4567)
export const looksPersonal = (s) => /0\d{1,2}[\s.\-)]{0,2}\d{3,4}[\s.\-]{0,2}\d{4}/.test(String(s ?? ""));
const noPersonal = (s, key) => { if (looksPersonal(s)) throw new Error(`개인정보(전화번호)처럼 보이는 값이 있어 저장하지 않아요: ${key}`); }; // 값은 메시지에 싣지 않는다

// 숫자: '--' 류는 null, ₩ $ US 공백은 떼고, 쉼표는 천 단위일 때만. 틀린 값은 길이만 알린다.
const NULLS = new Set(["--", "-", "–", "—"]), PLAIN_NUM = /^-?\d+(\.\d+)?$/, COMMA_NUM = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/;
function parseNum(k, v) {
  if (v === null || v === undefined || v === "") return null;
  const notNum = (why) => new Error(`${k} 는 숫자여야 해요 (${why})`);
  let n;
  if (typeof v === "number") { if (!Number.isFinite(v)) throw notNum("유한한 숫자가 아님"); n = v; }
  else if (typeof v === "string") {
    const t = v.trim(); if (NULLS.has(t)) return null;
    const c = t.replace(/US|[₩$\s]/g, "");
    if (!PLAIN_NUM.test(c) && !COMMA_NUM.test(c)) throw notNum(`길이 ${v.length}`);
    n = +c.replace(/,/g, "");
  } else throw notNum(`${Array.isArray(v) ? "배열" : typeof v} 형식`);
  if (n < 0 && !SIGNED.has(k)) throw new Error(`${k} 는 음수일 수 없어요`);
  return n;
}

// 허용된 키만, 숫자 키는 숫자로, 문자열은 잘라서. 개인정보 비슷한 값(전화번호)은 막는다.
export function cleanMetrics(m) {
  if (m === null || m === undefined) m = {};
  if (!isObj(m)) throw bad("metrics 는 객체여야 해요");
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (NUM_KEYS.has(k)) out[k] = parseNum(k, v);
    else if (STR_KEYS.has(k)) {
      const sv = k === "campaign_id" && typeof v === "number" && Number.isFinite(v) ? String(v) : v; // 크롬에서 읽은 id 는 숫자로 올 수 있다
      if (sv !== null && sv !== undefined && typeof sv !== "string") throw new Error(`${k} 는 문자열이어야 해요`);
      const s = sv ?? ""; if (!NO_PERSONAL_CHECK.has(k)) noPersonal(s, k);
      out[k] = s.slice(0, 200);
    } else if (k === "flags") {
      out[k] = (Array.isArray(v) ? v : [v]).map((x) => {
        if (x !== null && x !== undefined && typeof x !== "string" && typeof x !== "number") throw new Error("flags 항목은 문자열이어야 해요");
        const s = String(x ?? ""); noPersonal(s, "flags"); return s.slice(0, 120);
      }).filter(Boolean);
    } else throw new Error(`모르는 지표 키: ${k.slice(0, 40)}`);
  }
  return out;
}

// 입력 JSON → mkd_daily 행 [{team_id,date,channel,unit,metrics,status}]. teams = [{id,name,key}]. 규격은 이 파일 맨 위.
export function toRowsPure(channel, date, input, teams) {
  if (!D.CHANNELS.includes(channel)) throw new Error(`채널은 ${D.CHANNELS.join("/")} 중 하나: ${channel}`);
  if (!isObj(input)) throw bad('최상위는 {"rows":[…]} 객체여야 해요');
  const hasRows = input.rows !== undefined && input.rows !== null;
  if (hasRows && !Array.isArray(input.rows)) throw bad("rows 는 배열이어야 해요");
  (input.rows ?? []).forEach((r, i) => { if (!isObj(r)) throw bad(`rows[${i}] 는 객체여야 해요`); });
  if (input.status !== undefined && !D.STATUS.includes(input.status)) throw new Error(`status 는 ${D.STATUS.join("/")}: ${input.status}`);
  const empty = !input.rows?.length;
  if (empty && input.status !== "failed" && input.status !== "login_required") throw new Error("rows 가 비었는데 status(failed/login_required)가 없어요");
  if (!empty && (input.status === "failed" || input.status === "login_required")) throw new Error(`rows 가 있는데 status 가 ${input.status} 예요 — 행을 비우거나 ok/partial 로 보내 주세요`);
  const extra = Object.keys(input).find((k) => !TOP_KEYS.has(k)); if (extra !== undefined) throw bad(`모르는 키: ${extra.slice(0, 40)}`);
  if (!teams.length) throw new Error("지점 목록(teams)이 비었어요 — DB 를 확인해 주세요");

  if (empty) { // 채널 통째 실패·로그인 필요: 모든 지점에 '전체' 행
    if (input.note !== undefined && typeof input.note !== "string") throw new Error("note 는 문자열이어야 해요");
    const note = input.note ?? "행 없음"; noPersonal(note, "note");
    return teams.map((t) => ({ team_id: t.id, date, channel, unit: D.ALL, metrics: { note: note.slice(0, 200) }, status: input.status }));
  }
  if (input.note !== undefined) { if (typeof input.note !== "string") throw new Error("note 는 문자열이어야 해요"); noPersonal(input.note, "note"); }
  const defStatus = input.status ?? "ok";
  const rowOf = (r) => {
    const xk = Object.keys(r).find((k) => !ROW_KEYS.has(k)); if (xk !== undefined) throw bad(`모르는 키: ${xk.slice(0, 40)}`);
    if (r.unit !== undefined && r.unit !== null && typeof r.unit !== "string") throw new Error("unit 은 문자열이어야 해요");
    let unit = (r.unit ?? "").trim() || D.ALL;
    if (D.AD_CHANNELS.includes(channel) && looksPersonal(unit)) unit = unit.replace(/\d+/g, "#"); // 광고 캠페인 이름은 업무 글 — 전화번호 모양이면 던지지 않고 숫자만 가린다
    noPersonal(unit, "unit");
    if (channel === "jeonsan" && !JEONSAN_UNIT.test(unit) && (unit.length > 20 || /\d{3}/.test(unit))) throw new Error("jeonsan unit 은 전체|meta|homepage|기타|gads_…|nad_… 이거나 20자 이하(숫자 3자리 연속 불가)여야 해요");
    // 지점: team_key·team_id 로 정한다. blog·daangn·jeonsan 과 '전체' 행은 필수, 광고 채널만 unit 이름으로 추정.
    let team = null;
    if (r.team_key !== undefined && r.team_key !== null) {
      if (!TEAM_KEYS.includes(r.team_key)) throw new Error(`team_key 는 ${TEAM_KEYS.join("|")}: ${typeof r.team_key === "string" ? r.team_key.slice(0, 40) : typeof r.team_key}`);
      team = teams.find((t) => t.key === r.team_key);
      if (!team) throw new Error(`team_key 에 맞는 지점이 DB 에 없어요: ${r.team_key}`);
    }
    if (r.team_id !== undefined && r.team_id !== null) {
      const byId = teams.find((t) => t.id === r.team_id);
      if (!byId) throw new Error(`team_id 가 지점 목록에 없어요: ${typeof r.team_id === "number" ? r.team_id : typeof r.team_id}`);
      if (team && team.id !== byId.id) throw new Error("team_id 와 team_key 가 서로 다른 지점이에요");
      team = byId;
    }
    if (!team) {
      if (!D.AD_CHANNELS.includes(channel) || unit === D.ALL) throw new Error(`team_key 가 필요해요 (${TEAM_KEYS.join("|")}): ${channel} ${unit === D.ALL ? "'전체' 행" : `unit "${unit}"`}`);
      const k = MK.teamKeyOf(unit);
      team = teams.find((t) => t.key === (k ?? FALLBACK_KEY));
      if (!team) throw new Error(`지점을 못 정했어요: unit "${unit}"`);
      if (!k) unit = `[미분류] ${unit}`;
    }
    const status = r.status ?? defStatus; if (!D.STATUS.includes(status)) throw new Error(`status 는 ${D.STATUS.join("/")}: ${status}`);
    return { team_id: team.id, date, channel, unit: unit.slice(0, 120), metrics: cleanMetrics(r.metrics), status };
  };
  const out = input.rows.map((r, i) => { try { return rowOf(r); } catch (e) { throw new Error(`rows[${i}]: ${e.message}`); } }); // 어느 행인지 알려 준다
  // 같은 (지점, unit) 은 한 행으로 — 조용히 합치지 않고 전부 모아 알린다
  const seen = new Map();
  for (const r of out) { const k = `${r.team_id}:${r.unit}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  const dups = [...seen].filter(([, n]) => n > 1);
  if (dups.length) throw new Error(`같은 지점·unit 이 여러 번 나왔어요: ${dups.map(([k, n]) => `${k} ×${n}`).join(", ")} — 같은 이름이면 숫자를 더해 한 행으로 보내 주세요`);
  return out;
}

// saveRows 가 지울 옛 '전체' 행 계획 (순수). 한 배치에서 (채널, 날짜, 지점)마다:
//   · 이번에 '전체' 행을 쓴 지점 → 지우지 않는다 (같은 키라 이미 덮어썼고, 방금 쓴 행을 지우면 안 된다).
//   · '전체' 행 없이 쓸 수 있는(ok/partial) unit 행만 쓴 지점 → 그 지점·날짜·채널의 옛 '전체' 행을 상태와 상관없이 지운다.
//     (옛 "운영 캠페인 없음" 0 행이나 실패 표시가 남으면 합계 계산이 '전체' ok 행을 우선해 새 unit 행을 가린다.)
//   · 배치에 없는 지점, 실패 표시/실패 unit 행만 쓴 지점은 건드리지 않는다.
// → [{ channel, date, teamIds }]
export function staleAllPlan(rows) {
  const groups = new Map(); // `${channel}|${date}` → { channel, date, withAll: Set, withUnits: Set }
  for (const r of rows) {
    const k = `${r.channel}|${r.date}`;
    if (!groups.has(k)) groups.set(k, { channel: r.channel, date: r.date, withAll: new Set(), withUnits: new Set() });
    const g = groups.get(k);
    if (r.unit === D.ALL) g.withAll.add(r.team_id);
    else if (r.status === "ok" || r.status === "partial") g.withUnits.add(r.team_id);
  }
  return [...groups.values()].map((g) => ({ channel: g.channel, date: g.date, teamIds: [...g.withUnits].filter((id) => !g.withAll.has(id)) })).filter((p) => p.teamIds.length);
}
