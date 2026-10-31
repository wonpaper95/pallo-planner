// 맥미니 자동 브라우저(Playwright) 수집 — 구글 검색광고·전산 문의의 순수 부분. 브라우저·네트워크·DB·파일을 건드리지 않는다(tests/mkd-browser.test.mjs). CLI 는 browser.mjs.
// 만든 행은 {team_key, unit, metrics, status?} — rows.mjs 의 toRowsPure 가 검증·저장 형태로 바꾼다. 지점은 항상 team_key 로 명시.
// 화면에서 읽는 건 숫자와 캠페인 이름·상태 글자뿐이다. 이름·전화번호는 읽지 않고, 알림 글은 4자리 이상 숫자·이메일을 가려 플래그로만 남긴다.
import { join } from "node:path";
import { sanitizeNote } from "./naver-rows.mjs";

// 읽다가 화면이 예상과 다를 때 던지는 오류 — 메시지가 그대로 note 가 되므로 고정 문구만 쓴다(페이지 글을 싣지 않는다)
export class ReadError extends Error {}

// ── 상수·주소 ──
export const BRANCHES = [ // 구미점은 전산이 없다
  { code: "DAEGUDSR", team_key: "dsr" },
  { code: "DAEGUJPCH", team_key: "jpcn" },
  { code: "ULSAN", team_key: "ulsan" },
];
export const GOOGLE_ACCOUNTS = [
  { name: "대구", ocid: "6771267051", teams: ["dsr", "jpcn"] },
  { name: "울산", ocid: "7116215996", teams: ["ulsan"] },
];
export const SSO_URL = "https://sso.pallo.co.kr/select";
export const jeonsanUrl = (code) => `https://branch.pallo.co.kr/${code}/admin/call`;
export const googleUrl = (ocid) => `https://ads.google.com/aw/campaigns?ocid=${ocid}`;
export const conversionsUrl = (ocid) => `https://ads.google.com/aw/conversions/all?ocid=${ocid}`;

// playwright 가 설치된 곳 후보: PLAYWRIGHT_DIR → 이 저장소의 mkc → 메인 저장소(pallo-planner)의 mkc (워크트리엔 node_modules 가 없다)
export const playwrightCandidates = (here, home, env = {}) => [
  ...(env.PLAYWRIGHT_DIR ? [join(env.PLAYWRIGHT_DIR, "playwright", "index.mjs")] : []),
  join(here, "..", "mkc", "node_modules", "playwright", "index.mjs"),
  join(home, "pallo-planner", "scripts", "mkc", "node_modules", "playwright", "index.mjs"),
];

// ── 로그인 판정 ──
// sso. 주소, 구글 로그인 주소, 비밀번호 칸, 제목의 '로그인' 중 하나면 로그인이 풀린 것
export function needsLogin({ url = "", title = "", hasPassword = false } = {}) {
  let host = ""; try { host = new URL(url).hostname; } catch { /* 주소를 못 읽으면 호스트 없음 */ }
  return /^sso\./.test(host) || host === "accounts.google.com" || !!hasPassword || /로그인|sign in/i.test(title ?? "");
}

