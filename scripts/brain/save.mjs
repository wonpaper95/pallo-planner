// 🧠 뇌 탭 분석 저장 — 정의(brain.json: 주제·낱말·내용·연관)와 생각 조각(corpus.json)으로 온도·근거를 계산해 플래너 DB(brain_nodes·brain_links·brain_runs)에 넣는다.
// 사용: node scripts/brain/save.mjs [--dry] [--def 경로]
//   --dry : DB 에 닿지 않고 계산 결과만 보여 준다 (뜨거운 생각, 낱말에 안 걸린 최근 조각)
// 지키는 것: 대표가 화면에서 고친 점(edited)은 이름·내용·상태·자리를 덮어쓰지 않고, 지운 점(hidden)은 되살리지 않고, 직접 넣은 점·선(origin=me)은 건드리지 않는다(온도만 매긴다).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
const C = createRequire(import.meta.url)("../../brain-core.js");

const DIR = process.env.BRAIN_DIR || `${homedir()}/.local/share/pallo-brain`;
const dry = process.argv.includes("--dry"), di = process.argv.indexOf("--def");
const def = JSON.parse(readFileSync(di > 0 ? process.argv[di + 1] : `${DIR}/brain.json`, "utf8"));
const corpus = JSON.parse(readFileSync(`${DIR}/corpus.json`, "utf8"));
const B = C.build(def, corpus);
if (B.errors.length) { console.error("정의에 문제가 있어요:\n" + B.errors.join("\n")); process.exit(2); }
if (dry) {
  const top = (f, k = 12) => [...B.rows].filter((r) => r.depth >= 2).sort((a, b) => f(b) - f(a)).slice(0, k).map((r) => `${String(f(r)).padStart(3)} ${r.title} [${r.state}] n=${r.stats.n} n30=${r.stats.n30}`);
  console.log(`조각 ${B.coverage.items}개 중 ${B.coverage.matched}개가 주제에 걸림 (${Math.round((B.coverage.matched / B.coverage.items) * 100)}%) · 점 ${B.rows.length}개 · 선 ${B.links.length}개`);
  console.log("\n[큰 주제]\n" + B.rows.filter((r) => r.depth === 1).sort((a, b) => b.heat - a.heat).map((r) => `${String(r.heat).padStart(3)} 고민${String(r.worry).padStart(3)} ${r.title} n=${r.stats.n}`).join("\n"));
  console.log("\n[🔥 온도]\n" + top((r) => r.heat, 25).join("\n"));
  console.log("\n[😟 고민]\n" + top((r) => r.worry).join("\n"));
  console.log("\n[한 번도 안 걸린 주제]\n" + (B.rows.filter((r) => !r.stats.n).map((r) => r.key).join(", ") || "없음"));
  if (process.argv.includes("--miss")) console.log("\n[최근 45일, 어느 주제에도 안 걸린 조각]\n" + B.coverage.recentUnmatched.map((x) => `${x.d} ${x.w} ${x.t}`).join("\n"));
  else console.log(`\n최근 45일 조각 중 안 걸린 것 ${B.coverage.recentUnmatched.length}개 (--miss 로 보기)`);
  process.exit(0);
}

