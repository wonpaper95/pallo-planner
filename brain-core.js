// 🧠 뇌 탭 계산 (화면 아님 — 맥미니 분석 스크립트 scripts/brain/*.mjs 와 tests/brain-core.test.mjs 가 씀)
// 생각 조각(corpus: 주간 할 일·아이디어·Claude 에게 쓴 말)에 주제의 낱말(match)이 몇 번 나오는지 세어 온도·달별 추이·근거를 만든다.
// 순수 계산만: 파일·DB·시간을 직접 읽지 않는다 (today 를 받아서 계산). → BRAIN_CORE (브라우저에서는 쓰지 않음)
(function (root, factory) { const m = factory(); if (typeof module === "object" && module.exports) module.exports = m; else root.BRAIN_CORE = m; })(typeof self !== "undefined" ? self : this, function () {
  const DAY = 86400e3, HALF = 45; // 온도 반감기: 45일 전 생각은 절반만 친다
  const W = { week: 1, claude: 1.2, idea: 2.5, goal: 2 }; // 어디서 나온 생각인지에 따른 무게
  const STATES = ["관심", "고민", "실행", "루틴", "식음"];
  const SIDES = ["L", "R", "B"]; // 좌뇌(논리·숫자·계획·규칙) · 우뇌(사람·감정·창의·이미지) · 둘 다. stats.side 에 담는다
  // 다시 분석해도 좌·우를 지킨다: 대표가 화면에서 고른 것(side_me)은 그대로, 새 통계에 좌·우가 없으면 있던 것을 남긴다
  const keepSide = (old, next) => (old?.side_me ? (({ side, side_me, ...r }) => ({ ...r, ...(SIDES.includes(old.side) ? { side: old.side } : {}), side_me: true }))(next) : !next.side && SIDES.includes(old?.side) ? { ...next, side: old.side } : next);
  const days = (a, b) => Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / DAY);

  // 낱말 하나 → 판별 함수. "/정규식/" 은 정규식(대소문자 무시), 나머지는 글자 그대로(대소문자 무시)
  function term(t) {
    const s = String(t ?? "").trim(); if (!s) return () => false;
    const m = /^\/(.+)\/$/.exec(s);
    if (m) { let re; try { re = new RegExp(m[1], "i"); } catch { return () => false; } return (x) => re.test(x); }
    const low = s.toLowerCase(); return (x) => x.includes(low);
  }
  function matcher(match, not) {
    const yes = (match ?? []).map(term), no = (not ?? []).map(term);
    if (!yes.length) return () => false;
    return (low) => yes.some((f) => f(low)) && !no.some((f) => f(low));
  }
  // 조각 하나의 '횟수 단위': 주간 할 일·아이디어는 1번. Claude 대화는 같은 대화·같은 날에 최대 3번까지만 (한 대화에서 길게 말한 것이 부풀지 않게)
  function units(items) {
    const seen = new Map(), out = [];
    for (const x of items) {
      if (x.w === "claude") { const k = `${x.sid}|${x.d}`, c = seen.get(k) ?? 0; if (c >= 3) continue; seen.set(k, c + 1); }
      out.push(x);
    }
    return out;
  }
  // 조각 묶음 → 통계. today 뒤 날짜(앞으로 잡아 둔 할 일)는 '지금 머릿속에 있는 것'으로 친다 (나이 0)
  function stats(items, today) {
    const us = units(items), by = {}, m = {}; let n30 = 0, n90 = 0, raw = 0, first = "", last = "", open = 0, moved = 0;
    for (const x of us) {
      const age = Math.max(0, days(today, x.d)), d = x.d > today ? today : x.d;
      by[x.w] = (by[x.w] ?? 0) + 1;
      if (age <= 30) n30++; if (age <= 90) n90++;
      const mon = d.slice(0, 7); m[mon] = (m[mon] ?? 0) + 1;
      if (!first || d < first) first = d; if (!last || d > last) last = d;
      const late = x.w === "week" && !x.done && x.d < today; if (late) open++; if (x.moved) moved++;
      raw += (W[x.w] ?? 1) * Math.pow(0.5, age / HALF) * (late ? 1.3 : 1) * (x.imp || x.must ? 1.3 : 1);
    }
    return { n: us.length, n30, n90, rise: Math.round((n30 - (n90 - n30) / 2) * 10) / 10, first, last, by, m, open, moved, raw };
  }
  // 근거 고르기: 사람이 고른 것(pin) 먼저, 그다음 최근 것부터 — 출처가 한쪽으로 쏠리지 않게 번갈아
  function evidence(items, pin, max = 6) {
    const cut = (t) => { const s = String(t ?? "").replace(/\s+/g, " ").trim(); return s.length > 150 ? s.slice(0, 149) + "…" : s; };
    const out = [], seen = new Set(), push = (d, w, t) => { const c = cut(t), k = c.slice(0, 40); if (!c || seen.has(k) || out.length >= max) return; seen.add(k); out.push({ d, w, t: c }); };
    for (const p of pin ?? []) push(p.d, p.w ?? "week", p.t);
    const pools = {}; for (const x of [...items].sort((a, b) => b.d.localeCompare(a.d))) if (!(x.w === "claude" && (x.ans || x.text.length < 12))) (pools[x.w] ??= []).push(x);
    const order = Object.keys(pools).sort((a, b) => pools[b][0].d.localeCompare(pools[a][0].d));
    for (let i = 0; out.length < max && order.some((w) => pools[w].length); i++) { const w = order[i % order.length], x = pools[w].shift(); if (x) push(x.d, x.w, x.text); }
    return out.sort((a, b) => b.d.localeCompare(a.d));
  }
  const scale = (raw, max) => (max > 0 && raw > 0 ? Math.max(1, Math.min(100, Math.round(100 * Math.pow(raw / max, 0.6)))) : 0);

  // 정의(def: {title, nodes:[{key,parent,title,state,worry,side,note,match,not,pin}], links}) + 조각 → 점마다 통계·온도·근거
  function build(def, corpus) {
    const today = corpus.today, items = corpus.items.map((x) => ({ ...x, low: x.text.toLowerCase() }));
    const errors = [], byKey = new Map(), kids = new Map();
    for (const n of def.nodes ?? []) {
      if (!n.key || !/^[a-z0-9][a-z0-9._-]{0,78}$/.test(n.key)) errors.push(`key 가 이상해요: ${JSON.stringify(n.key)}`);
      else if (n.key === "root" || byKey.has(n.key)) errors.push(`key 가 겹쳐요: ${n.key}`);
      else byKey.set(n.key, n);
      if (!n.title || n.title.length > 80) errors.push(`${n.key}: 제목은 1~80자`);
      if (n.state && !STATES.includes(n.state)) errors.push(`${n.key}: 상태는 ${STATES.join("·")} 중 하나`);
      if (n.side && !SIDES.includes(n.side)) errors.push(`${n.key}: side 는 L(좌뇌)·R(우뇌)·B(둘 다) 중 하나`);
      if (String(n.note ?? "").length > 6000) errors.push(`${n.key}: 내용이 너무 길어요`);
    }
    for (const n of def.nodes ?? []) {
      const p = n.parent ?? "root"; if (p !== "root" && !byKey.has(p)) errors.push(`${n.key}: 위 가지(${p})가 없어요`);
      (kids.get(p) ?? kids.set(p, []).get(p)).push(n);
    }
    for (const [a, b] of def.links ?? []) { if (!byKey.has(a) || !byKey.has(b)) errors.push(`연관 선: ${a} — ${b} 중 없는 key`); if (a === b) errors.push(`연관 선: 자기 자신 ${a}`); }
    if (errors.length) return { errors };
    const depth = (n) => { let d = 1; for (let p = n.parent, i = 0; p && p !== "root" && i < 30; p = byKey.get(p)?.parent, i++) d++; return d; };
    const own = new Map(), hit = new Set();
    for (const n of byKey.values()) { const f = matcher(n.match, n.not), s = new Set(); items.forEach((x, i) => { if (f(x.low)) { s.add(i); hit.add(i); } }); own.set(n.key, s); }
    const all = new Map(), gather = (n) => { if (all.has(n.key)) return all.get(n.key); const s = new Set(own.get(n.key)); for (const c of kids.get(n.key) ?? []) for (const i of gather(c)) s.add(i); all.set(n.key, s); return s; };
    const rows = [];
    for (const n of byKey.values()) {
      const its = [...gather(n)].sort((a, b) => a - b).map((i) => items[i]), st = stats(its, today), d = depth(n);
      rows.push({ key: n.key, parent: n.parent ?? "root", depth: d, title: n.title, note: n.note ?? "", state: n.state ?? "", worry: Math.max(0, Math.min(100, Math.round(n.worry ?? 0))), _raw: st.raw, stats: { ...(({ raw, ...r }) => r)(st), ...(n.side ? { side: n.side } : {}) }, src: evidence(its, n.pin), sort: (kids.get(n.parent ?? "root") ?? []).indexOf(n) });
    }
    const maxA = Math.max(0, ...rows.filter((r) => r.depth === 1).map((r) => r._raw)), maxT = Math.max(0, ...rows.filter((r) => r.depth >= 2).map((r) => r._raw));
    const rk = new Map(rows.map((r) => [r.key, r]));
    for (const r of rows) {
      r.heat = scale(r._raw, r.depth === 1 ? maxA : maxT); delete r._raw;
      // 두 달 반 넘게 한 번도 안 나온 관심·실행·고민은 '식음'
      if (["관심", "실행", "고민"].includes(r.state) && r.stats.last && days(today, r.stats.last) > 75) { r.state = "식음"; r.worry = Math.min(r.worry, 20); }
    }
    for (const r of rows) if (r.depth === 1 && !byKey.get(r.key).worry) { // 큰 주제의 고민 = 아래 생각들의 고민을 온도로 무게 준 평균
      const cs = rows.filter((c) => c.depth >= 2 && (function up(k) { for (let p = k, i = 0; p && p !== "root" && i < 30; p = rk.get(p)?.parent, i++) if (p === r.key) return true; return false; })(c.parent)), w = cs.reduce((s, c) => s + c.heat, 0);
      r.worry = w ? Math.round(cs.reduce((s, c) => s + c.worry * c.heat, 0) / w) : 0;
    }
    const counts = {}; for (const x of units(items)) counts[x.w] = (counts[x.w] ?? 0) + 1;
    const ds = items.map((x) => x.d).filter((d) => d <= today).sort();
    const miss = items.filter((x, i) => !hit.has(i) && !(x.w === "claude" && (x.ans || x.text.length < 12)));
    return { errors: [], rows, max: { area: maxA, topic: maxT }, links: (def.links ?? []).map(([a, b, why]) => ({ a, b, why: String(why ?? "").slice(0, 300) })), counts, period: { from: ds[0] ?? "", to: ds.at(-1) ?? "" },
      coverage: { items: items.length, matched: hit.size, unmatched: miss.length, recentUnmatched: miss.filter((x) => days(today, x.d) <= 45).map((x) => ({ d: x.d, w: x.w, t: x.text.replace(/\s+/g, " ").slice(0, 90) })) } };
  }
  // 지난 분석과 달라진 점 (문장 목록). before = [{key,title,heat,worry,state}] (DB 에 있던 것), after = build().rows
  function changes(before, after) {
    const old = new Map((before ?? []).filter((r) => r.key).map((r) => [r.key, r])), out = [];
    if (!old.size) return out;
    const t = after.filter((r) => r.depth >= 2);
    const fresh = t.filter((r) => !old.has(r.key)).sort((a, b) => b.heat - a.heat).slice(0, 5); if (fresh.length) out.push(`새로 생긴 생각: ${fresh.map((r) => r.title).join(", ")}`);
    const up = t.filter((r) => old.has(r.key) && r.heat - old.get(r.key).heat >= 12).sort((a, b) => (b.heat - old.get(b.key).heat) - (a.heat - old.get(a.key).heat)).slice(0, 4);
    if (up.length) out.push(`더 뜨거워진 생각: ${up.map((r) => `${r.title}(${old.get(r.key).heat}→${r.heat})`).join(", ")}`);
    const dn = t.filter((r) => old.has(r.key) && old.get(r.key).heat - r.heat >= 12).sort((a, b) => (old.get(b.key).heat - b.heat) - (old.get(a.key).heat - a.heat)).slice(0, 4);
    if (dn.length) out.push(`식어 가는 생각: ${dn.map((r) => `${r.title}(${old.get(r.key).heat}→${r.heat})`).join(", ")}`);
    const wo = t.filter((r) => old.has(r.key) && r.worry - old.get(r.key).worry >= 15).slice(0, 4); if (wo.length) out.push(`고민이 커진 생각: ${wo.map((r) => r.title).join(", ")}`);
    const ok = t.filter((r) => old.has(r.key) && old.get(r.key).worry - r.worry >= 15).slice(0, 4); if (ok.length) out.push(`고민이 줄어든 생각: ${ok.map((r) => r.title).join(", ")}`);
    return out;
  }
  return { term, matcher, units, stats, evidence, scale, build, changes, keepSide, STATES, SIDES, HALF };
});
