// 🧠 시뮬레이션 여러 줄 칸(브레인 덤프·시간표) 줄 단위 합치기 — 여러 명이 같은 칸에 써도 서로 줄을 안 지움
// merge3(기준, 내 글, 서버 글): 기준→내 글에서 내가 지운 줄은 서버 글에서도 빼고, 내가 새로 쓴 줄은 앞줄 뒤에 끼워 넣음.
// 줄마다 쓴 사람(who)도 같이 옮김. 각 인자는 { lines: [...], who: [...] }. 같은 줄을 둘이 동시에 고치면 둘 다 남음(안 지움).
(() => {
// 🐞 같은 글의 줄(빈 줄 등)이 여러 개면 글자로 찾지 않고 줄 번호로 맞춤 — 고친 줄이 첫 빈 줄 뒤로 튀던 문제(마야 신고 #45)
const lcs = (a, b) => { // a[i] ↔ b[j] 같은 줄 짝: a 줄 번호 → b 줄 번호
  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) d[i][j] = a[i] === b[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const m = new Map();
  for (let i = 0, j = 0; i < a.length && j < b.length;) { if (a[i] === b[j]) m.set(i++, j++); else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++; }
  return m;
};
function merge3(base, mine, theirs) {
  const toMine = lcs(base.lines, mine.lines), toTheirs = lcs(base.lines, theirs.lines);
  const gone = new Set(), after = new Map(), fromMine = new Set(toMine.values()); // gone = 내가 지운 줄(서버 줄 번호), after = 서버 줄 번호(-1 = 맨 위) 뒤에 넣을 내 새 줄
  base.lines.forEach((_, i) => { if (!toMine.has(i) && toTheirs.has(i)) gone.add(toTheirs.get(i)); });
  const mineToBase = new Map([...toMine].map(([i, j]) => [j, i])), seen = theirs.lines.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  base.lines.forEach((l) => seen.set(l, (seen.get(l) ?? 0) - 1)); // seen = 남이 새로 쓴 줄 수
  let anchor = -1;
  mine.lines.forEach((l, j) => {
    if (fromMine.has(j)) { // 앞줄이 서버에서 지워졌으면 그 앞 살아 있는 줄 뒤로
      let i = mineToBase.get(j); while (i >= 0 && !toTheirs.has(i)) i--;
      anchor = i < 0 ? -1 : toTheirs.get(i); return;
    }
    if (l.trim() && (seen.get(l) ?? 0) > 0) { seen.set(l, seen.get(l) - 1); return; } // 남도 똑같은 줄을 이미 씀
    if (!after.has(anchor)) after.set(anchor, []); after.get(anchor).push([l, mine.who[j] ?? ""]);
  });
  const out = [...(after.get(-1) ?? [])];
  theirs.lines.forEach((l, i) => { if (!gone.has(i)) out.push([l, theirs.who[i] ?? ""]); out.push(...(after.get(i) ?? [])); });
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
