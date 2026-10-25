# 💬 매니저 Q&A 탭 구현 계획 (1~3단계 전부)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팔로플래너에 "Q&A" 탭을 만든다 — 매니저 질문에 AI가 대표처럼 답하거나 대표를 기다리게 하고, 대표는 확정·수정·캡처 학습·말투 메모로 AI를 키운다.

**Architecture:** 화면 `qna.js`/`qna.css`(index.html 전역 사용, links.js 방식) + Supabase 테이블 5개(RLS·지킴 트리거) + Edge Function `qna`(ask·extract·suggest·usage, blog-write 와 같은 틀) + 운영 `planner-push` 에 알림 RPC 한 줄. 판정·가리기 규칙은 `supabase/functions/qna/rules.ts`(Deno 테스트).

**Tech Stack:** 정적 HTML + 바닐라 JS(빌드 없음, GitHub Pages), Supabase(Postgres + RLS + pg_trgm + Realtime + Edge Function/Deno), Claude API(`claude-opus-5-5`, 구조화 출력, 서버 측 대체 모델), Deno 2 `deno test`, 로컬 Supabase(`~/.cache/pallo-planner-dev`).

설계: `docs/manager-qna/README.md` (이 계획과 다르면 README 를 이 계획에 맞춰 고친다 — 예: 순수 함수 위치는 `qna-core.js` 대신 `supabase/functions/qna/rules.ts`).

## Global Constraints

- 작업 위치: worktree `~/pallo-planner-qna`, 브랜치 `feat/manager-qna`. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 캐시 버스터: 새 파일 `?v=` 는 지금 값 `202610260019` 그대로. 버전 올리기는 배포 때만.
- **운영 배포·운영 DB·`supabase secrets` 변경은 이 계획에서 하지 않는다.** 로컬에서만 확인 → 마지막에 사용자 승인 받고 README 의 배포 순서대로.
- 비밀값은 채팅·커밋에 넣지 않는다. 로컬 AI 키는 `~/.cache/pallo-planner-dev/.env.functions` 에 이미 있다(값 출력 금지).
- 모델 `claude-opus-5-5`, `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"`, `output_config.effort` 명시, `temperature` 등 샘플링 값 쓰지 않음(blog-write 와 동일).
- 화면 글은 존댓말·짧게(기존 탭 말투). 대표 = `role=admin` (`isBoss`), 매니저 = 그 외.
- 매니저 질문은 **함수(service_role)만 넣는다**. 사람이 바꿀 수 있는 칸은 트리거가 지킨다.
- 하루 한도: 매니저 지점당 `ask` 50회(`qna_limits.daily`), 대표는 제한 없음.
- 캡처 원본 사진은 어디에도 저장하지 않는다(Storage 안 씀).

## 로컬 환경 메모 (구현 전에 읽기)

- 로컬 Supabase: `~/.cache/pallo-planner-dev` (`supabase status --workdir ~/.cache/pallo-planner-dev`). 지점 1 대구동성로점·2 대구일본어중국어점·3 울산점·4 구미점. 계정 `boss@pallo.test`(대표, 지점1) · `manager@pallo.test`(지점1). 비밀번호는 `dev-accounts.txt`.
- 마이그레이션 적용(데이터 유지): `docker exec -i supabase_db_pallo-planner-dev psql -U postgres -d postgres -v ON_ERROR_STOP=1 < <파일>` + 같은 파일을 `~/.cache/pallo-planner-dev/supabase/migrations/` 에 복사.
- 함수: `~/.cache/pallo-planner-dev/supabase/functions` 는 `~/pallo-planner/supabase/functions` 심볼릭 링크 → 작업 동안 worktree 로 돌리고(Task 3) 끝에 되돌린다(Task 9).
- 프런트 확인: 세션 폴더 `/Volumes/wonpaper308/.claude/launch.json` 의 `planner-qna`(8768, `--directory ~/pallo-planner-qna`) → `http://localhost:8768/`. 테스트 캡처는 PIL 대신 크롬 헤드리스로 `~/.cache/pallo-planner-dev/qna-cap.html` 을 찍는다 (config.js 가 localhost 면 로컬 Supabase 사용). 로컬 DB 엔 tasks 등 옛 테이블이 없어서 다른 탭 콘솔 오류는 무시, Q&A 탭 오류만 본다.

## 파일

| 파일 | 역할 |
|---|---|
| `supabase/functions/qna/rules.ts` · `rules_test.ts` | `route()` · `maskPII()` · `editRatio()` 순수 함수 + Deno 테스트 |
| `supabase/migrations/20261026120000_qna.sql` | qna_items · qna_style · qna_suggestions · qna_gens · qna_limits, 지킴 트리거, RLS, `qna_search` · `qna_pick_refs` · `claim_qna_notices`, realtime |
| `supabase/migrations/20261026130000_qna_grants.sql` | 테이블·함수 API 권한 |
| `supabase/functions/qna/index.ts` · `prompt.ts` | AI 함수 |
| `qna.js` / `qna.css` | 화면 (`window.QA`) |
| `index.html` · `sw.js` | 탭 버튼·섹션·스크립트·실시간·캐시 목록 |
| `supabase/functions/planner-push/index.ts` | 운영에서 받은 원본 + Q&A 알림 (저장소에 처음 넣음) |
| `~/.cache/pallo-planner-dev/test-qna.sh` | 로컬 점검 (저장소 밖) |

---

### Task 1: 판정·가리기 규칙 (rules.ts)

**Files:** Create `supabase/functions/qna/rules.ts`, `supabase/functions/qna/rules_test.ts`

**Interfaces — Produces:**
- `type AskOut = { grounded: boolean; decision_request: boolean; sensitive: boolean; answer: string; refs: number[]; reason: string }`
- `route(out: AskOut, allowed: number[]): { status: "ai" | "waiting"; refs: number[] }` — 근거 있음 + 허락·결정 요청 아님 + 실제로 넘긴 참고 id 1개 이상 + 답 있음 → `ai`
- `maskPII(s: string): string` — 이메일 → `***@***`, 휴대폰·지역번호 → `010-****-****` 꼴, 숫자 10자리 이상 묶음(계좌) → `****`. 날짜(2026-10-26)·시간·금액(150,000원)은 그대로.
- `editRatio(a: string, b: string): number` — 공백 정리 후 글자 단위 편집 거리 / 긴 쪽 길이 (0~1)

- [ ] **Step 1: 테스트 쓰기** — `rules_test.ts`:
```ts
import { assertEquals } from "jsr:@std/assert@1";
import { editRatio, maskPII, route, type AskOut } from "./rules.ts";

const out = (o: Partial<AskOut>): AskOut => ({ grounded: true, decision_request: false, sensitive: false, answer: "네, 그렇게 하시면 돼요", refs: [3], reason: "", ...o });

Deno.test("route: 근거 있고 허락 요청 아니면 바로 답", () => {
  assertEquals(route(out({}), [3, 4]), { status: "ai", refs: [3] });
});
Deno.test("route: 허락·결정 요청은 근거 있어도 대표 대기", () => {
  assertEquals(route(out({ decision_request: true }), [3]).status, "waiting");
});
Deno.test("route: 근거 없음 → 대기", () => {
  assertEquals(route(out({ grounded: false }), [3]).status, "waiting");
});
Deno.test("route: 넘기지 않은 번호는 버리고, 남는 근거가 없으면 대기", () => {
  assertEquals(route(out({ refs: [99, 3, 3] }), [3]), { status: "ai", refs: [3] });
  assertEquals(route(out({ refs: [99] }), [3]), { status: "waiting", refs: [] });
});
Deno.test("route: 답이 비면 대기", () => {
  assertEquals(route(out({ answer: "  " }), [3]).status, "waiting");
});
Deno.test("maskPII: 전화번호·이메일·계좌", () => {
  assertEquals(maskPII("연락처 010-1234-5678 / 01098765432 / +82 10-2222-3333"), "연락처 010-****-**** / 010-****-**** / 010-****-****");
  assertEquals(maskPII("지점 053-123-4567 로"), "지점 0**-****-**** 로");
  assertEquals(maskPII("메일 kim.pallo@gmail.com 로"), "메일 ***@*** 로");
  assertEquals(maskPII("계좌 110-123-456789 입금"), "계좌 **** 입금");
});
Deno.test("maskPII: 날짜·시간·금액은 그대로", () => {
  const s = "2026-10-26 19:30 수업, 수강료 150,000원, 5개월 플랜";
  assertEquals(maskPII(s), s);
});
Deno.test("editRatio: 같으면 0, 전부 다르면 1, 공백 차이는 무시", () => {
  assertEquals(editRatio("안녕하세요", "안녕하세요"), 0);
  assertEquals(editRatio("가나", "다라"), 1);
  assertEquals(editRatio("네  알겠어요\n", "네 알겠어요"), 0);
  assertEquals(editRatio("", ""), 0);
});
Deno.test("editRatio: 조금 고치면 작은 값", () => {
  const r = editRatio("수업은 7시에 시작해요", "수업은 7시 반에 시작해요");
  if (!(r > 0 && r < 0.2)) throw new Error(`ratio ${r}`);
});
```
- [ ] **Step 2: 실패 확인** — `cd ~/pallo-planner-qna/supabase/functions/qna && deno test rules_test.ts` → 모듈 없음 오류.
- [ ] **Step 3: 구현** — `rules.ts`:
```ts
// 💬 Q&A 판정·가리기 규칙 (순수 함수). index.ts 가 쓰고 rules_test.ts 가 확인한다: deno test supabase/functions/qna/rules_test.ts
export type AskOut = { grounded: boolean; decision_request: boolean; sensitive: boolean; answer: string; refs: number[]; reason: string };

// 바로 답하는 조건: 확정 답변에 근거(실제로 넘긴 번호) + 허락·결정 요청 아님 + 답이 있음. 하나라도 빠지면 대표를 기다린다
export function route(out: AskOut, allowed: number[]): { status: "ai" | "waiting"; refs: number[] } {
  const ok = new Set(allowed);
  const refs = [...new Set((out.refs ?? []).filter((id) => ok.has(id)))];
  const direct = out.grounded === true && out.decision_request !== true && refs.length > 0 && String(out.answer ?? "").trim().length > 0;
  return { status: direct ? "ai" : "waiting", refs };
}

// 캡처에서 뽑은 글에 남은 개인정보를 한 번 더 가린다 (AI 가 1차로 가림)
export function maskPII(s: string): string {
  return String(s ?? "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "***@***")
    .replace(/(?<!\d)(\+82[-\s]?)?0?1[016789][-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/g, "010-****-****")
    .replace(/(?<!\d)0[2-6]\d?-\d{3,4}-\d{4}(?!\d)/g, "0**-****-****")
    .replace(/(?<!\d)\d[\d-]{8,}\d(?!\d)/g, (m) => (m.replace(/-/g, "").length >= 10 ? "****" : m));
}

// 대표가 AI 초안을 얼마나 고쳤나 (0 = 그대로, 1 = 전부 새로)
export function editRatio(a: string, b: string): number {
  const x = [...String(a ?? "").replace(/\s+/g, " ").trim()], y = [...String(b ?? "").replace(/\s+/g, " ").trim()];
  if (!x.length && !y.length) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length] / Math.max(x.length, y.length);
}
```
- [ ] **Step 4: 통과 확인** — 같은 명령 → 모두 ok.
- [ ] **Step 5: 커밋** — `git add supabase/functions/qna && git commit -m "💬 Q&A: 판정·개인정보 가리기·고친 정도 규칙 (rules.ts + 테스트)"`

### Task 2: 데이터 — 마이그레이션 + 로컬 권한 점검

**Files:** Create `supabase/migrations/20261026120000_qna.sql`, `supabase/migrations/20261026130000_qna_grants.sql`, `~/.cache/pallo-planner-dev/test-qna.sh`

**Interfaces — Produces:**
- `qna_items` 칸: id, user_id(→profiles), team_id(→teams), asker_label, question, private, auto_private, status(ai|waiting|final), ai_answer, answer, ai_flags, refs bigint[], only_team(→teams), reviewed, resolved, escalated, source(ask|capture), notified_wait, notified_final, created_at, updated_at, final_at
- `qna_style(id=1, memo)`, `qna_suggestions(id, item_id, line, why, status)`, `qna_gens(team_id, user_id, kind, input_tokens, output_tokens, cost_usd, meta)`, `qna_limits(team_id, daily)`
- RPC `qna_search(q text, n int = 5)` → (id, question, answer, only_team, final_at, score) — 화면용, RLS 그대로
- RPC `qna_pick_refs(q text, team bigint, n int = 40)` → (id, question, answer) — 서비스 키만
- RPC `claim_qna_notices()` → (user_id, title, body, tag) — 서비스 키만, 부르면 보낸 것으로 표시

