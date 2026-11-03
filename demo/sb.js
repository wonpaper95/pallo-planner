// 🧪 체험판 가짜 서버: supabase-js 와 같은 모양, 데이터는 이 브라우저 메모리에만 (새로고침하면 처음으로). 운영 서버로 나가는 요청 없음.
(() => {
  // 운영과 저장값이 안 섞이게 localStorage·sessionStorage 키에 접두어
  const P = "demo:", S = Storage.prototype, [g, s, r] = [S.getItem, S.setItem, S.removeItem];
  S.getItem = function (k) { return g.call(this, P + k); };
  S.setItem = function (k, v) { return s.call(this, P + k, v); };
  S.removeItem = function (k) { return r.call(this, P + k); };
  // 혹시 남은 서버 호출은 여기서 끊는다
  const fetch0 = window.fetch.bind(window);
  window.fetch = (u, o) => {
    const url = String(u?.url ?? u);
    if (/supabase\.co|demo\.invalid/.test(url)) return Promise.resolve(new Response(JSON.stringify({ error: "체험판에서는 실행되지 않아요" }), { status: 200, headers: { "content-type": "application/json" } }));
    if (url.includes("version.txt")) return Promise.resolve(new Response(""));
    return fetch0(u, o);
  };
  if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {}); // 체험판은 앱 설치·푸시 없음

  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = (off = 0) => { const d = new Date(); d.setDate(d.getDate() + off); return ymd(d); }; // 오늘 기준 며칠 뒤 YYYY-MM-DD
  const at = (off = 0, hm = "10:00") => new Date(`${day(off)}T${hm}:00`).toISOString(); // 오늘 기준 며칠 뒤 시각
  const month = (off = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return ymd(d).slice(0, 7); }; // YYYY-MM
  const monday = (off = 0) => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + off * 7); return ymd(d); }; // 이번 주 월요일(+주)
  let seq = 900000;
  const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

  // 공용 고정값: 모든 seed 파일이 같은 지점·사람을 쓴다
  const U = { boss: "00000000-0000-4000-8000-000000000001", m1: "00000000-0000-4000-8000-000000000002", m2: "00000000-0000-4000-8000-000000000003", m3: "00000000-0000-4000-8000-000000000004", m4: "00000000-0000-4000-8000-000000000005", a1: "00000000-0000-4000-8000-000000000006" };
  const T = { en: 1, jp: 2, bs: 3, sw: 4 };
  const DEMO = (window.DEMO = {
    U, T, day, at, month, monday, uuid,
    tables: {}, // 표 이름 → 행 배열
    rpc: {}, // rpc 이름 → (인자) => 값 (또는 { data, error })
    fn: {}, // functions.invoke 이름 → (body) => 값
    pk: {}, // 표 이름 → 기본키 칼럼 배열 (기본 ["id"]) — upsert 에 onConflict 없을 때
    defaults: {}, // 표 이름 → () => ({칼럼: 값}) — insert 로 새 행이 생길 때 서버가 채우는 값(user_id 등). upsert 키 찾기에도 씀
    hooks: {}, // "표.insert" → (새 행) · "표.update" → (바뀐 행, 예전 행) — 서버 트리거 흉내
    trim: [], // 페이지 스크립트가 다 돈 뒤 실행할 것 (교재 잘라내기 등)
    NOTE: "체험판에서는 실제로 실행되지 않아요",
  });

  const path = (row, k) => k.split(".").reduce((v, p) => (Array.isArray(v) ? v[0]?.[p] : v?.[p]), row);
  const cmp = (a, b) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);
  const like = (v, pat, flags) => new RegExp("^" + String(pat).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$", flags).test(String(v ?? ""));
  const has = (v, need) => Array.isArray(need) ? need.every((x) => (v ?? []).includes(x)) : Object.entries(need ?? {}).every(([k, x]) => JSON.stringify(v?.[k]) === JSON.stringify(x));
  const OPS = { // eq/neq: or("reviewed.eq.false") 처럼 글자로 온 true/false 도 맞게
    eq: (v, x) => v == x || (typeof v === "boolean" && String(v) === String(x)), neq: (v, x) => v != x && !(typeof v === "boolean" && String(v) === String(x)), gt: (v, x) => cmp(v, x) > 0 && v != null, gte: (v, x) => cmp(v, x) >= 0 && v != null,
    lt: (v, x) => v != null && cmp(v, x) < 0, lte: (v, x) => v != null && cmp(v, x) <= 0,
    is: (v, x) => (x === null || x === "null" ? v == null : v === (x === "true" || x === true)),
    in: (v, x) => (typeof x === "string" ? x.replace(/^\(|\)$/g, "").split(",") : x).some((y) => y == v),
    like: (v, x) => like(v, x, ""), ilike: (v, x) => like(v, x, "i"), cs: (v, x) => has(v, typeof x === "string" ? JSON.parse(x) : x),
  };
  const orFilter = (text) => { // "a.eq.1,b.is.null,and(c.gte.1,c.lt.\"2\")" 정도만
    const cut = (s) => s.split(/,(?![^()]*\))/);
    const cond = (p) => {
      const g = p.match(/^and\((.*)\)$/);
      if (g) { const fs = cut(g[1]).map(cond); return (row) => fs.every((f) => f(row)); }
      const [c, op, ...r] = p.split("."), x = r.join(".").replace(/^"(.*)"$/, "$1");
      return (row) => (op === "not" ? !OPS[x.split(".")[0]]?.(path(row, c), x.split(".").slice(1).join(".")) : OPS[op]?.(path(row, c), x));
    };
    const fs = cut(text).map(cond);
    return (row) => fs.some((f) => f(row));
  };
  const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
  const rows = (t) => (DEMO.tables[t] ||= []);
  const stamp = (t, r) => {
    const out = { ...DEMO.defaults[t]?.(), ...r }, list = rows(t), now = new Date().toISOString();
    if (!("created_at" in out)) out.created_at = now;
    if (!("updated_at" in out)) out.updated_at = now;
    if (!("id" in out) && !DEMO.pk[t]) {
      const ex = list.find((x) => x.id != null)?.id;
      out.id = typeof ex === "string" ? uuid() : Math.max(0, ...list.map((x) => +x.id || 0)) + 1;
    }
    return out;
  };

  class Query {
    constructor(t) { this.t = t; this.fs = []; this.ord = []; this.op = "select"; }
    select(_c, o) { if (this.op === "select") this.opt = o || {}; this.ret = true; return this; }
    insert(v) { this.op = "insert"; this.val = v; return this; }
    update(v) { this.op = "update"; this.val = v; return this; }
    upsert(v, o) { this.op = "upsert"; this.val = v; this.conflict = o?.onConflict; this.ignore = o?.ignoreDuplicates; return this; }
    delete() { this.op = "delete"; return this; }
    filter(c, op, x) { this.fs.push((r) => OPS[op]?.(path(r, c), x)); return this; }
    not(c, op, x) { this.fs.push((r) => !OPS[op]?.(path(r, c), x)); return this; }
    or(text) { this.fs.push(orFilter(text)); return this; }
    match(o) { for (const [c, x] of Object.entries(o)) this.eq(c, x); return this; }
    contains(c, x) { return this.cs(c, x); }
    order(c, o) { this.ord.push([c, o?.ascending !== false, o?.nullsFirst]); return this; }
    limit(n) { this.max = n; return this; }
    range(a, b) { this.from_ = a; this.max = b - a + 1; return this; }
    single() { this.one = "single"; return this; }
    maybeSingle() { this.one = "maybe"; return this; }
    abortSignal() { return this; }
    csv() { return this; }
    run() {
      const list = rows(this.t), hit = (r) => this.fs.every((f) => f(r));
      let out = [];
      if (this.op === "select") {
        out = list.filter(hit);
        for (const [c, asc, nf] of [...this.ord].reverse()) out = [...out].sort((a, b) => {
          const [x, y] = [path(a, c), path(b, c)];
          if (x == null || y == null) { if (x == null && y == null) return 0; return (x == null) === (nf ?? !asc) ? -1 : 1; }
          return asc ? cmp(x, y) : cmp(y, x);
        });
      } else if (this.op === "insert") {
        out = [].concat(this.val).map((r) => stamp(this.t, r)); list.push(...out); out.forEach((r) => DEMO.hooks[this.t + ".insert"]?.(r));
      } else if (this.op === "update") {
        out = list.filter(hit); for (const r of out) { const old = { ...r }; Object.assign(r, this.val, "updated_at" in r ? { updated_at: new Date().toISOString() } : {}); DEMO.hooks[this.t + ".update"]?.(r, old); }
      } else if (this.op === "upsert") {
        const keys = this.conflict ? this.conflict.split(",").map((x) => x.trim()) : DEMO.pk[this.t] || ["id"];
        for (const v of [].concat(this.val)) {
          const kv = { ...DEMO.defaults[this.t]?.(), ...v }, ex = list.find((r) => keys.every((k) => kv[k] !== undefined && r[k] == kv[k]));
          if (ex) { if (!this.ignore) { const old = { ...ex }; Object.assign(ex, v); DEMO.hooks[this.t + ".update"]?.(ex, old); } out.push(ex); } else { const n = stamp(this.t, v); list.push(n); out.push(n); DEMO.hooks[this.t + ".insert"]?.(n); }
        }
      } else if (this.op === "delete") {
        out = list.filter(hit); DEMO.tables[this.t] = list.filter((r) => !out.includes(r));
      }
      const count = out.length;
      if (this.from_) out = out.slice(this.from_);
      if (this.max != null) out = out.slice(0, this.max);
      if (this.opt?.head) return { data: null, error: null, count };
      if (this.op !== "select" && !this.ret) return { data: null, error: null, count };
      if (this.one) {
        if (out.length > 1 || (this.one === "single" && !out.length)) return { data: null, error: { code: "PGRST116", message: "행을 찾지 못했어요" }, count };
        return { data: clone(out[0] ?? null), error: null, count };
      }
      return { data: clone(out), error: null, count };
    }
    then(ok, bad) { return Promise.resolve().then(() => this.run()).then(ok, bad); }
    catch(bad) { return this.then(undefined, bad); }
    finally(f) { return this.then((x) => { f(); return x; }); }
  }
  for (const [m, op] of Object.entries({ eq: "eq", neq: "neq", gt: "gt", gte: "gte", lt: "lt", lte: "lte", is: "is", in: "in", like: "like", ilike: "ilike", cs: "cs" }))
    Query.prototype[m] = function (c, x) { this.fs.push((r) => OPS[op](path(r, c), x)); return this; };

  // 🪄 rpc·함수: 준비 안 된 이름은 빈 결과 / 안내 — 화면이 깨지지 않게
  const answer = (v) => (v && typeof v === "object" && ("data" in v || "error" in v) ? { data: v.data ?? null, error: v.error ?? null } : { data: v ?? null, error: null });
  const later = (f) => { const p = Promise.resolve().then(f); p.single = () => p; p.maybeSingle = () => p; p.select = () => p; return p; };
  const user = { id: U.boss, email: "demo@pallo.example" };
  const session = { user, access_token: "demo", refresh_token: "demo", expires_at: 4102444800 };
  const channel = () => { const c = { state: "joined", on: () => c, subscribe: (f) => { f?.("SUBSCRIBED"); return c; }, send: async () => "ok", track: async () => "ok", untrack: async () => "ok", unsubscribe: async () => "ok", presenceState: () => ({}) }; return c; };
  const files = new Map();
  const bucket = (b) => ({
    upload: async (p, f) => { files.set(`${b}/${p}`, f); return { data: { path: p }, error: null }; },
    remove: async (ps) => { for (const p of ps) files.delete(`${b}/${p}`); return { data: [], error: null }; },
    url: (p) => { const f = files.get(`${b}/${p}`); return f instanceof Blob ? URL.createObjectURL(f) : DEMO.placeholder ?? "icon-512.png"; },
    createSignedUrl: async function (p) { return { data: { signedUrl: this.url(p) }, error: null }; },
    createSignedUrls: async function (ps) { return { data: ps.map((p) => ({ path: p, signedUrl: this.url(p), error: null })), error: null }; },
    getPublicUrl: function (p) { return { data: { publicUrl: this.url(p) } }; },
    download: async () => ({ data: null, error: { message: DEMO.NOTE } }),
    list: async () => ({ data: [], error: null }),
  });
  const client = {
    from: (t) => new Query(t),
    rpc: (name, args) => later(async () => { const f = DEMO.rpc[name]; return f ? answer(await f(args ?? {})) : { data: [], error: null }; }),
    functions: { invoke: async (name, o) => { const f = DEMO.fn[name]; return f ? answer(await f(o?.body ?? {})) : { data: null, error: { message: DEMO.NOTE } }; } },
    storage: { from: bucket },
    channel, removeChannel: async () => "ok", getChannels: () => [],
    realtime: { setAuth() {} },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { session, user }, error: null }),
      signUp: async () => ({ data: { session, user }, error: null }),
      setSession: async () => ({ data: { session, user }, error: null }),
      signOut: async () => { toastLate("체험판에서는 로그아웃이 없어요"); return { error: null }; },
      updateUser: async () => ({ data: { user }, error: null }),
    },
  };
  const toastLate = (m) => window.toast?.(m);
  window.supabase = { createClient: () => client };

  // 체험판 띠
  addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.id = "demoBar";
    bar.textContent = "🧪 체험판 · 모든 내용은 가상의 샘플이에요 · 새로고침하면 처음 상태로 돌아가요";
    bar.style.cssText = "position:sticky;top:0;z-index:9999;background:#E0D120;color:#1a1530;font:600 13px/1.5 system-ui;text-align:center;padding:5px 12px";
    document.body.prepend(bar);
    // 체험판에서 쓸 일 없는 버튼: 로그아웃은 전부, 외부 도구는 폰에서 (폰 머리줄이 화면 밖으로 밀림)
    const css = document.createElement("style");
    css.textContent = "#outBtn{display:none!important} @media (max-width:899px){#consultBtn,#trainingBtn{display:none!important}}";
    document.head.append(css);
    for (const f of DEMO.trim) try { f(); } catch (e) { console.warn("demo trim", e); }
    // 운영 앱·외부 도구로 빠져나가는 링크는 막는다 (상담 AI·전산 연습·위젯·가이드 공유 등)
    document.addEventListener("click", (e) => {
      const a = e.target.closest?.("a[href]");
      if (!a || /^(blob:|data:|#|javascript:)/.test(a.getAttribute("href"))) return;
      e.preventDefault(); e.stopPropagation(); window.toast?.("체험판에서는 링크가 열리지 않아요");
    }, true);
  });
})();
