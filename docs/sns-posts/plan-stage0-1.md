# 📸 게시물 탭 0~1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팔로플래너에 "게시물" 탭을 만들어, 사진 1~10장 + 주제 한 줄로 인스타·구글·네이버·당근 문구를 AI가 한 번에 쓰고, 매니저가 채널별로 점검 → 복사·사진 받기 → [올렸어요]까지 하게 한다 (네 채널 모두 수동, 자동 게시는 2단계부터).

**Architecture:** 채널 규칙·점검·상태 표시는 `sns-core.js`(브라우저·Node 겸용 순수 함수, `node:test`로 검증). 사진 처리(자르기·모자이크·얼굴 찾기·편집 창·복사·번호대로 받기)는 블로그에서 `photo.js`로 빼서 두 탭이 같이 쓴다. 화면은 `post.js`(`window.PS`). AI는 기존 Edge Function `blog-write` 에 `sns` action 을 더한다. 데이터는 새 마이그레이션의 `sns_posts`·`sns_jobs`·`sns_accounts` + 공개 버킷 `sns`.

**Tech Stack:** 정적 HTML + 바닐라 JS(빌드 없음, GitHub Pages), Supabase(Postgres + RLS + Storage + Edge Function/Deno), Claude API(`claude-opus-5-5`, 구조화 출력), Node 22 `node:test`, 로컬 Supabase(`~/.cache/pallo-planner-dev`).

## Global Constraints

- 설계 문서: `docs/sns-posts/README.md`. 결정을 다시 묻지 않는다.
- 작업 폴더: `~/pallo-planner-sns` (브랜치 `feat/sns-posts`, main `0ea9224` 에서 분기). `~/pallo-planner`(main) 은 건드리지 않는다.
- **이번 범위 = 0~1단계.** 네 채널 모두 `method='manual'`. `sns-publish` 함수, pg_cron, 설정 탭(계정 연결), 실시간 구독, 블로그→게시물 보내기, 7일 뒤 사진 정리는 만들지 않는다 (2~4단계).
- 사진 게시물만: 1~10장. 릴스·영상 없음.
- **구 브랜드 "컬컴/CULCOM" 언급 금지** (프롬프트·점검기 모두). 사실 지어내지 않기 → `[확인 필요: …]`.
- 권한: 매니저 = 자기 지점만, 대표(role=admin) = 전 지점. `blog_my_team()` / `blog_is_admin()` 재사용.
- AI 하루 제한은 블로그와 **합산**(`blog-write` 의 `AI_KINDS` 에 `sns`), 기록은 `blog_gens` kind=`sns`.
- 어투 옵션은 2개만: `friendly`(친근 ~해요) / `polite`(정중 ~합니다).
- 코드 스타일은 `blog.js` 를 따른다: IIFE, index.html 전역(`sb`·`me`·`esc`·`toast`·`fail`·`isBoss`·`previewTeam`·`teams`), 한국어 주석·문구.
- 캐시 버스터: 새 파일의 `?v=` 는 지금 값 `202610242009` 그대로 쓴다. 버전 올리기는 배포 때(사용자 승인 후)만.
- **운영 배포·운영 DB·`supabase secrets` 변경은 하지 않는다.** 로컬에서만 확인.
- 비밀값은 채팅·커밋에 넣지 않는다. 로컬 AI 키는 `~/.cache/pallo-planner-dev/.env.functions` 에 이미 있다(값을 출력하지 말 것).
- 커밋 메시지는 `📸 게시물: …` 형식, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## 로컬 환경 메모 (구현 전에 읽기)

- 로컬 Supabase 는 `~/.cache/pallo-planner-dev` 에서 떠 있다 (`supabase status --workdir ~/.cache/pallo-planner-dev`).
- Edge Function 은 그 폴더에서 `supabase functions serve --env-file .env.functions` 가 띄운다. `supabase/functions` 는 **`~/pallo-planner/supabase/functions` 를 가리키는 심볼릭 링크**라서, 이번 작업 동안 worktree 로 돌렸다가 끝에 되돌린다 (Task 4, Task 7).
- 마이그레이션 적용은 데이터를 지우지 않게 DB 컨테이너의 psql 로 한다: `docker exec -i supabase_db_pallo-planner-dev psql -U postgres -d postgres -v ON_ERROR_STOP=1 < <파일>`. (`supabase db query --local -f` 는 여러 문장을 못 돌린다.) 나중 `db reset` 에도 들어가게 같은 파일을 `~/.cache/pallo-planner-dev/supabase/migrations/` 에 복사한다.
- 테스트 계정: `~/.cache/pallo-planner-dev/dev-accounts.txt` (boss@pallo.test = 대표, manager@pallo.test = 대구동성로점 team 1). 비밀번호를 출력하지 말 것.
- 맥미니 예약 작업 `pallo-blog-feedback` 이 30분마다 `test-blog.sh` 를 돌릴 수 있다. 함수 심볼릭 링크를 worktree 로 돌려도 worktree 의 `blog-write` 는 기존 action 을 그대로 갖고 있으므로 그 점검은 계속 통과해야 한다.

## File Structure

| 파일 | 역할 |
|---|---|
| `sns-core.js` | 순수 로직: 채널 목록·제한, 해시태그, 복사용 문구, 채널별 점검, AI 응답 정리, 작업 행, 상태 뱃지. 브라우저 `window.SNSCORE`, Node `require` |
| `tests/sns-core.test.mjs` | sns-core 단위 테스트 |
| `photo.js` / `photo.css` | 사진 공용 (블로그 → 분리): 읽기·자르기(4:5 추가)·모자이크·얼굴 찾기·편집 창·복사·번호대로 받기. `window.PHOTO` |
| `tests/photo.test.mjs` | `PHOTO.cropRect` 단위 테스트 |
| `blog.js` / `blog.css` | 사진 코드 제거하고 PHOTO 사용, 사용량 표에 게시물 포함 |
| `supabase/migrations/20261025150000_sns.sql` | sns_accounts · sns_posts · sns_jobs + 상태 지킴 트리거 + RLS + `sns` 버킷 |
| `supabase/functions/blog-write/prompt.ts` | `SNS_SYSTEM` · `SNS_TONES` · `SNS_SCHEMA` 추가 |
| `supabase/functions/blog-write/index.ts` | `sns` action, `similar` 의 네이버 소식 모드, `profileLines` 공용화, `AI_KINDS` |
| `post.js` / `post.css` | 게시물 탭 화면: 만들기 · 목록 |
| `index.html` · `sw.js` | 탭 버튼·section·css/script 연결, 오프라인 캐시 목록 |
| `docs/sns-posts/README.md` | 파일 표·남은 일 갱신 |
| `~/.cache/pallo-planner-dev/test-sns.sh` | 로컬 RLS·함수 점검 (저장소 밖, test-blog.sh 방식) |
| `/Volumes/wonpaper308/.claude/launch.json` | 미리보기 설정 `planner-sns`(8767) 추가 |

---

### Task 1: sns-core — 채널 규칙·점검·상태 (순수 함수)

**Files:**
- Create: `sns-core.js`
- Test: `tests/sns-core.test.mjs`

**Interfaces:**
- Produces (`window.SNSCORE` / `require("../sns-core.js")`):
  - `CHANNELS: {key, label, auto, open}[]` — key 순서 `instagram, google, naver, daangn`
  - `LIMITS`, `BANNED: string[]`, `GOOGLE_TYPES: {standard, event, offer}`, `GOOGLE_BUTTONS: {none, call, book, learn_more}`
  - `parseTags(text: string) → string[]` (`#` 없음, 중복 제거, 순서 유지)
  - `tagLine(tags: string[]) → "#a #b"`
  - `normalizeChannels(o) → {instagram:{caption,hashtags}, google:{body,type,button}, naver:{title,body}, daangn:{title,body}}`
  - `normalizeAi(out) → {draft, self_review, channels}`
  - `channelText(key, ch) → string` (복사할 글 전체)
  - `checkChannel(key, ch, {photos, unfaced}) → {lv: "ok"|"warn"|"bad"|"info", txt}[]`
  - `jobRows({id, team_id}, keys) → {post_id, team_id, channel, method:"manual", status:"waiting_copy"}[]`
  - `fmtKst(iso) → "MM/DD HH:mm"` (한국 시간)
  - `badge(job) → {cls: ""|"pub"|"bad", text}`
  - `titleOf(post) → string` (topic, 없으면 draft 첫 줄, 40자 넘으면 자름)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/sns-core.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const C = createRequire(import.meta.url)("../sns-core.js");

const tags = (n) => Array.from({ length: n }, (_, i) => `태그${i + 1}`);
const lv = (L, re) => L.find((x) => re.test(x.txt))?.lv;