- [ ] **Step 1: 점검 스크립트 먼저 쓰기** — `~/.cache/pallo-planner-dev/test-qna.sh` (아래 내용; Task 3 에서 함수 부분을 덧붙인다):
```bash
#!/bin/bash
# 💬 Q&A 탭 로컬 점검: 권한(RLS)·지킴 트리거·알림 RPC (+ 함수, AI=1 이면 실제 AI). 각 줄 괄호 안 기대값과 비교
cd "$(dirname "$0")"
API=http://127.0.0.1:54321
PK=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH
SRK=$(supabase status -o env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"/\1/p')
PW=$(sed -n 's/^password: //p' dev-accounts.txt)
login() { curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $PK" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"$PW\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'; }
code() { curl -s -o /dev/null -w '%{http_code}' "$API/rest/v1/$2" -H "apikey: $PK" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' "${@:3}"; echo; }
body() { curl -s "$API/rest/v1/$2" -H "apikey: $PK" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -H 'Prefer: return=representation' "${@:3}"; echo; }
svc() { curl -s "$API/rest/v1/$1" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H 'Content-Type: application/json' -H 'Prefer: return=representation' "${@:2}"; echo; }
fn() { curl -s "$API/functions/v1/qna" -H "apikey: $PK" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' -d "$2"; echo; }
jid() { python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["id"])'; }

# 다른 지점(울산점 3) 매니저 계정 — 없으면 만든다
if ! login manager3@pallo.test >/dev/null 2>&1; then
  U=$(curl -s "$API/auth/v1/admin/users" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H 'Content-Type: application/json' \
    -d "{\"email\":\"manager3@pallo.test\",\"password\":\"$PW\",\"email_confirm\":true}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
  svc profiles -X POST -d "{\"user_id\":\"$U\",\"team_id\":3,\"role\":\"manager\",\"name\":\"울산매니저\"}" >/dev/null
fi
M=$(login manager@pallo.test); M3=$(login manager3@pallo.test); B=$(login boss@pallo.test)
MID=$(svc "profiles?select=user_id&team_id=eq.1&role=eq.manager" | python3 -c 'import sys,json;print(json.load(sys.stdin)[0]["user_id"])')

echo -n "== 매니저: 질문 직접 넣기 (403 또는 400) "; code "$M" qna_items -X POST -d '{"question":"몰래 넣기","status":"final","answer":"x"}'
PUB=$(svc qna_items -X POST -d "{\"user_id\":\"$MID\",\"team_id\":1,\"question\":\"점검: 공개 질문\",\"status\":\"ai\",\"answer\":\"AI 답\",\"ai_answer\":\"AI 답\"}" | jid)
PRV=$(svc qna_items -X POST -d "{\"user_id\":\"$MID\",\"team_id\":1,\"question\":\"점검: 🔒 질문\",\"private\":true}" | jid)
echo "== 서비스 키로 질문 2개 → $PUB(ai) $PRV(🔒 waiting)"
echo "== 울산 매니저: 확정 전 질문 안 보임 ([])"; body "$M3" "qna_items?id=in.($PUB,$PRV)&select=id"
echo -n "== 매니저: 답 위조 (204 이지만 답·상태 그대로) "; code "$M" "qna_items?id=eq.$PUB" -X PATCH -d '{"answer":"위조","private":false,"reviewed":true}'
echo "== 답 그대로 (answer AI 답, reviewed false)"; body "$B" "qna_items?id=eq.$PUB&select=answer,reviewed"
echo -n "== 매니저: 직접 확정 (400) "; code "$M" "qna_items?id=eq.$PUB" -X PATCH -d '{"status":"final"}'
echo -n "== 매니저: 👍 해결 (204) "; code "$M" "qna_items?id=eq.$PUB" -X PATCH -d '{"resolved":true}'
echo -n "== 매니저: 🙋 대표님께 (204) "; code "$M" "qna_items?id=eq.$PUB" -X PATCH -d '{"status":"waiting"}'
echo "== 🙋 뒤 (status waiting, escalated true, notified_wait false, resolved true)"; body "$B" "qna_items?id=eq.$PUB&select=status,escalated,notified_wait,resolved"
echo -n "== 대표: 확정 + 울산점만 (204) "; code "$B" "qna_items?id=eq.$PUB" -X PATCH -d '{"status":"final","answer":"대표 답","only_team":3}'
echo "== 확정 뒤 (final_at 있음, reviewed true, notified_final false)"; body "$B" "qna_items?id=eq.$PUB&select=final_at,reviewed,notified_final"
echo "== 울산 매니저: 울산점만 답 보임 ([$PUB])"; body "$M3" "qna_items?status=eq.final&select=id"
echo -n "== 대표: 대구동성로점만으로 바꿈 (204) "; code "$B" "qna_items?id=eq.$PUB" -X PATCH -d '{"only_team":1}'
echo "== 울산 매니저: 이제 안 보임 ([])"; body "$M3" "qna_items?id=eq.$PUB&select=id"
echo "== 매니저(대구): FAQ 검색 (id $PUB)"; body "$M" "rpc/qna_search" -X POST -d '{"q":"공개"}'
echo -n "== 대표: 🔒 질문 확정 (204) "; code "$B" "qna_items?id=eq.$PRV" -X PATCH -d '{"status":"final","answer":"비밀 답"}'
echo "== 울산 매니저: 🔒 확정 답 안 보임 ([])"; body "$M3" "qna_items?id=eq.$PRV&select=id"
echo "== 서비스: 참고 예시 (대구 지점) — $PRV 없어야 함"; svc "rpc/qna_pick_refs" -X POST -d '{"q":"질문","team":1}'
svc qna_items -X POST -d "{\"user_id\":\"$MID\",\"team_id\":1,\"question\":\"점검: 대기 알림\",\"notified_wait\":false}" >/dev/null
echo "== 서비스: 알림 가져가기 (대표 💬 1건 + 매니저 ✅ 2건)"; svc "rpc/claim_qna_notices" -X POST -d '{}'
echo "== 다시 부르면 ([])"; svc "rpc/claim_qna_notices" -X POST -d '{}'
echo -n "== 매니저: 알림 RPC 직접 (401 또는 403 또는 404) "; code "$M" "rpc/claim_qna_notices" -X POST -d '{}'
echo -n "== 매니저: 말투 메모 읽기 ([]) "; body "$M" "qna_style?select=memo"
echo -n "== 대표: 말투 메모 쓰기 (204) "; code "$B" "qna_style?id=eq.1" -X PATCH -d '{"memo":"존댓말, 결론 먼저"}'
echo -n "== 대표: 캡처 쌍 저장 (201) "; code "$B" qna_items -X POST -d '{"question":"점검: 캡처 질문","answer":"캡처 답","status":"final","source":"capture","asker_label":"○○ 매니저"}'
echo -n "== 매니저: 확정 답 지우기 (204 이지만 안 지워짐) "; code "$M" "qna_items?id=eq.$PUB" -X DELETE
echo "== 남아 있음 (id $PUB)"; body "$B" "qna_items?id=eq.$PUB&select=id"
svc "qna_items?question=like.점검:*" -X DELETE >/dev/null
echo "== 점검 데이터 정리 끝"
```
`chmod +x` 한다.
- [ ] **Step 2: 실패 확인** — `bash ~/.cache/pallo-planner-dev/test-qna.sh` → 테이블 없음(404/PGRST205) 줄들.
- [ ] **Step 3: 마이그레이션 쓰기** — `supabase/migrations/20261026120000_qna.sql`:
```sql
-- 💬 매니저 Q&A 탭: 질문·답 · 말투 메모 · 메모 제안 · AI 사용 기록 · 하루 한도 (설계: docs/manager-qna/README.md)
-- 권한은 블로그와 같은 도우미(blog_my_team / blog_is_admin). 매니저 질문은 Edge Function(service_role)만 넣는다.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.qna_items (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(user_id) on delete set null, -- 물어본 매니저 (캡처로 들어온 건 null)
  team_id bigint references public.teams(id) on delete set null,       -- 물어본 매니저 지점
  asker_label text not null default '',                                -- 캡처용 가린 이름 (○○ 매니저)
  question text not null check (length(question) between 2 and 2000),
  private boolean not null default false,                              -- 🔒 본인 + 대표만, AI 참고에서도 빠짐
  auto_private boolean not null default false,                         -- AI 가 켠 🔒 (표시용)
  status text not null default 'waiting' check (status in ('ai', 'waiting', 'final')),
  ai_answer text not null default '',                                  -- AI 초안 원본 (고친 정도 비교용)
  answer text not null default '',                                     -- 보여 줄 답: ai 면 AI 답, final 이면 대표 확정 답
  ai_flags jsonb not null default '{}',                                -- {grounded, decision_request, sensitive, reason}
  refs bigint[] not null default '{}',                                 -- AI 가 참고한 qna_items.id
  only_team bigint references public.teams(id) on delete set null,     -- ○○점만 해당
  reviewed boolean not null default false,                             -- 대표가 봤는지 (ai 답 사후 확인)
  resolved boolean not null default false,                             -- 매니저 👍
  escalated boolean not null default false,                            -- 매니저 🙋 (AI 답 → 대표님께)
  source text not null default 'ask' check (source in ('ask', 'capture')),
  notified_wait boolean not null default true,                         -- false = 대표에게 💬 알림 보낼 차례 (planner-push)
  notified_final boolean not null default true,                        -- false = 매니저에게 ✅ 알림 보낼 차례
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  final_at timestamptz
);
create index if not exists qna_items_status_idx on public.qna_items (status, created_at desc);
create index if not exists qna_items_user_idx on public.qna_items (user_id, created_at desc);
create index if not exists qna_items_q_trgm on public.qna_items using gin (question extensions.gin_trgm_ops);

-- 지킴: 대표·서버는 자유, 매니저는 자기 것 중 👍(resolved)·🔒 켜기·🙋(ai → waiting)만. 나머지 칸은 old 값으로 되돌린다
create or replace function public.qna_items_guard() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'final' and (tg_op = 'INSERT' or old.status <> 'final') then
    new.final_at := now(); new.reviewed := true;
    new.notified_final := new.user_id is null or new.source = 'capture';
  end if;
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.blog_is_admin() then return new; end if;
  if tg_op = 'INSERT' then raise exception '질문은 Q&A 화면에서 보내 주세요'; end if;
  if old.user_id is distinct from auth.uid() then raise exception '내 질문만 바꿀 수 있어요'; end if;
  if new.status <> old.status and not (old.status = 'ai' and new.status = 'waiting') then
    raise exception '답 확정은 대표님만 할 수 있어요';
  end if;
  new.escalated := old.escalated or (old.status = 'ai' and new.status = 'waiting');
  new.notified_wait := case when old.status = 'ai' and new.status = 'waiting' then false else old.notified_wait end;
  new.reviewed := case when old.status = 'ai' and new.status = 'waiting' then false else old.reviewed end;
  new.private := old.private or new.private;
  new.user_id := old.user_id; new.team_id := old.team_id; new.asker_label := old.asker_label; new.question := old.question;
  new.auto_private := old.auto_private; new.ai_answer := old.ai_answer; new.answer := old.answer; new.ai_flags := old.ai_flags;
  new.refs := old.refs; new.only_team := old.only_team; new.source := old.source; new.notified_final := old.notified_final;
  new.created_at := old.created_at; new.final_at := old.final_at;
  return new;
end $$;
drop trigger if exists qna_items_guard on public.qna_items;
create trigger qna_items_guard before insert or update on public.qna_items for each row execute function public.qna_items_guard();

alter table public.qna_items enable row level security;
drop policy if exists qna_items_read on public.qna_items;
create policy qna_items_read on public.qna_items for select to authenticated using (
  public.blog_is_admin() or user_id = auth.uid()
  or (status = 'final' and not private and (only_team is null or only_team = public.blog_my_team())));
drop policy if exists qna_items_ins on public.qna_items;
create policy qna_items_ins on public.qna_items for insert to authenticated with check (public.blog_is_admin());
drop policy if exists qna_items_upd on public.qna_items;
create policy qna_items_upd on public.qna_items for update to authenticated
  using (public.blog_is_admin() or user_id = auth.uid()) with check (public.blog_is_admin() or user_id = auth.uid());
drop policy if exists qna_items_del on public.qna_items;
create policy qna_items_del on public.qna_items for delete to authenticated
  using (public.blog_is_admin() or (user_id = auth.uid() and status = 'waiting'));

-- 대표 말투·원칙 메모 (한 줄짜리 표)
create table if not exists public.qna_style (
  id int primary key default 1 check (id = 1),
  memo text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.qna_style (id) values (1) on conflict do nothing;
alter table public.qna_style enable row level security;
drop policy if exists qna_style_admin on public.qna_style;
create policy qna_style_admin on public.qna_style for all to authenticated using (public.blog_is_admin()) with check (public.blog_is_admin());

-- AI 가 낸 메모 추가 제안 (수락한 것만 메모에 들어감)
create table if not exists public.qna_suggestions (
  id bigint generated always as identity primary key,
  item_id bigint references public.qna_items(id) on delete set null,
  line text not null,
  why text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.qna_suggestions enable row level security;
drop policy if exists qna_suggestions_admin on public.qna_suggestions;
create policy qna_suggestions_admin on public.qna_suggestions for all to authenticated using (public.blog_is_admin()) with check (public.blog_is_admin());

-- AI 사용 기록: 하루 한도·비용·캡처 기록(meta={shots, pairs}). Edge Function(서비스 키)만 쓴다
create table if not exists public.qna_gens (
  id bigint generated always as identity primary key,
  team_id bigint references public.teams(id) on delete set null,
  user_id uuid not null,
  kind text not null check (kind in ('ask', 'extract', 'suggest')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists qna_gens_team_idx on public.qna_gens (team_id, kind, created_at desc);
alter table public.qna_gens enable row level security;
drop policy if exists qna_gens_admin on public.qna_gens;
create policy qna_gens_admin on public.qna_gens for select to authenticated using (public.blog_is_admin());

-- 지점별 하루 질문 한도 (없으면 50)
create table if not exists public.qna_limits (
  team_id bigint primary key references public.teams(id) on delete cascade,
  daily int not null default 50 check (daily between 0 and 1000)
);
alter table public.qna_limits enable row level security;
drop policy if exists qna_limits_admin on public.qna_limits;
create policy qna_limits_admin on public.qna_limits for all to authenticated using (public.blog_is_admin()) with check (public.blog_is_admin());

-- FAQ 검색 ("이미 있는 답"): 확정 · 🔒 아님 · 우리 지점 해당. 부른 사람 권한(RLS) 그대로
create or replace function public.qna_search(q text, n int default 5)
returns table (id bigint, question text, answer text, only_team bigint, final_at timestamptz, score real)
language sql stable security invoker set search_path = public, extensions as $$
  select i.id, i.question, i.answer, i.only_team, i.final_at,
         greatest(similarity(i.question, q), word_similarity(q, i.question)) as score
  from qna_items i
  where i.status = 'final' and not i.private
    and (i.only_team is null or i.only_team = blog_my_team() or blog_is_admin())
    and (greatest(similarity(i.question, q), word_similarity(q, i.question)) > 0.2
         or i.question ilike '%' || q || '%' or i.answer ilike '%' || q || '%')
  order by score desc, i.final_at desc
  limit least(greatest(n, 1), 20)
$$;

-- AI 참고 예시: 확정 · 🔒 아님 · (지점 한정 없음 또는 이 지점). 300개 이하면 전부(최신순), 넘으면 비슷한 것 n개
create or replace function public.qna_pick_refs(q text, team bigint, n int default 40)
returns table (id bigint, question text, answer text)
language sql stable security definer set search_path = public, extensions as $$
  with e as (
    select i.id, i.question, i.answer, i.final_at, greatest(similarity(i.question, q), word_similarity(q, i.question)) as s
    from qna_items i
    where i.status = 'final' and not i.private and (i.only_team is null or i.only_team = team)
  ), c as (select count(*) as k from e)
  select e.id, e.question, e.answer from e, c
  order by case when c.k <= 300 then 0 else e.s end desc, e.final_at desc
  limit case when (select k from c) <= 300 then 300 else n end
$$;

-- planner-push(1분마다)가 부른다: 대표에게 💬 새 대기 질문, 매니저에게 ✅ 확정 알림. 가져간 건 보낸 것으로 표시
create or replace function public.claim_qna_notices()
returns table (user_id uuid, title text, body text, tag text)
language sql volatile security definer set search_path = public as $$
  with w as (
    update qna_items set notified_wait = true
    where notified_wait = false and status = 'waiting'
    returning qna_items.id, qna_items.user_id as asker, qna_items.team_id, qna_items.question
  ), f as (
    update qna_items set notified_final = true
    where notified_final = false and status = 'final' and qna_items.user_id is not null
    returning qna_items.id, qna_items.user_id as asker, qna_items.question
  )
  select b.user_id, '💬 ' || coalesce(t.name || ' ', '') || coalesce(p.name, '매니저') || '님 질문',
         left(regexp_replace(w.question, '\s+', ' ', 'g'), 80), 'qna-' || w.id
  from w cross join profiles b
  left join profiles p on p.user_id = w.asker left join teams t on t.id = w.team_id
  where b.role = 'admin'
  union all
  select f.asker, '✅ 대표님이 답했어요', left(regexp_replace(f.question, '\s+', ' ', 'g'), 80), 'qna-' || f.id from f
$$;

-- 실시간: 대표 확인 목록·매니저 내 질문이 바로 바뀌게 (RLS 로 걸러서 감)
do $$ begin
  alter publication supabase_realtime add table public.qna_items;
exception when duplicate_object or undefined_object then null;
end $$;
```
- [ ] **Step 4: 권한 마이그레이션 쓰기** — `supabase/migrations/20261026130000_qna_grants.sql`:
```sql
-- 💬 Q&A 테이블·함수 API 권한. 이 프로젝트는 새 테이블에 기본 GRANT 가 붙지 않아서 직접 준다 (sns_grants 와 같은 이유).
-- 누가 무엇을 하는지는 20261026120000_qna.sql 의 RLS·트리거가 막는다.
grant select, insert, update, delete on public.qna_items, public.qna_style, public.qna_suggestions, public.qna_limits to authenticated;
grant select on public.qna_gens to authenticated;
grant select, insert, update, delete on public.qna_items, public.qna_style, public.qna_suggestions, public.qna_gens, public.qna_limits to service_role;
grant execute on function public.qna_search(text, int) to authenticated, service_role;
revoke execute on function public.qna_pick_refs(text, bigint, int) from public, anon, authenticated;
grant execute on function public.qna_pick_refs(text, bigint, int) to service_role;
revoke execute on function public.claim_qna_notices() from public, anon, authenticated;
grant execute on function public.claim_qna_notices() to service_role;
```
- [ ] **Step 5: 로컬 적용** — 두 파일을 psql 로 적용하고 `~/.cache/pallo-planner-dev/supabase/migrations/` 에 복사:
```bash
cd ~/pallo-planner-qna && for f in supabase/migrations/2026102612*_qna.sql supabase/migrations/2026102613*_qna_grants.sql; do docker exec -i supabase_db_pallo-planner-dev psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$f" && cp "$f" ~/.cache/pallo-planner-dev/supabase/migrations/; done
```
- [ ] **Step 6: 점검** — `bash ~/.cache/pallo-planner-dev/test-qna.sh` → 모든 줄이 괄호 기대값과 같음. 틀리면 마이그레이션을 고치고 같은 psql 로 다시 적용(create or replace / drop policy if exists 라 다시 돌려도 됨).
- [ ] **Step 7: 커밋** — `git add supabase/migrations/2026102612*_qna.sql supabase/migrations/2026102613*_qna_grants.sql && git commit -m "💬 Q&A: 테이블·RLS·지킴 트리거·검색/참고/알림 RPC (마이그레이션 2개)"`

