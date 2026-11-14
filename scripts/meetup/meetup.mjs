// 사용: node scripts/meetup/meetup.mjs check | poll [--print] | jeonsan-mark <rsvp_id> <registered|duplicate|skipped|failed> [메모] | roster [YYYY-MM-DD]
// 밋업 운영 (docs/meetup/README.md). 스킬 pallo-meetup-sync 가 매시간 부른다.
//   check        토큰을 받아 계정 이름만 확인 → {"ok":true,"member":"…"}
//   poll         앞으로 21일 예정 이벤트 중 신청이 있는 것 + DB 에 참석 예정자가 남은 이벤트(지난 2일 포함)를 다시 읽어 meetup_events·meetup_rsvps 에 쌓고,
//                최근 3일 새 회원을 meetup_members 에 쌓는다. 새 신청·취소·전산 등록할 것(jeonsan_todo)을 JSON 한 줄로 낸다. --print 면 저장하지 않는다.
//   jeonsan-mark 스킬이 전산 캘린더 등록 결과를 적는다.
//   roster       그날(기본 오늘, 한국 날짜) 참석 예정자 지점·시간별.
// stdout 은 JSON 한 줄, 진행 로그는 stderr. 종료코드: 인자 오류 2, 실패·인증 실패 1, 정상 0. 115초에 강제 종료.
import { select, upsert, patch, insert, arg, run, MK } from "../mk/db.mjs";
import { M, AuthError, self, upcomingWithRsvps, eventsById, newMembers } from "./api.mjs";

const [cmd] = process.argv.slice(2), print = process.argv.includes("--print");
const out = (o, code = o.ok ? 0 : 1) => { console.log(JSON.stringify(o)); process.exitCode = code; };
const log = (...a) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
setTimeout(() => { console.error("115초 초과 — 강제 종료"); process.exit(1); }, 115e3).unref();
const now = () => new Date().toISOString();
const hours = (h) => new Date(Date.now() + h * 3600e3).toISOString();

async function teams() { return (await select("teams", "select=id,name", "sort,id")).map((t) => ({ id: t.id, key: MK.teamKeyOfTeamName(t.name) })); }

async function poll() {
  const tms = await teams(), t0 = now();
  log("예정 이벤트 읽는 중");
  const upcoming = await upcomingWithRsvps(hours(-1), hours(24 * 21), 2);
  // DB 에 참석 예정자가 남아 있는데 이번 목록에 없는 이벤트(신청이 다 취소됐거나 이미 지난 모임) → 번호로 다시 읽는다
  const known = await select("meetup_rsvps", `select=id,event_id,status,jeonsan_status&starts_at=gte.${hours(-48)}`, "id");
  const prev = Object.fromEntries(known.map((r) => [r.id, r]));
  const have = new Set(upcoming.map((e) => String(e.id)));
  const recheck = [...new Set(known.filter((r) => M.ACTIVE.includes(r.status)).map((r) => r.event_id))].filter((id) => !have.has(id));
  const again = recheck.length ? await eventsById(recheck) : [];
  const events = [...upcoming, ...again].map((n) => ({ node: n, row: M.eventRow(n, tms) }));
  const rows = events.flatMap(({ node, row }) => M.rsvpRows(row, node.rsvps?.edges?.map((e) => e.node)));
  const { fresh, cancelled, changed } = M.diffRsvps(prev, rows);
  log(`이벤트 ${events.length} · 신청 ${rows.length} · 새 ${fresh.length} · 취소 ${cancelled.length}`);

  const members = await newMembers(hours(-72));
  const knownMembers = new Set(members.length ? (await select("meetup_members", `select=member_id&member_id=in.(${members.map((m) => `"${m.member_id}"`).join(",")})`, "member_id")).map((m) => m.member_id) : []);
  const newOnes = members.filter((m) => !knownMembers.has(m.member_id));

  if (!print) {
    if (events.length) await upsert("meetup_events", events.map((e) => ({ ...e.row, seen_at: t0 })), "id");
    const cancelledIds = new Set(cancelled.map((r) => r.id));
    if (rows.length) await upsert("meetup_rsvps", rows.map((r) => (cancelledIds.has(r.id) ? { ...r, cancelled_at: t0 } : r)), "id");
    if (members.length) await upsert("meetup_members", members, "member_id");
  }
  // 전산 등록할 것: 이번에 읽은 행 + 지난번 jeonsan_status (DB 값)
  const withJ = rows.map((r) => ({ ...r, jeonsan_status: prev[r.id]?.jeonsan_status ?? null }));
  const todo = M.jeonsanTodo(withJ, tms, now()).map((r) => ({ id: r.id, jeonsan_code: r.jeonsan_code, date: r.date, time: r.time, member_name: r.member_name, title: M.jeonsanTitle(r), memo: M.jeonsanMemo(r) }));
  const brief = (r) => ({ name: r.member_name, branch: r.branch, ...M.kst(r.starts_at), status: r.status, first: r.is_first_event });
  const counts = { events: events.length, rsvps: rows.length, fresh: fresh.length, cancelled: cancelled.length, changed: changed.length, members: newOnes.length };
  if (!print) await insert("meetup_runs", [{ status: "ok", counts }]);
  out({ ok: true, saved: !print, counts, fresh: fresh.map(brief), cancelled: cancelled.map(brief), new_members: newOnes.map((m) => ({ name: m.name, city: m.city })), jeonsan_todo: todo });
}

async function jeonsanMark() {
  const id = arg(3, "rsvp_id"), st = arg(4, "결과");
  if (!["registered", "duplicate", "skipped", "failed"].includes(st)) { console.error("결과는 registered|duplicate|skipped|failed"); process.exit(2); }
  const note = process.argv.slice(5).filter((a) => a !== "--print").join(" ").slice(0, 300) || null;
  await patch("meetup_rsvps", `id=eq.${encodeURIComponent(id)}`, { jeonsan_status: st, jeonsan_note: note, jeonsan_at: now() });
  out({ ok: true, id, jeonsan_status: st });
}

async function roster() {
  const ymd = process.argv[3] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[3]) ? process.argv[3] : M.kst(now()).date;
  const rows = await select("meetup_rsvps", `select=event_id,branch,team_id,event_title,starts_at,member_name,status,is_first_event&starts_at=gte.${ymd}T00:00:00%2B09:00&starts_at=lt.${M.addDays(ymd, 1)}T00:00:00%2B09:00`, "starts_at,id");
  out({ ok: true, date: ymd, roster: M.rosterOf(rows, ymd) });
}

async function main() {
  try {
    if (cmd === "check") { const s = await self(); return out(s ? { ok: true, member: s.name } : { ok: false, error: "계정 정보를 못 읽었어요" }); }
    if (cmd === "poll") return await poll();
    if (cmd === "jeonsan-mark") return await jeonsanMark();
    if (cmd === "roster") return await roster();
    console.error("사용: node scripts/meetup/meetup.mjs check | poll [--print] | jeonsan-mark <rsvp_id> <registered|duplicate|skipped|failed> [메모] | roster [YYYY-MM-DD]");
    process.exit(2);
  } catch (e) {
    const auth = e instanceof AuthError;
    if (cmd === "poll" && !print) await insert("meetup_runs", [{ status: auth ? "auth_failed" : "failed", error: String(e.message).slice(0, 300) }]).catch(() => {});
    out({ ok: false, error: auth ? "auth_failed" : "failed", message: String(e.message).slice(0, 300) });
  }
}
run(main);