test("CHANNELS: 네 채널 순서, 1단계는 전부 수동", () => {
  assert.deepEqual(C.CHANNELS.map((c) => c.key), ["instagram", "google", "naver", "daangn"]);
  assert.ok(C.CHANNELS.every((c) => c.auto === false && /^https:\/\//.test(c.open)));
});

test("parseTags: # 떼기·쉼표·중복 제거", () => {
  assert.deepEqual(C.parseTags("#대구영어 ##동성로, 대구영어\n#팔로"), ["대구영어", "동성로", "팔로"]);
  assert.deepEqual(C.parseTags(""), []);
});

test("tagLine: # 붙여 한 줄", () => {
  assert.equal(C.tagLine(["대구영어", "#팔로"]), "#대구영어 #팔로");
  assert.equal(C.tagLine([]), "");
});

test("normalizeChannels: 빠진 값 채우고 모르는 구글 종류·버튼은 기본값", () => {
  const n = C.normalizeChannels({ instagram: { caption: "a", hashtags: ["#x", "y"] }, google: { body: "b", type: "toString", button: "zzz" } });
  assert.deepEqual(n, {
    instagram: { caption: "a", hashtags: ["x", "y"] },
    google: { body: "b", type: "standard", button: "none" },
    naver: { title: "", body: "" },
    daangn: { title: "", body: "" },
  });
  assert.equal(C.normalizeChannels({ instagram: { hashtags: "문자열" } }).instagram.hashtags.length, 0);
});

test("normalizeAi: draft·self_review·channels", () => {
  const r = C.normalizeAi({ draft: "원고", self_review: "점검", google: { body: "g", type: "event", button: "call" } });
  assert.equal(r.draft, "원고"); assert.equal(r.self_review, "점검");
  assert.deepEqual(r.channels.google, { body: "g", type: "event", button: "call" });
});

test("channelText: 채널별 복사 글", () => {
  assert.equal(C.channelText("instagram", { caption: "훅\n본문 ", hashtags: ["a", "b"] }), "훅\n본문\n\n#a #b");
  assert.equal(C.channelText("instagram", { caption: "훅", hashtags: [] }), "훅");
  assert.equal(C.channelText("google", { body: " 구글 본문 " }), "구글 본문");
  assert.equal(C.channelText("naver", { title: "제목", body: "본문" }), "제목\n\n본문");
  assert.equal(C.channelText("daangn", { title: "", body: "본문" }), "본문");
});

test("checkChannel 인스타: 정상 캐러셀", () => {
  const L = C.checkChannel("instagram", { caption: "훅\n본문", hashtags: tags(16) }, { photos: 3, unfaced: 0 });
  assert.ok(L.every((x) => x.lv === "ok"), JSON.stringify(L));
  assert.equal(lv(L, /사진 3장 \(캐러셀\)/), "ok");
});

test("checkChannel 인스타: 사진 없음·해시태그 31개는 막힘", () => {
  const L = C.checkChannel("instagram", { caption: "x", hashtags: tags(31) }, { photos: 0, unfaced: 0 });
  assert.equal(lv(L, /1장 이상/), "bad");
  assert.equal(lv(L, /해시태그 31개/), "bad");
});

test("checkChannel 인스타: 해시태그 10개는 경고, 11장은 막힘", () => {
  const L = C.checkChannel("instagram", { caption: "x", hashtags: tags(10) }, { photos: 11, unfaced: 2 });
  assert.equal(lv(L, /해시태그 10개/), "warn");
  assert.equal(lv(L, /10장까지/), "bad");
  assert.equal(lv(L, /얼굴 확인 안 한 사진 2장/), "warn");
});

test("checkChannel: 컬컴·[확인 필요]는 막힘, 과장 표현은 경고", () => {
  assert.equal(C.checkChannel("naver", { title: "소식", body: "컬컴 시절부터" }, {})[0].lv, "bad");
  assert.equal(C.checkChannel("daangn", { title: "소식", body: "최고의 수업" }, {})[0].lv, "warn");
  assert.equal(lv(C.checkChannel("daangn", { title: "t", body: "[확인 필요: 시간] 시작" }, {}), /\[확인 필요\] 1곳/), "bad");
});

test("checkChannel 구글: 1,500자 넘으면 막힘, 사진 여러 장은 안내", () => {
  const L = C.checkChannel("google", { body: "가".repeat(1600), type: "standard", button: "none" }, { photos: 3 });
  assert.equal(lv(L, /본문 1,600자/), "bad");
  assert.equal(lv(L, /첫 번째 사진 1장만/), "info");
});

test("checkChannel 네이버: 제목 25자는 경고, 빈 제목도 경고", () => {
  assert.equal(lv(C.checkChannel("naver", { title: "가".repeat(25), body: "b" }, {}), /제목 25자/), "warn");
  assert.equal(lv(C.checkChannel("naver", { title: "", body: "b" }, {}), /제목이 비어/), "warn");
  assert.equal(lv(C.checkChannel("naver", { title: "11월 토요반 모집", body: "b" }, {}), /제목 10자/), "ok");
});

test("jobRows: 고른 채널마다 수동 작업", () => {
  assert.deepEqual(C.jobRows({ id: 7, team_id: 1 }, ["naver", "daangn"]), [
    { post_id: 7, team_id: 1, channel: "naver", method: "manual", status: "waiting_copy" },
    { post_id: 7, team_id: 1, channel: "daangn", method: "manual", status: "waiting_copy" },
  ]);
});

test("fmtKst: UTC → 한국 시간", () => {
  assert.equal(C.fmtKst("2026-10-27T10:00:00Z"), "10/27 19:00");
  assert.equal(C.fmtKst("2026-12-31T15:30:00Z"), "01/01 00:30");
});

test("badge: 상태별 뱃지", () => {
  assert.deepEqual(C.badge({ status: "queued", run_at: "2026-10-27T10:00:00Z" }), { cls: "", text: "예약됨 10/27 19:00" });
  assert.deepEqual(C.badge({ status: "running" }), { cls: "", text: "올리는 중…" });
  assert.deepEqual(C.badge({ status: "posted" }), { cls: "pub", text: "게시됨" });
  assert.deepEqual(C.badge({ status: "failed", error_ko: "토큰 만료" }), { cls: "bad", text: "실패 — 토큰 만료" });
  assert.deepEqual(C.badge({ status: "failed" }), { cls: "bad", text: "실패" });
  assert.deepEqual(C.badge({ status: "waiting_copy" }), { cls: "", text: "복사 대기" });
  assert.deepEqual(C.badge({ status: "done_manual" }), { cls: "pub", text: "올렸어요" });
});

test("titleOf: 주제 → 없으면 원고 첫 줄 → 40자 자르기", () => {
  assert.equal(C.titleOf({ topic: " 토요반 ", draft: "x" }), "토요반");
  assert.equal(C.titleOf({ topic: "", draft: "\n첫 줄입니다\n둘째" }), "첫 줄입니다");
  assert.equal(C.titleOf({ topic: "가".repeat(45) }), "가".repeat(40) + "…");
  assert.equal(C.titleOf({}), "(제목 없음)");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd ~/pallo-planner-sns && node --test tests/sns-core.test.mjs`
Expected: FAIL — `Cannot find module '../sns-core.js'`

- [ ] **Step 3: 구현**

`sns-core.js`:
```js
// 📸 게시물 탭 계산 모음 (브라우저 window.SNSCORE · Node require 겸용). 화면·DB와 무관한 순수 함수만 둔다.
// 채널 규칙은 docs/sns-posts/README.md "채널별 변형 규칙" 표와 맞춘다. 네이버·당근 제한은 실제 화면에서 확인되면 LIMITS 에 추가.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.SNSCORE = api;
})(typeof self !== "undefined" ? self : globalThis, function () {

// 1단계는 넷 다 수동(복사·사진 받기). 2단계에서 instagram, 3단계에서 google 의 auto 를 true 로 바꾼다.
const CHANNELS = [
  { key: "instagram", label: "📸 인스타", auto: false, open: "https://www.instagram.com/" },
  { key: "google", label: "🔎 구글", auto: false, open: "https://business.google.com/" },
  { key: "naver", label: "🟢 네이버", auto: false, open: "https://new.smartplace.naver.com/" },
  { key: "daangn", label: "🥕 당근", auto: false, open: "https://business.daangn.com/" },
];
const LIMITS = {
  instagram: { body: 2200, tagsMin: 15, tagsMax: 20, tagsHard: 30, photosMax: 10 },
  google: { body: 1500 },
  naver: { title: 20 },
  daangn: {},
};
const BANNED = ["컬컴", "CULCOM", "culcom", "100%", "무조건", "보장", "1등", "1위", "최고", "최저가", "완벽"];
const GOOGLE_TYPES = { standard: "일반 소식", event: "이벤트", offer: "혜택" };
const GOOGLE_BUTTONS = { none: "버튼 없음", call: "전화", book: "예약", learn_more: "자세히 알아보기" };

const s = (v) => String(v ?? "");
const len = (v) => [...s(v)].length;
const has = (o, k) => typeof k === "string" && Object.hasOwn(o, k);

function parseTags(text) {
  return [...new Set(s(text).split(/[\s,]+/).map((t) => t.replace(/^#+/, "")).filter(Boolean))];
}
const tagLine = (tags) => parseTags((Array.isArray(tags) ? tags : []).join(" ")).map((t) => "#" + t).join(" ");

function normalizeChannels(o = {}) {
  const ig = o.instagram ?? {}, g = o.google ?? {}, n = o.naver ?? {}, d = o.daangn ?? {};
  return {
    instagram: { caption: s(ig.caption), hashtags: parseTags((Array.isArray(ig.hashtags) ? ig.hashtags : []).join(" ")) },
    google: { body: s(g.body), type: has(GOOGLE_TYPES, g.type) ? g.type : "standard", button: has(GOOGLE_BUTTONS, g.button) ? g.button : "none" },
    naver: { title: s(n.title), body: s(n.body) },
    daangn: { title: s(d.title), body: s(d.body) },
  };
}
const normalizeAi = (out = {}) => ({ draft: s(out.draft), self_review: s(out.self_review), channels: normalizeChannels(out) });

function channelText(key, ch = {}) {
  if (key === "instagram") return [s(ch.caption).trim(), tagLine(ch.hashtags)].filter(Boolean).join("\n\n");
  if (key === "google") return s(ch.body).trim();
  return [s(ch.title).trim(), s(ch.body).trim()].filter(Boolean).join("\n\n");
}

function checkChannel(key, ch = {}, { photos = 0, unfaced = 0 } = {}) {
  const L = [], add = (lv, txt) => L.push({ lv, txt }), text = channelText(key, ch), lim = LIMITS[key] ?? {};
  const hits = BANNED.filter((w) => text.includes(w));
  add(hits.some((h) => /컬컴|culcom/i.test(h)) ? "bad" : hits.length ? "warn" : "ok", hits.length ? `과장·금지 표현: ${hits.join(", ")}` : "과장·금지 표현 없음");
  const todo = text.split("[확인 필요").length - 1;
  add(todo ? "bad" : "ok", todo ? `[확인 필요] ${todo}곳 — 채우거나 지우고 올리세요` : "[확인 필요] 없음");
  if (key === "instagram") {
    const n = len(text), t = (ch.hashtags ?? []).length;
    add(n <= lim.body ? "ok" : "bad", `캡션 ${n.toLocaleString()}자 (해시태그 포함 ${lim.body.toLocaleString()}자까지)`);
    add(t > lim.tagsHard ? "bad" : t >= lim.tagsMin && t <= lim.tagsMax ? "ok" : "warn", `해시태그 ${t}개 (15~20개 권장, 30개 넘으면 안 올라가요)`);
    add(photos < 1 || photos > lim.photosMax ? "bad" : "ok",
      photos < 1 ? "인스타는 사진이 1장 이상 있어야 해요" : photos > lim.photosMax ? `사진 ${photos}장 — 인스타는 10장까지` : `사진 ${photos}장${photos > 1 ? " (캐러셀)" : ""}`);
  } else if (key === "google") {
    const n = len(text);
    add(n <= lim.body ? "ok" : "bad", `본문 ${n.toLocaleString()}자 (${lim.body.toLocaleString()}자까지)`);
    if (photos > 1) add("info", "구글 소식은 첫 번째 사진 1장만 올라가요");
  } else if (key === "naver") {
    const n = len(ch.title);
    add(n && n <= lim.title ? "ok" : "warn", n ? `제목 ${n}자 (${lim.title}자 안팎 권장)` : "제목이 비어 있어요");
  } else if (key === "daangn") {
    const n = len(ch.title);
    add(n ? "ok" : "warn", n ? `제목 ${n}자` : "제목이 비어 있어요");
  }
  if (photos && unfaced) add("warn", `얼굴 확인 안 한 사진 ${unfaced}장 — 🙂 얼굴 자동 모자이크 또는 [편집]`);
  return L;
}

const jobRows = (post, keys) => keys.map((k) => ({ post_id: post.id, team_id: post.team_id, channel: k, method: "manual", status: "waiting_copy" }));

function fmtKst(iso) {
  const t = new Date(Date.parse(iso) + 9 * 3600e3).toISOString();
  return `${t.slice(5, 7)}/${t.slice(8, 10)} ${t.slice(11, 16)}`;
}
function badge(j) {
  switch (j.status) {
    case "queued": return { cls: "", text: `예약됨 ${fmtKst(j.run_at)}` };
    case "running": return { cls: "", text: "올리는 중…" };
    case "posted": return { cls: "pub", text: "게시됨" };
    case "failed": return { cls: "bad", text: j.error_ko ? `실패 — ${j.error_ko}` : "실패" };
    case "done_manual": return { cls: "pub", text: "올렸어요" };
    default: return { cls: "", text: "복사 대기" };
  }
}
function titleOf(p = {}) {
  const t = s(p.topic).trim() || s(p.draft).split("\n").map((x) => x.trim()).find(Boolean) || "(제목 없음)";
  return len(t) > 40 ? [...t].slice(0, 40).join("") + "…" : t;
}

return { CHANNELS, LIMITS, BANNED, GOOGLE_TYPES, GOOGLE_BUTTONS, parseTags, tagLine, normalizeChannels, normalizeAi, channelText, checkChannel, jobRows, fmtKst, badge, titleOf };
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd ~/pallo-planner-sns && node --test tests/sns-core.test.mjs`
Expected: `# pass 16` · `# fail 0`

- [ ] **Step 5: 커밋**

```bash
cd ~/pallo-planner-sns && git add sns-core.js tests/sns-core.test.mjs && git commit -m "📸 게시물: 채널 규칙·점검·상태 뱃지 (sns-core)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 데이터 — 마이그레이션 + 로컬 RLS 점검

**Files:**
- Create: `supabase/migrations/20261025150000_sns.sql`
- Create (저장소 밖): `~/.cache/pallo-planner-dev/test-sns.sh`

**Interfaces:**
- Consumes: `blog_my_team()`, `blog_is_admin()` (블로그 마이그레이션), `teams(id)`
- Produces:
  - `sns_posts(id, team_id, user_id, topic, tone, draft, photos jsonb [{path,w,h}], channels jsonb, source, created_at, updated_at)`
  - `sns_jobs(id, post_id, team_id, channel, method, run_at, status, result_url, external_id, error, error_ko, tries, next_try_at, done_at, created_at)` — `unique(post_id, channel)`
  - `sns_accounts(team_id, channel, external_id, display, status, checked_at)` — 2단계 설정 탭용, 이번엔 테이블만
  - Storage 버킷 `sns` (공개, JPEG, 10MB) — 경로 `<team_id>/<uuid>.jpg`
  - 사람(매니저·대표)은 `sns_jobs` 에 `method='manual'` 이고 `status in ('waiting_copy','done_manual')` 인 것만 넣고 바꿀 수 있다. 그 외는 `service_role`·`postgres` 만.

- [ ] **Step 1: 점검 스크립트 먼저 작성 (지금은 테이블이 없어 실패해야 함)**

`~/.cache/pallo-planner-dev/test-sns.sh`:
```bash
#!/bin/bash
# 게시물 탭 로컬 점검: 권한(RLS)·상태 지킴 트리거·사진 버킷 (+ AI=1 이면 실제 AI 한 번, 약 100원)
# 사용: bash test-sns.sh   (각 줄 괄호 안 기대값과 비교)
cd "$(dirname "$0")"
API=http://127.0.0.1:54321
PK=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SRK=$(supabase status -o env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"/\1/p')
PW=$(sed -n 's/^password: //p' dev-accounts.txt)
login() { curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $PK" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'; }
code() { curl -s -o /dev/null -w '%{http_code}' "$API/rest/v1/$2" -H "apikey: $PK" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' "${@:3}"; echo; }
body() { curl -s "$API/rest/v1/$2" -H "apikey: $PK" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -H 'Prefer: return=representation' "${@:3}"; echo; }
fn() { curl -s "$API/functions/v1/blog-write" -H "apikey: $PK" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$2"; echo; }
jid() { python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])'; }

M=$(login manager@pallo.test); B=$(login boss@pallo.test)
P=$(body "$M" sns_posts -X POST -d '{"team_id":1,"topic":"점검용 게시물","channels":{"naver":{"title":"t","body":"b"}}}' | jid)
echo "== 매니저: 자기 지점 게시물 만듦 → id $P"
echo -n "== 매니저: 다른 지점(3) 게시물 (403) "; code "$M" sns_posts -X POST -d '{"team_id":3,"topic":"몰래"}'
J=$(body "$M" sns_jobs -X POST -d "{\"post_id\":$P,\"team_id\":1,\"channel\":\"naver\"}" | jid)
echo "== 매니저: 수동 작업 만듦 → id $J"
echo -n "== 매니저: 자동(api) 작업 만들기 (400) "; code "$M" sns_jobs -X POST -d "{\"post_id\":$P,\"team_id\":1,\"channel\":\"instagram\",\"method\":\"api\",\"status\":\"queued\"}"
echo -n "== 매니저: 게시됨으로 위조 (400) "; code "$M" "sns_jobs?id=eq.$J" -X PATCH -d '{"status":"posted"}'
echo -n "== 매니저: 올렸어요 (204) "; code "$M" "sns_jobs?id=eq.$J" -X PATCH -d '{"status":"done_manual"}'
echo "== 매니저: 올린 시각 채워짐 (done_at 값 있음)"; body "$M" "sns_jobs?id=eq.$J&select=status,done_at"
echo -n "== 대표: 지점 다른 작업 (400) "; code "$B" sns_jobs -X POST -d "{\"post_id\":$P,\"team_id\":3,\"channel\":\"daangn\"}"
echo -n "== 서비스 키: 게시됨 (204) "; curl -s -o /dev/null -w '%{http_code}\n' "$API/rest/v1/sns_jobs?id=eq.$J" -X PATCH -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H 'Content-Type: application/json' -d '{"status":"posted","result_url":"https://x"}'
echo "== 매니저: 보이는 게시물 (team_id 1 만)"; body "$M" 'sns_posts?select=team_id,topic'
echo -n "== 매니저: 계정 연결 쓰기 (403) "; code "$M" sns_accounts -X POST -d '{"team_id":1,"channel":"instagram","external_id":"1"}'
echo -n "== 대표: 계정 연결 쓰기 (201) "; code "$B" sns_accounts -X POST -H 'Prefer: resolution=merge-duplicates' -d '{"team_id":1,"channel":"instagram","external_id":"17840000000000000"}'
printf '\xff\xd8\xff\xe0test' > /tmp/sns-test.jpg
up() { curl -s -o /dev/null -w '%{http_code}\n' "$API/storage/v1/object/sns/$2" -H "apikey: $PK" -H "Authorization: Bearer $1" -H 'Content-Type: image/jpeg' -H 'x-upsert: true' --data-binary @/tmp/sns-test.jpg; }
echo -n "== 매니저: 사진 자기 지점 폴더 (200) "; up "$M" "1/test-$P.jpg"
echo -n "== 매니저: 사진 다른 지점 폴더 (400 또는 403) "; up "$M" "3/test-$P.jpg"
echo -n "== 누구나: 공개 주소로 읽기 (200) "; curl -s -o /dev/null -w '%{http_code}\n' "$API/storage/v1/object/public/sns/1/test-$P.jpg"
echo -n "== 매니저: 게시물 지우기 → 작업도 같이 (204) "; code "$M" "sns_posts?id=eq.$P" -X DELETE
echo "== 지운 게시물의 작업 (빈 목록 [])"; body "$B" "sns_jobs?post_id=eq.$P&select=id"
```

Run: `chmod +x ~/.cache/pallo-planner-dev/test-sns.sh && bash ~/.cache/pallo-planner-dev/test-sns.sh 2>&1 | head -5`
Expected: 첫 줄부터 `KeyError`/`404` 류 오류 (sns_posts 없음)

- [ ] **Step 2: 마이그레이션 작성**

`supabase/migrations/20261025150000_sns.sql`:
```sql
-- 📸 게시물 탭: 채널 계정 연결 · 게시물 · 채널별 게시 작업 + 공개 사진 버킷 (설계: docs/sns-posts/README.md)
-- 권한은 블로그와 같음: 매니저 = 자기 지점, 대표(role=admin) = 전부 (blog_my_team / blog_is_admin 재사용).
-- 토큰·키는 여기 두지 않는다 (Supabase secrets).

-- 지점 × 자동 게시 채널 연결 (2단계 설정 탭에서 대표가 채움)
create table if not exists public.sns_accounts (
  team_id bigint not null references public.teams(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'google')),
  external_id text not null,               -- 인스타 비즈니스 계정 ID / 구글 accounts/…/locations/…
  display text not null default '',
  status text not null default 'unknown' check (status in ('ok', 'token', 'perm', 'unknown')),
  checked_at timestamptz,
  primary key (team_id, channel)
);

-- 게시물 1건 (사진 + 채널별 문구)
create table if not exists public.sns_posts (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  topic text not null default '',
  tone text not null default 'friendly',
  draft text not null default '',           -- AI 공통 원고
  photos jsonb not null default '[]',       -- [{path, w, h}] 순서 = 게시 순서, path 는 sns 버킷 안 경로
  channels jsonb not null default '{}',     -- {instagram:{caption,hashtags}, google:{body,type,button}, naver:{title,body}, daangn:{title,body}}
  source text not null default 'direct',    -- direct | blog:<id> | marketing:<id>
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sns_posts_team_idx on public.sns_posts (team_id, created_at desc);

-- 게시물 × 채널 작업 (목록의 상태 뱃지는 전부 여기서)
create table if not exists public.sns_jobs (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.sns_posts(id) on delete cascade,
  team_id bigint not null references public.teams(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'google', 'naver', 'daangn')),
  method text not null default 'manual' check (method in ('api', 'manual')),
  run_at timestamptz not null default now(),      -- 예약 시각 (즉시면 지금)
  status text not null default 'waiting_copy'
    check (status in ('queued', 'running', 'posted', 'failed', 'waiting_copy', 'done_manual')),
  result_url text,
  external_id text,
  error text,                                     -- 원문
  error_ko text,                                  -- 매니저에게 보여 줄 한국어 풀이
  tries int not null default 0,
  next_try_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, channel)
);
create index if not exists sns_jobs_due_idx on public.sns_jobs (status, run_at);

-- 상태 지킴: 지점이 게시물과 같아야 하고, 사람은 수동 작업의 '복사 대기 ↔ 올렸어요'만.
-- 자동 게시 상태(queued·running·posted·failed)는 Edge Function(service_role)만 바꾼다.
-- security definer 아님: 게시물 지점 확인도 부른 사람의 RLS 로 읽는다 (남의 지점 게시물이면 안 보여서 막힘).
create or replace function public.sns_jobs_guard() returns trigger language plpgsql as $$
begin
  if new.team_id is distinct from (select team_id from public.sns_posts where id = new.post_id) then
    raise exception '게시물과 작업의 지점이 달라요';
  end if;
  if current_user in ('service_role', 'postgres', 'supabase_admin') then return new; end if;
  if new.method <> 'manual' or new.status not in ('waiting_copy', 'done_manual') then
    raise exception '자동 게시 상태는 서버만 바꿀 수 있어요';
  end if;
  if tg_op = 'UPDATE' and (new.post_id, new.channel, new.method) is distinct from (old.post_id, old.channel, old.method) then
    raise exception '작업 정보는 바꿀 수 없어요';
  end if;
  new.done_at := case when new.status = 'done_manual' then coalesce(new.done_at, now()) else null end;
  return new;
end $$;
drop trigger if exists sns_jobs_guard on public.sns_jobs;
create trigger sns_jobs_guard before insert or update on public.sns_jobs for each row execute function public.sns_jobs_guard();

alter table public.sns_accounts enable row level security;
alter table public.sns_posts enable row level security;
alter table public.sns_jobs enable row level security;

create policy sns_accounts_read on public.sns_accounts for select using (blog_is_admin() or team_id = blog_my_team());
create policy sns_accounts_admin on public.sns_accounts for all using (blog_is_admin()) with check (blog_is_admin());

create policy sns_posts_rw on public.sns_posts for all
  using (blog_is_admin() or team_id = blog_my_team())
  with check (blog_is_admin() or team_id = blog_my_team());

create policy sns_jobs_read on public.sns_jobs for select using (blog_is_admin() or team_id = blog_my_team());
create policy sns_jobs_ins on public.sns_jobs for insert with check (blog_is_admin() or team_id = blog_my_team());
create policy sns_jobs_upd on public.sns_jobs for update
  using (blog_is_admin() or team_id = blog_my_team())
  with check (blog_is_admin() or team_id = blog_my_team());
create policy sns_jobs_del on public.sns_jobs for delete
  using ((blog_is_admin() or team_id = blog_my_team()) and method = 'manual');

-- 사진 버킷: 인스타·구글 API가 공개 https 주소로 가져가야 해서 공개. blog-temp 와 같은 패턴(JPEG, 무작위 이름, 자기 지점 폴더만).
-- 모자이크·자르기는 기기 안에서 끝낸 뒤 올리므로 원본 얼굴 사진은 올라오지 않는다. 정리는 4단계(끝난 뒤 7일).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sns', 'sns', true, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy sns_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sns' and (blog_is_admin() or (storage.foldername(name))[1] = blog_my_team()::text));
create policy sns_photo_select on storage.objects for select to authenticated
  using (bucket_id = 'sns' and (blog_is_admin() or (storage.foldername(name))[1] = blog_my_team()::text));
create policy sns_photo_update on storage.objects for update to authenticated
  using (bucket_id = 'sns' and (blog_is_admin() or (storage.foldername(name))[1] = blog_my_team()::text));
create policy sns_photo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sns' and (blog_is_admin() or (storage.foldername(name))[1] = blog_my_team()::text));
```

- [ ] **Step 3: 로컬 DB에 적용 (데이터 유지)**

```bash
cp ~/pallo-planner-sns/supabase/migrations/20261025150000_sns.sql ~/.cache/pallo-planner-dev/supabase/migrations/
docker exec -i supabase_db_pallo-planner-dev psql -U postgres -d postgres -v ON_ERROR_STOP=1 < ~/pallo-planner-sns/supabase/migrations/20261025150000_sns.sql
```
Expected: `NOTICE: trigger "sns_jobs_guard" … does not exist, skipping` 한 줄 외엔 오류 없음. 다시 돌리면 `policy … already exists` 가 나는 게 정상(한 번만 적용). (계획 작성 때 begin…rollback 으로 문법 확인함)

- [ ] **Step 4: 점검 스크립트로 확인**

Run: `bash ~/.cache/pallo-planner-dev/test-sns.sh`
Expected (괄호 안 값과 모두 일치):
- 다른 지점 게시물 `403`, 자동 작업 `400`, 게시됨 위조 `400`, 올렸어요 `204`, `done_at` 에 시각, 대표 지점 다른 작업 `400`, 서비스 키 `204`
- 매니저가 보는 게시물은 `team_id: 1` 만
- 계정 연결: 매니저 `403`, 대표 `201`
- 사진: 자기 폴더 `200`, 남의 폴더 `400` 또는 `403`, 공개 읽기 `200`
- 게시물 지우기 `204`, 그 작업 목록 `[]`

틀린 값이 있으면 마이그레이션을 고치고, 로컬에선 같은 psql 명령으로 해당 정책/함수만 `drop … ; create …` 해서 다시 확인.

- [ ] **Step 5: 커밋**

```bash
cd ~/pallo-planner-sns && git add supabase/migrations/20261025150000_sns.sql && git commit -m "📸 게시물: 테이블 3개·상태 지킴 트리거·RLS·공개 사진 버킷 sns

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: photo.js — 블로그 사진 처리를 공용으로 분리

**Files:**
- Create: `photo.js`, `photo.css`, `tests/photo.test.mjs`
- Modify: `blog.js` (사진 코드 제거 → PHOTO 사용), `blog.css` (편집 창 규칙 이동), `index.html` (photo.css·photo.js 연결), `sw.js`
- Modify: `/Volumes/wonpaper308/.claude/launch.json` (미리보기 `planner-sns`)

**Interfaces:**
- Produces (`window.PHOTO`):
  - `RATIOS` — `{orig, "4:5", "1:1", "4:3", "3:4", "16:9"}`
  - `cropRect(p) → {x,y,w,h}` (p 는 `{img:{naturalWidth,naturalHeight}, edits:{ratio,ox,oy}}`)
  - 사진 객체 모양: `{ id, name, img, note, faced, edits, blob, url, ai, w, h }` — `blob` 편집 반영 JPEG(긴 변 2000px), `url` 그 blob 의 object URL, `ai` 1024px base64(접두어 없음), `w`·`h` blob 크기
  - `fromFiles(files: File[]) → Promise<photo[]>` (이미지 아닌 것·못 읽는 것은 건너뛰고 toast)
  - `fromUrls(urls: string[]) → Promise<(photo|null)[]>` (순서 유지, 실패는 null, `faced: true`)
  - `bake(p) → Promise<void>`, `faceAll(list) → Promise<number>`(찾은 얼굴 수), `setRatio(list, ratio) → Promise<void>`
  - `edit(p, { title, onSave(p) })` — 편집 창 열기 (body 에 붙는 `#phEditDlg`)
  - `copy(text, htmlPromise?) → Promise<boolean>`
  - `share(list: {name, blob}[], zipName) → Promise<void>` (폰은 공유 시트, 아니면 zip)
  - `loadScript(src)`, `pad(n)`

- [ ] **Step 1: 미리보기 설정 추가**

`/Volumes/wonpaper308/.claude/launch.json` 의 `configurations` 배열 끝에 추가:
```json
    {
      "name": "planner-sns",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8767", "--directory", "/Users/ilbon-eojung-gug-eomembeonimdeulkkeo/pallo-planner-sns"],
      "port": 8767
    }
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/photo.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const PH = createRequire(import.meta.url)("../photo.js");
const P = (W, H, ratio, ox = 0.5, oy = 0.5) => ({ img: { naturalWidth: W, naturalHeight: H }, edits: { ratio, ox, oy } });

test("RATIOS: 인스타용 4:5 가 있다", () => assert.equal(PH.RATIOS["4:5"], 0.8));
test("cropRect: 원본은 전체", () => assert.deepEqual(PH.cropRect(P(4000, 3000, "orig")), { x: 0, y: 0, w: 4000, h: 3000 }));
test("cropRect: 가로 사진 4:5 는 가운데 세로로", () => assert.deepEqual(PH.cropRect(P(4000, 3000, "4:5")), { x: 800, y: 0, w: 2400, h: 3000 }));
test("cropRect: 세로 사진 1:1 위쪽 끝", () => assert.deepEqual(PH.cropRect(P(3000, 4000, "1:1", 0.5, 0)), { x: 0, y: 0, w: 3000, h: 3000 }));
test("cropRect: 16:9 는 위아래를 자름", () => assert.deepEqual(PH.cropRect(P(1600, 1600, "16:9")), { x: 0, y: 350, w: 1600, h: 900 }));
```

Run: `cd ~/pallo-planner-sns && node --test tests/photo.test.mjs`
Expected: FAIL — `Cannot find module '../photo.js'`

- [ ] **Step 3: photo.js 작성 (blog.js 코드를 옮기며 이름만 정리)**

`photo.js`:
```js
// 🖼 사진 공용 (블로그·게시물 탭): 읽기 · 자르기·밝기·모자이크 굽기 · 얼굴 자동 찾기 · 편집 창 · 복사 · 번호대로 받기.
// 사진 처리는 이 기기 안에서만 한다 (AI 에는 1024px 사본만). index.html 전역 toast 를 씀 → window.PHOTO
// cropRect 는 Node 테스트(tests/photo.test.mjs)에서도 불러서, 위쪽 코드는 DOM 없이 읽혀야 한다.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.PHOTO = api;
})(typeof self !== "undefined" ? self : globalThis, function () {

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const RATIOS = { orig: 0, "4:5": 4 / 5, "1:1": 1, "4:3": 4 / 3, "3:4": 3 / 4, "16:9": 16 / 9 };
const pad = (n) => String(n).padStart(2, "0");
let seq = 0;

const loadScript = (src) => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const blankEdits = () => ({ ratio: "orig", ox: 0.5, oy: 0.5, bright: 0, contrast: 0, blurs: [] });

// ── 읽기 ──
async function fromBlob(blob, name, faced = false) {
  const img = await loadImg(URL.createObjectURL(blob));
  const p = { id: ++seq, name, img, note: "", faced, edits: blankEdits() };
  await bake(p);
  return p;
}
async function fromFiles(files) {
  const out = [];
  for (const f of files) {
    if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) continue;
    try { out.push(await fromBlob(f, f.name)); } catch { toast(`${f.name}: 이 형식은 못 읽어요 (HEIC면 JPG로 바꿔서 올려 주세요)`); }
  }
  return out;
}
// 저장해 둔 공개 주소 → 사진. 이미 모자이크된 사진이라 faced=true. fetch 로 받아서 캔버스 오염(CORS) 없이 처리
async function fromUrls(urls) {
  const out = [];
  for (const u of urls) {
    try {
      const r = await fetch(u); if (!r.ok) throw new Error(String(r.status));
      out.push(await fromBlob(await r.blob(), u.split("/").pop(), true));
    } catch (e) { console.warn("사진 불러오기 실패", u, e); out.push(null); }
  }
  return out;
}

// ── 자르기·모자이크·밝기 ──
function cropRect(p) {
  const W = p.img.naturalWidth, H = p.img.naturalHeight, r = RATIOS[p.edits.ratio];
  if (!r) return { x: 0, y: 0, w: W, h: H };
  let w = W, h = W / r; if (h > H) { h = H; w = H * r; }
  return { x: (W - w) * p.edits.ox, y: (H - h) * p.edits.oy, w, h };
}
function mosaic(ctx, x, y, w, h) {
  if (w < 2 || h < 2) return;
  const cell = Math.max(6, Math.round(Math.max(w, h) / 9)), t = document.createElement("canvas");
  t.width = Math.max(1, Math.ceil(w / cell)); t.height = Math.max(1, Math.ceil(h / cell));
  t.getContext("2d").drawImage(ctx.canvas, x, y, w, h, 0, 0, t.width, t.height);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, t.width, t.height, x, y, w, h); ctx.restore();
}
function tone(ctx, e) {
  if (!e.bright && !e.contrast) return;
  const { width: w, height: h } = ctx.canvas, d = ctx.getImageData(0, 0, w, h), a = d.data;
  const b = e.bright * 2.2, c = (100 + e.contrast) / 100;
  for (let i = 0; i < a.length; i += 4) for (let k = 0; k < 3; k++) a[i + k] = Math.max(0, Math.min(255, (a[i + k] - 128) * c + 128 + b));
  ctx.putImageData(d, 0, 0);
}
// 편집 반영한 사진 (crop: 자르기 적용 여부)
function draw(p, maxSide, e = p.edits, crop = true) {
  const W = p.img.naturalWidth, H = p.img.naturalHeight, c = crop ? cropRect({ ...p, edits: e }) : { x: 0, y: 0, w: W, h: H };
  const s = Math.min(1, maxSide / Math.max(c.w, c.h)), cv = document.createElement("canvas");
  cv.width = Math.round(c.w * s); cv.height = Math.round(c.h * s);
  const ctx = cv.getContext("2d"); ctx.drawImage(p.img, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  e.blurs.forEach((r) => mosaic(ctx, (r.x - c.x) * s, (r.y - c.y) * s, r.w * s, r.h * s));
  tone(ctx, e);
  return { cv, s, c };
}
async function bake(p) {
  const big = draw(p, 2000).cv;
  p.blob = await new Promise((ok) => big.toBlob(ok, "image/jpeg", 0.9));
  p.w = big.width; p.h = big.height;
  if (p.url) URL.revokeObjectURL(p.url);
  p.url = URL.createObjectURL(p.blob);
  p.ai = draw(p, 1024).cv.toDataURL("image/jpeg", 0.8).split(",")[1];
}
async function setRatio(list, ratio) { for (const p of list) { p.edits.ratio = ratio; await bake(p); } }

// ── 얼굴 찾기: 전체 + 2×2 조각(작은 얼굴용)으로 돌리고 겹치는 건 합침 ──
let detector;
async function faceDetector() {
  if (detector) return detector;
  const v = await import(`${MP}/vision_bundle.mjs`);
  const fs = await v.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  detector = await v.FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: FACE_MODEL }, runningMode: "IMAGE", minDetectionConfidence: 0.35 });
  return detector;
}
async function findFaces(p) {
  const d = await faceDetector(), W = p.img.naturalWidth, H = p.img.naturalHeight, boxes = [];
  const run = (sx, sy, sw, sh) => {
    const k = Math.min(1, 1024 / Math.max(sw, sh)), cv = document.createElement("canvas");
    cv.width = Math.round(sw * k); cv.height = Math.round(sh * k);
    cv.getContext("2d").drawImage(p.img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    for (const det of d.detect(cv).detections) { const b = det.boundingBox; boxes.push({ x: sx + b.originX / k, y: sy + b.originY / k, w: b.width / k, h: b.height / k }); }
  };
  run(0, 0, W, H);
  const tw = W * 0.6, th = H * 0.6;
  for (const fx of [0, 0.4]) for (const fy of [0, 0.4]) run(W * fx, H * fy, tw, th);
  const iou = (a, b) => { const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); return x * y / Math.min(a.w * a.h, b.w * b.h); };
  const keep = [];
  boxes.sort((a, b) => b.w * b.h - a.w * a.h).forEach((b) => { if (!keep.some((k) => iou(k, b) > 0.3)) keep.push(b); });
  return keep.map((b) => ({ x: Math.max(0, b.x - b.w * 0.25), y: Math.max(0, b.y - b.h * 0.35), w: b.w * 1.5, h: b.h * 1.6 }));
}
// 아직 확인 안 한 사진만 돌림. 찾은 얼굴 수를 돌려준다 (불러오기 실패면 throw)
async function faceAll(list) {
  let n = 0;
  for (const p of list.filter((x) => !x.faced)) { const f = await findFaces(p); p.edits.blurs.push(...f); p.faced = true; n += f.length; await bake(p); }
  return n;
}

// ── 편집 창 (처음 열 때 body 에 붙임) ──
const ED = { p: null, e: null, mode: "blur", s: 1, drag: null, onSave: null };
let dlg = null;
const $e = (s) => dlg.querySelector(s);
function editorDom() {
  if (dlg) return;
  dlg = document.createElement("dialog"); dlg.id = "phEditDlg";
  dlg.innerHTML = `<h3 style="margin:0 0 8px">🖼 사진 편집 <small class="mut" id="phEdNo"></small></h3>
    <div class="tb"><span class="mut">비율</span><span class="blseg" id="phEdRatio">${Object.keys(RATIOS).map((r) => `<button type="button" data-ratio="${r}">${r === "orig" ? "원본" : r}</button>`).join("")}</span></div>
    <div class="tb"><span class="blseg" id="phEdMode"><button type="button" data-emode="blur">🟦 모자이크 그리기</button><button type="button" data-emode="pan">✋ 자르기 위치</button></span>
      <button type="button" class="btn ghost small" id="phEdFace">🙂 얼굴 자동 찾기</button><button type="button" class="btn ghost small" id="phEdClear">모자이크 지우기</button>
      <span class="mut">밝기</span><input type="range" id="phEdBright" min="-40" max="40" value="0"><span class="mut">대비</span><input type="range" id="phEdContrast" min="-40" max="40" value="0"></div>
    <div class="cv"><canvas id="phEdCv"></canvas></div>
    <div class="mut" style="margin-top:6px">모자이크: 끌어서 네모 그리기 · 네모를 누르면 지워져요. 학생 얼굴은 동의가 없으면 꼭 가려 주세요.</div>
    <label>사진 메모 (AI에게 알려줄 내용, 선택)</label><input id="phEdNote" placeholder="예) 토요반 프리토킹 시간, 원어민 강사">
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn ghost" id="phEdCancel">취소</button><button type="button" class="btn" id="phEdSave">적용</button></div>`;
  document.body.append(dlg);
  wireEditor();
}
function edit(p, { title = "", onSave } = {}) {
  editorDom();
  ED.p = p; ED.e = structuredClone(p.edits); ED.mode = "blur"; ED.onSave = onSave;
  $e("#phEdNo").textContent = title;
  $e("#phEdBright").value = ED.e.bright; $e("#phEdContrast").value = ED.e.contrast; $e("#phEdNote").value = p.note;
  dlg.showModal(); edDraw();
}
function edDraw() {
  const { p, e } = ED, maxW = Math.min(940, window.innerWidth - 60), maxH = window.innerHeight * 0.55;
  const s = Math.min(maxW / p.img.naturalWidth, maxH / p.img.naturalHeight, 1); ED.s = s;
  const { cv: src } = draw(p, Math.max(p.img.naturalWidth, p.img.naturalHeight) * s, e, false);
  const cv = $e("#phEdCv"); cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d"); ctx.drawImage(src, 0, 0);
  const c = cropRect({ ...p, edits: e }), cx = c.x * s, cy = c.y * s, cw = c.w * s, ch = c.h * s;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(0, 0, cv.width, cy); ctx.fillRect(0, cy + ch, cv.width, cv.height - cy - ch); ctx.fillRect(0, cy, cx, ch); ctx.fillRect(cx + cw, cy, cv.width - cx - cw, ch);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(cx, cy, cw, ch);
  ctx.setLineDash([5, 4]); ctx.strokeStyle = "#ffd400";
  e.blurs.forEach((r) => ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s));
  if (ED.drag?.rect) { const r = ED.drag.rect; ctx.strokeStyle = "#4dabf7"; ctx.strokeRect(r.x * s, r.y * s, r.w * s, r.h * s); }
  ctx.setLineDash([]);
  dlg.querySelectorAll("[data-ratio]").forEach((b) => b.classList.toggle("on", b.dataset.ratio === e.ratio));
  dlg.querySelectorAll("[data-emode]").forEach((b) => b.classList.toggle("on", b.dataset.emode === ED.mode));
}
function edPoint(ev) { const cv = $e("#phEdCv"), r = cv.getBoundingClientRect(), k = cv.width / r.width; return { x: (ev.clientX - r.left) * k / ED.s, y: (ev.clientY - r.top) * k / ED.s }; }
function wireEditor() {
  const cv = $e("#phEdCv");
  cv.onpointerdown = (ev) => { cv.setPointerCapture(ev.pointerId); const pt = edPoint(ev); ED.drag = { start: pt, last: pt, moved: false }; };
  cv.onpointermove = (ev) => {
    const d = ED.drag; if (!d) return; const pt = edPoint(ev);
    if (Math.abs(pt.x - d.start.x) + Math.abs(pt.y - d.start.y) > 6 / ED.s) d.moved = true;
    if (ED.mode === "blur") d.rect = { x: Math.min(d.start.x, pt.x), y: Math.min(d.start.y, pt.y), w: Math.abs(pt.x - d.start.x), h: Math.abs(pt.y - d.start.y) };
    else {
      const c = cropRect({ ...ED.p, edits: ED.e }), W = ED.p.img.naturalWidth, H = ED.p.img.naturalHeight;
      if (W > c.w) ED.e.ox = Math.max(0, Math.min(1, ED.e.ox + (pt.x - d.last.x) / (W - c.w)));
      if (H > c.h) ED.e.oy = Math.max(0, Math.min(1, ED.e.oy + (pt.y - d.last.y) / (H - c.h)));
    }
    d.last = pt; edDraw();
  };
  cv.onpointerup = () => {
    const d = ED.drag; ED.drag = null; if (!d) return;
    if (ED.mode === "blur") {
      if (d.moved && d.rect.w > 4 && d.rect.h > 4) ED.e.blurs.push(d.rect);
      else if (!d.moved) { const { x, y } = d.start, i = ED.e.blurs.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); if (i >= 0) ED.e.blurs.splice(i, 1); }
    }
    edDraw();
  };
  $e("#phEdRatio").onclick = (ev) => { const r = ev.target.dataset.ratio; if (r) { ED.e.ratio = r; edDraw(); } };
  $e("#phEdMode").onclick = (ev) => { const m = ev.target.dataset.emode; if (m) { ED.mode = m; edDraw(); } };
  $e("#phEdBright").oninput = (ev) => { ED.e.bright = +ev.target.value; edDraw(); };
  $e("#phEdContrast").oninput = (ev) => { ED.e.contrast = +ev.target.value; edDraw(); };
  $e("#phEdClear").onclick = () => { ED.e.blurs = []; edDraw(); };
  $e("#phEdFace").onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = "찾는 중…";
    try { const f = await findFaces(ED.p); ED.e.blurs.push(...f); toast(f.length ? `얼굴 ${f.length}개를 찾았어요` : "찾은 얼굴이 없어요. 직접 칠해 주세요"); }
    catch (e) { console.error(e); toast("얼굴 찾기를 불러오지 못했어요"); }
    ev.target.disabled = false; ev.target.textContent = "🙂 얼굴 자동 찾기"; edDraw();
  };
  $e("#phEdCancel").onclick = () => dlg.close();
  $e("#phEdSave").onclick = async () => {
    const p = ED.p; p.edits = ED.e; p.note = $e("#phEdNote").value.trim(); p.faced = true; // 편집 창에서 직접 봤으면 확인한 것으로
    await bake(p); dlg.close(); ED.onSave?.(p);
  };
}

// ── 복사·받기 ──
// html 은 Promise 로 받는다: Safari 는 클릭 직후 await 없이 clipboard.write 를 불러야 해서 내용은 나중에 채움
async function copy(text, html) {
  try {
    if (html && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ "text/html": html.then((h) => new Blob([h], { type: "text/html" })), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    else await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    console.warn("clipboard.write 실패 → 글자만 복사", e);
    const t = document.createElement("textarea"); t.value = text; document.body.append(t); t.select();
    const ok = document.execCommand("copy"); t.remove(); if (!ok) toast("복사하지 못했어요. 길게 눌러 직접 복사해 주세요"); return ok;
  }
}
// list: [{name: "01.jpg", blob}] — 폰은 공유 시트(사진 앱 저장), 그 외는 zip 한 개
async function share(list, zipName) {
  const files = list.map((x) => new File([x.blob], x.name, { type: "image/jpeg" }));
  if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare?.({ files })) {
    try { await navigator.share({ files }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  await loadScript(JSZIP);
  const zip = new JSZip(); files.forEach((f) => zip.file(f.name, f));
  const a = document.createElement("a"); a.href = URL.createObjectURL(await zip.generateAsync({ type: "blob" }));
  a.download = zipName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`사진 ${files.length}장을 01, 02… 번호대로 받았어요`);
}

return { RATIOS, pad, loadScript, cropRect, fromFiles, fromUrls, bake, setRatio, faceAll, edit, copy, share };
});
```

`photo.css`:
```css
/* 🖼 사진 편집 창 (photo.js). body 에 붙는 dialog 라 어느 탭에서 열어도 같은 모양 */
#phEditDlg { width: min(980px, calc(100vw - 24px)); }
#phEditDlg .cv { position: relative; background: #111; border-radius: 8px; overflow: hidden; touch-action: none; }
#phEditDlg canvas { display: block; max-width: 100%; margin: 0 auto; cursor: crosshair; }
#phEditDlg .tb { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 10px 0; }
#phEditDlg .tb input[type=range] { width: 120px; }
#phEditDlg .mut { color: var(--sub); font-size: 12.5px; }
#phEditDlg .btn.small { padding: 5px 9px; font-size: 13px; }
#phEditDlg .blseg button { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); font-size: 14px; }
#phEditDlg .blseg button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd ~/pallo-planner-sns && node --test 'tests/*.test.mjs'`
Expected: photo 5개 + sns-core 16개 = `# pass 21`, `# fail 0`

- [ ] **Step 5: blog.js 에서 사진 코드 빼고 PHOTO 쓰기**

`blog.js` 를 아래처럼 고친다 (줄 번호는 `0ea9224` 기준 참고용, 실제로는 문자열로 찾아서 고칠 것):

1. 14줄 `const RATIOS = { orig: 0, "4:3": … };` 삭제.
2. 18~20줄 `const MP = …`, `const FACE_MODEL = …`, `const JSZIP = …` 삭제.
3. 67줄 `const loadScript = …` 를 아래로 바꾼다:
   ```js
   const copy = PHOTO.copy; // 사진·복사 도구는 photo.js (게시물 탭과 공용)
   ```
4. 69줄 `let seq = 0, drag = null;` → `let drag = null;`
5. `shell()` 안의 `<dialog id="blEditDlg">` 부터 그 dialog 의 `</dialog>` 까지(90~98줄) 삭제. (`blConvDlg`, `blStyleDlg` 는 그대로)
6. `// ── 사진: 읽기·편집·굽기 ──` 줄부터 `// ── 시안 만들기 ──` 줄 **바로 앞**까지(loadImg·addFiles·cropRect·mosaic·tone·draw·bake·faceDetector·findFaces·faceAll·ED·openEditor·edDraw·edPoint·wireEditor 전부)를 아래로 바꾼다:
   ```js
   // ── 사진: 읽기·편집은 photo.js(PHOTO) ──
   async function addFiles(files) { BL.photos.push(...await PHOTO.fromFiles(files)); renderThumbs(); presetWhy(); }
   async function faceAll() {
     if (!BL.photos.some((p) => !p.faced)) return toast("모든 사진을 이미 확인했어요");
     const btn = $b("#blFaceAll"); if (btn) { btn.disabled = true; btn.textContent = "🙂 얼굴 찾는 중…"; }
     try {
       const n = await PHOTO.faceAll(BL.photos);
       toast(n ? `얼굴 ${n}개를 모자이크했어요. 놓친 얼굴은 [편집]에서 직접 칠해 주세요` : "찾은 얼굴이 없어요. 작은 얼굴은 [편집]에서 확인해 주세요");
     } catch (e) { console.error(e); toast("얼굴 찾기를 불러오지 못했어요. [편집]에서 직접 칠해 주세요"); }
     renderThumbs(); if (BL.post) renderOut();
   }
   function openEditor(id) {
     const p = BL.photos.find((x) => x.id === id); if (!p) return;
     PHOTO.edit(p, { title: `사진 ${pad(BL.photos.indexOf(p) + 1)}`, onSave: () => { renderThumbs(); if (BL.post) renderOut(); } });
   }

   ```
7. `// html 은 Promise 로 받는다: …` 주석 줄과 `async function copy(text, html) { … }` 함수 전체 삭제 (3번의 `const copy` 가 대신함).
8. `async function photosOut() { … }` 전체를 아래로 바꾼다:
   ```js
   async function photosOut() {
     const list = []; let n = 0;
     BL.post.blocks.forEach((b) => { if (b.type === "photo") { n++; const p = photoOf(b.pid); if (p) list.push({ name: `${pad(n)}.jpg`, blob: p.blob }); } });
     if (!list.length) return toast("시안에 들어간 사진이 없어요");
     await PHOTO.share(list, `${BL.teamName}_${today()}_사진${list.length}장.zip`);
   }
   ```
9. `wire()` 안의 `wireEditor();` 줄 삭제.
10. `renderUsage()` 안: `mine.filter((x) => x.kind === "convert" || x.kind === "style").length` → `mine.filter((x) => ["convert", "style", "sns"].includes(x.kind)).length`, 표 머리 `<th>변환·스타일</th>` → `<th>변환·스타일·게시물</th>`.

확인: `grep -n "RATIOS\|loadImg\|cropRect\|findFaces\|blEd\|JSZIP\|wireEditor\|++seq" blog.js` → 아무것도 안 나와야 함. `node --check blog.js` → 오류 없음.

`blog.css`: `#blEditDlg` 로 시작하는 다섯 줄(85~89줄) 삭제.

- [ ] **Step 6: index.html·sw.js 에 연결**

`index.html`:
- `<link rel="stylesheet" href="blog.css?v=202610242009">` 바로 아래에 `<link rel="stylesheet" href="photo.css?v=202610242009">` 추가.
- `<script src="blog.js?v=202610242009"></script>` 바로 **위**에 `<script src="photo.js?v=202610242009"></script>` 추가.

`sw.js` 3줄 SHELL 배열: `"blog.css",` 뒤에 `"photo.js", "photo.css",` 추가.

- [ ] **Step 7: 블로그 탭이 그대로 동작하는지 브라우저로 확인**

1. `preview_start {name: "planner-sns"}` → `http://localhost:8767` 열기, `manager@pallo.test` 로 로그인 (비밀번호는 `~/.cache/pallo-planner-dev/dev-accounts.txt`).
2. [블로그] 탭 → `read_console_messages {onlyErrors: true}` 에 오류 없음.
3. 시험 사진 넣기 (javascript_tool):
   ```js
   const cv = Object.assign(document.createElement("canvas"), { width: 1200, height: 900 });
   const g = cv.getContext("2d"); g.fillStyle = "#4a7"; g.fillRect(0, 0, 1200, 900); g.fillStyle = "#fff"; g.font = "120px sans-serif"; g.fillText("TEST", 380, 500);
   const blob = await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.9));
   const dt = new DataTransfer(); dt.items.add(new File([blob], "t1.jpg", { type: "image/jpeg" })); dt.items.add(new File([blob], "t2.jpg", { type: "image/jpeg" }));
   const inp = document.querySelector("#blFile"); inp.files = dt.files; inp.dispatchEvent(new Event("change"));
   await new Promise((r) => setTimeout(r, 1500)); document.querySelectorAll("#blThumbs .blthumb").length
   ```
   Expected: `2`
4. 첫 썸네일 [편집] 클릭 → 편집 창(`#phEditDlg`)이 뜨고 비율 버튼에 `4:5` 가 있음 → `4:5` 누르고 [적용] → 썸네일에 🙂 표시. 스크린샷으로 확인.
5. [🙂 얼굴 자동 모자이크] 클릭 → "찾은 얼굴이 없어요…" 토스트 (`window.lastToast` 가 없으면 화면 확인).
6. 콘솔 오류 다시 확인 → 없음.

- [ ] **Step 8: 커밋**

```bash
cd ~/pallo-planner-sns && git add photo.js photo.css tests/photo.test.mjs blog.js blog.css index.html sw.js && git commit -m "📸 게시물: 블로그 사진 처리(자르기·모자이크·얼굴·편집 창·복사·받기)를 photo.js 로 분리, 4:5 비율 추가

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(`launch.json` 은 저장소 밖이라 커밋하지 않는다.)

---

### Task 4: AI — blog-write 에 `sns` action, 네이버 소식 겹침 검사

**Files:**
- Modify: `supabase/functions/blog-write/prompt.ts` (끝에 추가)
- Modify: `supabase/functions/blog-write/index.ts`
- Modify (저장소 밖): `~/.cache/pallo-planner-dev/test-sns.sh` (함수 점검 추가), 함수 심볼릭 링크

**Interfaces:**
- Consumes: 기존 `guard`, `record`, `ask`, `sys`, `teamFor`, `Photo` 타입, `sns_posts` (Task 2)
- Produces:
  - 요청 `{ action: "sns", team_id?, photos?: {data, media_type, note}[], topic?: string, tone?: "friendly"|"polite" }`
  - 응답 `{ result: { draft, instagram:{caption,hashtags}, google:{body,type,button}, naver:{title,body}, daangn:{title,body}, self_review }, quota: {used, limit} }`
  - 요청 `{ action: "similar", channel: "naver", text, exclude_id? }` → `{ matches: [{id, title, team, same_team:false, date, score}] }` (다른 지점 게시물만)
  - 오류: 사진·주제 둘 다 없으면 400 `사진을 올리거나 주제를 적어 주세요`

- [ ] **Step 1: 로컬 함수 서버를 worktree 로 돌리기**

```bash
cd ~/.cache/pallo-planner-dev
ls -l supabase/functions          # → ~/pallo-planner/supabase/functions 인지 확인 (Task 7 에서 되돌릴 값)
pkill -f "supabase functions serve" ; sleep 2
ln -sfn ~/pallo-planner-sns/supabase/functions supabase/functions
```
그다음 `supabase functions serve --env-file .env.functions` 를 `~/.cache/pallo-planner-dev` 에서 **백그라운드로** 실행 (Bash `run_in_background: true`). 10초 뒤:
```bash
docker inspect supabase_edge_runtime_pallo-planner-dev --format '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' | grep functions
```
Expected: `…/pallo-planner-sns/supabase/functions`

- [ ] **Step 2: 점검 스크립트에 함수 점검 추가 (아직 sns action 이 없어 실패해야 함)**

`~/.cache/pallo-planner-dev/test-sns.sh` 끝에 추가:
```bash
echo "== 함수: 사진·주제 없음 (\"사진을 올리거나 주제를 적어 주세요\")"; fn "$M" '{"action":"sns"}'
echo "== 함수: 네이버 소식 겹침 (matches 배열, same_team 은 전부 false)"
fn "$B" '{"action":"similar","team_id":3,"channel":"naver","text":"동성로 영어회화 11월 토요일 오전 프리토킹반을 새로 열어요. 소수정예로 진행하고 원어민과 1:1 언어교환 시간도 있어요. 상담은 편하게 연락 주세요 오늘도 좋은 하루 보내세요"}'
if [ "$AI" = 1 ]; then
  echo "== 함수: 실제 AI 한 번 (키 4개 + 해시태그 수 + 남은 횟수)"
  fn "$M" '{"action":"sns","topic":"11월부터 토요일 오전 10시 프리토킹반을 새로 열어요","tone":"friendly"}' > /tmp/sns-ai.json
  python3 - <<'EOF'
import json; r = json.load(open("/tmp/sns-ai.json"))
if "error" in r: print("오류:", r["error"]); raise SystemExit
x = r["result"]
print("keys:", sorted(x))
print("instagram 해시태그:", len(x["instagram"]["hashtags"]), "| google:", x["google"]["type"], x["google"]["button"], len(x["google"]["body"]), "자")
print("naver 제목:", x["naver"]["title"], "| daangn 제목:", x["daangn"]["title"])
print("컬컴 언급:", "컬컴" in json.dumps(x, ensure_ascii=False), "| quota:", r["quota"])
EOF
fi
```

Run: `bash ~/.cache/pallo-planner-dev/test-sns.sh 2>&1 | tail -4`
Expected: `{"error":"알 수 없는 action"}` (아직 sns 없음)

- [ ] **Step 3: prompt.ts 끝에 게시물 프롬프트 추가**

`supabase/functions/blog-write/prompt.ts` 맨 끝에 추가:
```ts
// ── 📸 게시물 탭: 사진·주제 → 공통 원고 → 인스타·구글·네이버·당근 ──
export const SNS_TONES: Record<string, string> = {
  friendly: "친근한 존댓말 (~해요)",
  polite: "정중한 존댓말 (~합니다)",
};

export const SNS_SYSTEM = `너는 성인 외국어 회화 학원 "팔로(Pallo)" 지점의 SNS 담당자다. 매니저가 준 사진·주제로 4개 채널 게시물을 한 번에 만든다.

# 절대 규칙
1. 사실을 지어내지 않는다. 입력에 없는 수강생, 후기, 점수, 수강료, 날짜, 시간, 정원, 할인·혜택은 쓰지 않는다. 꼭 필요한 자리면 "[확인 필요: 무엇]"으로 남긴다.
2. 구 브랜드 "컬컴/CULCOM"은 어디에도 쓰지 않는다. 이름이 바뀌었다는 암시도 금지.
3. 과장·법적 위험 표현 금지: 100%, 무조건, 보장, 1등, 1위, 최고, 최저가, 완벽, 다른 학원 비교·비방.
4. 사진 속 사람의 이름·나이·직업을 추측해 단정하지 않는다. 보이는 장면만 묘사한다.
5. 지점명·위치·운영시간·상담 방법은 입력에 있는 값만 쓴다.

# 순서
먼저 draft(공통 원고): 이 게시물이 전할 핵심 사실·장면·행동 유도를 5~8줄로 쓴다.
그다음 draft 를 채널마다 그 채널 독자에 맞게 다시 쓴다 (복사·붙여넣기 금지, 채널마다 도입이 달라야 한다).

# instagram
- caption: 첫 줄 훅(스크롤을 멈추게, 25자 안팎) → 빈 줄 → 본문 6~12줄(한 줄 짧게, 줄 끝 이모지 0~1개) → 행동 유도 1줄(저장·공유·DM 키워드 중 하나). 해시태그는 caption 에 넣지 않는다.
- hashtags 15~20개. "#" 없이, 띄어쓰기 없이 단어만. 순서: 넓은 지역·주제 → 핵심 타깃 → 이 게시물만의 상황·롱테일 → 브랜드 태그(맨 뒤 1~2개, 입력의 브랜드 태그에서).

# google (구글 비즈니스 프로필 소식)
- body 600~1,200자, 존댓말, 해시태그·이모지 없음. 첫 문장에 지점명과 동네·과목을 자연스럽게 넣는다. 마지막 줄에 상담 방법.
- type: 날짜가 정해진 행사면 event, 할인·혜택이면 offer, 그 밖은 standard. 기간·혜택 내용이 입력에 없으면 standard.
- button: 상담 방법에 전화번호가 있으면 call, 예약 링크면 book, 그 밖은 learn_more.

# naver (네이버 스마트플레이스 소식)
- title 20자 안팎, body 300~800자. 플레이스를 본 사람이 "지금 상담할 이유"(수업 안내·이번 달 일정·모집)를 바로 알게 쓴다. 해시태그 없음, 이모지 2개 이하.
- "다른 지점 최근 네이버 소식"이 주어지면 도입·구성·마무리를 다르게 한다 (네이버는 같은 틀에 지점명만 바꾼 글을 스팸으로 본다).

# daangn (당근 비즈프로필 소식)
- title 25자 안팎, body 200~600자. 동네 이웃에게 말하듯 친근한 존댓말. 동네 이름을 앞세우고(예: 동성로, 삼산동, 옥계동) 위치는 건물·랜드마크 기준으로. 해시태그 없음, 이모지 2개 이하.

# 어투
입력의 "어투"를 instagram·naver·daangn 에 지킨다. google 은 항상 정중한 존댓말.

# 겹침
"이 지점 최근 게시물" 주제와 같은 각도로 쓰지 않는다.

self_review: 무엇을 지켰는지, 어디가 [확인 필요]인지 2~3줄.`;

export const SNS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["draft", "instagram", "google", "naver", "daangn", "self_review"],
  properties: {
    draft: { type: "string" },
    instagram: {
      type: "object", additionalProperties: false, required: ["caption", "hashtags"],
      properties: { caption: { type: "string" }, hashtags: { type: "array", items: { type: "string" } } },
    },
    google: {
      type: "object", additionalProperties: false, required: ["body", "type", "button"],
      properties: {
        body: { type: "string" },
        type: { type: "string", enum: ["standard", "event", "offer"] },
        button: { type: "string", enum: ["none", "call", "book", "learn_more"] },
      },
    },
    naver: { type: "object", additionalProperties: false, required: ["title", "body"], properties: { title: { type: "string" }, body: { type: "string" } } },
    daangn: { type: "object", additionalProperties: false, required: ["title", "body"], properties: { title: { type: "string" }, body: { type: "string" } } },
    self_review: { type: "string" },
  },
} as const;
```

- [ ] **Step 4: index.ts 고치기**

`supabase/functions/blog-write/index.ts`:

1. 맨 위 주석 2줄째 action 목록 끝에 ` | sns(게시물 4채널 문구)` 추가, `similar(유사도)` → `similar(유사도, channel=naver 면 네이버 소식)`.
2. import 에 `SNS_SCHEMA, SNS_SYSTEM, SNS_TONES` 추가:
   ```ts
   import {
     COMMON, CONCEPTS, CONVERT_SCHEMA, CONVERT_SYSTEM, POST_SCHEMA, PRESETS, READERS, SNS_SCHEMA, SNS_SYSTEM, SNS_TONES, STYLE_SCHEMA, STYLE_SYSTEM, TONES, WRITERS,
   } from "./prompt.ts";
   ```
3. `const AI_KINDS = ["write", "convert", "style"];` → `const AI_KINDS = ["write", "convert", "style", "sns"]; // 하루 제한에 세는 것 (블로그·게시물 합산)`
4. switch 에 `case "convert": …` 다음 줄로 추가: `      case "sns": return json(await sns(who, team, body));`
5. `type Team = Awaited<ReturnType<typeof teamFor>>;` 다음 줄에 추가:
   ```ts
   // 지점 프로필 → 프롬프트 줄 (write·sns 공용)
   const profileLines = (team: Team) => {
     const p = team.profile as Record<string, any>;
     return [
       `# 지점`, `지점명: ${p.display || team.name}`, `주소·위치: ${p.address || "[확인 필요]"} / ${p.location || ""}`,
       `과목: ${(p.subjects ?? []).join(", ")}`, `강점: ${p.strengths || ""}`, `운영시간: ${p.hours || "[확인 필요]"}`,
       `상담 방법: ${p.contact || "[확인 필요]"}`, `브랜드 태그: ${(p.brandTags ?? ["팔로"]).join(", ")}`, p.notes ? `지점 메모: ${p.notes}` : "",
     ];
   };
   const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
   ```
6. `write()` 의 `lines` 배열에서 아래 3줄을
   ```ts
       `# 지점`, `지점명: ${p.display || team.name}`, `주소·위치: ${p.address || "[확인 필요]"} / ${p.location || ""}`,
       `과목: ${(p.subjects ?? []).join(", ")}`, `강점: ${p.strengths || ""}`, `운영시간: ${p.hours || "[확인 필요]"}`,
       `상담 방법: ${p.contact || "[확인 필요]"}`, `브랜드 태그: ${(p.brandTags ?? ["팔로"]).join(", ")}`, p.notes ? `지점 메모: ${p.notes}` : "",
   ```
   `    ...profileLines(team),` 한 줄로 바꾼다. (`const p = team.profile …` 는 아래 서브 키워드에 쓰이니 남긴다.)
7. `// ── style: …` 주석 바로 위에 `sns` 함수 추가:
   ```ts
   // ── sns: 사진·주제 → 공통 원고 + 인스타·구글·네이버·당근 (게시물 탭) ──
   async function sns(who: Who, team: Team, b: { photos?: Photo[]; topic?: string; tone?: string }) {
     await guard(team.id);
     const photos = (b.photos ?? []).slice(0, 10), topic = String(b.topic ?? "").trim();
     if (!photos.length && !topic) throw new HttpError(400, "사진을 올리거나 주제를 적어 주세요");
     const [recent, others] = await Promise.all([
       admin.from("sns_posts").select("topic, draft").eq("team_id", team.id).order("created_at", { ascending: false }).limit(20),
       admin.from("sns_posts").select("channels").neq("team_id", team.id).order("created_at", { ascending: false }).limit(6),
     ]);
     const mine = (recent.data ?? []).map((r) => r.topic || String(r.draft).split("\n")[0]).filter(Boolean);
     const naver = (others.data ?? []).map((r: any) => r.channels?.naver).filter((n: any) => n?.body);
     const lines = [
       `오늘: ${kstToday()}`,
       ...profileLines(team),
       `# 이번 게시물`,
       topic ? `주제/메모: ${topic}` : "주제 없음 → 사진을 보고 내용을 잡아라",
       `어투: ${SNS_TONES[b.tone ?? ""] ?? SNS_TONES.friendly}`,
       `사진: ${photos.length}장 (아래 순서 = 게시 순서)${photos.length ? "" : " — 사진 없이 문구만"}`,
       mine.length ? `# 이 지점 최근 게시물 (겹치지 않게)\n${mine.map((t) => `- ${String(t).slice(0, 80)}`).join("\n")}` : "",
       naver.length ? `# 다른 지점 최근 네이버 소식 (구성을 다르게)\n${naver.map((n: any) => `- ${n.title}: ${String(n.body).slice(0, 100).replace(/\s+/g, " ")}`).join("\n")}` : "",
     ].filter(Boolean).join("\n");
     const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: lines }];
     photos.forEach((ph, i) => {
       content.push({ type: "text", text: `사진 ${i + 1}${ph.note ? ` (매니저 메모: ${ph.note})` : ""}` });
       content.push({ type: "image", source: { type: "base64", media_type: ph.media_type as "image/jpeg", data: ph.data } });
     });
     const { out, usage } = await ask(sys(SNS_SYSTEM), content, SNS_SCHEMA, "low");
     return { result: out, quota: await record(who, team.id, "sns", usage) };
   }

   ```
8. `similar()` 전체를 아래로 바꾼다 (블로그 동작은 그대로, `channel: "naver"` 면 다른 지점 네이버 소식과 비교):
   ```ts
   async function similar(team: Team, b: { text?: string; exclude_id?: number; channel?: string }) {
     const mine = shingles(String(b.text ?? ""));
     if (mine.size < 50) return { matches: [] };
     const naver = b.channel === "naver";
     const [posts, teams] = await Promise.all([
       naver
         ? admin.from("sns_posts").select("id, team_id, channels, created_at").neq("team_id", team.id).order("created_at", { ascending: false }).limit(80)
         : admin.from("blog_posts").select("id, team_id, title, body, created_at").order("created_at", { ascending: false }).limit(80),
       admin.from("teams").select("id, name"),
     ]);
     const tn = Object.fromEntries((teams.data ?? []).map((t) => [t.id, t.name]));
     const rows = (posts.data ?? []).map((p: any) => naver
       ? { id: p.id, team_id: p.team_id, created_at: p.created_at, title: p.channels?.naver?.title ?? "", body: `${p.channels?.naver?.title ?? ""}\n${p.channels?.naver?.body ?? ""}` }
       : p);
     const matches = rows.filter((p: any) => p.id !== b.exclude_id).map((p: any) => {
       const o = shingles(p.body); let inter = 0; for (const x of mine) if (o.has(x)) inter++;
       return { id: p.id, title: p.title, team: tn[p.team_id] ?? "", same_team: p.team_id === team.id, date: p.created_at.slice(0, 10), score: Math.round(inter / (mine.size + o.size - inter || 1) * 100) };
     }).sort((a: any, c: any) => c.score - a.score).slice(0, 3);
     return { matches };
   }
   ```

확인: `cd ~/pallo-planner-sns/supabase/functions/blog-write && deno check index.ts` → 오류 없음.

- [ ] **Step 5: 점검 스크립트로 확인 (실제 AI 1회 포함)**

Run: `cd ~/.cache/pallo-planner-dev && AI=1 bash test-sns.sh 2>&1 | tail -9`
Expected:
- `{"error":"사진을 올리거나 주제를 적어 주세요"}`
- `{"matches":[…]}` — 항목이 있으면 전부 `"same_team":false` (게시물이 없으면 `[]` 도 정상)
- `keys: ['daangn', 'draft', 'google', 'instagram', 'naver', 'self_review']`
- 인스타 해시태그 15~20 근처, google type `standard`(주제에 날짜가 있으면 `event` 도 정상), 제목들이 비어 있지 않음
- `컬컴 언급: False`, quota 의 used 가 1 늘어남

블로그 점검도 그대로인지: `bash ~/.cache/pallo-planner-dev/test-blog.sh 2>&1 | head -8` → 기존과 같은 결과(남은 횟수 JSON, 403 등).

- [ ] **Step 6: 커밋**

```bash
cd ~/pallo-planner-sns && git add supabase/functions/blog-write && git commit -m "📸 게시물: blog-write 에 sns action(공통 원고→4채널), 네이버 소식 지점 간 겹침 검사, 하루 제한 블로그와 합산

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 게시물 탭 — 만들기 화면 (사진·주제 → 문구 → 채널별 점검·복사·올렸어요)

