import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const M = createRequire(import.meta.url)("../meetup-core.js");

const TEAMS = [{ id: 1, name: "구미점", key: "gumi" }, { id: 2, name: "대구영어점", key: "dsr" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "대구일중점", key: "jpcn" }];
const NOW = "2026-11-14T03:00:00Z"; // 한국 11/14 12:00

test("branchOf·teamKeyOfBranch·jeonsanCodeOf: 제목 [지점] → 플래너 지점 → 전산 코드", () => {
  assert.deepEqual(["[Daegu Dongseongno] Korean–English Language Exchange", "[Daegu Dongseongno JP] Korean–Japanese Language Exchange", " [Ulsan] x", "[Gumi] x", "[Daegu Dalseo] x", "제목만", null].map(M.branchOf),
    ["Daegu Dongseongno", "Daegu Dongseongno JP", "Ulsan", "Gumi", "Daegu Dalseo", null, null]);
  assert.deepEqual(["Daegu Dongseongno", "Daegu Dongseongno JP", "Ulsan", "Gumi", "Daegu Dalseo", null].map(M.teamKeyOfBranch), ["dsr", "jpcn", "ulsan", "gumi", null, null]);
  assert.deepEqual(["dsr", "jpcn", "ulsan", "gumi", null].map(M.jeonsanCodeOf), ["DAEGUDSR", "DAEGUJPCH", "ULSAN", null, null]);
});

test("kst·weekStart: 한국 날짜·시간, 월요일 시작", () => {
  assert.deepEqual(M.kst("2026-11-16T20:00:00+09:00"), { date: "2026-11-16", time: "20:00", dow: 1 });
  assert.deepEqual(M.kst("2026-11-15T16:30:00Z"), { date: "2026-11-16", time: "01:30", dow: 1 });
  assert.equal(M.kst("엉망"), null);
  assert.equal(M.weekStart("2026-11-16"), "2026-11-16");
  assert.equal(M.weekStart("2026-11-22"), "2026-11-16");
  assert.equal(M.weekStart("2026-11-15"), "2026-11-09");
});

const EV = { id: 317395221, title: "[Daegu Dalseo] Korean–English Language Exchange", dateTime: "2026-11-16T20:00:00+09:00", eventUrl: "https://www.meetup.com/g/events/317395221/", venue: { name: "PALLO" } };
const EV_DSR = { id: "5", title: "[Daegu Dongseongno] Korean–English Language Exchange", dateTime: "2026-11-17T11:00:00+09:00", eventUrl: null };

test("eventRow·rsvpRows: 지점 없는 이벤트는 team_id null, 주최자 신청은 뺀다", () => {
  const ev = M.eventRow(EV, TEAMS);
  assert.deepEqual(ev, { id: "317395221", title: EV.title, branch: "Daegu Dalseo", team_id: null, starts_at: EV.dateTime, event_url: EV.eventUrl, venue: "PALLO" });
  assert.equal(M.eventRow(EV_DSR, TEAMS).team_id, 2);
  const rows = M.rsvpRows(M.eventRow(EV_DSR, TEAMS), [
    { id: "1!chp", status: "YES", isHost: true, member: { id: 9, name: "PALLO Language Exchange" } },
    { id: "2!chp", status: "YES", isHost: false, isFirstEvent: true, guestsCount: 0, updated: "2026-11-13T01:00:00Z", member: { id: 77, name: "Holly Phillips", city: "Daegu" } },
    null, { id: "3", status: "YES", isHost: false },
  ]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], { id: "2!chp", event_id: "5", team_id: 2, branch: "Daegu Dongseongno", event_title: EV_DSR.title, starts_at: EV_DSR.dateTime,
    member_id: "77", member_name: "Holly Phillips", member_city: "Daegu", status: "YES", is_first_event: true, guests: 0, rsvp_updated: "2026-11-13T01:00:00Z" });
});

test("diffRsvps: 새 신청(참석·대기만), 취소, 그 밖 상태 변화", () => {
  const prev = { a: { status: "YES" }, b: { status: "WAITLIST" }, c: { status: "YES" }, d: { status: "NO" } };
  const rows = [{ id: "a", status: "YES" }, { id: "b", status: "NO" }, { id: "c", status: "ATTENDED" }, { id: "d", status: "YES" }, { id: "n1", status: "YES" }, { id: "n2", status: "WAITLIST" }, { id: "n3", status: "NO" }];
  const d = M.diffRsvps(prev, rows);
  assert.deepEqual(d.fresh.map((r) => r.id), ["n1", "n2"]);
  assert.deepEqual(d.cancelled.map((r) => r.id), ["b"]);
  assert.deepEqual(d.changed.map((r) => [r.id, r.prev_status, r.status]), [["c", "YES", "ATTENDED"], ["d", "NO", "YES"]]);
});

