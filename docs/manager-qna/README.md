# 💬 매니저 Q&A 탭 (팔로플래너 "Q&A" 탭)

매니저가 대표에게 하던 질문을 한곳에 모은다. AI가 **대표가 확정한 답변 모음 + 대표 말투·원칙 메모**를 보고 대표처럼 답하고,
대표는 AI 답을 고쳐 확정해서 점점 "대표가 하는 답"에 가깝게 만든다. 플래너 밖(카카오톡)에서 오간 질문은 **캡처를 올려 학습**시킨다.
2026-10-26 맥미니 세션에서 설계(brainstorming). 브랜치 `feat/manager-qna` (worktree `~/pallo-planner-qna`, main 12c383b 에서 분기).

관련 문서: 블로그 작성기 `docs/blog-writer/README.md`(권한·AI 함수 패턴), 게시물 탭 `docs/sns-posts/README.md`(테이블 GRANT·상태 지킴 트리거 패턴).

## 확정된 결정 (사용자와 정함)

1. **답을 언제 보여주나 = 섞기(C).** 확정 답변에 근거가 있으면 AI가 바로 답하고, 처음 보는 유형이면 "⏳ 대표님 확인 중"으로 기다린다.
   - **허락·결정 요청**(조퇴해도 될까요, 환불해 줘도 될까요 등)은 전례가 있어도 **항상 대표에게** 넘긴다.
   - AI가 바로 답한 것도 대표의 📥 확인할 것에 "아직 안 봄"으로 올라간다(사후 확인).
2. **누가 보나 = 전 지점 공유 + 민감한 건 본인만(A+).** 🔒 아닌 확정 Q&A는 전 지점 FAQ. 확정 전·🔒 는 물어본 사람 + 대표만.
   - "○○점만 해당"으로 확정한 답은 그 지점 매니저에게만 보인다.
   - **🔒 Q&A는 AI가 다른 사람 질문에 답할 때 참고하지 않는다**(AI 답을 통한 새어 나감 방지). 같은 사람의 다음 질문에도 쓰지 않는다(단순하게).
3. **🔒 누가 정하나 = 셋 다(A).** 매니저가 물을 때 "나만 보기" 체크 / AI가 민감해 보이면 자동으로 켬(급여·인사·개인 사정·다른 직원 이야기·건강 등) / 대표는 언제든 켜고 끔. AI는 켜기만 하고 끄지 않는다.
4. **캡처 학습 = 플래너 안 대표 전용 칸(A).** 여러 장 올리기 → AI가 질문·답 쌍 추출 → 쌍마다 저장/고치기/버리기/🔒 → 확정 답변 모음에 들어감. **원본 사진은 저장하지 않는다**(함수 메모리에서만 쓰고 버림). 이름·전화번호는 가려서 저장.
5. **말투 익히기 = 예시 + 말투·원칙 메모(A).** 대표가 직접 쓰는 메모 하나. 대표가 AI 초안을 고쳐 확정하면 AI가 "메모에 이 줄 추가할까요?"를 제안하고 **수락한 것만** 들어간다.
6. **만드는 방법 = 새 Edge Function `qna`.** blog-write 와 같은 틀(caller → 지점 → Claude)이지만 파일·하루 한도는 따로.

## 파일

| 파일 | 역할 |
|---|---|
| `qna.js` / `qna.css` | Q&A 탭 화면 (`window.QA`). index.html 전역(sb·me·isBoss·previewTeam·previewUser·teams·esc·toast·fail)을 씀 — links.js 와 같은 방식 |
| `supabase/functions/qna/rules.ts` · `rules_test.ts` | 순수 함수: `route()` 상태 판정, `maskPII()` 전화번호·이메일·계좌 가리기, `editRatio()` 고친 정도. `deno test supabase/functions/qna/rules_test.ts` (참고 Q&A 고르기는 SQL `qna_pick_refs`) |
| `supabase/migrations/20261026120000_qna.sql` | 테이블 5개 · RLS · 지킴 트리거 · `qna_search`(화면)·`qna_pick_refs`(AI 참고)·`claim_qna_notices`(알림) · pg_trgm · realtime |
| `supabase/migrations/20261026130000_qna_grants.sql` | 테이블 API 권한 (운영은 새 테이블에 기본 GRANT 가 안 붙음 — sns_grants 와 같은 이유) |
| `supabase/functions/qna/index.ts` · `prompt.ts` | AI 함수: `ask` · `extract` · `suggest` · `usage` |
| `supabase/functions/planner-push/index.ts` | 운영 원본(v16, 그동안 노트북 `~/.cache/pallo-planner-dev` 에만 있었음)을 저장소로 옮기고 `claim_qna_notices()` 한 줄 추가 |
| `~/.cache/pallo-planner-dev/test-qna.sh` | 로컬 점검 (저장소 밖). `AI=1` 이면 실제 AI 1회 |