**Files:**
- Create: `post.js`, `post.css`
- Modify: `index.html`, `sw.js`

**Interfaces:**
- Consumes: `window.SNSCORE`(Task 1), `window.PHOTO`(Task 3), `blog-write` `sns`·`similar`·`usage` (Task 4), `sns_posts`·`sns_jobs`·버킷 `sns` (Task 2)
- Produces: `window.PS` — `PS.load()` (index.html 이 탭 열 때 부름), 상태 `PS.tab: "make"|"list"`, `PS.post: {id?, topic, tone, draft, channels, self_review}`, `PS.photos: photo[]`(각 사진에 `path`, `pathOf` 추가), `PS.jobs`, `PS.sel: Set<channel>`, `PS.ch`. Task 6 은 `renderList`·`openPost`·`deletePost` 를 이 파일에 더한다.

- [ ] **Step 1: post.js 작성**

`post.js`:
```js
// 📸 게시물 탭: 사진 1~10장 + 주제 → AI 공통 원고 + 인스타·구글·네이버·당근 문구 → 채널별 점검 → 복사·사진 받기 → [올렸어요].
// 1단계는 네 채널 모두 수동. 인스타(2단계)·구글(3단계) 자동 게시는 Edge Function sns-publish 로 붙인다. 설계: docs/sns-posts/README.md
// 사진은 이 기기에서 모자이크·자르기(photo.js) → sns 버킷(공개, 무작위 이름)에 올린다: 다른 기기에서 다시 열고, 나중에 API가 공개 주소로 가져가게.
// 채널 규칙·점검은 sns-core.js(SNSCORE). index.html 전역 sb·me·esc·toast·fail·isBoss·previewTeam·teams 를 씀 → window.PS
(() => {
const C = window.SNSCORE;
const allKeys = () => new Set(C.CHANNELS.map((c) => c.key));
const PS = (window.PS = { tab: "make", photos: [], post: null, jobs: [], ch: "instagram", sel: allKeys(), topic: "", tone: "friendly" });
const TONES = [["friendly", "친근 (~해요)"], ["polite", "정중 (~합니다)"]];
const V = () => document.getElementById("postView");
const $p = (s) => V().querySelector(s);
const pad = PHOTO.pad;
const opt = (list, v) => list.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(t)}</option>`).join("");
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const pub = (path) => sb.storage.from("sns").getPublicUrl(path).data.publicUrl;
const chOf = (k) => C.CHANNELS.find((c) => c.key === k);
const jobOf = (k) => PS.jobs.find((j) => j.channel === k);
const facts = () => ({ photos: PS.photos.length, unfaced: PS.photos.filter((p) => !p.faced).length });
const MARK = { ok: "✔", warn: "!", bad: "✕", info: "·" };