### Task 3: AI 함수 `qna` — ask · usage

**Files:** Create `supabase/functions/qna/index.ts`, `supabase/functions/qna/prompt.ts`; Modify `~/.cache/pallo-planner-dev/test-qna.sh` (끝에 함수 점검 추가)

**Interfaces:**
- Consumes: Task 1 `route`, Task 2 테이블·`qna_pick_refs`
- Produces (화면이 부름, `sb.functions.invoke("qna", { body })`):
  - `{action:"ask", question, private}` → `{ item: qna_items 행 전체 }` (AI 실패·한도 초과도 200 + `item.status='waiting'`, `item.ai_flags.reason` 에 사유)
  - `{action:"usage"}` → `{ used: number, limit: number | null }` (대표는 limit null)
  - 오류 응답은 `{ error: "한국어 문장" }` + 4xx/5xx (blog-write 와 같음)

- [ ] **Step 1: 점검 줄 추가 (실패 확인용)** — `test-qna.sh` 의 `echo "== 점검 데이터 정리 끝"` 줄 **앞**에 추가:
```bash
echo "== 함수: 빈 질문 (\"질문을 적어 주세요\")"; fn "$M" '{"action":"ask","question":" "}'
echo "== 함수: 사용량 (used 숫자, limit 50)"; fn "$M" '{"action":"usage"}'
echo "== 함수: 대표 사용량 (limit null)"; fn "$B" '{"action":"usage"}'
if [ "$AI" = 1 ]; then
  svc qna_items -X POST -d '{"question":"점검: 상담 일지는 어디에 쓰나요?","answer":"상담 일지는 지점 구글 시트 상담일지 탭에 당일 바로 적어 주세요.","status":"final","source":"capture"}' >/dev/null
  echo "== AI: 근거 있는 질문 (status ai, refs 1개 이상)"
  fn "$M" '{"action":"ask","question":"점검: 상담 일지 어디에 적어야 해요?"}' | python3 -c 'import sys,json;r=json.load(sys.stdin);i=r.get("item",r);print(i.get("status"),i.get("refs"),i.get("answer","")[:60],r.get("error",""))'
  echo "== AI: 허락 요청 (status waiting, decision_request true)"
  fn "$M" '{"action":"ask","question":"점검: 오늘 몸이 안 좋아서 4시에 조퇴해도 될까요?"}' | python3 -c 'import sys,json;r=json.load(sys.stdin);i=r.get("item",r);print(i.get("status"),i.get("ai_flags"),r.get("error",""))'
  echo "== AI: 민감 질문 (private true, auto_private true)"
  fn "$M" '{"action":"ask","question":"점검: 제 이번 달 월급이 지난달보다 적게 들어왔는데 이유가 뭘까요?"}' | python3 -c 'import sys,json;r=json.load(sys.stdin);i=r.get("item",r);print(i.get("status"),i.get("private"),i.get("auto_private"),r.get("error",""))'
fi
```
그리고 `bash test-qna.sh` → 함수 줄이 404/연결 오류.
- [ ] **Step 2: prompt.ts 쓰기**:
```ts
// 💬 Q&A 프롬프트·출력 형식. 규칙을 바꾸면 docs/manager-qna/README.md 의 "AI 함수" 도 같이 고친다.

export const ASK_SYSTEM = `너는 팔로(영어회화 학원, 대구·울산·구미 지점) 대표를 대신해 매니저 질문에 답하는 비서다.
대표가 직접 답한 것처럼, 아래 "확정 답변"과 "대표 말투·원칙 메모"만 근거로 답한다.

