// 🧠 뇌 탭 분석 자료 모으기 ③ 한데 모으기 — planner.json + claude-*.json → corpus.json (한 줄 = 생각 한 조각)
// 사용: node scripts/brain/corpus.mjs [--chunks] [--since YYYY-MM-DD]
//   --chunks : 읽기 좋은 글 묶음(chunks/*.txt)도 만든다 (분기별 주간 할 일, 컴퓨터별 Claude 대화)
//   --since  : 그 날짜부터의 조각만 chunks/new.txt 로 따로 만든다 (매주 다시 분석할 때)
// 비밀번호·긴 열쇠 문자열은 가린다. 결과는 맥미니 안(~/.local/share/pallo-brain)에만 둔다.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";

const DIR = process.env.BRAIN_DIR || `${homedir()}/.local/share/pallo-brain`;
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1] ?? ""; };
const kst = (iso) => { const t = new Date(iso); return isNaN(t) ? "" : new Date(t.getTime() + 9 * 3600e3).toISOString().slice(0, 10); };
export const scrub = (s) => String(s ?? "")
  .replace(/(비밀번호|비번|패스워드|password|passwd|pw)(\s*(?:는|은|가|이|:|=|：)?\s*)([^\s,.]{3,})/gi, "$1$2[가림]")
  .replace(/\b(?:sk|pk|rk|ghp|gho|xox[abp]|eyJ)[A-Za-z0-9_\-.]{16,}/g, "[열쇠 가림]")
  .replace(/[A-Za-z0-9_\-]{40,}/g, "[긴 문자열 가림]");

const items = [];
const P = JSON.parse(readFileSync(`${DIR}/planner.json`, "utf8"));
for (const t of P.tasks ?? []) {
  const text = scrub([t.title, t.note].filter((x) => x && String(x).trim()).join(" — ")).trim(); if (!text) continue;
  items.push({ w: "week", d: t.day, text, done: !!t.done, ...(t.important ? { imp: 1 } : {}), ...(t.must_do ? { must: 1 } : {}), ...(Array.isArray(t.deadline_log) && t.deadline_log.length ? { moved: t.deadline_log.length } : {}) });
}
for (const s of P.someday ?? []) {
  const text = scrub([s.title, s.memo].filter((x) => x && String(x).trim()).join(" — ")).trim(); if (!text) continue;
  items.push({ w: "idea", d: String(s.created_at).slice(0, 10), text, done: !!s.done });
}
for (const g of P.month_goals ?? []) for (const k of ["my_goal", "strategy", "my_plan", "team_goal"]) if (g[k] && String(g[k]).trim()) items.push({ w: "goal", d: `${g.month}-01`, text: scrub(g[k]) });
for (const f of readdirSync(DIR).filter((x) => /^claude-.*\.json$/.test(x)).sort()) {
  const C = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")), host = f.replace(/^claude-|\.json$/g, "");
  for (const s of C.sessions ?? []) for (const m of s.msgs ?? []) {
    const text = scrub(m.text).trim(); if (text.length < 2) continue;
    items.push({ w: "claude", host, sid: s.id, d: kst(m.t + ":00Z") || String(m.t).slice(0, 10), text, ...(m.kind === "answer" ? { ans: 1 } : {}) });
  }
}
items.sort((a, b) => a.d.localeCompare(b.d));
items.forEach((x, i) => (x.i = i));
writeFileSync(`${DIR}/corpus.json`, JSON.stringify({ at: new Date().toISOString(), today: kst(new Date().toISOString()), items }), { mode: 0o600 });
const by = {}; for (const x of items) by[x.w] = (by[x.w] ?? 0) + 1;

const line = (x) => x.w === "week" ? `${x.d} ${x.done ? "✓" : "☐"}${x.imp ? "⭐" : ""}${x.must ? "‼" : ""}${x.moved ? `(미룸${x.moved})` : ""} ${x.text}` : x.w === "claude" ? `  [${x.d}]${x.ans ? " (고른 답)" : ""} ${x.text.replace(/\n+/g, " ⏎ ")}` : `${x.d} (${x.w === "idea" ? "아이디어" : "목표"}) ${x.text.replace(/\n+/g, " ⏎ ")}`;
const out = [];
if (process.argv.includes("--chunks")) {
  const cd = `${DIR}/chunks`; if (existsSync(cd)) rmSync(cd, { recursive: true }); mkdirSync(cd, { recursive: true, mode: 0o700 });
  const put = (name, text) => { writeFileSync(`${cd}/${name}`, text, { mode: 0o600 }); out.push([name, text.length]); };
  const q = {}; for (const x of items) if (x.w !== "claude") { const k = `${x.d.slice(0, 4)}Q${Math.ceil(+x.d.slice(5, 7) / 3)}`; (q[k] ??= []).push(line(x)); }
  for (const [k, ls] of Object.entries(q)) put(`week-${k}.txt`, `# 대표의 주간 할 일·아이디어 ${k} (날짜 ✓=함 ☐=안 함 ⭐=중요 ‼=꼭 (미룸n)=마감을 n번 미룸)\n` + ls.join("\n"));
  const hosts = {}; for (const x of items) if (x.w === "claude") ((hosts[x.host] ??= {})[x.sid] ??= []).push(x);
  for (const [h, ss] of Object.entries(hosts)) {
    let n = 1, buf = `# 대표가 Claude 에게 쓴 말 (${h}) — 대화별로 묶음, 날짜순\n`;
    for (const [sid, ms] of Object.entries(ss).sort((a, b) => a[1][0].d.localeCompare(b[1][0].d))) {
      const block = `\n## 대화 ${sid} (${ms[0].d}${ms.at(-1).d !== ms[0].d ? `~${ms.at(-1).d}` : ""}, ${ms.length}마디)\n` + ms.map(line).join("\n") + "\n";
      if (buf.length + block.length > 42000 && buf.length > 2000) { put(`claude-${h}-${String(n++).padStart(2, "0")}.txt`, buf); buf = `# 대표가 Claude 에게 쓴 말 (${h}) — 이어서\n`; }
      buf += block;
    }
    put(`claude-${h}-${String(n).padStart(2, "0")}.txt`, buf);
  }
}
const since = arg("--since");
if (since) { mkdirSync(`${DIR}/chunks`, { recursive: true, mode: 0o700 }); const ls = items.filter((x) => x.d >= since && x.d <= kst(new Date().toISOString())); writeFileSync(`${DIR}/chunks/new.txt`, `# ${since} 부터 새로 쌓인 조각 ${ls.length}개\n` + ls.map((x) => (x.w === "claude" ? `(Claude 대화 ${x.sid})` : "") + line(x)).join("\n"), { mode: 0o600 }); out.push(["new.txt", ls.length]); }
console.log(JSON.stringify({ ok: true, items: items.length, by, chunks: out }));