async function call(action, body = {}) {
  const { data, error } = await sb.functions.invoke("blog-write", { body: { action, team_id: PS.team, ...body } });
  if (error) {
    let m = error.message;
    try { m = (await error.context.json()).error || m; } catch {}
    if (/Failed to send|FunctionsFetchError|not found/i.test(m)) m = "AI 서버가 아직 연결되지 않았어요 (Edge Function 배포 필요)";
    toast(m); return null;
  }
  return data;
}
function setQuota(q) { const el = $p("#psQuota"); if (el && q) el.textContent = `오늘 남은 생성 ${Math.max(0, q.limit - q.used)}/${q.limit}회 (블로그와 합산)`; }
function reset() { PS.photos = []; PS.post = null; PS.jobs = []; PS.topic = ""; PS.tone = "friendly"; PS.ch = "instagram"; PS.sel = allKeys(); }

// ── 화면 뼈대 (한 번만) ──
function shell() {
  V().dataset.ready = 1;
  V().innerHTML = `<div class="psbar"><h2>📸 게시물</h2><select id="psTeam" class="hidden"></select><span id="psTeamName" class="mut"></span>
    <div class="pstabs"><button type="button" data-pt="make">만들기</button><button type="button" data-pt="list">목록</button></div>
    <span id="psQuota" class="mut"></span></div>
  <div id="psBody"></div>
  <input type="file" id="psFile" accept="image/*" multiple hidden>`;
  wire();
}