판단 규칙
- grounded: 확정 답변 중 이 질문에 그대로 적용되는 답이 있으면 true. 비슷해 보여도 날짜·금액·대상·조건이 다르면 false.
- 확정 답변에 없는 사실(날짜, 금액, 규정, 사람, 일정)은 지어내지 않는다. 모르면 grounded=false.
- decision_request: 매니저가 허락·결정·승인을 구하면 true (조퇴·휴가·근무 변경·환불·할인·예외 처리·비용 지출 등). 방법·위치·절차를 묻는 질문은 false.
- sensitive: 급여·인사 평가·징계·개인 사정·건강·다른 직원에 대한 이야기·고객 개인정보가 들어 있으면 true.
- refs: 근거로 쓴 확정 답변 번호(#숫자의 숫자)만. 근거가 없으면 빈 배열.
- answer: grounded=true 면 매니저에게 바로 보낼 답. grounded=false 면 대표가 고쳐 쓰기 좋은 초안 — 모르는 부분은 [대표님 확인]으로 비워 둔다.
- 말투·원칙 메모를 반드시 따른다. 메모가 비어 있으면: 존댓말, 결론 먼저, 3~5문장, 이모지는 많아야 1개.
- reason: 판단 이유 한 줄 (대표만 본다).`;

export const ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["grounded", "decision_request", "sensitive", "answer", "refs", "reason"],
  properties: {
    grounded: { type: "boolean" },
    decision_request: { type: "boolean" },
    sensitive: { type: "boolean" },
    answer: { type: "string" },
    refs: { type: "array", items: { type: "integer" } },
    reason: { type: "string" },
  },
} as const;

export const EXTRACT_SYSTEM = `너는 카카오톡 대화 캡처에서 "매니저가 묻고 대표가 답한" 질문·답 쌍을 뽑는다.
- 캡처는 대표 본인 폰이다. 오른쪽 노란 말풍선 = 대표, 왼쪽 말풍선(이름 표시) = 상대(매니저). 단체방이면 이름으로 사람을 구분한다.
- 상대가 묻고 대표가 답한 것만 쌍으로 만든다. 인사·잡담·사진만 있는 것·답이 없는 질문은 버린다.
- 여러 말풍선으로 나뉜 질문/답은 하나로 합친다. 캡처 여러 장은 순서대로 이어진 대화로 보고, 겹치는 부분은 한 번만 쓴다.
- question: 다른 매니저가 읽어도 알 수 있게 맥락을 넣어 한두 문장으로 다듬는다 (뜻은 바꾸지 않는다).
- answer: 대표가 쓴 말을 최대한 그대로 (말투 유지, 오타만 고침).
- asker_label: 사람 이름은 "○○ 매니저"처럼 가린다. 전화번호·계좌·주소·고객 이름은 ○○로 가린다 (question·answer 안에서도).
- sensitive: 급여·인사·징계·개인 사정·건강·다른 직원 이야기·고객 개인정보면 true.
- 쌍이 없으면 빈 배열.`;

export const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pairs"],
  properties: {
    pairs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer", "asker_label", "sensitive"],
        properties: { question: { type: "string" }, answer: { type: "string" }, asker_label: { type: "string" }, sensitive: { type: "boolean" } },
      },
    },
  },
} as const;

export const SUGGEST_SYSTEM = `대표가 AI 초안을 고쳐서 확정했다. 고치기 전·후를 비교해 "앞으로도 지킬 말투·원칙"이 보이면 말투 메모에 넣을 한 줄을 제안한다.
- 이번 질문에만 해당하는 사실(날짜·금액·사람)은 제안하지 않는다 — 그건 확정 답변에 이미 남는다.
- 이미 메모에 있는 내용이거나 일반화할 게 없으면 line 은 빈 문자열.
- line: 40자 안팎 한 줄, 명령형 (예: "환불 문의는 직접 답하지 말고 대표에게 넘긴다").
- why: 근거 한 줄 (전→후 요약).`;

export const SUGGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["line", "why"],
  properties: { line: { type: "string" }, why: { type: "string" } },
} as const;
```
- [ ] **Step 3: index.ts 쓰기** (extract·suggest 는 Task 7·8 에서 채우는 자리만):
```ts
// 💬 매니저 Q&A Edge Function. 화면(qna.js)이 sb.functions.invoke("qna", { body: { action, ... } }) 로 부른다.
// action: ask(질문 → AI 바로 답 또는 대표 대기) | extract(카톡 캡처 → 질문·답 쌍, 대표만) | suggest(확정 전후 비교 → 말투 메모 제안, 대표만) | usage(오늘 사용량)
// 비밀값: ANTHROPIC_API_KEY (blog-write 와 같은 키). 설계: docs/manager-qna/README.md
import Anthropic from "npm:@anthropic-ai/sdk@0.137.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { ASK_SCHEMA, ASK_SYSTEM, EXTRACT_SCHEMA, EXTRACT_SYSTEM, SUGGEST_SCHEMA, SUGGEST_SYSTEM } from "./prompt.ts";
import { editRatio, maskPII, route, type AskOut } from "./rules.ts";

const MODEL = "claude-opus-5-5";
const PRICE = { in: 4 / 1e6, out: 20 / 1e6, cacheRead: 0.2 / 1e6, cacheWrite: 5 / 1e6 }; // USD / token
const DAILY = 50; // qna_limits 에 없을 때 지점당 하루 질문 수
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
let client: Anthropic | null = null;
const anthropic = () => {
  if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new HttpError(503, "AI 키(ANTHROPIC_API_KEY)가 아직 연결되지 않았어요");
  return (client ??= new Anthropic());
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const who = await caller(req);
    switch (body.action) {
      case "ask": return json(await ask(who, body));
      case "extract": return json(await extract(who, body));
      case "suggest": return json(await suggest(who, body));
      case "usage": return json(await usage(who));
      default: throw new HttpError(400, "알 수 없는 action");
    }
  } catch (e) {
    console.error(e);
    return json({ error: errText(e) }, e instanceof HttpError ? e.status : e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError ? 502 : 500);
  }
});
function errText(e: unknown) {
  if (e instanceof HttpError) return e.message;
  if (e instanceof Anthropic.RateLimitError) return "AI 요청이 몰렸어요. 1분 뒤 다시 눌러 주세요.";
  if (e instanceof Anthropic.APIError) return `AI 오류 (${e.status ?? "연결"}): ${e.message}`;
  return String((e as Error)?.message ?? e);
}

// ── 누가 ──
type Who = { id: string; role: string; team: number | null };
async function caller(req: Request): Promise<Who> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "로그인이 필요해요");
  const p = (await admin.from("profiles").select("role, team_id").eq("user_id", data.user.id).single()).data;
  return { id: data.user.id, role: p?.role ?? "manager", team: p?.team_id ?? null };
}
const bossOnly = (who: Who) => { if (who.role !== "admin") throw new HttpError(403, "대표님만 쓸 수 있어요"); };

// ── 하루 한도·기록 (매니저 지점당 ask 만 셈, 대표는 제한 없음) ──
const kstMidnight = () => { const k = new Date(Date.now() + 9 * 3600e3); k.setUTCHours(0, 0, 0, 0); return new Date(k.getTime() - 9 * 3600e3).toISOString(); };
async function usage(who: Who) {
  if (!who.team) return { used: 0, limit: who.role === "admin" ? null : 0 };
  const { count } = await admin.from("qna_gens").select("id", { count: "exact", head: true })
    .eq("team_id", who.team).eq("kind", "ask").gte("created_at", kstMidnight());
  const lim = (await admin.from("qna_limits").select("daily").eq("team_id", who.team).maybeSingle()).data?.daily ?? DAILY;
  return { used: count ?? 0, limit: who.role === "admin" ? null : lim };
}
async function guard(who: Who) {
  if (who.role === "admin") return;
  const u = await usage(who);
  if (u.limit !== null && u.used >= u.limit) throw new HttpError(429, `오늘 AI 질문 ${u.limit}회를 다 썼어요`);
}
async function record(who: Who, kind: string, u?: Anthropic.Beta.BetaUsage, meta: Record<string, unknown> = {}) {
  const inT = u?.input_tokens ?? 0, outT = u?.output_tokens ?? 0;
  const cost = inT * PRICE.in + outT * PRICE.out + (u?.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u?.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite;
  await admin.from("qna_gens").insert({ team_id: who.team, user_id: who.id, kind, input_tokens: inT, output_tokens: outT, cost_usd: cost.toFixed(5), meta });
}

// ── Claude 호출 (구조화 출력 + 거절 시 서버 측 대체 모델, blog-write 와 같음) ──
async function claude(system: Anthropic.Beta.BetaTextBlockParam[], content: Anthropic.Beta.BetaContentBlockParam[], schema: { [key: string]: unknown }, effort: "low" | "medium" | "high") {
  const msg = await anthropic().beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    // @ts-ignore 최신 SDK 타입에 없을 수 있음: 거절 카테고리에 맞춰 대체 모델로 다시 돌림
    fallbacks: "default",
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content }],
  }).finalMessage();
  if (msg.stop_reason === "refusal") throw new HttpError(422, "AI가 이 요청을 거절했어요");
  if (msg.stop_reason === "max_tokens") throw new HttpError(502, "AI 답이 너무 길어져 끊겼어요. 다시 눌러 주세요.");
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join("");
  try { return { out: JSON.parse(text), usage: msg.usage }; } catch { throw new HttpError(502, "AI 응답을 읽지 못했어요. 다시 눌러 주세요."); }
}
// 고정 규칙 → 메모 → 예시 순서. 마지막 블록에 캐시 표시 (예시가 안 바뀌는 동안 재사용)
const sys = (...parts: string[]): Anthropic.Beta.BetaTextBlockParam[] =>
  parts.map((t, i) => ({ type: "text", text: t, ...(i === parts.length - 1 ? { cache_control: { type: "ephemeral" } } : {}) }));
const memoOf = async () => String((await admin.from("qna_style").select("memo").eq("id", 1).maybeSingle()).data?.memo ?? "").trim();

// ── ask: 먼저 '대기'로 저장(AI 가 실패해도 질문은 남게) → AI 판단 → 바로 답 또는 대표 대기 ──
const ITEM = "*";
async function ask(who: Who, b: { question?: string; private?: boolean }) {
  const question = String(b.question ?? "").trim();
  if (question.length < 2) throw new HttpError(400, "질문을 적어 주세요");
  if (question.length > 2000) throw new HttpError(400, "질문은 2000자까지 돼요");
  if (who.role !== "admin" && !who.team) throw new HttpError(400, "지점이 정해지지 않았어요");
  const { data: row, error } = await admin.from("qna_items")
    .insert({ user_id: who.id, team_id: who.team, question, private: !!b.private, status: "waiting" }).select("id").single();
  if (error) throw error;
  let patch: Record<string, unknown>;
  try {
    await guard(who);
    const [refs, memo] = await Promise.all([
      admin.rpc("qna_pick_refs", { q: question, team: who.team, n: 40 }).then((r) => { if (r.error) throw r.error; return (r.data ?? []) as { id: number; question: string; answer: string }[]; }),
      memoOf(),
    ]);
    const refsText = refs.length
      ? `# 확정 답변 (${refs.length}개)\n` + refs.map((r) => `#${r.id}\nQ: ${r.question}\nA: ${r.answer}`).join("\n\n")
      : "# 확정 답변\n(아직 없음 → grounded=false)";
    const { out, usage: u } = await claude(sys(ASK_SYSTEM, `# 대표 말투·원칙 메모\n${memo || "(비어 있음)"}`, refsText),
      [{ type: "text", text: `# 매니저 질문\n${question}` }], ASK_SCHEMA, "medium");
    await record(who, "ask", u);
    const o = out as AskOut, r = route(o, refs.map((x) => x.id));
    patch = {
      status: r.status, refs: r.refs, ai_answer: o.answer, answer: r.status === "ai" ? o.answer : "",
      ai_flags: { grounded: o.grounded, decision_request: o.decision_request, sensitive: o.sensitive, reason: o.reason },
      notified_wait: r.status !== "waiting",
      ...(o.sensitive ? { private: true, auto_private: !b.private } : {}),
    };
  } catch (e) {
    console.error("ask ai", e);
    patch = { ai_flags: { reason: errText(e), failed: true }, notified_wait: false };
  }
  const { data: item, error: e2 } = await admin.from("qna_items").update(patch).eq("id", row.id).select(ITEM).single();
  if (e2) throw e2;
  return { item };
}

// ── extract: 카톡 캡처 → 질문·답 쌍 (Task 7) ──
async function extract(who: Who, _b: unknown): Promise<unknown> { bossOnly(who); throw new HttpError(501, "캡처 학습은 다음 단계에서 붙여요"); }
// ── suggest: 대표가 고친 답 → 말투 메모 제안 (Task 8) ──
async function suggest(who: Who, _b: unknown): Promise<unknown> { bossOnly(who); throw new HttpError(501, "말투 제안은 다음 단계에서 붙여요"); }
```
(`editRatio`, `maskPII`, `EXTRACT_*`, `SUGGEST_*` import 는 Task 7·8 에서 쓴다 — Deno 는 안 쓴 import 로 실패하지 않는다.)
- [ ] **Step 4: 로컬 함수 서버를 worktree 로 돌리기**:
```bash
cd ~/.cache/pallo-planner-dev/supabase && rm functions && ln -s ~/pallo-planner-qna/supabase/functions functions && ls -la functions
pkill -f "supabase functions serve" ; sleep 2
```
그다음 `cd ~/.cache/pallo-planner-dev && supabase functions serve --env-file .env.functions` 를 **백그라운드**로(Bash `run_in_background: true`). 10초 뒤 `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:54321/functions/v1/qna -X OPTIONS` → `200`.
- [ ] **Step 5: 점검** — `bash ~/.cache/pallo-planner-dev/test-qna.sh` → Task 2 줄 그대로 + 함수 3줄 기대값. 그다음 `AI=1 bash ~/.cache/pallo-planner-dev/test-qna.sh` (실제 AI 3회, 약 300원) → ai / waiting(decision_request true) / private true.
- [ ] **Step 6: 커밋** — `git add supabase/functions/qna && git commit -m "💬 Q&A: AI 함수 qna — ask(바로 답 또는 대표 대기, 민감하면 🔒)·usage"`

### Task 4: 탭 연결 + 매니저 화면

**Files:** Create `qna.js`, `qna.css`, `.claude/launch.json`; Modify `index.html`, `sw.js`

**Interfaces:**
- Consumes: index.html 전역 `sb, me, isBoss, previewTeam, previewUser, teams, esc, toast, fail, view`; Task 3 함수
- Produces: `window.QA = { load(), remote(), badge() }` — index.html 이 부름. Task 5·7·8 은 같은 IIFE 안 `renderBoss()`, `BOSS_TABS`, `call()`, `card()`, `V()`, `QA.tab` 을 씀.

- [ ] **Step 1: 실패 확인** — 브라우저 `http://localhost:8765/` 매니저 로그인 → Q&A 탭 없음.
- [ ] **Step 2: index.html 고치기**
  1. 스타일: `<link rel="stylesheet" href="links.css?v=202610250655">` 다음 줄에 `<link rel="stylesheet" href="qna.css?v=202610260019">`
  2. 탭 버튼: `<button data-v="links">바로가기</button>` **앞**에 `<button data-v="qna">Q&A<span id="qaBadge" class="qabadge hidden"></span></button>`
  3. 섹션: `<section id="lkView"></section>` 다음 줄에 `  <section id="qaView"></section>`
  4. 레이아웃 숨김: `body.lkv .layout { display: none; }` → `body.lkv .layout, body.qav .layout { display: none; }`
  5. 언젠가 할 일 숨김: `body:not(.tv):not(.bv):not(.sv):not(.blv):not(.mkv):not(.psv):not(.lkv) #somedayView` → `…:not(.lkv):not(.qav) #somedayView`
  6. setView: `document.body.classList.toggle("lkv", v === "links");` 뒤에 ` document.body.classList.toggle("qav", v === "qna");`, 그리고 `if (v === "links" && me && window.LK) LK.load();` 다음 줄 `  if (v === "qna" && me && window.QA) QA.load();`
  7. 로그인 뒤: `if (view === "links") window.LK?.load();` 다음 줄 `  if (view === "qna") window.QA?.load();` + `  window.QA?.badge(); // 💬 대표: 확인할 것 개수`
  8. 실시간: listen() 의 `sb.channel("rt")…` 줄 앞에 `  sb.channel("qna").on("postgres_changes", { event: "*", schema: "public", table: "qna_items" }, () => window.QA?.remote()).subscribe(); // 💬 질문·확정 바로 반영`
  9. 스크립트: `<script src="links.js?v=202610260019"></script>` 다음 줄 `<script src="qna.js?v=202610260019"></script>`