test("jeonsanTodo: 전산 3지점 · 참석/대기 · 미처리 · 아직 안 지난 모임만, 시간순", () => {
  const base = { member_name: "A", branch: "Daegu Dongseongno", event_title: "t", event_id: "5" };
  const rows = [
    { ...base, id: "late", team_id: 2, status: "YES", starts_at: "2026-11-18T11:00:00+09:00" },
    { ...base, id: "early", team_id: 3, status: "WAITLIST", starts_at: "2026-11-16T20:00:00+09:00" },
    { ...base, id: "gumi", team_id: 1, status: "YES", starts_at: "2026-11-16T20:00:00+09:00" },
    { ...base, id: "other", team_id: null, status: "YES", starts_at: "2026-11-16T20:00:00+09:00" },
    { ...base, id: "done", team_id: 2, status: "YES", jeonsan_status: "registered", starts_at: "2026-11-16T20:00:00+09:00" },
    { ...base, id: "no", team_id: 2, status: "NO", starts_at: "2026-11-16T20:00:00+09:00" },
    { ...base, id: "past", team_id: 2, status: "YES", starts_at: "2026-11-14T11:00:00+09:00" },
  ];
  const todo = M.jeonsanTodo(rows, TEAMS, NOW);
  assert.deepEqual(todo.map((r) => [r.id, r.jeonsan_code, r.date, r.time]), [["early", "ULSAN", "2026-11-16", "20:00"], ["late", "DAEGUDSR", "2026-11-18", "11:00"]]);
});

test("jeonsanTitle·jeonsanMemo: 대기 표시, 첫 참석·이벤트 주소", () => {
  const r = { id: "2!chp", event_id: "5", member_name: "Holly Phillips", member_city: "Daegu", is_first_event: true, branch: "Ulsan", event_title: "[Ulsan] X", status: "WAITLIST" };
  assert.equal(M.jeonsanTitle(r), "밋업 / Holly Phillips / Ulsan 언어교환 참석(대기)");
  assert.equal(M.jeonsanTitle({ ...r, status: "YES" }), "밋업 / Holly Phillips / Ulsan 언어교환 참석");
  const memo = M.jeonsanMemo(r);
  assert.match(memo, /^\[밋업 자동등록\]/);
  assert.match(memo, /Holly Phillips \(Daegu\) · 첫 참석/);
  assert.match(memo, /events\/5\//);
});

test("rosterOf: 그날 참석·대기만 이벤트별로 묶고 시간순", () => {
  const rows = [
    { id: "1", event_id: "e2", branch: "Ulsan", team_id: 3, event_title: "u", starts_at: "2026-11-16T20:00:00+09:00", member_name: "B", status: "YES", is_first_event: false },
    { id: "2", event_id: "e1", branch: "Gumi", team_id: 1, event_title: "g", starts_at: "2026-11-16T11:00:00+09:00", member_name: "A", status: "WAITLIST", is_first_event: true },
    { id: "3", event_id: "e2", branch: "Ulsan", team_id: 3, event_title: "u", starts_at: "2026-11-16T20:00:00+09:00", member_name: "C", status: "NO" },
    { id: "4", event_id: "e3", branch: "Ulsan", team_id: 3, event_title: "u", starts_at: "2026-11-17T20:00:00+09:00", member_name: "D", status: "YES" },
  ];
  assert.deepEqual(M.rosterOf(rows, "2026-11-16"), [
    { branch: "Gumi", team_id: 1, time: "11:00", event_id: "e1", event_title: "g", people: [{ name: "A", status: "WAITLIST", first: true }] },
    { branch: "Ulsan", team_id: 3, time: "20:00", event_id: "e2", event_title: "u", people: [{ name: "B", status: "YES", first: false }] },
  ]);
});

test("weeklyStats: 모임 날짜 기준 주·지점별 신청·왔음·안 옴·취소", () => {
  const rows = [
    { branch: "Ulsan", starts_at: "2026-11-16T20:00:00+09:00", status: "YES" },
    { branch: "Ulsan", starts_at: "2026-11-17T20:00:00+09:00", status: "NO" },
    { branch: "Ulsan", starts_at: "2026-11-10T20:00:00+09:00", status: "ATTENDED" },
    { branch: "Ulsan", starts_at: "2026-11-11T20:00:00+09:00", status: "NO_SHOW" },
    { branch: "Gumi", starts_at: "2026-11-12T11:00:00+09:00", status: "YES" },
    { branch: "Gumi", starts_at: "2026-10-01T11:00:00+09:00", status: "YES" },
  ];
  assert.deepEqual(M.weeklyStats(rows, 2, "2026-11-16"), [
    { week: "2026-11-16", branch: "Ulsan", rsvps: 1, attended: 0, noShow: 0, cancelled: 1 },
    { week: "2026-11-09", branch: "Ulsan", rsvps: 2, attended: 1, noShow: 1, cancelled: 0 },
    { week: "2026-11-09", branch: "Gumi", rsvps: 1, attended: 0, noShow: 0, cancelled: 0 },
  ]);
});

test("jwtParts: 공식 문서 클레임, 120초", () => {
  assert.deepEqual(M.jwtParts({ clientKey: "ck", memberId: 123, signingKeyId: "kid1" }, 1000), {
    header: { kid: "kid1", typ: "JWT", alg: "RS256" }, claims: { sub: "123", iss: "ck", aud: "api.meetup.com", exp: 1120 } });
});