// ── 불러오기 ──
PS.load = async function () {
  if (!me) return;
  if (!V().dataset.ready) shell();
  if (PS.myTeam === undefined) PS.myTeam = (await sb.from("profiles").select("team_id").eq("user_id", me.id).single()).data?.team_id ?? null;
  const boss = isBoss && !previewTeam;
  if (boss && !teams.length) teams = (await sb.from("teams").select("*").order("sort")).data ?? [];
  const prev = PS.team;
  if (boss) {
    try { PS.team = PS.team ?? (+localStorage.getItem("post-team") || null); } catch {}
    if (!teams.some((t) => t.id === PS.team)) PS.team = teams[0]?.id ?? null;
    $p("#psTeam").innerHTML = teams.map((t) => `<option value="${t.id}" ${t.id === PS.team ? "selected" : ""}>${esc(t.name)}</option>`).join("");
  } else PS.team = previewTeam || PS.myTeam;
  $p("#psTeam").classList.toggle("hidden", !boss);
  if (!PS.team) { $p("#psBody").innerHTML = `<div class="card">아직 지점이 정해지지 않았어요. 대표님이 [팀] 탭에서 지점을 정해 주시면 게시물을 만들 수 있어요.</div>`; return; }
  PS.teamName = (teams.find((t) => t.id === PS.team) ?? (await sb.from("teams").select("name").eq("id", PS.team).single()).data)?.name ?? "";
  $p("#psTeamName").textContent = boss ? "" : PS.teamName;
  if (prev !== undefined && prev !== PS.team) reset();
  call("usage").then((r) => r && setQuota(r.quota));
  renderTab();
};
function renderTab() {
  V().querySelectorAll("[data-pt]").forEach((b) => b.classList.toggle("on", b.dataset.pt === PS.tab));
  if (PS.tab === "list") renderList(); else renderMake();
}

