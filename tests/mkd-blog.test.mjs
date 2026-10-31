import { test } from "node:test";
import assert from "node:assert/strict";
import { BLOGS, searchUrl, searchPage, postOf, postsOf, targetOf, rankOf, keywordRow, teamAllRow, blogInput, blogOutput } from "../scripts/mkd/blog-rows.mjs";
import { toRowsPure } from "../scripts/mkd/rows.mjs";
import D from "../mkd-core.js";

const TEAMS = [{ id: 1, name: "구미점", key: "gumi" }, { id: 2, name: "대구영어점", key: "dsr" }, { id: 3, name: "울산점", key: "ulsan" }, { id: 4, name: "대구일중점", key: "jpcn" }];
const post = (id, log) => `https://blog.naver.com/${id}/${log}`;
const ok = (...hrefs) => ({ hrefs });

// ── 주소·화면 ──
test("searchUrl: 통합검색 / 블로그 탭, 키워드는 인코딩", () => {
  assert.equal(searchUrl("all", "대구 영어"), "https://search.naver.com/search.naver?query=%EB%8C%80%EA%B5%AC%20%EC%98%81%EC%96%B4");
  assert.equal(searchUrl("tab", "a&b"), "https://search.naver.com/search.naver?ssc=tab.blog.all&query=a%26b");
});
test("searchPage: 제목·주소로 정상 검색 화면만 인정 (차단·로그인·다른 탭은 false)", () => {
  assert.equal(searchPage("all", { url: "https://search.naver.com/search.naver?query=x", title: "대구영어회화 : 네이버 검색" }), true);
  assert.equal(searchPage("tab", { url: "https://search.naver.com/search.naver?ssc=tab.blog.all&query=x", title: "대구영어회화 : 네이버 블로그검색" }), true);
  assert.equal(searchPage("all", { url: "https://search.naver.com/search.naver?query=x", title: "대구영어회화 : 네이버 블로그검색" }), false);
  assert.equal(searchPage("tab", { url: "https://search.naver.com/x", title: "대구영어회화 : 네이버 검색" }), false);
  assert.equal(searchPage("all", { url: "https://nid.naver.com/login", title: "x : 네이버 검색" }), false);
  assert.equal(searchPage("all", { url: "https://search.naver.com/", title: "보안 확인" }), false);
  assert.equal(searchPage("all", { url: "주소아님", title: "x : 네이버 검색" }), false);
  assert.equal(searchPage("all"), false);
});
test("postOf: 글 주소 3가지 모양, 블로그 첫 화면·다른 사이트는 null", () => {
  assert.deepEqual(postOf("https://blog.naver.com/PalloDaeguDsr/224441610152"), { id: "pallodaegudsr", log: "224441610152" });
  assert.deepEqual(postOf("https://m.blog.naver.com/palloulsan/224400000001/"), { id: "palloulsan", log: "224400000001" });
  assert.deepEqual(postOf("https://blog.naver.com/PostView.naver?blogId=pallodsrjpch&logNo=2244&redirect=Dlog"), { id: "pallodsrjpch", log: "2244" });
  assert.equal(postOf("https://blog.naver.com/pallodaegudsr"), null);
  assert.equal(postOf("https://blog.naver.com/PostView.naver?blogId=a"), null);
  assert.equal(postOf("https://cafe.naver.com/x/123"), null);
  assert.equal(postOf("https://evil.com/blog.naver.com/a/1"), null);
  assert.equal(postOf("https://search.naver.com/p/crd/rd?u=https%3A%2F%2Fblog.naver.com%2Fa%2F1"), null);
  assert.equal(postOf("주소아님"), null);
});
test("postsOf: 화면 순서 유지, 같은 글(모바일·PostView 주소 포함) 중복 제거", () => {
  const ps = postsOf([post("a", 1), "https://m.blog.naver.com/a/1", post("b", 2), "https://blog.naver.com/PostView.naver?blogId=b&logNo=2", "https://cafe.naver.com/x/9", post("a", 3)]);
  assert.deepEqual(ps.map((p) => `${p.id}/${p.log}`), ["a/1", "b/2", "a/3"]);
  assert.deepEqual(postsOf(undefined), []);
});

// ── 우리 글 ──
test("targetOf: 지점 기본 블로그 / target_url 이 글이면 그 글만 / 블로그 주소면 그 블로그 / 못 읽으면 기본", () => {
  assert.deepEqual(targetOf("dsr", null), { ids: ["pallodaegudsr"], log: null });
  assert.deepEqual(targetOf("dsr", "https://blog.naver.com/pallodaegudsr/224429769347"), { ids: ["pallodaegudsr"], log: "224429769347" });
  assert.deepEqual(targetOf("gumi", "https://blog.naver.com/PalloGumi/"), { ids: ["pallogumi"], log: null });
  assert.deepEqual(targetOf("ulsan", "아무 글"), { ids: ["palloulsan"], log: null });
  assert.deepEqual(targetOf("gumi", ""), { ids: [], log: null });
  assert.deepEqual(Object.keys(BLOGS), ["dsr", "jpcn", "ulsan", "gumi"]);
});
test("rankOf: 우리 글 중 가장 위 자리(1부터), depth 를 넘으면 밖, 특정 글만 볼 때는 그 글", () => {
  const ps = postsOf([post("x", 1), post("pallodaegudsr", 10), post("y", 2), post("pallodaegudsr", 11)]);
  assert.deepEqual(rankOf(ps, { ids: ["pallodaegudsr"], log: null }), { rank: 2, url: post("pallodaegudsr", 10) });
  assert.deepEqual(rankOf(ps, { ids: ["pallodaegudsr"], log: "11" }), { rank: 4, url: post("pallodaegudsr", 11) });
  assert.deepEqual(rankOf(ps, { ids: ["pallodaegudsr"], log: null }, 1), { rank: null, url: null });
  assert.deepEqual(rankOf(ps, { ids: [], log: null }), { rank: null, url: null });
});

