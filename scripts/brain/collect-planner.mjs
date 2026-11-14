// 🧠 뇌 탭 분석 자료 모으기 ① 플래너 — 대표 계정이 쓴 글만 **읽기 전용**으로 읽어 맥미니 안(~/.local/share/pallo-brain/planner.json)에 둔다.
// 사용: node scripts/brain/collect-planner.mjs [--peek]     (--peek: 칸 이름과 건수만 보여 주고 저장하지 않는다)
// 읽는 곳: 주간 할 일(tasks) · 💡아이디어 창구(someday) · 월간 목표(month_goals) · 리포트(reports) · 회의록(meetings, 대표가 쓴 것)
// 다른 사람 글은 읽지 않는다. 결과 파일은 저장소·동기화 폴더 밖에 둔다 (생각이 담긴 글이라 밖으로 나가면 안 된다).
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { select, run } from "../mk/db.mjs";

const peek = process.argv.includes("--peek");
const OUT = process.env.BRAIN_DIR || `${homedir()}/.local/share/pallo-brain`;

await run(async () => {
  const admins = await select("profiles", "select=user_id,name,role&role=eq.admin", "user_id");
  if (!admins.length) throw new Error("대표(admin) 계정을 못 찾았어요");
  const want = process.env.BRAIN_USER;
  const boss = want ? admins.find((a) => a.user_id === want) : admins[0];
  if (!boss) throw new Error("BRAIN_USER 가 대표 계정이 아니에요");
  if (admins.length > 1 && !want) console.error(`대표 계정이 ${admins.length}개예요 (${admins.map((a) => a.name).join(", ")}) — 첫 번째(${boss.name})를 씁니다. 바꾸려면 BRAIN_USER=<user_id>`);
  const u = boss.user_id;
  const read = async (table, q, order) => { try { return await select(table, q, order); } catch (e) { console.error(`${table}: ${String(e.message).slice(0, 160)}`); return []; } };
  const src = {
    tasks: await read("tasks", `select=*&user_id=eq.${u}`, "day,id"),
    someday: await read("someday", `select=*&user_id=eq.${u}`, "created_at"),
    month_goals: await read("month_goals", `select=*&user_id=eq.${u}`, "month"),
    reports: await read("reports", `select=*&user_id=eq.${u}`, "day"),
    meetings: await read("meetings", "select=*&deleted_at=is.null", "held_on,id"),
  };
  if (peek) {
    for (const [k, rows] of Object.entries(src)) console.log(k, rows.length, rows[0] ? Object.keys(rows[0]).join(",") : "");
    return;
  }
  mkdirSync(OUT, { recursive: true, mode: 0o700 });
  writeFileSync(`${OUT}/planner.json`, JSON.stringify({ at: new Date().toISOString(), user_id: u, name: boss.name, ...src }), { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, name: boss.name, counts: Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v.length])) }));
});