- [ ] **Step 3: sw.js** — SHELL 배열 `"links.css",` 뒤에 `"qna.js", "qna.css",`
- [ ] **Step 4: qna.css 쓰기**:
```css
/* 💬 Q&A 탭 (qna.js) */
body:not(.qav) #qaView { display: none; }
#qaView { max-width: 820px; margin: 0 auto; padding: 16px 20px 100px; }
#qaView .mut { color: var(--sub); font-size: 12.5px; }
#qaView .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
#qaView .card + .card { margin-top: 10px; }
#qaView textarea, #qaView input[type=text], #qaView input[type=search], #qaView select { width: 100%; box-sizing: border-box; padding: 9px 11px; background: var(--bg); color: var(--text); border: 1px solid var(--line); border-radius: 8px; font: inherit; }
#qaView textarea { min-height: 84px; resize: vertical; line-height: 1.55; }
#qaView .qarow { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
#qaView .qarow .sp { flex: 1; }
#qaView .qarow label { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
#qaView .qarow select { width: auto; }
#qaView .btn.small { padding: 6px 10px; font-size: 13px; }
#qaView .qatabs { display: flex; gap: 6px; margin: 18px 0 12px; flex-wrap: wrap; }
#qaView .qatabs button { padding: 7px 12px; border-radius: 99px; border: 1px solid var(--line); background: var(--panel); color: var(--sub); }
#qaView .qatabs button.on { color: var(--text); background: var(--hover); font-weight: 600; }
#qaView .qatabs .n { margin-left: 4px; font-size: 12px; color: var(--orange); }
#qaView .qaq { font-weight: 600; white-space: pre-wrap; word-break: break-word; }
#qaView .qaa { margin-top: 8px; white-space: pre-wrap; word-break: break-word; line-height: 1.6; }
#qaView .qameta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 6px; font-size: 12.5px; color: var(--sub); }
#qaView .qbadge { font-size: 12px; padding: 1px 8px; border-radius: 99px; border: 1px solid var(--line); white-space: nowrap; }
#qaView .qbadge.ai { color: var(--blue); border-color: var(--blue); }
#qaView .qbadge.waiting { color: var(--orange); border-color: var(--orange); }
#qaView .qbadge.final { color: var(--green); border-color: var(--green); }
#qaView .qbadge.warn { color: var(--red); border-color: var(--red); }
#qaView .qahits { margin-top: 10px; }
#qaView .qahits details { border-top: 1px solid var(--line); padding: 8px 2px; }
#qaView .qahits summary { cursor: pointer; }
#qaView .qarefs { margin-top: 8px; padding: 8px 10px; border-left: 3px solid var(--line); font-size: 13.5px; }
#qaView .qarefs p { margin: 0 0 8px; white-space: pre-wrap; }
#qaView .qashots { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
#qaView .qashots img { width: 72px; height: 128px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); }
#qaView .qaempty { color: var(--sub); text-align: center; padding: 26px 10px; }
.seg .qabadge { margin-left: 4px; min-width: 16px; padding: 0 5px; border-radius: 99px; background: var(--orange); color: #fff; font-size: 11px; font-weight: 700; }
.seg .qabadge.hidden { display: none; }
```
- [ ] **Step 5: qna.js 쓰기** (대표 화면은 Task 5 에서 `renderBoss` 를 채움):
```js
// 💬 Q&A 탭: 매니저가 묻고 AI 가 대표처럼 답(근거 있을 때만, 아니면 대표 대기), 대표는 확정·수정·캡처 학습·말투 메모로 AI 를 키운다.
// 설계 docs/manager-qna/README.md. index.html 의 sb·me·isBoss·previewTeam·previewUser·teams·esc·toast·fail·view 를 씀 → window.QA
(() => {
const QA = (window.QA = { tab: null, people: null });
const V = () => document.getElementById("qaView");
const $q = (s) => V().querySelector(s);
const boss = () => isBoss && !previewTeam && !previewUser;
const ro = () => !!(previewTeam || previewUser); // 👀 매니저 화면 보기: 보기만
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const when = (s) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const tname = (id) => teams.find((t) => t.id === id)?.name ?? "";
const BADGE = { ai: ["ai", "🤖 AI 답변 · 대표 확인 전"], waiting: ["waiting", "⏳ 대표님 확인 중"], final: ["final", "✅ 대표 확정"] };

async function call(action, body = {}) {
  const { data, error } = await sb.functions.invoke("qna", { body: { action, ...body } });
  if (error) {
    let m = error.message;
    try { m = (await error.context.json()).error || m; } catch {}
    if (/Failed to send|FunctionsFetchError|not found/i.test(m)) m = "AI 서버가 아직 연결되지 않았어요 (Edge Function 배포 필요)";
    toast(m); return null;
  }
  return data;
}

QA.load = async function () {
  if (!V()) return;
  if (boss()) {
    if (!QA.people) QA.people = new Map(((await sb.from("profiles").select("user_id, name, team_id")).data ?? []).map((p) => [p.user_id, p]));
    if (!BOSS_TABS.some((t) => t[0] === QA.tab)) QA.tab = "inbox";
    return renderBoss();
  }
  if (!["mine", "faq"].includes(QA.tab)) QA.tab = "mine";
  renderManager();
};

// 실시간: 고치는 중이면 덮어쓰지 않고 다음에
QA.remote = debounce(() => {
  QA.badge();
  if (view !== "qna" || !V()) return;
  if (document.activeElement?.closest("#qaView textarea, #qaView input")) { QA.dirty = true; return; }
  QA.load();
}, 500);
document.addEventListener("focusout", (e) => { if (QA.dirty && e.target.closest?.("#qaView") && !e.relatedTarget?.closest?.("#qaView textarea, #qaView input")) { QA.dirty = false; setTimeout(QA.load, 50); } });

// 대표: 탭 옆 숫자 = 대기 + AI 답 중 아직 안 본 것
QA.badge = async function () {
  const el = document.getElementById("qaBadge"); if (!el) return;
  if (!boss()) return el.classList.add("hidden");
  const { count } = await sb.from("qna_items").select("id", { count: "exact", head: true }).or("status.eq.waiting,and(status.eq.ai,reviewed.eq.false)");
  el.textContent = count || ""; el.classList.toggle("hidden", !count);
};

// ── 카드 한 장 (매니저 내 질문·FAQ 공용) ──
function card(r, { mine = false } = {}) {
  const [cls, text] = BADGE[r.status] ?? ["", r.status];
  const showAns = r.status !== "waiting" && r.answer;
  return `<div class="card" data-id="${r.id}">
    <div class="qameta">${mine ? `<span class="qbadge ${cls}">${text}</span>` : ""}${r.private ? `<span class="qbadge">🔒 나만 보기</span>` : ""}${r.only_team ? `<span class="qbadge">${esc(tname(r.only_team) || "지점 한정")}만</span>` : ""}${r.source === "capture" ? `<span class="qbadge">📸 카톡</span>` : ""}<span>${when(r.final_at || r.created_at)}</span></div>
    <div class="qaq">Q. ${esc(r.question)}</div>
    ${showAns ? `<div class="qaa">${esc(r.answer)}</div>` : ""}
    ${mine && r.auto_private ? `<div class="mut" style="margin-top:6px">🔒 민감한 내용 같아서 나만 보기로 바꿨어요</div>` : ""}
    ${mine && r.status === "waiting" ? `<div class="mut" style="margin-top:6px">${r.ai_flags?.failed ? "AI가 지금 답하기 어려워서 대표님께 바로 넘겼어요. " : ""}답이 오면 알림이 가요</div>` : ""}
    ${mine && r.status === "ai" && r.refs?.length ? `<button type="button" class="btn ghost small qarefbtn" style="margin-top:8px">확정된 답 ${r.refs.length}개 참고</button><div class="qarefs hidden"></div>` : ""}
    ${mine && !ro() ? `<div class="qarow">${r.status === "ai" && !r.resolved ? `<button type="button" class="btn ghost small" data-act="resolve">👍 해결됐어요</button><button type="button" class="btn ghost small" data-act="escalate">🙋 대표님께 직접 물어보기</button>` : ""}${r.status === "ai" && r.resolved ? `<span class="mut">👍 해결됨</span>` : ""}${r.status === "waiting" ? `<button type="button" class="btn ghost small" data-act="cancel">취소</button>` : ""}</div>` : ""}
  </div>`;
}

// ── 매니저 화면: 질문창 + 내 질문 / FAQ ──
async function renderManager() {
  V().innerHTML = `<div class="card">
      <textarea id="qaQ" maxlength="2000" placeholder="대표님께 물어볼 것을 적어 주세요. 이미 있는 답이 아래에 먼저 보여요."></textarea>
      <div class="qarow"><label><input type="checkbox" id="qaPriv"> 🔒 나만 보기</label><span class="sp"></span><button type="button" class="btn" id="qaSend" ${ro() ? "disabled" : ""}>보내기</button></div>
      <div id="qaHits" class="qahits"></div></div>
    <nav class="qatabs"><button data-tab="mine" class="${QA.tab === "mine" ? "on" : ""}">📝 내 질문</button><button data-tab="faq" class="${QA.tab === "faq" ? "on" : ""}">📚 FAQ</button></nav>
    <div id="qaBody"><div class="mut">불러오는 중…</div></div>`;
  $q("#qaQ").addEventListener("input", hitsSoon);
  $q("#qaSend").onclick = send;
  V().querySelectorAll(".qatabs [data-tab]").forEach((b) => (b.onclick = () => { QA.tab = b.dataset.tab; renderManager(); }));
  QA.tab === "faq" ? renderFaq() : renderMine();
}
const hitsSoon = debounce(async () => {
  const q = $q("#qaQ")?.value.trim() ?? "", box = $q("#qaHits"); if (!box) return;
  if (q.length < 2) return (box.innerHTML = "");
  const { data } = await sb.rpc("qna_search", { q, n: 5 });
  box.innerHTML = data?.length ? `<div class="mut">이미 있는 답 — 열어 보고 해결되면 안 보내도 돼요</div>` + data.map((x) =>
    `<details><summary>${esc(x.question)}</summary><div class="qaa">${esc(x.answer)}</div></details>`).join("") : "";
}, 400);

async function send() {
  const t = $q("#qaQ"), q = t.value.trim(), btn = $q("#qaSend");
  if (q.length < 2) return toast("질문을 적어 주세요");
  btn.disabled = true; btn.textContent = "AI가 답을 찾는 중…";
  const r = await call("ask", { question: q, private: $q("#qaPriv").checked });
  btn.disabled = false; btn.textContent = "보내기";
  if (!r?.item) return;
  t.value = ""; $q("#qaHits").innerHTML = "";
  toast(r.item.status === "ai" ? "🤖 확정된 답을 찾았어요" : "⏳ 대표님께 넘겼어요. 답이 오면 알림이 가요");
  QA.tab = "mine"; renderManager();
}

async function renderMine() {
  const { data, error } = await sb.from("qna_items").select("*").eq("user_id", me.id).order("created_at", { ascending: false }).limit(100);
  if (fail(error)) return;
  const box = $q("#qaBody"); if (!box) return;
  box.innerHTML = data.length ? data.map((r) => card(r, { mine: true })).join("") : `<div class="card qaempty">아직 보낸 질문이 없어요. 위에 적어서 보내 보세요.</div>`;
  box.querySelectorAll(".card").forEach((c) => {
    const r = data.find((x) => x.id === +c.dataset.id);
    c.querySelector(".qarefbtn")?.addEventListener("click", async (e) => {
      const el = c.querySelector(".qarefs");
      if (el.classList.toggle("hidden")) return;
      const { data: refs } = await sb.from("qna_items").select("id, question, answer").in("id", r.refs);
      el.innerHTML = (refs ?? []).map((x) => `<p><b>Q. ${esc(x.question)}</b>\n${esc(x.answer)}</p>`).join("") || `<span class="mut">참고한 답을 볼 수 없어요 (지워졌거나 다른 지점 한정)</span>`;
      e.target.blur();
    });
    c.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => act(r, b.dataset.act)));
  });
}
async function act(r, a) {
  if (a === "cancel") {
    if (!confirm("이 질문을 취소할까요?")) return;
    const { error } = await sb.from("qna_items").delete().eq("id", r.id); if (fail(error)) return;
    toast("취소했어요");
  } else {
    const { error } = await sb.from("qna_items").update(a === "resolve" ? { resolved: true } : { status: "waiting" }).eq("id", r.id); if (fail(error)) return;
    toast(a === "resolve" ? "👍 고마워요" : "🙋 대표님께 넘겼어요. 답이 오면 알림이 가요");
  }
  renderMine();
}

async function renderFaq() {
  const box = $q("#qaBody"); if (!box) return;
  box.innerHTML = `<input type="search" id="qaFind" placeholder="FAQ 검색 (예: 상담 일지, 환불)"><div id="qaFaqList" style="margin-top:10px"></div>`;
  const { data, error } = await sb.from("qna_items").select("id, question, answer, only_team, final_at, source, private, status")
    .eq("status", "final").eq("private", false).order("final_at", { ascending: false }).limit(500);
  if (fail(error)) return;
  const draw = () => {
    const k = $q("#qaFind").value.trim().toLowerCase();
    const rows = k ? data.filter((x) => (x.question + " " + x.answer).toLowerCase().includes(k)) : data;
    $q("#qaFaqList").innerHTML = rows.length ? rows.map((r) => card(r)).join("") : `<div class="card qaempty">${data.length ? "찾는 내용이 없어요. 위에서 질문해 주세요." : "아직 확정된 답이 없어요."}</div>`;
  };
  $q("#qaFind").addEventListener("input", debounce(draw, 200)); draw();
}

// ── 대표 화면 (Task 5) ──
const BOSS_TABS = [["inbox", "📥 확인할 것"]];
function renderBoss() { V().innerHTML = `<div class="card qaempty">대표 화면은 다음 단계에서 붙여요.</div>`; }
})();
```
- [ ] **Step 6: 정적 서버 설정** — `.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "qna-local", "runtimeExecutable": "python3", "runtimeArgs": ["-m", "http.server", "8765"], "port": 8765 }
  ]
}
```
- [ ] **Step 7: 브라우저 확인** — `preview_start {name:"qna-local"}` → manager@pallo.test 로그인 → [Q&A]:
  1. 콘솔에 `qna.js` 오류 없음 (`node --check qna.js` 도 통과).
  2. `점검: 상담 일지` 같은 확정 답이 있으면 "상담" 입력 → "이미 있는 답" 펼침 보임 (없으면 test-qna.sh 의 svc 줄로 하나 넣고 확인).
  3. 질문 보내기 → 버튼 "AI가 답을 찾는 중…" → 내 질문 카드에 배지(🤖 또는 ⏳). 🤖 면 [확정된 답 n개 참고] 펼침 · [👍]·[🙋] 동작, ⏳ 면 [취소] 동작.
  4. 🔒 체크하고 보냄 → 카드에 🔒. FAQ 에는 안 나옴.
  5. 대표 로그인 → Q&A 탭에 "대표 화면은 다음 단계에서" + 탭 옆 숫자 배지.