// ── 만들기: 입력 ──
function renderMake() {
  $p("#psBody").innerHTML = `<div class="blgrid"><div class="card">
    <div class="bldrop" id="psDrop">📷 사진 1~10장을 끌어다 놓거나 눌러서 고르세요<br><small>순서 = 게시 순서 · ◀ ▶ 로 바꾸기</small></div>
    <div class="blthumbs" id="psThumbs"></div>
    <div id="psFaceRow" style="margin-top:6px"></div>
    <div class="psratio" id="psRatio"></div>
    <label>주제·메모 <small>(선택 · 비우면 사진만 보고 써요)</small></label>
    <textarea data-f="topic" placeholder="예) 11월부터 토요일 오전 10시 프리토킹반을 새로 열어요"></textarea>
    <label>어투</label><select data-f="tone" style="width:100%">${opt(TONES, PS.tone)}</select>
    <button type="button" class="btn psgo" id="psGo">✨ 문구 만들기</button><div class="mut" id="psGoNote" style="margin-top:6px"></div>
  </div><div id="psOut"></div></div>`;
  $p("[data-f=topic]").value = PS.topic;
  renderThumbs(); renderOut();
}
function renderThumbs() {
  const el = $p("#psThumbs"); if (!el) return;
  el.innerHTML = PS.photos.map((p, i) => `<div class="blthumb"><img src="${p.url}" alt=""><span class="no">${pad(i + 1)}</span>
    <button type="button" class="x" data-rm="${p.id}" title="빼기">✕</button><button type="button" class="ed" data-ed="${p.id}">편집</button>
    ${p.faced ? `<span class="face">🙂${p.edits.blurs.length || ""}</span>` : ""}
    <div class="psmv"><button type="button" data-mv="-1" data-i="${i}" title="앞으로">◀</button><button type="button" data-mv="1" data-i="${i}" title="뒤로">▶</button></div></div>`).join("");
  const n = PS.photos.length, unchecked = PS.photos.filter((p) => !p.faced).length;
  $p("#psFaceRow").innerHTML = n ? `<button type="button" class="btn ghost small" id="psFaceAll">🙂 얼굴 자동 모자이크${unchecked ? ` (${unchecked}장)` : ""}</button> <small class="mut">${n}장 · 사진은 이 기기 안에서 처리한 뒤 올려요</small>` : "";
  $p("#psRatio").innerHTML = n ? `<span class="mut">한 번에 자르기</span><span class="blseg">${[["4:5", "4:5 세로 (인스타 추천)"], ["1:1", "1:1"], ["orig", "원본"]].map(([r, t]) => `<button type="button" data-ratio="${r}">${t}</button>`).join("")}</span>` : "";
}
async function addFiles(files) {
  const room = 10 - PS.photos.length;
  if (room <= 0) return toast("사진은 10장까지예요");
  if (files.length > room) toast(`10장까지라 ${files.length - room}장은 뺐어요`);
  PS.photos.push(...await PHOTO.fromFiles(files.slice(0, room)));
  renderThumbs(); photosChanged();
}
function photosChanged() { if (PS.post) { renderOut(); saveSoon(); } }
async function faceAll() {
  if (!PS.photos.some((p) => !p.faced)) return toast("모든 사진을 이미 확인했어요");
  const btn = $p("#psFaceAll"); if (btn) { btn.disabled = true; btn.textContent = "🙂 얼굴 찾는 중…"; }
  try {
    const n = await PHOTO.faceAll(PS.photos);
    toast(n ? `얼굴 ${n}개를 모자이크했어요. 놓친 얼굴은 [편집]에서 직접 칠해 주세요` : "찾은 얼굴이 없어요. 작은 얼굴은 [편집]에서 확인해 주세요");
  } catch (e) { console.error(e); toast("얼굴 찾기를 불러오지 못했어요. [편집]에서 직접 칠해 주세요"); }
  renderThumbs(); photosChanged();
}

// ── 문구 만들기 ──
async function generate() {
  if (!PS.photos.length && !PS.topic.trim()) return toast("사진을 올리거나 주제를 적어 주세요");
  if (PS.post && !confirm("지금 문구를 새로 만든 문구로 바꿀까요? (고친 내용은 사라져요)")) return;
  const btn = $p("#psGo"); btn.disabled = true; btn.textContent = "✍️ 쓰는 중… (30초 안팎)";
  $p("#psGoNote").textContent = "공통 원고 → 인스타 · 구글 · 네이버 · 당근 순서로 다시 써요";
  try {
    const r = await call("sns", { photos: PS.photos.map((p) => ({ data: p.ai, media_type: "image/jpeg", note: p.note })), topic: PS.topic, tone: PS.tone });
    if (!r) return;
    setQuota(r.quota);
    const n = C.normalizeAi(r.result);
    PS.post = { ...(PS.post ?? {}), topic: PS.topic, tone: PS.tone, draft: n.draft, channels: n.channels, self_review: n.self_review };
    renderOut(); await save(); renderOut();
    $p("#psOut").scrollIntoView({ behavior: "smooth", block: "start" });
  } finally { btn.disabled = false; btn.textContent = "✨ 문구 만들기"; $p("#psGoNote").textContent = ""; }
}

