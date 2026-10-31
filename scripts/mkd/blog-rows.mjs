// 네이버 블로그 순위 — 순수 모듈(DB·브라우저 안 씀, tests/mkd-blog.test.mjs 로 검증). blog-rank.mjs 가 검색 화면에서 모은 링크를 넘겨 쓴다.
// 순위 두 가지(키워드마다, 우리 지점 블로그 글 중 가장 위):
//   rank     통합검색 — 첫 화면에 보이는 블로그 글들 중 몇 번째(화면 순서, 같은 글 중복 제거). 없으면 null(= 1페이지 밖).
//   tab_rank 블로그 탭 — 처음 뜨는 30개 중 몇 번째. 없으면 null(= 30위 밖).
// PC·모바일 검색 결과는 2026-10-31 확인 때 글 순서가 같아서 PC 화면만 읽는다.
// 한쪽 화면을 못 읽으면 그 키를 아예 빼서(null 아님) "순위 밖"으로 오해되지 않게 하고 행은 partial.

export const BLOGS = { dsr: ["pallodaegudsr"], jpcn: ["pallodsrjpch"], ulsan: ["palloulsan"], gumi: [] }; // 지점 → 블로그 아이디 (구미점은 아직 블로그 없음)
export const TAB_DEPTH = 30;
export const KINDS = { all: "통합검색", tab: "블로그 탭" };
export const searchUrl = (kind, kw) => `https://search.naver.com/search.naver?${kind === "tab" ? "ssc=tab.blog.all&" : ""}query=${encodeURIComponent(kw)}`;

// 정상 검색 화면인지: 제목이 "키워드 : 네이버 검색"(통합) / "키워드 : 네이버 블로그검색"(탭). 차단·보안 확인·점검 화면이면 false — 그 화면은 풀지 않고 실패로 둔다.
export function searchPage(kind, { url = "", title = "" } = {}) {
  let host = ""; try { host = new URL(url).hostname; } catch { return false; }
  if (host !== "search.naver.com") return false;
  return kind === "tab" ? / : 네이버 블로그검색$/.test(title) : / : 네이버 검색$/.test(title);
}

// 링크 → 블로그 글 {id, log} (블로그 글이 아니면 null). blog.naver.com/아이디/글번호 · m.blog… · PostView?blogId=&logNo= 를 받는다.
export function postOf(href) {
  let u; try { u = new URL(href); } catch { return null; }
  if (!/^(m\.)?blog\.naver\.com$/.test(u.hostname)) return null;
  const id = u.searchParams.get("blogId"), log = u.searchParams.get("logNo");
  if (/^\/PostView/i.test(u.pathname)) return id && /^[A-Za-z0-9_-]+$/.test(id) && /^\d+$/.test(log ?? "") ? { id: id.toLowerCase(), log } : null;
  const m = u.pathname.match(/^\/([A-Za-z0-9_-]+)\/(\d+)\/?$/);
  return m ? { id: m[1].toLowerCase(), log: m[2] } : null;
}
export const postUrl = (p) => `https://blog.naver.com/${p.id}/${p.log}`;

// 화면 순서의 링크들 → 글 목록(같은 글은 처음 나온 자리만)
export function postsOf(hrefs) {
  const seen = new Set(), out = [];
  for (const h of hrefs ?? []) { const p = postOf(h); if (!p || seen.has(p.id + "/" + p.log)) continue; seen.add(p.id + "/" + p.log); out.push(p); }
  return out;
}

// 키워드의 '우리 글': target_url 이 블로그 글이면 그 글만, 블로그 주소(blog.naver.com/아이디)면 그 블로그 글 전부, 비었거나 못 읽으면 지점 기본 블로그.
export function targetOf(teamKey, targetUrl) {
  const t = String(targetUrl ?? "").trim();
  if (t) {
    const p = postOf(t); if (p) return { ids: [p.id], log: p.log };
    try { const u = new URL(t), m = u.pathname.match(/^\/([A-Za-z0-9_-]+)\/?$/); if (/^(m\.)?blog\.naver\.com$/.test(u.hostname) && m) return { ids: [m[1].toLowerCase()], log: null }; } catch { /* 지점 기본 */ }
  }
  return { ids: BLOGS[teamKey] ?? [], log: null };
}

// 글 목록에서 우리 글의 첫 자리 → {rank, url}. depth 를 넘으면 밖(null).
export function rankOf(posts, target, depth = Infinity) {
  const i = posts.findIndex((p, k) => k < depth && target.ids.includes(p.id) && (!target.log || p.log === target.log));
  return i < 0 ? { rank: null, url: null } : { rank: i + 1, url: postUrl(posts[i]) };
}