- [ ] **Step 8: 커밋** — `git add qna.js qna.css index.html sw.js .claude/launch.json && git commit -m "💬 Q&A: 탭 + 매니저 화면(질문·이미 있는 답·내 질문·FAQ·👍/🙋/취소)"`

### Task 5: 대표 화면 — 확인할 것 · 확정 답변 모음

**Files:** Modify `qna.js` (`// ── 대표 화면 (Task 5) ──` 아래 두 줄을 바꿈)

**Interfaces:**
- Consumes: Task 4 의 `V, $q, call, card, when, tname, BADGE, QA.people, esc, toast, fail, teams`
- Produces: `BOSS_TABS` (Task 7·8 이 항목 추가), `renderBoss()`, `bossCard(r, mode)`, `saveItem(r, card, patch)`; Task 8 이 확정 뒤 `afterFinal(r, before)` 를 채움

- [ ] **Step 1: 구현** — `qna.js` 의 `const BOSS_TABS = …` 과 `function renderBoss() …` 두 줄을 아래로 바꾼다:
```js
const BOSS_TABS = [["inbox", "📥 확인할 것"], ["lib", "📚 확정 답변"]];
const BOSS_VIEWS = { inbox: renderInbox, lib: renderLib };
async function renderBoss() {
  V().innerHTML = `<nav class="qatabs" style="margin-top:0">${BOSS_TABS.map(([k, l]) => `<button data-tab="${k}" class="${QA.tab === k ? "on" : ""}">${l}${k === "inbox" ? `<span class="n" id="qaInN"></span>` : ""}</button>`).join("")}</nav><div id="qaBody"><div class="mut">불러오는 중…</div></div>`;
  V().querySelectorAll(".qatabs [data-tab]").forEach((b) => (b.onclick = () => { QA.tab = b.dataset.tab; renderBoss(); }));
  await BOSS_VIEWS[QA.tab]();
}
const who = (r) => r.user_id ? `${esc(tname(QA.people.get(r.user_id)?.team_id ?? r.team_id))} ${esc(QA.people.get(r.user_id)?.name ?? "")}` : esc(r.asker_label || "카톡");
const teamSel = (v) => `<select data-k="only_team" title="이 답이 해당하는 지점"><option value="">전 지점</option>${teams.map((t) => `<option value="${t.id}" ${t.id === v ? "selected" : ""}>${esc(t.name)}만</option>`).join("")}</select>`;
function bossCard(r, mode) {
  const f = r.ai_flags ?? {}, [cls, text] = BADGE[r.status] ?? ["", r.status];
  const flags = mode === "inbox" ? [
    f.failed && `<span class="qbadge warn">AI 실패: ${esc(String(f.reason ?? "").slice(0, 40))}</span>`,
    !f.failed && f.grounded === false && `<span class="qbadge">근거 없음</span>`,
    f.decision_request && `<span class="qbadge warn">허락·결정 요청</span>`,
    f.sensitive && `<span class="qbadge warn">민감</span>`,
    r.escalated && `<span class="qbadge waiting">🙋 직접 물어봄</span>`,
  ].filter(Boolean).join("") : "";
  return `<div class="card" data-id="${r.id}">
    <div class="qameta"><span class="qbadge ${cls}">${text}</span>${flags}<span>${who(r)} · ${when(r.created_at)}</span>${r.source === "capture" ? `<span class="qbadge">📸 카톡</span>` : ""}</div>
    ${mode === "lib" ? `<input type="text" data-k="question" value="${esc(r.question)}" maxlength="2000">` : `<div class="qaq">Q. ${esc(r.question)}</div>`}
    ${mode === "inbox" && f.reason && !f.failed ? `<div class="mut" style="margin:4px 0">AI 판단: ${esc(f.reason)}</div>` : ""}
    <textarea data-k="answer" style="margin-top:8px" placeholder="답을 적어 주세요">${esc(r.answer || r.ai_answer)}</textarea>
    <div class="qarow"><label><input type="checkbox" data-k="private" ${r.private ? "checked" : ""}> 🔒 나만 보기${r.auto_private ? " (AI가 켬)" : ""}</label>${teamSel(r.only_team)}<span class="sp"></span>
      <button type="button" class="btn ghost small" data-act="del">🗑</button><button type="button" class="btn small" data-act="ok">${mode === "lib" ? "저장" : "✅ 확정"}</button></div></div>`;
}
function bindBoss(box, rows, mode, reload) {
  box.querySelectorAll(".card[data-id]").forEach((c) => {
    const r = rows.find((x) => x.id === +c.dataset.id);
    c.querySelector('[data-act="ok"]').onclick = async () => {
      const answer = c.querySelector('[data-k="answer"]').value.trim();
      if (!answer) return toast("답을 적어 주세요");
      const patch = { status: "final", answer, private: c.querySelector('[data-k="private"]').checked, only_team: +c.querySelector('[data-k="only_team"]').value || null };
      if (mode === "lib") { const q = c.querySelector('[data-k="question"]').value.trim(); if (q.length < 2) return toast("질문을 적어 주세요"); patch.question = q; }
      const { error } = await sb.from("qna_items").update(patch).eq("id", r.id); if (fail(error)) return;
      toast(mode === "lib" ? "저장했어요" : r.user_id ? "✅ 확정했어요. 매니저에게 알림이 가요" : "✅ 확정했어요");
      if (mode === "inbox") afterFinal(r, answer);
      reload(); QA.badge();
    };
    c.querySelector('[data-act="del"]').onclick = async () => {
      if (!confirm("이 질문을 지울까요? 되돌릴 수 없어요.")) return;
      const { error } = await sb.from("qna_items").delete().eq("id", r.id); if (fail(error)) return;
      toast("지웠어요"); reload(); QA.badge();
    };
  });
}
async function renderInbox() {
  const { data, error } = await sb.from("qna_items").select("*").or("status.eq.waiting,and(status.eq.ai,reviewed.eq.false)").order("created_at").limit(200);
  if (fail(error)) return;
  const box = $q("#qaBody"); if (!box) return;
  $q("#qaInN") && ($q("#qaInN").textContent = data.length || "");
  box.innerHTML = data.length ? `<div class="mut" style="margin-bottom:8px">⏳ 기다리는 질문과 🤖 AI가 바로 답한 질문(사후 확인)이에요. 고쳐서 확정하면 AI가 다음부터 이 답을 따라 해요.</div>` + data.map((r) => bossCard(r, "inbox")).join("")
    : `<div class="card qaempty">확인할 질문이 없어요 🎉</div>`;
  bindBoss(box, data, "inbox", renderInbox);
}
async function renderLib() {
  const box = $q("#qaBody"); if (!box) return;
  box.innerHTML = `<input type="search" id="qaFind" placeholder="확정 답변 검색"><div id="qaLibList" style="margin-top:10px"></div>`;
  const { data, error } = await sb.from("qna_items").select("*").eq("status", "final").order("final_at", { ascending: false }).limit(1000);
  if (fail(error)) return;
  const draw = () => {
    const k = $q("#qaFind").value.trim().toLowerCase();
    const rows = (k ? data.filter((x) => (x.question + " " + x.answer).toLowerCase().includes(k)) : data).slice(0, 100);
    const list = $q("#qaLibList");
    list.innerHTML = rows.length ? `<div class="mut" style="margin-bottom:8px">확정 ${data.length}개 · 🔒 ${data.filter((x) => x.private).length}개 (🔒 는 AI 참고에서 빠져요)</div>` + rows.map((r) => bossCard(r, "lib")).join("") : `<div class="card qaempty">${data.length ? "찾는 내용이 없어요." : "아직 확정된 답이 없어요. 📥 에서 확정하거나 📸 캡처로 채워 주세요."}</div>`;
    bindBoss(list, rows, "lib", renderLib);
  };
  $q("#qaFind").addEventListener("input", debounce(draw, 200)); draw();
}
// 확정 직후 (Task 8 에서 말투 제안을 붙임)
function afterFinal(_r, _answer) {}
```
- [ ] **Step 2: 확인** — `node --check qna.js`. 브라우저 대표 로그인 → [Q&A]:
  1. 📥 에 Task 4 에서 보낸 질문들 + 배지(근거 없음·허락·결정 요청·민감·🙋). 탭 옆 숫자 = 카드 수.
  2. 하나 고쳐서 [✅ 확정] → 목록에서 빠짐, 숫자 줄어듦. 매니저 창(다른 브라우저 프로필 또는 로그아웃 후)에서 그 질문이 ✅ 대표 확정 + 고친 답.
  3. 📚 에 확정된 것 + 질문 고치기·[저장]·🔒·지점 한정·🗑 동작. "대구동성로점만" 으로 저장 → manager3(울산) FAQ 에 안 나옴.
  4. 매니저가 질문 보냄 → 대표 화면 새로고침 없이 0.5초 안에 📥 에 나타남(실시간), 숫자 배지 바뀜.
- [ ] **Step 3: 커밋** — `git add qna.js && git commit -m "💬 Q&A: 대표 화면 — 📥 확인할 것(AI 판단 배지·고쳐서 확정)·📚 확정 답변(고치기·🔒·지점 한정)·실시간 숫자"`