// ── 결과: 채널별 보기·고치기 ──
function worst(k) { const L = C.checkChannel(k, PS.post.channels[k], facts()); return L.some((x) => x.lv === "bad") ? "bad" : L.some((x) => x.lv === "warn") ? "warn" : "ok"; }
function editorHtml(k, ch) {
  if (k === "instagram") return `<label>캡션</label><textarea data-c="caption" style="min-height:12em">${esc(ch.caption)}</textarea>
    <label>해시태그 <small>(띄어쓰기로 구분)</small></label><textarea data-c="hashtags">${esc(C.tagLine(ch.hashtags))}</textarea>`;
  if (k === "google") return `<label>본문</label><textarea data-c="body" style="min-height:10em">${esc(ch.body)}</textarea>
    <div class="row2"><div><label>소식 종류</label><select data-c="type">${opt(Object.entries(C.GOOGLE_TYPES), ch.type)}</select></div>
      <div><label>버튼</label><select data-c="button">${opt(Object.entries(C.GOOGLE_BUTTONS), ch.button)}</select></div></div>
    <div class="mut" style="margin-top:6px">구글 비즈니스 프로필 → 업데이트 추가에서 같은 종류·버튼을 고르세요${ch.type !== "standard" ? " · 이벤트·혜택은 기간도 넣어야 해요" : ""}</div>`;
  return `<label>제목</label><input data-c="title" value="${esc(ch.title)}" style="width:100%"><label>본문</label><textarea data-c="body" style="min-height:10em">${esc(ch.body)}</textarea>`;
}
function renderOut() {
  const el = $p("#psOut"); if (!el) return;
  const X = PS.post;
  if (!X) { el.innerHTML = `<div class="card blempty">왼쪽에서 사진을 올리고 <b>✨ 문구 만들기</b>를 누르면<br>인스타 · 구글 · 네이버 · 당근 문구가 한 번에 나와요.<br><br><small>채널마다 고칠 수 있고, 복사해서 각 앱에 붙여넣으면 돼요.</small></div>`; return; }
  const k = PS.ch, ch = X.channels[k], j = jobOf(k), c = chOf(k);
  const doneBtn = !PS.sel.has(k) ? `<span class="mut">이 채널은 이번에 안 올려요 (위에서 체크)</span>`
    : j?.status === "done_manual" ? `<button type="button" class="btn ghost" id="psUndo">↩ 올렸어요 취소</button>` : `<button type="button" class="btn ghost" id="psDone">✓ 올렸어요</button>`;
  el.innerHTML = `<div class="card">
    <details><summary class="mut">📝 공통 원고 (AI가 먼저 쓴 핵심)</summary><div class="psdraft">${esc(X.draft)}</div>${X.self_review ? `<div class="mut" style="margin-top:6px">${esc(X.self_review)}</div>` : ""}</details>
    <div class="mut" style="margin-top:12px">올릴 채널</div>
    <div class="pssel">${C.CHANNELS.map((x) => { const jj = jobOf(x.key), b = jj ? C.badge(jj) : null;
      return `<label><input type="checkbox" data-sel="${x.key}" ${PS.sel.has(x.key) ? "checked" : ""} ${jj?.status === "done_manual" ? "disabled" : ""}> ${x.label}${b ? ` <span class="blbadge ${b.cls}">${esc(b.text)}</span>` : ""}</label>`; }).join("")}</div>
    <div class="pstabs pschs">${C.CHANNELS.map((x) => `<button type="button" data-ch="${x.key}" class="${x.key === k ? "on" : ""}">${x.label}${worst(x.key) === "bad" ? " ⚠" : ""}</button>`).join("")}</div>
    <div id="psEd">${editorHtml(k, ch)}</div>
    <div class="blcheck" id="psCheck"></div>
    <div class="blacts">
      <button type="button" class="btn" id="psCopy">📋 문구 복사</button>
      <button type="button" class="btn ghost" id="psPhotos">🖼 사진 ${k === "google" ? "1장" : "번호대로"} 받기</button>
      <a class="btn ghost" href="${c.open}" target="_blank" rel="noopener">↗ ${esc(c.label.replace(/^\S+\s/, ""))} 열기</a>
      ${doneBtn}
    </div></div>`;
  check();
}
function check() {
  const el = $p("#psCheck"); if (!el || !PS.post) return;
  const k = PS.ch;
  el.innerHTML = C.checkChannel(k, PS.post.channels[k], facts()).map((x) => `<div class="${x.lv}"><b>${MARK[x.lv]}</b><span>${esc(x.txt)}</span></div>`).join("")
    + (k === "naver" ? `<div class="info" id="psSim"><b>·</b><span>다른 지점 네이버 소식과 겹침 확인 중…</span></div>` : "");
  if (k === "naver") similarSoon();
}
const similarSoon = debounce(async () => {
  const X = PS.post; if (!X || PS.ch !== "naver") return;
  const r = await sb.functions.invoke("blog-write", { body: { action: "similar", team_id: PS.team, channel: "naver", text: C.channelText("naver", X.channels.naver), exclude_id: X.id } });
  const el = $p("#psSim"); if (!el) return;
  if (!r.data?.matches) { el.querySelector("span").textContent = "겹침 확인은 AI 서버 연결 후에 돼요"; return; }
  const top = r.data.matches[0], lv = !top ? "ok" : top.score >= 30 ? "bad" : top.score >= 15 ? "warn" : "ok";
  el.className = lv;
  el.innerHTML = `<b>${MARK[lv]}</b><span>${top ? `다른 지점 네이버 소식과 겹침 최대 ${top.score}% — ${esc(top.team)} "${esc(top.title)}" (${top.date})${top.score >= 15 ? " · 도입·구성을 바꿔 주세요" : ""}` : "다른 지점 네이버 소식과 겹치지 않아요"}</span>`;
}, 1200);
const editedSoon = debounce(() => { check(); save(); }, 900);