// ── 날짜 (모두 한국 시간 기준) ──
const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? "")); return m ? [+m[1], +m[2], +m[3]] : null; };
export function validDate(s) {
  if (!ymd(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
export const kstDate = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
export function isYesterdayKst(D, now = new Date()) {
  const y = new Date(`${kstDate(now)}T00:00:00Z`); y.setUTCDate(y.getUTCDate() - 1);
  return D === y.toISOString().slice(0, 10);
}
// D 의 달이 이번 달(KST)보다 몇 달 앞인가 (미래 달이면 음수 — 호출한 쪽이 거른다)
export function monthsBack(D, now = new Date()) {
  const [dy, dm] = ymd(D), [ny, nm] = ymd(kstDate(now));
  return (ny - dy) * 12 + (nm - dm);
}

// 화면의 기간 글("2026년 10월 29일", "어제 2026년 10월 29일", "2026년 10월 1일 - 2026년 10월 29일", "2026. 10. 29.") → {start, end} | null
// 구글은 같은 해의 맞춤 기간을 줄여 보여 준다: "2026년 10월 23일 ~ 29일", "2026년 10월 28일 ~ 11월 2일" (끝의 해·달 생략 → 시작의 해·달, 해를 넘어가면 다음 해)
const pad = (n) => String(n).padStart(2, "0");
export function parseRange(text) {
  const t = String(text ?? "");
  const ds = [...t.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)];
  const dots = ds.length ? [] : [...t.matchAll(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./g)];
  const all = (ds.length ? ds : dots).map((m) => `${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  if (!all.length) return null;
  if (ds.length === 1) { // 시작 뒤에 "~ 29일" · "~ 11월 2일" 이 붙은 줄임 표기
    const [, y, mo] = ds[0], rest = t.slice(ds[0].index + ds[0][0].length), m = /^\s*[~\-–—]\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/.exec(rest);
    if (m) {
      const em = m[1] ? +m[1] : +mo, ey = em < +mo ? +y + 1 : +y;
      return { start: all[0], end: `${ey}-${pad(em)}-${pad(m[2])}` };
    }
  }
  return { start: all[0], end: all[all.length - 1] };
}
export const rangeText = (D) => { const [y, m, d] = ymd(D); return `${y}년 ${m}월 ${d}일`; };
export const rangeIs = (text, from, to) => { const r = parseRange(text); return !!r && r.start === from && r.end === to; }; // 화면 기간 글이 from~to 와 같은가
export const rangeIsDay = (text, D) => rangeIs(text, D, D);
// google-range 의 날짜 검사: 문제가 있으면 짧은 이유, 없으면 "". 끝날은 어제까지(오늘·이후는 하루가 끝나지 않았다).
export function checkRange(from, to, now = new Date()) {
  if (!validDate(from) || !validDate(to)) return "날짜는 YYYY-MM-DD 형식이어야 해요";
  if (from > to) return "시작일이 끝일보다 늦어요";
  if (to >= kstDate(now)) return "오늘·이후 날짜는 읽지 않아요 (끝일은 어제까지)";
  return "";
}

// ── 전산: 데이터 보드 스니펫 결과 합격 검사 ──
// 규칙은 docs/meta-marketing/jeonsan-leads.md "호출한 쪽의 합격 검사". reason 은 note 로 저장되는 짧은 고정 문구(숫자 없음).
// 전산 데이터 보드는 달을 한국 시각이 아니라 세계 시각(UTC)으로 나누는 것으로 보인다 — 2026-11-01 00시대 문의가 10월 보드 맨 위에 있었다.
// 그래서 어느 달 보드든 맨 위(newest)가 '다음 달 1일'일 수 있고(한국 0~9시 문의), D 가 1일이면 그날 이른 아침 문의는 전달 보드에만 있다.
const firstOfNext = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; };
const prevYm = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
export const isFirstOfMonth = (D) => /-01$/.test(String(D));
export const prevMonthOf = (D) => prevYm(String(D).slice(0, 7));
// boardMonth = 지금 읽은 보드의 달(기본 D 의 달). D 가 1일일 때 전달 보드도 읽으면 prevMonthOf(D) 로 검사한다.
export function acceptJeonsan(r, D, boardMonth = String(D).slice(0, 7)) {
  const no = (reason) => ({ ok: false, reason });
  if (!r || typeof r !== "object") return no("결과 없음");
  if (r.error) return no(/^열 없음/.test(r.error) ? "열 없음" : /시간 형식/.test(r.error) ? "시간 형식 못 읽음" : "전산 오류");
  if (r.filterSet !== true) return no("필터 못 맞춤");
  if (!(r.scanned > 0)) return no("읽은 행 없음");
  if (r.unparsed !== 0) return no("시간 못 읽은 행");
  if (r.stoppedBy === "maxPages") return no("쪽 수 상한");
  if (r.stoppedBy !== "cutoff" && r.stoppedBy !== "lastPage") return no("표 끝을 못 찾음");
  if (r.stoppedBy === "lastPage" && r.pages === 1 && r.lastPageRows >= 20) return no("표 끝을 못 찾음"); // 꽉 찬 쪽인데 다음 쪽 버튼을 못 찾은 것
  if (typeof r.newest !== "string" || (r.newest.slice(0, 7) !== boardMonth && r.newest !== firstOfNext(boardMonth))) return no("달이 안 맞음"); // 표가 그 달 보드의 맨 앞(또는 다음 달 1일)에서 시작해야 한다
  if (r.stoppedBy === "lastPage" && !(typeof r.oldest === "string" && r.oldest <= D)) return no("D 까지 못 내려감");
  const sum = r.bySource && typeof r.bySource === "object" ? Object.values(r.bySource).reduce((a, v) => a + (Number.isFinite(v?.inquiries) ? v.inquiries : 0), 0) : NaN;
  if (!Number.isFinite(r.total) || sum !== r.total) return no("합계 불일치");
  return { ok: true, reason: "" };
}

// 합격한 결과 → 행. 코멘트·광고명·유입경로 열이 없으면 소스 구분이 뭉개지니 '전체' 한 행만 partial.
// D 가 1일일 때 D 의 달 보드 결과 a + 전달 보드 결과 b(그날 이른 아침 문의) → 합친 결과 (같은 행은 한 보드에만 있다)
export function mergeJeonsan(a, b) {
  const bySource = {};
  for (const src of [a.bySource ?? {}, b.bySource ?? {}]) for (const [k, v] of Object.entries(src)) { const o = (bySource[k] ??= { inquiries: 0, enrolls: 0 }); o.inquiries += Number.isFinite(v?.inquiries) ? v.inquiries : 0; o.enrolls += Number.isFinite(v?.enrolls) ? v.enrolls : 0; }
  return { ...a, total: a.total + b.total, bySource, pages: (a.pages ?? 0) + (b.pages ?? 0), scanned: (a.scanned ?? 0) + (b.scanned ?? 0), missingCols: [...new Set([...(a.missingCols ?? []), ...(b.missingCols ?? [])])] };
}
export function jeonsanRows(team_key, r) {
  const missing = (r.missingCols ?? []).filter((c) => ["코멘트", "광고명", "유입경로"].includes(c));
  if (missing.length) return [{ team_key, unit: "전체", metrics: { inquiries: r.total, note: `열 없음: ${missing.join(", ")}` }, status: "partial" }];
  const by = new Map();
  for (const [key, v] of Object.entries(r.bySource ?? {})) { const unit = key === "전체" ? "기타" : key; by.set(unit, (by.get(unit) ?? 0) + v.inquiries); } // '전체' 는 합계 행 이름이라 쓰지 않는다
  return [{ team_key, unit: "전체", metrics: { inquiries: r.total } }, ...[...by].map(([unit, n]) => ({ team_key, unit, metrics: { inquiries: n } }))];
}
// 읽지 못한 지점·계정 → '전체' 실패 행 (note 는 4자리 이상 숫자 #, 120자까지)
export const failRow = (team_key, note, status = "failed") => ({ team_key, unit: "전체", metrics: { note: sanitizeNote(note) }, status });

// 한 줄 출력 JSON. 지점별 {status, total} | {status, note}
export function jeonsanOutput(date, results) {
  const branches = {};
  for (const r of results) branches[r.team_key] = r.status === "ok" || r.status === "partial" ? { status: r.status, total: r.total } : { status: r.status, note: r.note };
  return { ok: results.every((r) => r.status === "ok" || r.status === "partial"), date, branches };
}

// ── 구글 ──
// 대구 계정: 일본어·중국어·일중·일어·중어 가 이름에 있으면 jpcn, 나머지 dsr. 울산 계정은 전부 ulsan.
export const googleTeamOf = (accountName, name) => (accountName === "울산" ? "ulsan" : /일본어|중국어|일중|일어|중어/.test(name ?? "") ? "jpcn" : "dsr");

// 상태 칸: "일시중지됨 예산에 의한 제약 입찰 전략에 의해 제한됨" → "일시중지됨". 제한 사유는 쓰지 않는다.
export function parseStatus(s) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim(), cut = t.search(/예산에 의한|입찰 전략에 의해/);
  return (cut >= 0 ? t.slice(0, cut) : t).trim();
}

// 숫자 칸: 쉼표·공백 떼기, 대시는 null(값 없음), 나머지 글자는 던진다(조용히 0 으로 만들지 않는다)
const DASH = /^[-–—]+$/;
function plain(t) {
  if (t === "" || DASH.test(t)) return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new ReadError("숫자 못 읽음");
  return Number(t);
}
export const num = (text) => plain(String(text ?? "").replace(/[\s,]/g, ""));
export const parseMoney = (text) => plain(String(text ?? "").replace(/[\s,₩]/g, "").replace(/원$/, ""));

// 머리글·라벨 칸 끝의 아이콘 글자(" help_outline")와 공백 정리
const label = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/(\s*help_outline)+\s*$/, "").trim();
const COLS = { name: "캠페인", status: "상태", impressions: "노출수", clicks: "클릭수", spend: "비용", conversions: "전환수" };

// 구글 표의 아이콘 칸(펼치기·더보기 글자)은 라벨이 아니다
const ICON = /^(expand_more|expand_less|chevron_right|more_vert)$/;
// 표 → {campaigns, total}. headers = [role=columnheader 글], rows = [role=row 마다 칸 글 배열].
// 열 위치는 머리글에서 찾는다. 라벨은 빈 칸·아이콘 칸을 건너뛴 첫 글 칸. 칸이 머리글만큼 이상이면 오른쪽 끝을 맞추고(총계 줄은 앞 아이콘 칸이 하나 더 있다), 적으면 라벨 위치로 맞춘다.
// 캠페인 행 = 첫 글 칸이 " settings" 로 끝나거나(숫자를 못 읽으면 던진다), 숫자 칸이 모두 읽히는 행. 총계·"작성 중인 초안" 행은 캠페인이 아니다.
export function readGrid(headers, rows) {
  const H = (headers ?? []).map(label), idx = {};
  const missing = Object.entries(COLS).filter(([k, h]) => (idx[k] = H.indexOf(h)) < 0).map(([, h]) => h);
  if (missing.length) throw new ReadError(`열 없음: ${missing.join(", ")}`);
  const campaigns = [], totals = [];
  for (const cells of rows ?? []) {
    const li = cells.findIndex((c) => { const t = label(c); return t !== "" && !ICON.test(t); }); if (li < 0) continue;
    const text = label(cells[li]), off = cells.length >= H.length ? cells.length - H.length : li - idx.name, at = (k) => cells[idx[k] + off];
    if (text.startsWith("총계")) { totals.push({ text, at }); continue; }
    if (text.startsWith("작성 중인 초안")) continue;
    const raw = ["status", "impressions", "clicks", "spend", "conversions"].map(at);
    if (raw.some((v) => v === undefined)) continue; // 칸이 모자란 줄(머리글 줄 등)
    const isCampaign = / settings$/.test(text);
    try {
      campaigns.push({ name: text.replace(/ settings$/, ""), status: parseStatus(raw[0]), impressions: num(raw[1]), clicks: num(raw[2]), spend: parseMoney(raw[3]), conversions: num(raw[4]) });
    } catch (e) { if (isCampaign) throw e; /* 이름만 있는 줄은 숫자가 안 읽히면 캠페인이 아니다 */ }
  }
  const pick = totals.find((t) => t.text.includes("현재 보기의 삭제되지 않은 모든 캠페인")) ?? totals.find((t) => t.text.includes("모든 캠페인"));
  let total = null;
  if (pick) {
    try { total = { impressions: num(pick.at("impressions")), clicks: num(pick.at("clicks")), spend: parseMoney(pick.at("spend")), conversions: num(pick.at("conversions")) }; }
    catch { throw new ReadError("합계 못 읽음"); }
  }
  return { campaigns, total };
}

// 캠페인 노출·클릭·비용 합 = '현재 보기의 모든 캠페인' 총계. 비용은 원 단위 반올림 오차(캠페인 수의 절반 원, 최소 1원)까지만. 대시(null)는 0.
export function checkTotals(campaigns, total) {
  if (!total) return { ok: false, reason: "합계 행 없음" };
  const sum = (k) => campaigns.reduce((a, c) => a + (c[k] ?? 0), 0), tol = Math.max(1, campaigns.length / 2);
  const same = sum("impressions") === (total.impressions ?? 0) && sum("clicks") === (total.clicks ?? 0) && Math.abs(sum("spend") - (total.spend ?? 0)) <= tol;
  return same ? { ok: true, reason: "" } : { ok: false, reason: "합계 불일치" };
}

// 알림 배너 글 → 플래그 (계정 전체 것). 빨강: 비승인·정책 제한·결제 거절/실패·계정 정지 → "[계정] 글". 안내: '[안내] [계정] …' 이 맨 앞(mkd-core 가 [안내] 로 시작하면 회색).
// 무시: 광고 크레딧·추천·최적화 점수, 그 밖의 알림은 기록하지 않는다. 4자리 이상 숫자·이메일은 가리고 120자 안, 같은 글은 한 번.
const RED = /비승인|정책.*제한|결제.*(거절|실패)|계정.*정지/, IGNORE = /광고 크레딧|추천|최적화 점수/;
const INFO = [[/계정 보안 강화/, "계정 보안 강화 작업 요청"], [/예비 결제 수단/, "예비 결제 수단 없음"], [/게재 중인 광고가 없/, "게재 중인 광고 없음"], [/검토 중/, "검토 중 광고"]];
const mask = (s) => s.replace(/\S+@\S+/g, "#").replace(/\d{4,}/g, "#");
export function noticeFlags(texts) {
  const out = [];
  for (const raw of texts ?? []) {
    const t = String(raw ?? "").replace(/\s+/g, " ").trim(); if (!t) continue;
    let f = null;
    if (RED.test(t)) f = `[계정] ${mask(t)}`.slice(0, 120);
    else if (IGNORE.test(t)) continue;
    else { const hit = INFO.find(([re]) => re.test(t)); if (hit) f = `[안내] [계정] ${hit[1]}`; }
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

// ── 구글 전환 화면 (/aw/conversions/all) ──
// 표 → 전환 액션 name 의 "추적 상태" 글자(예: "조치 필요", "운영중"). headers = [role=columnheader 글], rows = [role=row 마다 칸 글 배열].
// 행은 머리글보다 앞에 빈 칸이 하나 더 있어 readGrid 처럼 오른쪽 끝을 맞춘다(칸이 모자라면 이름 칸 위치로). 못 읽으면 null(던지지 않는다 — 전환 상태는 보조 정보).
// 같은 이름이 둘이면 삭제되지 않은 쪽을 쓴다. 이름은 정확히 같은 줄만(비슷한 이름은 다른 전환).
export function conversionStatus(headers, rows, name = "팔로 신청 클릭") {
  const H = (headers ?? []).map(label), ni = H.indexOf("전환 액션"), si = H.indexOf("추적 상태");
  if (ni < 0 || si < 0) return null;
  const found = [];
  for (const cells of rows ?? []) {
    const li = cells.findIndex((c) => { const t = label(c); return t !== "" && !ICON.test(t); });
    if (li < 0 || label(cells[li]) !== name) continue;
    const off = cells.length >= H.length ? cells.length - H.length : li - ni, st = label(cells[si + off] ?? "");
    if (st) found.push(st);
  }
  return found.find((st) => st !== "삭제됨") ?? found[0] ?? null;
}

// ── google-range: 맞춤 기간 캠페인 표 + 알림 + 전환 상태 → 출력 ──
const sumOf = (cs, k) => cs.reduce((a, c) => a + (c[k] ?? 0), 0);
// 읽은 계정 하나 → {account, campaigns:[{account,team,campaign,status,impressions,clicks,spend,conversions}], summary:{status:"ok",campaigns,impressions,clicks,spend,conversions,conversionStatus,notices}}
// 값이 대시였던 칸은 null 그대로(합계에는 0 으로 더한다). notices 는 noticeFlags 로 가린 플래그.
export function googleRangeAccount(accountName, campaigns, notices = [], conversion = null) {
  const list = campaigns.map((c) => ({ account: accountName, team: googleTeamOf(accountName, c.name), campaign: c.name, status: c.status ?? "", impressions: c.impressions ?? null, clicks: c.clicks ?? null, spend: c.spend ?? null, conversions: c.conversions ?? null }));
  const round = (n) => Math.round(n * 100) / 100;
  return {
    account: accountName, campaigns: list,
    summary: { status: "ok", campaigns: list.length, impressions: sumOf(list, "impressions"), clicks: sumOf(list, "clicks"), spend: round(sumOf(list, "spend")), conversions: round(sumOf(list, "conversions")), conversionStatus: conversion ?? null, notices: [...notices] },
  };
}
export const googleRangeFail = (accountName, note, status = "failed") => ({ account: accountName, campaigns: [], summary: { status, note: sanitizeNote(note) } });
export function googleRangeOutput(from, to, results) {
  return { ok: results.every((r) => r.summary.status === "ok"), from, to, accounts: Object.fromEntries(results.map((r) => [r.account, r.summary])), campaigns: results.flatMap((r) => r.campaigns) };
}

// 캠페인 → 구글 행. 같은 팀·같은 이름은 한 행으로(숫자 합, 상태는 운영 중인 쪽, 값이 전부 대시면 "--"). 계정 플래그는 표에서 맨 앞 캠페인이 든 행에만.
const STOPPED = /일시중지|종료|삭제/;
export function googleRows(accountName, campaigns, flags = []) {
  const groups = new Map();
  for (const c of campaigns) {
    const name = String(c.name ?? "").trim(), team_key = googleTeamOf(accountName, name), k = `${team_key}\0${name}`;
    if (!groups.has(k)) groups.set(k, { team_key, unit: name, members: [] });
    groups.get(k).members.push(c);
  }
  const total = (ms, key) => (ms.every((m) => m[key] == null) ? "--" : ms.reduce((a, m) => a + (m[key] ?? 0), 0));
  return [...groups.values()].map(({ team_key, unit, members }, i) => ({
    team_key, unit,
    metrics: {
      impressions: total(members, "impressions"), clicks: total(members, "clicks"), spend: total(members, "spend"), conversions: total(members, "conversions"),
      status: (members.find((m) => !STOPPED.test(m.status ?? "")) ?? members[0]).status ?? "", flags: i === 0 ? [...flags] : [],
    },
  }));
}
// 읽지 못한 계정 → 그 계정의 지점마다 '전체' 실패 행
export function googleFailRows(accountName, note, status = "failed") {
  const acct = GOOGLE_ACCOUNTS.find((a) => a.name === accountName);
  if (!acct) throw new Error(`모르는 계정: ${accountName}`);
  return acct.teams.map((team_key) => failRow(team_key, note, status));
}
export function googleOutput(date, results) {
  const accounts = {};
  for (const r of results) accounts[r.account] = r.status === "ok" ? { status: "ok", campaigns: r.campaigns } : { status: r.status, note: r.note };
  return { ok: results.every((r) => r.status === "ok"), date, accounts };
}

// 한 배치로 검증했는데 걸리면, 그룹(계정·지점)마다 따로 검증해 걸린 그룹만 실패 행으로 바꾼다. 실패 행도 못 통과하면 던진다.
// groups = [{name, rows, fail(note) → rows}], validate(rows) 는 나쁜 입력에 던진다 → {rows, bad:[name]}
export function partitionValid(groups, validate) {
  const all = groups.flatMap((g) => g.rows);
  try { validate(all); return { rows: all, bad: [] }; } catch { /* 어느 그룹이 문제인지 따로 본다 */ }
  const rows = [], bad = [];
  for (const g of groups) {
    try { validate(g.rows); rows.push(...g.rows); }
    catch {
      const fb = g.fail("행 검증 실패");
      try { validate(fb); } catch (e) { throw new Error(`${g.name}: 실패 행도 검증을 통과하지 못했어요 (${e.message})`); }
      rows.push(...fb); bad.push(g.name);
    }
  }
  validate(rows);
  return { rows, bad };
}