### Task 6: 알림 — planner-push 에 Q&A 추가

**Files:** Create `supabase/functions/planner-push/index.ts` (운영 원본 + 2줄)

**Interfaces:** Consumes Task 2 `claim_qna_notices()` → `(user_id, title, body, tag)`

- [ ] **Step 1: 운영 원본 받기** (읽기만):
```bash
cd ~/pallo-planner-qna && supabase functions download planner-push --project-ref aiqrchgwrfrmscstlsmv --workdir . 2>&1 | tail -1 && wc -l supabase/functions/planner-push/index.ts
```
(받은 파일이 다른 곳에 생기면 그 파일을 `supabase/functions/planner-push/index.ts` 로 옮긴다. `supabase/.temp` 는 커밋하지 않는다.)
- [ ] **Step 2: 원본 그대로 먼저 커밋** — `git add supabase/functions/planner-push/index.ts && git commit -m "🔔 planner-push: 운영 원본(v16)을 저장소에 넣음 (그동안 노트북 ~/.cache 에만 있었음)"`
- [ ] **Step 3: Q&A 알림 추가** — `const { data: tu } = await db.rpc("claim_timeups");` 줄 다음에:
```ts
  const { data: qna } = await db.rpc("claim_qna_notices"); // 💬 Q&A: 새 대기 질문 → 대표, 확정 → 물어본 매니저
```
그리고 `msgs` 배열의 `...(fb ?? []).map(…)` 항목 **뒤**에:
```ts
    ,
    ...(qna ?? []).map((t)=>({
        user_id: t.user_id,
        title: t.title,
        body: t.body,
        tag: t.tag
      }))
```
(대표는 kakao_links 가 있으면 같은 알림이 카톡으로도 간다 — 기존 코드가 msgs 전체에 적용.)
- [ ] **Step 4: 확인** — `cd ~/pallo-planner-qna/supabase/functions/planner-push && deno check index.ts` → 오류 없음(타입 경고만 있으면 원본과 같은지 `git stash` 로 비교). 로컬 DB 엔 app_settings·push_subs 가 없어 실행 점검은 RPC 로 대신(Task 2 test-qna.sh 의 claim 줄).
- [ ] **Step 5: 커밋** — `git add supabase/functions/planner-push/index.ts && git commit -m "🔔 planner-push: Q&A 알림 (💬 새 대기 질문 → 대표 푸시·카톡, ✅ 확정 → 매니저 푸시)"`

### Task 7: 캡처 학습 — extract + 📸 칸

**Files:** Modify `supabase/functions/qna/index.ts` (extract), `qna.js` (📸 탭), `~/.cache/pallo-planner-dev/test-qna.sh`

**Interfaces:**
- Produces: `{action:"extract", images:[{media_type, data}]}` → `{ pairs: [{question, answer, asker_label, sensitive}] }` (대표만, 1~10장, 저장 안 함)

- [ ] **Step 1: 점검 줄 추가** — test-qna.sh 의 `if [ "$AI" = 1 ]; then` **앞**에:
```bash
echo "== 함수: 매니저가 캡처 학습 (\"대표님만 쓸 수 있어요\")"; fn "$M" '{"action":"extract","images":[]}'
echo "== 함수: 사진 없음 (\"캡처를 1장 이상 올려 주세요\")"; fn "$B" '{"action":"extract","images":[]}'
```
그리고 `fi` **앞**(AI 블록 안)에:
```bash
  python3 - <<'EOF'
from PIL import Image, ImageDraw, ImageFont
import glob
f = next((p for p in glob.glob("/System/Library/Fonts/*.ttc") if "AppleSDGothicNeo" in p), None)
font = ImageFont.truetype(f, 26) if f else ImageFont.load_default()
im = Image.new("RGB", (720, 900), (186, 206, 224)); d = ImageDraw.Draw(im)
d.text((30, 40), "김민지 매니저", fill=(40, 40, 40), font=font)
d.rounded_rectangle((30, 80, 520, 170), 18, fill="white"); d.text((50, 100), "대표님 체험수업 후 결제 안 하면\n연락 몇 번까지 해요?", fill="black", font=font)
d.rounded_rectangle((200, 210, 690, 330), 18, fill=(254, 229, 0)); d.text((220, 230), "최대 2번이요. 3일 뒤 한 번,\n일주일 뒤 한 번 하고 끝내요.\n010-1234-5678 은 쓰지 마세요", fill="black", font=font)
d.rounded_rectangle((30, 370, 400, 430), 18, fill="white"); d.text((50, 385), "넵 감사합니다!", fill="black", font=font)
im.save("/tmp/qna-cap.png")
EOF
  python3 -c 'import base64,json;print(json.dumps({"action":"extract","images":[{"media_type":"image/png","data":base64.b64encode(open("/tmp/qna-cap.png","rb").read()).decode()}]}))' > /tmp/qna-cap.json
  echo "== AI: 캡처 학습 (쌍 1개, 번호 가려짐, asker_label ○○ 매니저)"
  curl -s "$API/functions/v1/qna" -H "apikey: $PK" -H "Authorization: Bearer $B" -H 'Content-Type: application/json' -d @/tmp/qna-cap.json; echo
```
`bash test-qna.sh` → extract 두 줄이 "다음 단계에서" (501).
- [ ] **Step 2: 함수 구현** — index.ts 의 extract 자리 한 줄을 바꾼다:
```ts
// ── extract: 카톡 캡처 → 질문·답 쌍. 사진은 이 요청 안에서만 쓰고 어디에도 저장하지 않는다 ──
type Shot = { media_type?: string; data?: string };
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
async function extract(who: Who, b: { images?: Shot[] }) {
  bossOnly(who);
  const imgs = (b.images ?? []).filter((x) => IMG_TYPES.includes(String(x.media_type)) && typeof x.data === "string" && x.data.length > 100);
  if (!imgs.length) throw new HttpError(400, "캡처를 1장 이상 올려 주세요");
  if (imgs.length > 10) throw new HttpError(400, "한 번에 10장까지 돼요");
  if (imgs.some((x) => x.data!.length > 4_500_000)) throw new HttpError(400, "사진 한 장이 너무 커요");
  const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: `카톡 캡처 ${imgs.length}장 (순서대로 이어진 대화)` }];
  imgs.forEach((x, i) => {
    content.push({ type: "text", text: `캡처 ${i + 1}` });
    content.push({ type: "image", source: { type: "base64", media_type: x.media_type as "image/png", data: x.data! } });
  });
  const { out, usage: u } = await claude(sys(EXTRACT_SYSTEM), content, EXTRACT_SCHEMA, "medium");
  const pairs = ((out as { pairs?: { question: string; answer: string; asker_label: string; sensitive: boolean }[] }).pairs ?? [])
    .map((p) => ({ question: maskPII(p.question).trim(), answer: maskPII(p.answer).trim(), asker_label: maskPII(p.asker_label).trim().slice(0, 40), sensitive: !!p.sensitive }))
    .filter((p) => p.question.length >= 2 && p.answer.length >= 1);
  await record(who, "extract", u, { shots: imgs.length, pairs: pairs.length });
  return { pairs };
}
```
- [ ] **Step 3: 화면 구현** — qna.js:
  1. `const BOSS_TABS = [...]` 에 `["cap", "📸 캡처로 학습"]` 추가, `BOSS_VIEWS` 에 `cap: renderCap` 추가.
  2. `// 확정 직후 (Task 8 …)` 줄 **앞**에:
```js
// ── 📸 캡처로 학습: 사진은 이 기기에서 줄여서 AI 에만 보내고(저장 안 함), 뽑힌 쌍은 대표가 골라 확정 답변으로 ──
QA.shots = []; QA.pairs = [];
async function shrink(file) { // 긴 변 1600px JPEG (카톡 글씨가 읽히는 크기)
  const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close?.();
  const url = cv.toDataURL("image/jpeg", 0.85);
  return { url, media_type: "image/jpeg", data: url.split(",")[1] };
}
async function renderCap() {
  const box = $q("#qaBody"); if (!box) return;
  box.innerHTML = `<div class="card"><div class="mut">카톡에서 매니저 질문 → 대표님 답이 보이게 캡처해서 올려 주세요 (한 번에 10장까지). 오른쪽 노란 말풍선을 대표님으로 봐요. 사진은 저장하지 않아요.</div>
      <div class="qarow"><input type="file" id="qaFiles" accept="image/*" multiple style="width:auto"><span class="sp"></span><button type="button" class="btn" id="qaExtract" ${QA.shots.length ? "" : "disabled"}>뽑기 (${QA.shots.length}장)</button></div>
      <div class="qashots">${QA.shots.map((s, i) => `<img src="${s.url}" alt="캡처 ${i + 1}" title="누르면 빼요" data-i="${i}">`).join("")}</div></div>
    <div id="qaPairs" style="margin-top:12px"></div>`;
  $q("#qaFiles").onchange = async (e) => {
    const files = [...e.target.files].filter((f) => /^image\//.test(f.type)).slice(0, 10 - QA.shots.length);
    for (const f of files) { try { QA.shots.push(await shrink(f)); } catch { toast(`'${f.name}' 을 읽지 못했어요`); } }
    renderCap();
  };
  box.querySelectorAll(".qashots img").forEach((im) => (im.onclick = () => { QA.shots.splice(+im.dataset.i, 1); renderCap(); }));
  $q("#qaExtract").onclick = async () => {
    const b = $q("#qaExtract"); b.disabled = true; b.textContent = "AI가 읽는 중… (30초쯤)";
    const r = await call("extract", { images: QA.shots.map(({ media_type, data }) => ({ media_type, data })) });
    if (!r) return renderCap();
    QA.pairs = r.pairs; QA.shots = [];
    toast(r.pairs.length ? `질문·답 ${r.pairs.length}쌍을 찾았어요. 골라서 저장해 주세요` : "질문·답을 찾지 못했어요");
    renderCap();
  };
  drawPairs();
}
function drawPairs() {
  const el = $q("#qaPairs"); if (!el) return;
  el.innerHTML = QA.pairs.length ? `<div class="qarow" style="margin-bottom:8px"><span class="mut">뽑힌 ${QA.pairs.length}쌍 — 고쳐서 저장하거나 버려 주세요</span><span class="sp"></span><button type="button" class="btn small" id="qaSaveAll">전부 저장</button></div>`
    + QA.pairs.map((p, i) => `<div class="card" data-i="${i}">
        <div class="qameta"><span class="qbadge">📸 ${esc(p.asker_label || "카톡")}</span>${p.sensitive ? `<span class="qbadge warn">민감해 보여요</span>` : ""}</div>
        <input type="text" data-k="question" value="${esc(p.question)}" maxlength="2000">
        <textarea data-k="answer" style="margin-top:8px">${esc(p.answer)}</textarea>
        <div class="qarow"><label><input type="checkbox" data-k="private" ${p.sensitive ? "checked" : ""}> 🔒 나만 보기</label>${teamSel(null)}<span class="sp"></span>
          <button type="button" class="btn ghost small" data-act="drop">버리기</button><button type="button" class="btn small" data-act="save">저장</button></div></div>`).join("") : "";
  const rowOf = (c) => ({ question: c.querySelector('[data-k="question"]').value.trim(), answer: c.querySelector('[data-k="answer"]').value.trim(),
    private: c.querySelector('[data-k="private"]').checked, only_team: +c.querySelector('[data-k="only_team"]').value || null,
    asker_label: QA.pairs[+c.dataset.i].asker_label, status: "final", source: "capture" });
  const save = async (cards) => {
    const rows = cards.map(rowOf).filter((x) => x.question.length >= 2 && x.answer);
    if (!rows.length) return toast("질문과 답을 채워 주세요");
    const { error } = await sb.from("qna_items").insert(rows); if (fail(error)) return;
    const gone = new Set(cards.map((c) => +c.dataset.i)); QA.pairs = QA.pairs.filter((_, i) => !gone.has(i));
    toast(`📚 확정 답변에 ${rows.length}개 넣었어요`); drawPairs();
  };
  el.querySelectorAll(".card[data-i]").forEach((c) => {
    c.querySelector('[data-act="save"]').onclick = () => save([c]);
    c.querySelector('[data-act="drop"]').onclick = () => { QA.pairs.splice(+c.dataset.i, 1); drawPairs(); };
  });
  $q("#qaSaveAll")?.addEventListener("click", () => save([...el.querySelectorAll(".card[data-i]")]));
}
```
- [ ] **Step 4: 확인** — 함수 서버는 파일 바뀌면 다시 읽음(안 되면 Task 3 Step 4 재시작). `bash test-qna.sh` → extract 두 줄 기대값. `AI=1 bash test-qna.sh` → 쌍 1개, 답에 `010-****-****`, asker_label `○○ 매니저`. 브라우저 대표 → 📸: `/tmp/qna-cap.png` 올림 → 썸네일 → [뽑기] → 쌍 카드 → 고쳐서 [저장] → 📚 에 📸 카톡 배지로 보임 → 매니저가 "체험수업 결제 연락" 질문 → 🤖 바로 답(refs 에 그 id).
- [ ] **Step 5: 커밋** — `git add supabase/functions/qna/index.ts qna.js && git commit -m "💬 Q&A: 📸 캡처로 학습 — 카톡 캡처에서 질문·답 쌍 뽑기(사진 저장 안 함, 번호·이름 가림) → 골라서 확정 답변으로"`