const { select, insert, patch, del, upsert, run } = await import("../mk/db.mjs");
await run(async () => {
  const u = JSON.parse(readFileSync(`${DIR}/planner.json`, "utf8")).user_id; if (!/^[0-9a-f-]{36}$/.test(u ?? "")) throw new Error("planner.json 에 대표 계정이 없어요 — collect-planner.mjs 를 먼저");
  let have;
  try { have = await select("brain_nodes", `select=id,parent_id,key,title,state,heat,worry,origin,edited,hidden&user_id=eq.${u}`, "created_at"); }
  catch (e) { throw new Error(/PGRST205|brain_nodes/.test(e.message) ? "DB 에 뇌 표가 아직 없어요 — supabase/migrations/20261114200000_brain.sql 을 먼저 적용해야 해요" : e.message); }
  const before = have.map((r) => ({ ...r }));
  let root = have.find((r) => !r.parent_id);
  if (!root) { [root] = await insert("brain_nodes", [{ user_id: u, key: "root", parent_id: null, title: def.title || "나", origin: "ai", sort: 0 }]); have.push(root); }
  else if (root.key !== "root") await patch("brain_nodes", `id=eq.${root.id}`, { key: "root" });
  const idOf = new Map([["root", root.id]]), ex = new Map(); for (const r of have) if (r.key && r.id !== root.id) { ex.set(r.key, r); idOf.set(r.key, r.id); }
  const out = { inserted: 0, updated: 0, kept_edited: 0, skipped_hidden: 0, deleted: 0, links: 0, me: 0 };
  const rows = [...B.rows].sort((a, b) => a.depth - b.depth), common = (r) => ({ heat: r.heat, worry: r.worry, stats: r.stats, src: r.src });
  for (const d of [...new Set(rows.map((r) => r.depth))]) {
    const level = rows.filter((r) => r.depth === d), add = [], todo = [];
    for (const r of level) {
      const pid = idOf.get(r.parent), e = ex.get(r.key); if (!pid) continue; // 위 가지가 없으면(숨겨져 지워진 경우 등) 건너뜀
      if (!e) add.push({ user_id: u, key: r.key, parent_id: pid, title: r.title, note: r.note, state: r.state, ...common(r), origin: "ai", sort: r.sort });
      else if (e.hidden) out.skipped_hidden++;
      else { todo.push([e.id, { ...common(r), ...(e.edited ? {} : { title: r.title, note: r.note, state: r.state, parent_id: pid }) }]); e.edited ? out.kept_edited++ : out.updated++; }
    }
    if (add.length) for (const row of await insert("brain_nodes", add)) { idOf.set(row.key, row.id); out.inserted++; }
    for (let i = 0; i < todo.length; i += 8) await Promise.all(todo.slice(i, i + 8).map(([id, body]) => patch("brain_nodes", `id=eq.${id}`, body)));
  }
  // 직접 넣은 생각: 이름이 조각에 나오면 온도·근거를 매긴다 (이름·내용은 그대로)
  const items = corpus.items.map((x) => ({ ...x, low: x.text.toLowerCase() })), topRaw = Math.max(1e-9, B.max.topic);
  for (const m of have.filter((r) => r.origin === "me" && r.parent_id && !r.hidden)) {
    const word = m.title.replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase(); if (word.length < 2) continue;
    const its = items.filter((x) => x.low.includes(word)); if (!its.length) continue;
    const st = C.stats(its, corpus.today);
    await patch("brain_nodes", `id=eq.${m.id}`, { heat: C.scale(st.raw, topRaw), stats: (({ raw, ...r }) => r)(st), src: C.evidence(its) }); out.me++;
  }
  // 정의에서 빠진 분석 점: 아무도 안 고쳤고 아래에 남은 점이 없으면 지운다
  const now = await select("brain_nodes", `select=id,parent_id,key,origin,edited&user_id=eq.${u}`, "created_at"), keys = new Set(B.rows.map((r) => r.key));
  const hasKid = new Set(now.map((r) => r.parent_id).filter(Boolean));
  for (const r of now) if (r.origin === "ai" && r.key && r.key !== "root" && !keys.has(r.key) && !r.edited && !hasKid.has(r.id)) { await del("brain_nodes", `id=eq.${r.id}`); out.deleted++; }
  // 연관 선: 분석이 그은 선(origin=ai)만 새로 맞춘다. 직접 그은 선은 그대로
  const links = await select("brain_links", `select=a,b,origin&user_id=eq.${u}`, "a,b"), mine = new Set(links.filter((l) => l.origin === "me").map((l) => `${l.a}|${l.b}`)), want = new Map();
  for (const l of B.links) { const x = idOf.get(l.a), y = idOf.get(l.b); if (!x || !y || x === y) continue; const [a, b] = x < y ? [x, y] : [y, x]; if (!mine.has(`${a}|${b}`)) want.set(`${a}|${b}`, { a, b, user_id: u, why: l.why, origin: "ai" }); }
  for (const l of links) if (l.origin === "ai" && !want.has(`${l.a}|${l.b}`)) await del("brain_links", `a=eq.${l.a}&b=eq.${l.b}`);
  if (want.size) await upsert("brain_links", [...want.values()], "a,b"); out.links = want.size;
  const ch = [...C.changes(before, B.rows), ...(def.changes ?? [])];
  await insert("brain_runs", [{ user_id: u, summary: { headline: def.headline ?? "", insights: def.insights ?? [], changes: ch, counts: B.counts, period: B.period } }]);
  console.log(JSON.stringify({ ok: true, ...out, coverage: `${B.coverage.matched}/${B.coverage.items}`, changes: ch.length }));
});