## 화면

탭 버튼 `<button data-v="qna">Q&A</button>` — 모든 사람. 탭 끌기 순서 저장(prefs.tabs)에 그대로 들어간다.
대표에게는 탭 이름 옆에 📥 확인할 것 개수 뱃지.

### 매니저
- **질문 입력창** + `🔒 나만 보기` 체크 + [보내기].
  - 치는 동안(0.4초 멈추면) `qna_search` 로 **"이미 있는 답"** 최대 5개를 아래에 보여 준다. 열어 보고 해결되면 안 보내도 된다(AI 호출 없음).
- **보낸 뒤 결과**
  - `ai`: 답 + "🤖 AI 답변 · 확정된 답 n개 참고"(누르면 참고한 Q&A 펼침) + [👍 해결됐어요] [🙋 대표님께 직접 물어보기]
  - `waiting`: "⏳ 대표님 확인 중이에요. 답이 오면 알림이 가요" (AI 초안은 화면에 안 보여 줌 — 행은 본인이 읽을 수 있으니 숨길 비밀은 아님)
  - `final`: "✅ 대표 확정" + 답 (대표가 AI 답을 고쳤으면 고친 답)
  - AI가 🔒 를 자동으로 켰으면 "🔒 민감한 내용 같아서 나만 보기로 바꿨어요" 한 줄.
- **보기 2개:** `📝 내 질문`(상태 뱃지, 최신순) · `📚 FAQ`(확정 + 🔒 아님 + 우리 지점에 해당, 검색창).
- 아직 `waiting` 인 내 질문은 [취소](삭제) 가능.

### 대표 (서브탭 4개)
1. **📥 확인할 것** — `waiting` 전부 + `ai` 중 `reviewed=false`. 오래된 순.
   - 카드: 질문 · 누가(지점) · AI 판단 뱃지(근거 없음 / 허락·결정 요청 / 민감) · AI 초안이 들어간 고칠 수 있는 칸.
   - 버튼: [확정] [🔒 켜기/끄기] [○○점만 해당 ▾(없음/지점 고르기)] [지우기].
   - `ai` 카드는 [이대로 OK](고치지 않고 확정)도 있음.
   - 확정하면 → 매니저 알림, 고친 정도(`editRatio`)가 0.15 이상이면 `suggest` 호출 → 메모 제안 생김.
2. **📚 확정 답변 모음** — 검색 · 고치기 · 🔒 · 지점 한정 · 지우기. 출처 뱃지(질문창 / 📸 캡처).
3. **📸 캡처로 학습** — 사진 1~10장(카톡 화면). 올리기 전에 브라우저에서 긴 변 1600px JPEG 로 줄임(photo.js 재사용).
   - [뽑기] → 쌍 목록: 질문 칸 · 답 칸(둘 다 고칠 수 있음) · 🔒 체크(AI 추천이면 미리 체크) · [저장] [버리기]. [전부 저장]도.
   - 저장하면 `qna_items` 에 `source='capture'`, `status='final'`, `reviewed=true` 로 들어간다. 물어본 사람은 `asker_label`(가린 이름, 예: "○○ 매니저")로만.
4. **✍️ 말투·원칙 메모** — 큰 글 칸 하나 + [저장]. 아래에 AI 제안 목록: 한 줄 + 근거(고치기 전→후 요약) + [수락](메모 끝에 한 줄 추가) [거절].

미리보기(대표가 "매니저 화면으로 보기")일 때는 매니저 화면을 보여 주되 보내기는 막는다(보기만).

## 데이터

```
qna_items
  id bigint pk
  user_id uuid null            -- 물어본 매니저 (캡처로 들어온 건 null)
  team_id bigint null → teams  -- 물어본 매니저 지점
  asker_label text ''          -- 캡처용 가린 이름
  question text not null
  private bool default false   -- 🔒
  auto_private bool default false  -- AI가 켠 것 (표시용)
  status text check in ('ai','waiting','final')
  ai_answer text ''            -- AI 초안/답 (원본 보존)
  answer text ''               -- 보여 줄 답: ai 면 ai_answer, final 이면 대표 확정 답
  ai_flags jsonb '{}'          -- {grounded, decision_request, sensitive, reason}
  refs bigint[] '{}'           -- 참고한 qna_items.id
  only_team bigint null → teams  -- ○○점만 해당
  reviewed bool default false  -- 대표가 봤는지
  resolved bool default false  -- 매니저 👍
  escalated bool default false -- 매니저 🙋
  source text default 'ask' check in ('ask','capture')
  created_at, updated_at, final_at
qna_style        (id=1 한 줄) memo text, updated_at
qna_suggestions  id, item_id → qna_items, line text, why text, status pending|accepted|rejected, created_at
qna_gens         id, team_id, user_id, kind ask|extract|suggest, input_tokens, output_tokens, cost_usd, meta jsonb, created_at  -- 사용량·한도·캡처 기록(meta={shots,pairs})
qna_limits       team_id pk, daily int default 50
```

