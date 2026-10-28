// 🧠 시뮬레이션 여러 줄 칸(브레인 덤프·시간표) 줄 단위 합치기 — 여러 명이 같은 칸에 써도 서로 줄을 안 지움
// merge3(기준, 내 글, 서버 글): 기준→내 글에서 내가 지운 줄은 서버 글에서도 빼고, 내가 새로 쓴 줄은 앞줄 뒤에 끼워 넣음.
// 줄마다 쓴 사람(who)도 같이 옮김. 각 인자는 { lines: [...], who: [...] }. 같은 줄을 둘이 동시에 고치면 둘 다 남음(안 지움).
(() => {
const count = (arr) => arr.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
function merge3(base, mine, theirs) {
  const b = count(base.lines), keep = new Map(b), added = [];
  mine.lines.forEach((l, j) => { if (keep.get(l) > 0) keep.set(l, keep.get(l) - 1); else added.push(j); }); // 기준에도 있던 줄 = 그대로 둔 줄
  const del = new Map([...keep].filter(([, n]) => n > 0)); // 기준엔 있는데 내 글엔 없는 줄 = 내가 지운 줄
  const out = [];
  theirs.lines.forEach((l, i) => { if (del.get(l) > 0) del.set(l, del.get(l) - 1); else out.push([l, theirs.who[i] ?? ""]); });
  const has = count(theirs.lines), base2 = count(base.lines);
  let cursor = 0, lastAnchor = null;
  for (const j of added) {
    const l = mine.lines[j];
    if ((has.get(l) ?? 0) > (base2.get(l) ?? 0) && l.trim()) { has.set(l, has.get(l) - 1); continue; } // 남도 똑같은 줄을 이미 씀
    let a = j - 1; while (a >= 0 && added.includes(a)) a--;
    if (a < 0) cursor = lastAnchor === -1 ? cursor : 0, lastAnchor = -1;
    else if (lastAnchor !== a) { const at = out.findIndex(([x]) => x === mine.lines[a]); cursor = at < 0 ? out.length : at + 1; lastAnchor = a; }
    out.splice(cursor, 0, [l, mine.who[j] ?? ""]); cursor++;
  }
  return { lines: out.map(([l]) => l), who: out.map(([, w]) => w) };
}
// ✍️ 줄 안에서도 쓴 사람 나눔: 줄마다 "이름" 또는 [["이름", 글자 수], …]. 남의 문장은 그 사람 그대로, 내가 끼워 쓴 글자만 내 이름
// rechars(직전 글, 지금 글, 직전 who(칸 통째 이름 | 줄마다), 나) → 줄마다 who. 바뀐 곳 = 앞·뒤 같은 글자 빼고 가운데
const lineW = (a, i) => (Array.isArray(a) ? a[i] ?? "" : a ?? "");
const charsOf = (l, x) => { const cs = [...l], r = (Array.isArray(x) ? x : [[x ?? "", cs.length]]).flatMap(([n, c]) => Array(Math.max(0, c)).fill(n)); return cs.map((_, j) => r[j] ?? r.at(-1) ?? ""); };
const pack = (cs) => { const r = []; for (const n of cs) r.at(-1)?.[0] === n ? r.at(-1)[1]++ : r.push([n, 1]); return r.length === 1 ? r[0][0] : r; };
function rechars(prev, next, a, me) {
  const P = [...prev], N = [...next], who = prev.split("\n").flatMap((l, i) => [...charsOf(l, lineW(a, i)), ""]); who.pop(); // "" = 줄바꿈 자리
  let i = 0; while (i < P.length && i < N.length && P[i] === N[i]) i++;
  let j = 0; while (j < P.length - i && j < N.length - i && P[P.length - 1 - j] === N[N.length - 1 - j]) j++;
  const nw = [...who.slice(0, i), ...Array(N.length - i - j).fill(me), ...who.slice(P.length - j)];
  let at = 0;
  return next.split("\n").map((l) => { const n = [...l].length, x = l.trim() ? pack(nw.slice(at, at + n)) : ""; at += n + 1; return x; });
}
globalThis.SIMMERGE = { merge3, rechars };
})();