// ── 행 ──
const KW = { keyword: "동성로영어회화", target_url: null };
test("keywordRow: 두 화면 다 읽음 → ok, rank·tab_rank·our_url(통합 우선)·top_url(탭 1위)", () => {
  const r = keywordRow("dsr", KW, { all: ok(post("z", 1), post("pallodaegudsr", 7)), tab: ok(post("t", 9), post("pallodaegudsr", 8)) });
  assert.deepEqual(r, { team_key: "dsr", unit: "동성로영어회화", status: "ok", metrics: { rank: 2, tab_rank: 2, top_url: post("t", 9), our_url: post("pallodaegudsr", 7) } });
});
test("keywordRow: 어디에도 없으면 rank·tab_rank 는 null(밖) — 키는 남긴다, our_url 없음", () => {
  const r = keywordRow("ulsan", { keyword: "울산영어회화" }, { all: ok(post("a", 1)), tab: ok() });
  assert.deepEqual(r.metrics, { rank: null, tab_rank: null });
  assert.equal(r.status, "ok");
});
test("keywordRow: 블로그 탭은 30위까지만", () => {
  const many = Array.from({ length: 30 }, (_, i) => post("o", i + 1)).concat(post("palloulsan", 99));
  assert.equal(keywordRow("ulsan", { keyword: "k" }, { all: ok(), tab: ok(...many) }).metrics.tab_rank, null);
  assert.equal(keywordRow("ulsan", { keyword: "k" }, { all: ok(), tab: ok(...many.slice(1)) }).metrics.tab_rank, 30);
});
test("keywordRow: 한쪽만 못 읽으면 그 키를 빼고(null 아님) partial + note, 둘 다 못 읽으면 failed", () => {
  const p = keywordRow("dsr", KW, { all: { error: "통합검색 시간 초과" }, tab: ok(post("pallodaegudsr", 1)) });
  assert.equal(p.status, "partial");
  assert.equal(Object.hasOwn(p.metrics, "rank"), false);
  assert.equal(p.metrics.tab_rank, 1);
  assert.equal(p.metrics.note, "통합검색 못 읽음 — 통합검색 시간 초과");
  const f = keywordRow("dsr", KW, { all: { error: "통합검색 화면이 아니에요" }, tab: { error: "블로그 탭 화면이 아니에요" } });
  assert.deepEqual(f, { team_key: "dsr", unit: "동성로영어회화", metrics: { note: "통합검색 화면이 아니에요" }, status: "failed" });
});
test("teamAllRow: 추적 키워드 수·통합검색에 걸린 수·탭 30위 안 수, 일부 실패면 partial, 전부 실패면 failed", () => {
  const a = keywordRow("dsr", { keyword: "a" }, { all: ok(post("pallodaegudsr", 1)), tab: ok(post("pallodaegudsr", 1)) });
  const b = keywordRow("dsr", { keyword: "b" }, { all: ok(), tab: ok(post("pallodaegudsr", 2)) });
  const c = keywordRow("dsr", { keyword: "c" }, { all: { error: "e" }, tab: { error: "e" } });
  assert.deepEqual(teamAllRow("dsr", [a, b]), { team_key: "dsr", unit: "전체", metrics: { kw_tracked: 2, kw_top: 1, kw_tab: 2 }, status: "ok" });
  assert.deepEqual(teamAllRow("dsr", [a, b, c]), { team_key: "dsr", unit: "전체", metrics: { kw_tracked: 3, kw_top: 1, kw_tab: 2 }, status: "partial" });
  assert.deepEqual(teamAllRow("dsr", [c]), { team_key: "dsr", unit: "전체", metrics: { note: "e" }, status: "failed" });
  // 통합검색을 하나도 못 읽었으면 kw_top 을 0 으로 만들지 않는다
  const t = keywordRow("dsr", { keyword: "t" }, { all: { error: "e" }, tab: ok() });
  assert.deepEqual(teamAllRow("dsr", [t]).metrics, { kw_tracked: 1, kw_tab: 0 });
});
test("blogInput: 지점별 키워드 행 + '전체' 행, 블로그 없는 지점(구미)은 건너뜀, 결과 없는 키워드는 missingNote 로 failed", () => {
  const kws = [{ team_key: "dsr", keyword: "a" }, { team_key: "gumi", keyword: "구미영어학원" }, { team_key: "ulsan", keyword: "u" }];
  const res = new Map([["dsr|a", { all: ok(post("pallodaegudsr", 1)), tab: ok() }]]);
  const { input, skipped } = blogInput(kws, res, "차단");
  assert.deepEqual(skipped, ["gumi"]);
  assert.deepEqual(input.rows.map((r) => [r.team_key, r.unit, r.status]), [["dsr", "a", "ok"], ["dsr", "전체", "ok"], ["ulsan", "u", "failed"], ["ulsan", "전체", "failed"]]);
  assert.equal(input.rows[2].metrics.note, "차단");
  // 구미도 target_url 이 있으면 본다
  assert.deepEqual(blogInput([{ team_key: "gumi", keyword: "g", target_url: "https://blog.naver.com/pallogumi" }], new Map()).skipped, []);
});
test("blogInput 결과는 rows.mjs 검증을 통과한다 (tab_rank·kw_* 키 허용, 지점 필수)", () => {
  const { input } = blogInput([{ team_key: "dsr", keyword: "동성로영어회화" }, { team_key: "jpcn", keyword: "대구일본어학원" }],
    new Map([["dsr|동성로영어회화", { all: ok(post("pallodaegudsr", 1)), tab: ok(post("x", 1), post("pallodaegudsr", 2)) }], ["jpcn|대구일본어학원", { all: { error: "e" }, tab: ok() }]]));
  const rows = toRowsPure("blog", "2026-10-30", input, TEAMS);
  assert.deepEqual(rows.map((r) => [r.team_id, r.unit, r.status]), [[2, "동성로영어회화", "ok"], [2, "전체", "ok"], [4, "대구일본어학원", "partial"], [4, "전체", "partial"]]);
  assert.deepEqual(rows[1].metrics, { kw_tracked: 1, kw_top: 1, kw_tab: 1 });
});
test("blogOutput: 지점별 [키워드, 통합, 탭]·실패 수, 실패·일부만 있으면 ok:false", () => {
  const { input, skipped } = blogInput([{ team_key: "dsr", keyword: "a" }, { team_key: "dsr", keyword: "b" }], new Map([["dsr|a", { all: ok(post("pallodaegudsr", 1)), tab: ok() }]]));
  const out = blogOutput("2026-10-30", input, skipped, 3);
  assert.deepEqual(out, { ok: false, date: "2026-10-30", saved: 3, skipped: [], teams: { dsr: { ranks: [["a", 1, null]], failed: 1, partial: 0, tracked: 2, top: 1, tab: 0 } } });
  assert.equal(blogOutput("2026-10-30", blogInput([{ team_key: "dsr", keyword: "a" }], new Map([["dsr|a", { all: ok(), tab: ok() }]])).input, []).printed, true);
});