// 키워드 하나. res = { all: {hrefs}|{error}, tab: {hrefs}|{error} } (error 는 저장해도 되는 짧은 고정 문구)
export function keywordRow(teamKey, k, res) {
  const target = targetOf(teamKey, k.target_url), metrics = {}, missed = [];
  let our = null;
  if (res.all?.hrefs) { const r = rankOf(postsOf(res.all.hrefs), target); metrics.rank = r.rank; our = r.url; } else missed.push(KINDS.all);
  if (res.tab?.hrefs) {
    const posts = postsOf(res.tab.hrefs), r = rankOf(posts, target, TAB_DEPTH);
    metrics.tab_rank = r.rank; our ??= r.url;
    if (posts[0]) metrics.top_url = postUrl(posts[0]);
  } else missed.push(KINDS.tab);
  if (missed.length === 2) return { team_key: teamKey, unit: k.keyword, metrics: { note: noteOf(res) }, status: "failed" };
  if (our) metrics.our_url = our;
  if (missed.length) metrics.note = `${missed[0]} 못 읽음 — ${noteOf(res)}`;
  return { team_key: teamKey, unit: k.keyword, metrics, status: missed.length ? "partial" : "ok" };
}
const noteOf = (res) => res.all?.error ?? res.tab?.error ?? "검색 화면을 못 읽었어요";

// 지점 합계('전체' 행): 추적 키워드 수 · 통합검색에 걸린 키워드 수 · 블로그 탭 30위 안 키워드 수 (읽은 것만 센다).
// 키워드를 하나도 못 읽었으면 failed. 일부만 읽었으면 partial — 세는 수가 실제보다 적을 수 있다는 뜻.
export function teamAllRow(teamKey, kwRows) {
  const read = kwRows.filter((r) => r.status !== "failed");
  if (!read.length) return { team_key: teamKey, unit: "전체", metrics: { note: kwRows[0]?.metrics?.note ?? "검색 화면을 못 읽었어요" }, status: "failed" };
  const cnt = (k) => read.filter((r) => Object.hasOwn(r.metrics, k) && r.metrics[k] !== null).length;
  const has = (k) => read.some((r) => Object.hasOwn(r.metrics, k));
  const metrics = { kw_tracked: kwRows.length };
  if (has("rank")) metrics.kw_top = cnt("rank");
  if (has("tab_rank")) metrics.kw_tab = cnt("tab_rank");
  return { team_key: teamKey, unit: "전체", metrics, status: kwRows.every((r) => r.status === "ok") ? "ok" : "partial" };
}

// 켜진 키워드 [{team_key, keyword, target_url}] + 결과 Map(`${team_key}|${keyword}` → res) → save 입력 {rows, status}.
// 블로그가 없는 지점(구미점) 키워드는 건너뛴다 — 볼 글이 없다. 지점마다 키워드 행 + '전체' 행. 결과가 없는 키워드(시간 초과·차단으로 못 읽음)는 missingNote 로 failed.
export function blogInput(keywords, results, missingNote = "읽기 전에 시간이 다 됐어요") {
  const rows = [], skipped = [];
  for (const key of Object.keys(BLOGS)) {
    const kws = keywords.filter((k) => k.team_key === key); if (!kws.length) continue;
    if (!BLOGS[key].length && !kws.some((k) => k.target_url)) { skipped.push(key); continue; }
    const kr = kws.map((k) => keywordRow(key, k, results.get(`${key}|${k.keyword}`) ?? { all: { error: missingNote }, tab: { error: missingNote } }));
    rows.push(...kr, teamAllRow(key, kr));
  }
  return { input: { rows, status: "ok" }, skipped };
}

// 출력 한 줄: 지점별 [키워드, 통합, 탭] 과 실패 수. 종료코드 1 = 실패·일부만 행이 있음.
export function blogOutput(date, input, skipped, saved) {
  const teams = {};
  for (const r of input.rows) {
    const t = (teams[r.team_key] ??= { ranks: [], failed: 0, partial: 0 });
    if (r.unit === "전체") { Object.assign(t, { tracked: r.metrics.kw_tracked ?? null, top: r.metrics.kw_top ?? null, tab: r.metrics.kw_tab ?? null }); continue; }
    if (r.status === "failed") t.failed++; else { if (r.status === "partial") t.partial++; t.ranks.push([r.unit, r.metrics.rank ?? null, r.metrics.tab_rank ?? null]); }
  }
  const bad = Object.values(teams).some((t) => t.failed || t.partial);
  return { ok: !bad, date, ...(saved === undefined ? { printed: true } : { saved }), skipped, teams };
}