// ── 저장: 사진 올리기 → sns_posts → 고른 채널 작업(sns_jobs) ──
async function uploadPhotos() {
  const out = [];
  for (const p of PS.photos) {
    if (!(p.path && p.pathOf === p.url)) {
      const path = `${PS.team}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("sns").upload(path, p.blob, { contentType: "image/jpeg" });
      if (error) throw error;
      p.path = path; p.pathOf = p.url;
    }
    out.push({ path: p.path, w: p.w, h: p.h });
  }
  return out;
}
let saving = null;
async function save() {
  const X = PS.post; if (!X) return;
  if (saving) { saving.again = true; return; } // 저장 중이면 끝난 뒤 한 번 더
  saving = {};
  try {
    const photos = await uploadPhotos();
    const row = { team_id: PS.team, topic: X.topic ?? "", tone: X.tone ?? "friendly", draft: X.draft ?? "", photos, channels: X.channels, updated_at: new Date().toISOString() };
    if (X.id) fail((await sb.from("sns_posts").update(row).eq("id", X.id)).error);
    else {
      const { data, error } = await sb.from("sns_posts").insert(row).select("id").single();
      if (!fail(error)) { X.id = data.id; await syncJobs(); renderOut(); }
    }
  } catch (e) { console.error(e); toast("사진을 올리지 못했어요. 인터넷 연결을 확인하고 다시 고쳐 주세요"); }
  finally { const again = saving.again; saving = null; if (again) save(); }
}
const saveSoon = debounce(save, 1200);
async function loadJobs() { PS.jobs = PS.post?.id ? (await sb.from("sns_jobs").select("*").eq("post_id", PS.post.id)).data ?? [] : []; }
async function syncJobs() {
  const X = PS.post; if (!X?.id) return;
  const have = new Set(PS.jobs.map((j) => j.channel));
  const add = [...PS.sel].filter((k) => !have.has(k));
  const drop = PS.jobs.filter((j) => !PS.sel.has(j.channel) && j.status === "waiting_copy").map((j) => j.id);
  if (add.length) fail((await sb.from("sns_jobs").insert(C.jobRows({ id: X.id, team_id: PS.team }, add))).error);
  if (drop.length) fail((await sb.from("sns_jobs").delete().in("id", drop)).error);
  await loadJobs();
}
async function setDone(k, done) {
  if (!PS.post?.id) await save();
  const j = jobOf(k); if (!j) return toast("저장 중이에요. 잠시 뒤 다시 눌러 주세요");
  const { error } = await sb.from("sns_jobs").update({ status: done ? "done_manual" : "waiting_copy" }).eq("id", j.id);
  if (fail(error)) return;
  await loadJobs(); renderOut();
  if (done) toast(`${chOf(k).label}에 올린 것으로 표시했어요`);
}
async function photosOut() {
  const list = (PS.ch === "google" ? PS.photos.slice(0, 1) : PS.photos).map((p, i) => ({ name: `${pad(i + 1)}.jpg`, blob: p.blob }));
  if (!list.length) return toast("사진이 없어요");
  await PHOTO.share(list, `${PS.teamName}_${chOf(PS.ch).label.replace(/^\S+\s/, "")}_${kstDay()}_사진${list.length}장.zip`);
}

// ── 목록 (Task 6 에서 채움) ──
function renderList() { $p("#psBody").innerHTML = `<div class="card blempty">목록은 다음 단계에서 붙여요.</div>`; }

// ── 이벤트 (한 번만 연결) ──
function wire() {
  const v = V();
  $p("#psFile").onchange = (ev) => { addFiles([...ev.target.files]); ev.target.value = ""; };
  $p("#psTeam").onchange = (ev) => { PS.team = +ev.target.value; try { localStorage.setItem("post-team", ev.target.value); } catch {} reset(); PS.load(); };
  v.addEventListener("click", async (ev) => {
    const t = ev.target, d = t.dataset ?? {};
    if (d.pt) { PS.tab = d.pt; return renderTab(); }
    if (t.closest?.("#psDrop")) return $p("#psFile").click();
    if (d.rm) { PS.photos = PS.photos.filter((p) => p.id !== +d.rm); renderThumbs(); return photosChanged(); }
    if (d.ed) {
      const p = PS.photos.find((x) => x.id === +d.ed);
      if (p) PHOTO.edit(p, { title: `사진 ${pad(PS.photos.indexOf(p) + 1)}`, onSave: () => { renderThumbs(); photosChanged(); } });
      return;
    }
    if (d.mv) { const i = +d.i, j = i + +d.mv; if (j < 0 || j >= PS.photos.length) return; [PS.photos[i], PS.photos[j]] = [PS.photos[j], PS.photos[i]]; renderThumbs(); return photosChanged(); }
    if (d.ratio) {
      V().querySelectorAll("[data-ratio]").forEach((b) => { b.disabled = true; });
      await PHOTO.setRatio(PS.photos, d.ratio); renderThumbs();
      toast(`${PS.photos.length}장을 ${d.ratio === "orig" ? "원본 비율로" : d.ratio + " 로"} 맞췄어요 · 자르기 위치는 [편집]에서`);
      return photosChanged();
    }
    if (t.id === "psFaceAll") return faceAll();
    if (t.id === "psGo") return generate();
    if (d.ch) { PS.ch = d.ch; return renderOut(); }
    if (t.id === "psCopy") { if (await PHOTO.copy(C.channelText(PS.ch, PS.post.channels[PS.ch]))) toast(`복사했어요. ${chOf(PS.ch).label} 글쓰기에 붙여넣으세요`); return; }
    if (t.id === "psPhotos") return photosOut();
    if (t.id === "psDone" || t.id === "psUndo") return setDone(PS.ch, t.id === "psDone");
    if (d.open) return openPost(+d.open);
    if (d.delp) return deletePost(+d.delp);
  });
  v.addEventListener("input", (ev) => {
    const t = ev.target, d = t.dataset;
    if (d.f === "topic") { PS.topic = t.value; return; }
    if (!d.c || !PS.post || t.tagName === "SELECT") return;
    PS.post.channels[PS.ch][d.c] = d.c === "hashtags" ? C.parseTags(t.value) : t.value;
    editedSoon();
  });
  v.addEventListener("change", async (ev) => {
    const t = ev.target, d = t.dataset;
    if (d.f === "tone") { PS.tone = t.value; return; }
    if (d.c && PS.post && t.tagName === "SELECT") { PS.post.channels[PS.ch][d.c] = t.value; renderOut(); return saveSoon(); }
    if (d.sel) { if (t.checked) PS.sel.add(d.sel); else PS.sel.delete(d.sel); if (PS.post?.id) await syncJobs(); return renderOut(); }
  });
  v.addEventListener("dragover", (ev) => { if (ev.dataTransfer.types.includes("Files") && ev.target.closest?.("#psDrop, #psThumbs")) { ev.preventDefault(); $p("#psDrop")?.classList.add("over"); } });
  v.addEventListener("dragleave", (ev) => { if (ev.target.id === "psDrop") ev.target.classList.remove("over"); });
  v.addEventListener("drop", (ev) => {
    $p("#psDrop")?.classList.remove("over");
    if (ev.dataTransfer.files?.length && ev.target.closest?.("#psDrop, #psThumbs")) { ev.preventDefault(); addFiles([...ev.dataTransfer.files]); }
  });
}
})();
```
(`openPost`·`deletePost` 는 Task 6 에서 정의한다. 그 전까지 목록 버튼이 없으므로 불리지 않는다.)

- [ ] **Step 2: post.css 작성**

`post.css`:
```css
/* 📸 게시물 탭 (post.js). 썸네일·점검·목록·뱃지는 blog.css 의 전역 클래스(blgrid·bldrop·blthumb·blcheck·bllist·blbadge)를 같이 씀 */
body:not(.psv) #postView { display: none; }
#postView { max-width: 1240px; margin: 0 auto; padding: 16px 20px 100px; }
#postView .psbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
#postView .psbar h2 { margin: 0 auto 0 0; }
#postView .pstabs { display: flex; flex-wrap: wrap; gap: 4px; }
#postView .pstabs button { padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); font-size: 14px; }
#postView .pstabs button.on { background: var(--accent); border-color: var(--accent); color: #fff; }
#postView .pschs { margin-top: 14px; }
#postView .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
#postView select, #postView input:not([type=checkbox]), #postView textarea { padding: 7px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 8px; min-width: 0; }
#postView textarea { width: 100%; resize: vertical; field-sizing: content; min-height: 3.2em; }
#postView label { display: block; font-size: 12.5px; color: var(--sub); margin: 12px 0 4px; }
#postView .mut { color: var(--sub); font-size: 12.5px; }
#postView .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } #postView .row2 select { width: 100%; }
#postView .btn.small { padding: 5px 9px; font-size: 13px; }
#postView a.btn { display: inline-block; text-decoration: none; }
#postView .psgo { width: 100%; margin-top: 14px; }
#postView .psratio { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
#postView .psratio .blseg button { flex: none; padding: 5px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); font-size: 13px; }
#postView .blthumb { cursor: default; }
#postView .blthumb .psmv { display: flex; border-top: 1px solid var(--line); }
#postView .blthumb .psmv button { flex: 1; padding: 3px 0; font-size: 12px; color: var(--sub); }
#postView .blthumb .ed, #postView .blthumb .face { bottom: 27px; }
#postView .psdraft { white-space: pre-wrap; margin-top: 6px; font-size: 13.5px; }
#postView .pssel { display: flex; flex-wrap: wrap; gap: 2px 16px; }
#postView .pssel label { display: flex; align-items: center; gap: 6px; margin: 4px 0; font-size: 14px; color: var(--text); }
#postView .blacts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
#postView .blempty { text-align: center; color: var(--sub); padding: 30px 14px; }
#postView .psthumb { width: 56px; height: 56px; flex: none; border-radius: 8px; object-fit: cover; background: var(--bg); display: grid; place-items: center; }
#postView .psbadges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.blbadge.bad { color: var(--red); border-color: var(--red); }
@media (max-width: 560px) { #postView { padding: 12px 12px 100px; } }
```

- [ ] **Step 3: index.html·sw.js 연결**

`index.html`:
1. `<link rel="stylesheet" href="photo.css?v=202610242009">` 아래에 `<link rel="stylesheet" href="post.css?v=202610242009">`
2. 탭 버튼: `<button data-v="blog">블로그</button>` 바로 뒤에 `<button data-v="post">게시물</button>`
3. CSS `body.mv .layout, … body.blv .layout { display: none; }` 에 `, body.psv .layout` 추가
4. 폰 탭 줄: `@media (max-width: 560px) { .seg button { padding: 7px 12px; white-space: nowrap; } }` → `@media (max-width: 560px) { .seg button { padding: 7px 12px; white-space: nowrap; } .seg div { max-width: 100%; overflow-x: auto; } }` (탭 7개 → 넘치면 옆으로 밀기)
5. `<section id="blogView"></section>` 아래에 `<section id="postView"></section>`
6. `setView()` 첫 줄 끝 `document.body.classList.toggle("blv", v === "blog");` 뒤에 ` document.body.classList.toggle("psv", v === "post");` 추가, `if (v === "blog" && me && window.BL) BL.load();` 아래에 `  if (v === "post" && me && window.PS) PS.load();`
7. 로그인 후 처리의 `if (view === "blog") window.BL?.load();` 아래에 `  if (view === "post") window.PS?.load();`
8. `<script src="blog.js?v=202610242009"></script>` 아래에 `<script src="sns-core.js?v=202610242009"></script>` 와 `<script src="post.js?v=202610242009"></script>`

`sw.js` SHELL: `"photo.js", "photo.css",` 뒤에 `"sns-core.js", "post.js", "post.css",` 추가.

확인: `node --check post.js && node --check sns-core.js && node --check photo.js && node --check blog.js` → 오류 없음.

- [ ] **Step 4: 브라우저로 만들기 흐름 확인 (실제 AI 1회)**

1. `http://localhost:8767` 새로고침 → manager 로그인 상태에서 [게시물] 탭 → 콘솔 오류 없음, 오른쪽에 안내 카드.
2. Task 3 Step 7 의 시험 사진 코드에서 `#blFile` → `#psFile`, 결과 확인 셀렉터 `#psThumbs .blthumb` 로 바꿔 3장 넣기 → `3`.
3. [4:5 세로] 클릭 → 토스트 "3장을 4:5 로 맞췄어요…". 두 번째 썸네일 ◀ 클릭 → 번호 순서 바뀜.
4. 주제 칸에 `11월부터 토요일 오전 10시 프리토킹반을 새로 열어요` → [✨ 문구 만들기] → 40초 안에 오른쪽에 공통 원고·채널 체크 4개(뱃지 "복사 대기")·채널 탭 4개.
5. DB 확인 (서비스 키로 읽기):
   ```bash
   cd ~/.cache/pallo-planner-dev && SRK=$(supabase status -o env | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"/\1/p')
   curl -s "http://127.0.0.1:54321/rest/v1/sns_posts?select=id,photos,channels->naver&order=id.desc&limit=1" -H "apikey: $SRK" -H "Authorization: Bearer $SRK"; echo
   curl -s "http://127.0.0.1:54321/rest/v1/sns_jobs?select=post_id,channel,status&order=id.desc&limit=4" -H "apikey: $SRK" -H "Authorization: Bearer $SRK"; echo
   ```
   Expected: 사진 경로 3개(`1/…jpg`), 네이버 제목 있음 / 작업 4건 전부 `waiting_copy`.
6. 인스타 탭: 점검에 `사진 3장 (캐러셀)` ✔. 해시태그 칸에서 하나 지우기 → 1초 뒤 점검 숫자 바뀜.
7. 네이버 탭: 점검 마지막 줄이 "다른 지점 네이버 소식과…" 로 바뀜.
8. 구글 탭: [🖼 사진 1장 받기] 버튼, 소식 종류 select 를 이벤트로 → 안내문에 "기간도 넣어야 해요".
9. 당근 체크 해제 → 뱃지 사라짐, DB `sns_jobs` 3건. 다시 체크 → 4건.
10. 네이버 탭 [✓ 올렸어요] → 뱃지 "올렸어요", 체크박스 비활성. [↩ 올렸어요 취소] → "복사 대기".
11. [📋 문구 복사] → 토스트 "복사했어요…".
12. `resize_window {preset: "mobile"}` → 탭 줄이 한 줄(넘치면 옆으로 밀림), 게시물 화면이 한 열. 스크린샷. `resize_window {preset: "desktop"}`.
13. 콘솔 오류 없음.

- [ ] **Step 5: 커밋**

```bash
cd ~/pallo-planner-sns && git add post.js post.css index.html sw.js && git commit -m "📸 게시물: 게시물 탭 만들기 화면 (사진·주제 → 4채널 문구, 채널별 점검·복사·사진 받기·올렸어요)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 게시물 탭 — 목록 (다시 열기·지우기)

**Files:**
- Modify: `post.js` (`renderList` 바꾸고 `openPost`·`deletePost` 추가)

**Interfaces:**
- Consumes: Task 5 의 `PS`, `reset`, `renderTab`, `loadJobs`, `pub`, `chOf`, `C.badge`, `C.titleOf`, `PHOTO.fromUrls`
- Produces: `renderList()`, `openPost(id)`, `deletePost(id)` — 같은 IIFE 안 함수

- [ ] **Step 1: 실패 확인**

브라우저에서 [목록] 클릭 → "목록은 다음 단계에서 붙여요." 가 보임 (아직 미구현).

- [ ] **Step 2: 구현**

`post.js` 에서 `// ── 목록 (Task 6 에서 채움) ──` 줄과 그 아래 `function renderList() { … }` 한 줄을 아래로 바꾼다:
```js
// ── 목록: 내 지점 게시물 + 채널별 상태 ──
const ORDER = Object.fromEntries(C.CHANNELS.map((c, i) => [c.key, i]));
async function renderList() {
  $p("#psBody").innerHTML = `<div class="mut">불러오는 중…</div>`;
  const { data, error } = await sb.from("sns_posts").select("id, topic, draft, photos, created_at, sns_jobs(channel, status, run_at, result_url, error_ko)")
    .eq("team_id", PS.team).order("created_at", { ascending: false }).limit(60);
  if (fail(error)) return;
  $p("#psBody").innerHTML = data.length ? `<div class="bllist">${data.map((x) => {
    const jobs = [...x.sns_jobs].sort((a, b) => ORDER[a.channel] - ORDER[b.channel]);
    return `<div class="card">
      ${x.photos?.[0] ? `<img class="psthumb" src="${esc(pub(x.photos[0].path))}" alt="" loading="lazy">` : `<div class="psthumb">📝</div>`}
      <div class="t"><b>${esc(C.titleOf(x))}</b><span class="mut">${x.created_at.slice(0, 10)} · 사진 ${x.photos?.length ?? 0}장</span>
        <div class="psbadges">${jobs.map((j) => { const b = C.badge(j); return j.result_url
          ? `<a class="blbadge ${b.cls}" href="${esc(j.result_url)}" target="_blank" rel="noopener">${esc(chOf(j.channel).label)} ${esc(b.text)} ↗</a>`
          : `<span class="blbadge ${b.cls}">${esc(chOf(j.channel).label)} ${esc(b.text)}</span>`; }).join("") || `<span class="mut">고른 채널 없음</span>`}</div></div>
      <button type="button" class="btn ghost small" data-open="${x.id}">열기</button><button type="button" class="btn ghost small" data-delp="${x.id}">삭제</button></div>`; }).join("")}</div>`
    : `<div class="card blempty">아직 만든 게시물이 없어요. [만들기]에서 문구를 만들면 여기에 쌓여요.</div>`;
}
async function openPost(id) {
  const { data, error } = await sb.from("sns_posts").select("*").eq("id", id).single();
  if (fail(error)) return;
  $p("#psBody").innerHTML = `<div class="mut">사진 불러오는 중…</div>`;
  const got = await PHOTO.fromUrls(data.photos.map((x) => pub(x.path)));
  if (got.includes(null)) toast("불러오지 못한 사진이 있어요 (지워졌을 수 있어요)");
  PS.photos = got.map((p, i) => p && Object.assign(p, { path: data.photos[i].path, pathOf: p.url })).filter(Boolean);
  PS.post = { id: data.id, topic: data.topic, tone: data.tone, draft: data.draft, channels: C.normalizeChannels(data.channels), self_review: "" };
  PS.topic = data.topic; PS.tone = data.tone; PS.ch = "instagram";
  await loadJobs(); PS.sel = new Set(PS.jobs.map((j) => j.channel));
  PS.tab = "make"; renderTab();
}
async function deletePost(id) {
  if (!confirm("이 게시물을 지울까요? 올려 둔 사진 파일도 같이 지워요. 되돌릴 수 없어요.")) return;
  const row = (await sb.from("sns_posts").select("photos").eq("id", id).single()).data;
  const paths = (row?.photos ?? []).map((x) => x.path);
  if (paths.length) { const { error } = await sb.storage.from("sns").remove(paths); if (error) console.warn("사진 파일 지우기 실패", error); }
  const { error } = await sb.from("sns_posts").delete().eq("id", id);
  if (fail(error)) return;
  if (PS.post?.id === id) reset();
  toast("지웠어요"); renderList();
}
```

확인: `node --check post.js` → 오류 없음.

- [ ] **Step 3: 브라우저로 확인**

1. 새로고침 → [게시물] → [목록]: Task 5 에서 만든 게시물 카드 1개, 첫 사진 썸네일, 뱃지 "📸 인스타 복사 대기 · 🔎 구글 복사 대기 · 🟢 네이버 … · 🥕 당근 …" (Task 5 에서 바꾼 상태 그대로).
2. [열기] → 만들기 화면에 사진 3장(🙂 표시)·문구·체크 상태가 그대로 돌아옴. 콘솔 오류 없음.
3. 인스타 캡션 한 글자 고치기 → 2초 뒤 [목록] → [열기] → 고친 글자가 남아 있음.
4. 대표(boss@pallo.test)로 다시 로그인 → [게시물] 지점 선택에 4곳(로컬은 있는 만큼), 대구동성로점 고르면 같은 게시물이 보임, 울산점 고르면 비어 있음.
5. 매니저로 돌아와 [삭제] → 확인 → 카드 사라짐. DB: 그 id 의 `sns_jobs` 0건, Storage `sns/1/` 에서 그 사진 파일들 없음 (`curl -s -o /dev/null -w '%{http_code}' <공개주소>` → `400` 또는 `404`).

- [ ] **Step 4: 커밋**

```bash
cd ~/pallo-planner-sns && git add post.js && git commit -m "📸 게시물: 목록(채널별 상태 뱃지)·다시 열기·지우기(사진 파일 포함)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 문서·마무리 점검·로컬 환경 되돌리기

**Files:**
- Modify: `docs/sns-posts/README.md`
- 로컬: 함수 심볼릭 링크 되돌리기

- [ ] **Step 1: README 갱신**

`docs/sns-posts/README.md` 의 `관련 문서:` 줄 아래에 파일 표를 추가:
```markdown
## 파일 (1단계까지)

| 파일 | 역할 |
|---|---|
| `post.js` / `post.css` | 게시물 탭 화면 (`window.PS`): 만들기 · 목록 |
| `sns-core.js` | 채널 목록·제한·점검·상태 뱃지 순수 함수 (`window.SNSCORE`, `node --test 'tests/*.test.mjs'`) |
| `photo.js` / `photo.css` | 사진 공용 (블로그와 같이 씀): 자르기·모자이크·얼굴·편집 창·복사·번호대로 받기 (`window.PHOTO`) |
| `supabase/migrations/20261025150000_sns.sql` | sns_accounts · sns_posts · sns_jobs + 상태 지킴 트리거 + RLS + `sns` 버킷 |
| `supabase/functions/blog-write` | `sns` action(4채널 문구), `similar` 의 `channel: "naver"` |
| `~/.cache/pallo-planner-dev/test-sns.sh` | 로컬 점검 (저장소 밖). `AI=1` 이면 실제 AI 1회 |
```
"만드는 순서" 표 아래에 추가:
```markdown
**진행:** 0~1단계 구현 완료(브랜치 `feat/sns-posts`, 로컬 확인). 운영 배포 전. 배포 순서: 마이그레이션 → `blog-write` 함수 → 프런트(버전 올리기). 지점 프로필(블로그 탭 [지점 설정])을 저장해 둔 지점이어야 AI가 주소·상담 방법을 씀 — 안 하면 `[확인 필요]`로 나옴.
**알려진 한계(4단계에서 정리):** 다시 연 게시물의 사진을 고치면 새 파일로 올라가고 예전 파일은 버킷에 남는다.
```

- [ ] **Step 2: 전체 점검**

```bash
cd ~/pallo-planner-sns && node --test 'tests/*.test.mjs' && for f in sns-core.js photo.js blog.js post.js; do node --check $f || echo "FAIL $f"; done
cd supabase/functions/blog-write && deno check index.ts
cd ~/.cache/pallo-planner-dev && bash test-sns.sh 2>&1 | tail -20 && bash test-blog.sh 2>&1 | head -6
```
Expected: 테스트 fail 0, check 오류 없음, test-sns 괄호 기대값 일치, test-blog 기존과 같음.

- [ ] **Step 3: 로컬 함수 서버를 main 으로 되돌리기**

```bash
cd ~/.cache/pallo-planner-dev
pkill -f "supabase functions serve" ; sleep 2
ln -sfn ~/pallo-planner/supabase/functions supabase/functions && ls -l supabase/functions
```
그다음 `supabase functions serve --env-file .env.functions` 를 `~/.cache/pallo-planner-dev` 에서 백그라운드로 다시 실행. 확인: `docker inspect supabase_edge_runtime_pallo-planner-dev --format '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' | grep functions` → `…/pallo-planner/supabase/functions`.
(로컬 DB의 sns 테이블은 남겨 둔다 — main 함수는 그 테이블을 쓰지 않으므로 영향 없음.)

- [ ] **Step 4: 커밋·푸시**

```bash
cd ~/pallo-planner-sns && git add docs/sns-posts/README.md && git commit -m "📸 게시물: 문서에 파일 표·진행 상황·배포 순서

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git push origin feat/sns-posts
```

- [ ] **Step 5: 사용자에게 보고하고 배포는 승인 받기**

보고할 것: 만든 기능, 로컬 확인 결과(스크린샷 1~2장), 실제 AI 문구 예시 1개, 남은 것(운영 배포 3단계·네이버/당근 글자 수 실측·메타/구글 준비). **운영 배포는 사용자가 "배포해"라고 한 뒤에만** README 의 배포 순서대로.

---

## Self-Review 결과

- 설계 문서 대비: 화면(만들기·목록) ✔ Task 5·6 / 설정 탭은 2단계로 명시 ✔ / 채널별 변형 규칙 ✔ Task 1(점검)·Task 4(프롬프트) / 네이버만 지점 간 유사도 ✔ Task 4·5 / 테이블 3개·버킷·RLS·사람은 posted 못 씀 ✔ Task 2 / blog_gens kind=sns·blog_limits 합산 ✔ Task 4 / 사진 공용 모듈 ✔ Task 3 / 로컬 검증·권한 점검 스크립트 ✔ Task 2·4·7. 2~4단계 항목(sns-publish, pg_cron, 실시간, 블로그→게시물 보내기, 7일 정리)은 Global Constraints 에서 범위 밖으로 명시.
- 이름 일관성: `SNSCORE.normalizeChannels/normalizeAi/channelText/checkChannel/jobRows/badge/titleOf/tagLine/parseTags/GOOGLE_TYPES/GOOGLE_BUTTONS/CHANNELS`, `PHOTO.fromFiles/fromUrls/setRatio/faceAll/edit/copy/share/pad`, `PS.load` — 정의한 Task 와 쓰는 Task 가 같은 이름.