**RLS (blog_my_team / blog_is_admin 재사용)**
- `qna_items` 읽기: 대표 전부 / `user_id = auth.uid()` / `status='final' and not private and (only_team is null or only_team = blog_my_team())`.
- `qna_items` 쓰기
  - 넣기: 대표만(캡처 저장). 매니저 질문은 `qna` 함수(service_role)가 넣는다 — 그래야 AI 결과·상태를 사람이 못 조작한다.
  - 고치기: 대표 전부. 매니저는 자기 것 중 **`resolved` 켜기, `ai`→`waiting`(escalated=true)** 만 — 지킴 트리거 `qna_items_guard` 가 나머지 칸을 old 값으로 되돌리고 그 밖의 상태 변경은 예외.
  - 지우기: 대표 전부, 매니저는 자기 `waiting` 만.
  - 트리거: `status='final'` 로 바뀌면 `final_at=now()`, `reviewed=true`. `updated_at` 갱신.
- `qna_style` · `qna_suggestions` · `qna_limits` · `qna_gens`: 대표만 (함수는 service_role).
- `qna_search(q text)` RPC: security invoker(RLS 그대로) — 확정 · 🔒 아님 · 우리 지점 해당 중 `similarity(question, q)` 높은 순 5개. `create extension if not exists pg_trgm` + `qna_items(question gin_trgm_ops)` 인덱스.

## AI 함수 `qna`

모델은 blog-write 와 같은 `claude-opus-5-5`, 같은 `ANTHROPIC_API_KEY`. 고정 부분(규칙 + 말투 메모 + 예시)은 system 에 두고 prompt caching.

### `ask` {question, private}
1. caller·지점 확인 → 한도 확인(대표는 제한 없음, 매니저는 지점별 `qna_limits.daily`, 오늘 `qna_gens kind='ask'` 개수).
2. **먼저 `qna_items` 에 `waiting` 으로 넣는다**(AI가 실패해도 질문은 남게).
3. 참고 예시 고르기: 확정 · 🔒 아님 · (only_team 없음 또는 이 지점). **300개 이하면 전부**, 넘으면 `similarity` 상위 40개.
4. Claude 호출 → JSON 출력(구조화 출력):
   `{grounded: bool, decision_request: bool, sensitive: bool, answer: string, refs: number[], reason: string}`
   - 규칙: 예시·메모에 근거가 있을 때만 grounded. 근거 없는 사실(날짜·금액·규정)은 지어내지 않는다. 허락·결정 요청이면 decision_request. 말투 메모를 따른다.
5. `route()` (qna-core): `grounded && !decision_request` → `ai`, 아니면 `waiting`. refs 는 실제로 넘긴 예시 id 만 남긴다.
6. `sensitive` 면 `private=true, auto_private=true`. 행 갱신(ai_answer, answer = ai 일 때만, ai_flags, refs).
7. `waiting` 이면 대표 알림(푸시+카톡). 응답으로 행 반환.
- **AI 실패·키 없음·한도 초과:** 행은 `waiting` 그대로, `ai_flags.reason` 에 사유. 매니저에게 "AI가 지금 답하기 어려워서 대표님께 바로 넘겼어요". 대표 알림은 그대로 간다.

### `extract` {images: [{media_type, data}]}  (대표만, 1~10장)
- 프롬프트: "대표 본인 폰 캡처 — 오른쪽 노란 말풍선 = 대표, 왼쪽 = 상대". 질문→답 쌍만 뽑고 잡담·인사는 버림. 여러 말풍선은 합침. 이름은 "○○ 매니저", 전화번호·계좌는 가림. 민감하면 sensitive.
- 출력: `{pairs: [{question, answer, asker_label, sensitive}]}` → 서버에서 `maskPII()` 한 번 더 → 그대로 반환(저장 안 함). `qna_gens` 에 `kind='extract', meta={shots, pairs}`.
- 사진은 어디에도 저장하지 않는다(Storage 안 씀).

### `suggest` {item_id}  (대표만, 확정 직후 화면이 부름)
- 입력: 질문 · ai_answer · 확정 answer · 지금 메모. 출력: `{line: string|null, why: string}`. 메모에 이미 있는 내용이거나 이번 답에만 해당하면 null.
- line 이 있으면 `qna_suggestions` 에 pending 으로.

### `usage`
- 오늘 지점 사용량·한도 (블로그 탭과 같은 모양).