// ── 화면 계산(mkd-core) ──
const row = (date, unit, metrics, status = "ok", team_id = 2) => ({ team_id, date, channel: "blog", unit, metrics, status });
test("buildTable: 블로그 합계 줄은 키워드 수(전체 행), 순위는 키워드 줄에만 — 통합·탭 둘 다", () => {
  const rows = [row("2026-10-30", "전체", { kw_tracked: 8, kw_top: 1, kw_tab: 3 }), row("2026-10-30", "동성로영어회화", { rank: 6, tab_rank: 4 }), row("2026-10-30", "대구영어회화", { rank: null, tab_rank: 21 })];
  const b = D.buildTable(rows, "2026-10-30").find((c) => c.channel === "blog");
  assert.deepEqual(b.metrics.map((m) => m.metric), ["kw_tracked", "kw_top", "kw_tab"]);
  assert.deepEqual(b.units.map((u) => [u.unit, u.metrics.map((m) => m.metric)]), [["대구영어회화", ["tab_rank"]], ["동성로영어회화", ["rank", "tab_rank"]]]);
  assert.equal(b.metrics[1].label, "통합검색에 걸린 키워드");
});
test("kw_* 는 기간의 마지막 값, 지점끼리는 더한다", () => {
  const rows = [row("2026-10-29", "전체", { kw_top: 1 }), row("2026-10-30", "전체", { kw_top: 2 }), row("2026-10-30", "전체", { kw_top: 3 }, "ok", 3)];
  assert.equal(D.cell(D.totalRows(rows), "kw_top", "2026-10-30", 7).value, 5);
});
test("flags 순위 하락: 오늘 통합검색을 못 읽은 partial(rank 키 없음)은 '빠졌어요'로 보지 않는다", () => {
  const kw = "동성로영어회화";
  assert.deepEqual(D.flags([row("2026-10-29", kw, { rank: 4 }), row("2026-10-30", kw, { tab_rank: 5 }, "partial")], "2026-10-30").map((f) => f.code), []);
  assert.deepEqual(D.flags([row("2026-10-29", kw, { rank: 4 }), row("2026-10-30", kw, { rank: null, tab_rank: 5 })], "2026-10-30").map((f) => f.code), ["rank_drop"]);
});