### Task 8: 말투·원칙 메모 + 제안

**Files:** Modify `supabase/functions/qna/index.ts` (suggest), `qna.js` (✍️ 탭 + afterFinal), `~/.cache/pallo-planner-dev/test-qna.sh`

**Interfaces:**
- Produces: `{action:"suggest", item_id}` → `{ suggestion: { id, line, why } | null }` (대표만; 고친 정도 0.15 미만·AI 초안 없음·제안 없음이면 null)

- [ ] **Step 1: 점검 줄** — `if [ "$AI" = 1 ]; then` 앞에:
```bash
echo "== 함수: 매니저가 말투 제안 (\"대표님만 쓸 수 있어요\")"; fn "$M" '{"action":"suggest","item_id":1}'
S=$(svc qna_items -X POST -d '{"question":"점검: 제안용","ai_answer":"네 가능합니다.","answer":"네 가능합니다.","status":"final"}' | jid)
echo "== 함수: 거의 안 고친 답 → 제안 없음 ({\"suggestion\":null})"; fn "$B" "{\"action\":\"suggest\",\"item_id\":$S}"
```
AI 블록 안(`fi` 앞)에:
```bash
  S2=$(svc qna_items -X POST -d '{"question":"점검: 환불 되나요?","ai_answer":"네, 환불 규정에 따라 처리해 드릴게요.","answer":"환불 문의는 직접 답하지 말고 저한테 바로 넘겨 주세요. 제가 회원님께 연락할게요.","status":"final"}' | jid)
  echo "== AI: 많이 고친 답 → 제안 한 줄 (suggestion.line 있음)"; fn "$B" "{\"action\":\"suggest\",\"item_id\":$S2}"
  echo "== 제안이 저장됨 (pending 1개 이상)"; svc "qna_suggestions?status=eq.pending&select=line" 
  svc "qna_suggestions?line=neq.__" -X DELETE >/dev/null
```
- [ ] **Step 2: 함수 구현** — suggest 자리 한 줄을 바꾼다:
```ts
// ── suggest: 대표가 AI 초안을 많이 고쳤으면(0.15 이상) 말투 메모에 넣을 한 줄 제안 ──
async function suggest(who: Who, b: { item_id?: number }) {
  bossOnly(who);
  const it = (await admin.from("qna_items").select("id, question, ai_answer, answer, status").eq("id", Number(b.item_id)).maybeSingle()).data;
  if (!it) throw new HttpError(404, "질문을 찾을 수 없어요");
  if (it.status !== "final" || !it.ai_answer || editRatio(it.ai_answer, it.answer) < 0.15) return { suggestion: null };
  const memo = await memoOf();
  const { out, usage: u } = await claude(sys(SUGGEST_SYSTEM),
    [{ type: "text", text: `# 지금 말투·원칙 메모\n${memo || "(비어 있음)"}\n\n# 질문\n${it.question}\n\n# AI 초안 (고치기 전)\n${it.ai_answer}\n\n# 대표 확정 답 (고친 뒤)\n${it.answer}` }],
    SUGGEST_SCHEMA, "low");
  await record(who, "suggest", u);
  const line = String((out as { line?: string }).line ?? "").trim(), why = String((out as { why?: string }).why ?? "").trim();
  if (!line || memo.includes(line)) return { suggestion: null };
  const { data, error } = await admin.from("qna_suggestions").insert({ item_id: it.id, line: line.slice(0, 200), why: why.slice(0, 300) }).select("id, line, why").single();
  if (error) throw error;
  return { suggestion: data };
}
```
- [ ] **Step 3: 화면 구현** — qna.js:
  1. `BOSS_TABS` 에 `["memo", "✍️ 말투 메모"]`, `BOSS_VIEWS` 에 `memo: renderMemo`.
  2. `function afterFinal(_r, _answer) {}` 를 바꾼다:
```js
// 확정 직후: AI 초안을 많이 고쳤으면 서버가 말투 메모 제안을 하나 만든다 (기다리지 않음)
function afterFinal(r, answer) {
  if (!r.ai_answer || r.ai_answer.trim() === answer) return;
  call("suggest", { item_id: r.id }).then((x) => x?.suggestion && toast("✍️ 말투 메모에 넣을 제안이 생겼어요 (✍️ 말투 메모 탭)"));
}
async function renderMemo() {
  const box = $q("#qaBody"); if (!box) return;
  const [st, sg] = await Promise.all([sb.from("qna_style").select("memo, updated_at").eq("id", 1).maybeSingle(),
    sb.from("qna_suggestions").select("id, line, why, created_at").eq("status", "pending").order("created_at", { ascending: false })]);
  if (fail(st.error) || fail(sg.error)) return;
  box.innerHTML = `<div class="card"><div class="mut">AI가 답할 때 항상 지키는 대표님 말투·원칙이에요. 한 줄에 하나씩 적어 주세요. 예: 존댓말, 결론 먼저 / 환불·할인 얘기는 저한테 넘기기 / 이모지는 거의 안 씀</div>
      <textarea id="qaMemo" style="margin-top:8px;min-height:180px">${esc(st.data?.memo ?? "")}</textarea>
      <div class="qarow"><span class="mut">${st.data?.updated_at ? `마지막 저장 ${when(st.data.updated_at)}` : ""}</span><span class="sp"></span><button type="button" class="btn small" id="qaMemoSave">저장</button></div></div>
    <h3 style="margin:20px 0 8px">AI 제안 ${sg.data.length ? `<span class="mut">${sg.data.length}개</span>` : ""}</h3>
    ${sg.data.length ? sg.data.map((x) => `<div class="card" data-id="${x.id}"><div class="qaq">${esc(x.line)}</div><div class="mut" style="margin-top:4px">${esc(x.why)}</div>
      <div class="qarow"><span class="sp"></span><button type="button" class="btn ghost small" data-act="no">거절</button><button type="button" class="btn small" data-act="yes">수락 (메모에 추가)</button></div></div>`).join("")
      : `<div class="card qaempty">아직 제안이 없어요. 📥 에서 AI 답을 고쳐서 확정하면 생겨요.</div>`}`;
  const saveMemo = async (memo) => { const { error } = await sb.from("qna_style").update({ memo, updated_at: new Date().toISOString() }).eq("id", 1); return !fail(error); };
  $q("#qaMemoSave").onclick = async () => { if (await saveMemo($q("#qaMemo").value.trim())) { toast("말투 메모를 저장했어요"); renderMemo(); } };
  box.querySelectorAll(".card[data-id]").forEach((c) => c.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    const x = sg.data.find((s) => s.id === +c.dataset.id), yes = b.dataset.act === "yes";
    if (yes) { const cur = $q("#qaMemo").value.trim(); if (!(await saveMemo(cur ? `${cur}\n- ${x.line}` : `- ${x.line}`))) return; }
    const { error } = await sb.from("qna_suggestions").update({ status: yes ? "accepted" : "rejected" }).eq("id", x.id); if (fail(error)) return;
    toast(yes ? "메모에 넣었어요" : "거절했어요"); renderMemo();
  })));
}
```
- [ ] **Step 4: 확인** — `bash test-qna.sh` → suggest 두 줄. `AI=1 bash test-qna.sh` → 제안 한 줄(환불은 대표에게 넘김 비슷한 내용). 브라우저 대표 → ✍️: 메모 저장·새로고침 뒤 유지, 제안 [수락] → 메모 끝에 `- …` 추가, [거절] → 사라짐. 📥 에서 AI 답을 크게 고쳐 확정 → 몇 초 뒤 "✍️ 제안이 생겼어요" 토스트.
- [ ] **Step 5: 커밋** — `git add supabase/functions/qna/index.ts qna.js && git commit -m "💬 Q&A: ✍️ 말투·원칙 메모 + 고친 답에서 메모 제안(수락한 것만 들어감)"`

### Task 9: 문서·마무리 점검·로컬 되돌리기

**Files:** Modify `docs/manager-qna/README.md`, `작업로그_claude.md`

- [ ] **Step 1: README 고치기** — 파일 표를 실제와 맞춤(`qna-core.js`·`tests/qna-core.test.mjs` 줄 → `supabase/functions/qna/rules.ts`·`rules_test.ts`(deno test), `planner-push` 줄 → 저장소에 넣었음), "## 진행" 절 추가: 1~3단계 구현 완료(로컬 확인), 운영 배포 전. **배포 순서:** ① 운영 DB 에 pg_trgm 확인(`select * from pg_available_extensions where name='pg_trgm'`) ② 마이그레이션 2개 ③ `supabase functions deploy qna` ④ `supabase functions deploy planner-push --no-verify-jwt`(원래 verify_jwt false) ⑤ 프런트(버전 올리기 `version.txt`·`?v=`) ⑥ 대표가 📸 로 기존 카톡 Q&A 먼저 채우기. **주의:** planner-push 는 노트북 `~/.cache/pallo-planner-dev/supabase/functions/planner-push` 에서도 배포해 왔다 → 노트북 세션은 이제 저장소 파일을 고쳐서 배포해야 Q&A 알림이 안 사라짐.
- [ ] **Step 2: 작업로그** — `작업로그_claude.md` 맨 아래에 한 줄: `- 10-26: 💬 매니저 Q&A 탭(feat/manager-qna) 1~3단계 로컬 완료 — qna 함수·qna_* 테이블·qna.js. planner-push 원본을 저장소 supabase/functions/planner-push 로 옮기고 Q&A 알림 추가(노트북 ~/.cache 사본으로 배포하면 Q&A 알림 사라짐 → 저장소 파일 쓸 것).`
- [ ] **Step 3: 전체 점검** — `cd ~/pallo-planner-qna/supabase/functions/qna && deno test rules_test.ts && deno check index.ts` · `node --check qna.js` · `bash ~/.cache/pallo-planner-dev/test-qna.sh` 전부 기대값 · 브라우저 매니저/대표 한 바퀴 + 휴대폰 폭(375px) 화면 깨짐 없음(스크린샷).
- [ ] **Step 4: 로컬 함수 서버를 main 으로 되돌리기**:
```bash
cd ~/.cache/pallo-planner-dev/supabase && rm functions && ln -s ~/pallo-planner/supabase/functions functions && pkill -f "supabase functions serve"; sleep 2
```
그다음 `supabase functions serve --env-file .env.functions` 를 `~/.cache/pallo-planner-dev` 에서 백그라운드로. (로컬 DB 의 qna 테이블은 남겨 둔다.)
- [ ] **Step 5: 커밋·푸시** — `git add docs/manager-qna/README.md 작업로그_claude.md && git commit -m "💬 Q&A: 문서에 파일 표·진행·배포 순서" && git push -u origin feat/manager-qna`
- [ ] **Step 6: 사용자에게 보고하고 배포는 승인 받기** — 만든 것, 점검 결과, 실제 AI 예시 1~2개, 스크린샷. **운영 배포는 사용자가 "배포해"라고 한 뒤에만** README 배포 순서대로.

---

## Self-Review

- 설계 대비: 섞기(C) 판정 ✔ Task 1 route + Task 3 / 허락·결정 요청 항상 대표 ✔ route·ASK_SYSTEM / AI 바로 답도 사후 확인 ✔ reviewed + 📥 쿼리 / 전 지점 FAQ·🔒 본인+대표·지점 한정 ✔ RLS(Task 2) / 🔒 AI 참고 제외 ✔ qna_pick_refs / 🔒 셋 다 ✔ 체크(Task 4)·sensitive(Task 3)·대표 체크(Task 5), 매니저는 켜기만 ✔ 트리거 / 캡처 학습·사진 미저장·가리기 ✔ Task 7 / 말투 메모·제안 수락만 ✔ Task 8 / 알림 ✔ Task 6 / 한도 50·대표 무제한 ✔ Task 3 / 실시간 ✔ Task 2 publication + Task 4·5 / 미리보기 보기만 ✔ ro().
- 이름 맞춤: `call`, `card`, `bossCard`, `bindBoss`, `teamSel`, `afterFinal`, `BOSS_TABS`/`BOSS_VIEWS`, `QA.shots/pairs/people/tab/dirty`, RPC 이름 `qna_search`/`qna_pick_refs`/`claim_qna_notices` — 각 Task 에서 같은 이름 사용.
- 범위 밖(1차 안 함): 매니저 질문 사진 첨부, 카테고리, 통계, 카톡 .txt 가져오기, 임베딩.