## 알림 (planner-push 에 추가)
- `qna_items` 가 `waiting` 이 됨(새 질문 또는 🙋) → 대표 푸시 + 카톡: "💬 ○○점 ○○: 질문 앞 40자".
- `final` 이 됨 + `user_id` 있음 → 그 매니저 푸시: "✅ 대표님이 답했어요: 질문 앞 40자".
- 탭 화면은 `qna_items` realtime 구독으로 바로 갱신, 대표 뱃지 개수도.

## 점검
- `tests/qna-core.test.mjs`: route 4경우, maskPII(010-1234-5678·01012345678·+82·이메일·계좌 같은 숫자열), editRatio(같음 0, 전부 다름 1), refs 걸러내기.
- `test-qna.sh` (로컬 supabase, 계정은 dev-accounts.txt)
  - 매니저 A 🔒 질문을 매니저 B·다른 지점이 못 봄.
  - 매니저가 `answer`·`status=final`·`private=false` 로 못 고침.
  - only_team 답이 다른 지점에 안 보임.
  - 매니저가 직접 insert 못 함.
  - 🔒 Q&A가 `ask` 참고 예시에 안 들어감.
  - `AI=1` 이면 ask 1회(근거 있는 질문 → ai, 허락 요청 → waiting) + extract 1회(샘플 캡처).
- 운영 배포 전 브라우저로 매니저·대표 화면 한 바퀴.

## 만드는 순서
1. **기본:** 마이그레이션 2개 · `qna` 함수 ask/usage · 탭(매니저 질문·내 질문·FAQ, 대표 📥·📚) · planner-push 알림. → 이것만으로 운영 가능.
2. **캡처 학습:** extract · 📸 칸.
3. **말투:** ✍️ 메모 · suggest · 제안 수락.

처음엔 확정 답변이 0개라 모든 질문이 `waiting` 으로 간다. **2단계(캡처)로 기존 카톡 Q&A를 먼저 채우면** 바로 답하는 비율이 빨리 올라간다 → 1·2단계를 이어서 배포.

## 진행

**2026-10-26: 1~3단계 구현 완료 (로컬 확인), 운영 배포 전.** 계획 `docs/manager-qna/plan.md`. 로컬 점검 `bash ~/.cache/pallo-planner-dev/test-qna.sh` (`AI=1` 이면 실제 AI 6회: 질문 3·캡처 1·제안 1 등).
확인한 것: 근거 있는 질문 → 🤖 바로 답(참고 번호) / 조퇴 허락 → ⏳ 대표 대기 / 급여 질문 → 🔒 자동 / 캡처에서 쌍 2개·번호 가림 / 많이 고친 답 → 메모 제안 / 다른 지점·🔒·지점 한정 안 보임 / 매니저가 답·상태 위조 못 함 / 실시간 갱신.

## 배포 (사용자 승인 뒤에만, 이 순서)

1. 운영 DB 에 pg_trgm 있는지: `select name, installed_version from pg_available_extensions where name = 'pg_trgm';`
2. 마이그레이션: `supabase db query --linked --project-ref aiqrchgwrfrmscstlsmv -f supabase/migrations/20261026120000_qna.sql` → 같은 방식으로 `20261026130000_qna_grants.sql`. 확인: `select count(*) from pg_policies where policyname like 'qna_%';` → 8
3. 함수: `supabase functions deploy qna --project-ref aiqrchgwrfrmscstlsmv --use-api` (ANTHROPIC_API_KEY 는 blog-write 와 같은 비밀값이라 따로 넣을 것 없음)
4. 알림: `supabase functions deploy planner-push --project-ref aiqrchgwrfrmscstlsmv --use-api --no-verify-jwt` (원래 verify_jwt=false)
5. 프런트: `version.txt` 와 index.html 의 `?v=`·`app-version` 을 `TZ=Asia/Seoul date +%Y%m%d%H%M` 로 → main 머지·푸시 (GitHub Pages)
6. 대표가 📸 캡처로 기존 카톡 Q&A 를 먼저 채우고 ✍️ 메모에 말투 몇 줄 → 그다음 매니저에게 탭 안내.

**주의 — planner-push:** 이 함수는 노트북 세션이 `~/.cache/pallo-planner-dev/supabase/functions/planner-push` 사본으로 배포해 왔다. 이제 원본은 저장소 `supabase/functions/planner-push/index.ts`. 노트북 사본으로 다시 배포하면 Q&A 알림이 사라지니, 고칠 땐 저장소 파일을 쓸 것.

## 1차에서 안 하는 것
- 매니저 질문에 사진 첨부, 카테고리 분류, 답변 평가 통계, 카톡 대화 내보내기(.txt) 가져오기, 임베딩 검색(pg_trgm 으로 부족하면 그때).
