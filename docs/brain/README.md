# 🧠 뇌 탭

대표 머릿속 지도. 플래너에 쓴 글과 Claude 에게 쓴 말을 매주 읽어 **무엇을 요즘 많이 생각하는지(온도)**, **어디에 고민이 걸려 있는지**를 주제별로 보여 주고, 관련 있는 생각을 선으로 잇는다(옵시디언 그래프처럼). 직접 생각을 더하고 잇고 고칠 수도 있다.

- 보는 사람: **대표 본인만** (매니저·조교·공유 링크 없음). 탭 단추도 대표에게만 보인다.
- 화면: 🌌 입체 지도(3D) / 🌿 나뭇가지 / 🔥 순위(관심순·고민순·최근순·뜨는 순) / 🧠 좌뇌·우뇌.
- 🧠 좌뇌·우뇌: 위에서 본 뇌 그림에 생각을 왼쪽(좌뇌 = 논리·숫자·계획·규칙) · 오른쪽(우뇌 = 사람·감정·창의·이미지) · 가운데 띠(둘 다)로 나눠 놓는다. 위 막대는 좌:우 비율(온도를 무게로, 둘 다는 반반). 과학적 구분이 아니라 "논리 쪽 / 감각 쪽" 을 보는 렌즈다.
- 입체 지도에서 점이 클수록 요즘 자주 떠올린 생각, 붉은 빛은 '고민' 상태. 색은 주제별/상태별로 바꿀 수 있다.

## 파일
| 파일 | 하는 일 |
|---|---|
| `brain.js` (`window.BRAIN`) | 화면. 화면 틀(.dt*)은 `duty.css`, 뇌 전용은 `brain.css` |
| `brain-core.js` | 계산(낱말 걸기·횟수·온도·근거·달라진 점). 화면에서는 안 쓰고 맥미니 스크립트와 테스트가 씀 |
| `vendor/duty-lib.js` | 3D 라이브러리(3d-force-graph + three). 입체 지도를 처음 열 때만 받음 |
| `scripts/brain/collect.sh` | 자료 모으기 한 번에 (아래 네 개를 차례로) |
| `scripts/brain/collect-planner.mjs` | 플래너에서 대표 계정 글만 읽기 전용으로 (주간 할 일·아이디어 창구·월간 목표·리포트·회의록) |
| `scripts/brain/extract-claude.py` | 그 컴퓨터의 Claude Code 대화에서 "내가 쓴 말"만 뽑기 (맥북에서도 같은 파일을 실행) |
| `scripts/brain/corpus.mjs` | 한데 모아 조각 목록(corpus.json)과 읽기용 묶음(chunks/*.txt) 만들기. 비밀번호·열쇠는 가림 |
| `scripts/brain/save.mjs` | 정의(brain.json) + 조각 → 온도·근거 계산 → DB 저장. `--dry` 는 계산만 |
| `supabase/migrations/20261114200000_brain.sql` | 표 `brain_nodes`·`brain_links`·`brain_runs` 와 권한 |
| `~/.claude/skills/pallo-brain-sync/SKILL.md` | 매주 월요일 새벽 분석 절차 (맥미니 예약 작업) |

자료와 정의는 맥미니의 `~/.local/share/pallo-brain/` 에만 있다 (planner.json, claude-*.json, corpus.json, chunks/, digest/, brain.json). **저장소에 올리지 않는다** — 이 저장소는 공개된다.

## 점 하나에 담기는 것 (`brain_nodes`)
- `title` 이름, `note` 내용, `state` 상태(관심·고민·실행·루틴·식음), `heat` 온도 0~100, `worry` 고민 0~100
- 좌뇌·우뇌는 `stats.side` = `L`·`R`·`B`(둘 다). 따로 칸을 만들지 않았다(DB 변경 없음). 화면에서 고르면 `stats.side_me = true` 가 붙는다
- `stats` = `{n 전체 횟수, n30 최근 30일, n90, rise 뜨는 정도, first, last, by:{week,claude,idea}, m:{"2026-10": 12}, open 안 끝낸 할 일, moved 미룬 횟수}`
- `src` 근거 = `[{d 날짜, w week|claude|idea, t 원문 한 줄}]` (최대 6개)
- `origin` ai(분석이 만든 점)/me(직접 넣은 점), `key` 분석이 붙인 이름표, `edited`, `hidden`

### 다시 분석해도 지켜지는 것
- 화면에서 **직접 넣은 점·선**(origin=me)은 건드리지 않는다. 이름이 조각에 나오면 온도·근거만 매긴다.
- 분석이 만든 점의 이름·내용·상태·자리를 화면에서 고치면 `edited=true`(DB 트리거) → 그 뒤로는 온도·근거만 새로 하고 이름·내용·상태·자리는 덮어쓰지 않는다.
- 분석이 만든 점을 화면에서 지우면 `hidden=true` → 다시 나타나지 않는다. (직접 넣은 점은 완전히 지워진다.)
- 화면에서 고른 좌뇌·우뇌(`stats.side_me`)는 다시 분석해도 그대로 둔다 (`brain-core.js` `keepSide`). 직접 넣은 생각은 분석이 좌·우를 매기지 않으니 화면에서 고른다.
- 내용에 `[[다른 생각 이름]]` 을 쓰면 그 생각과 선이 이어진다.

## 온도 계산 (`brain-core.js`)
- 주제의 `match` 낱말이 들어 있는 조각을 센다. 주간 할 일·아이디어는 1번, Claude 대화는 같은 대화·같은 날 3번까지만.
- 조각마다 무게 = 출처(주간 1, Claude 1.2, 아이디어 2.5) × 0.5^(지난 날수/45) × (기한 지난 안 끝낸 할 일 1.3) × (중요·꼭 1.3). 앞으로 잡아 둔 할 일은 오늘로 친다.
- 온도 = 100 × (무게 합 / 가장 큰 값)^0.6. 큰 주제끼리, 생각끼리 따로 잰다.
- 관심·실행·고민인데 75일 넘게 안 나오면 '식음'으로 바뀐다.
- 고민(worry)은 분석이 글을 읽고 매긴 값이다(미룸·막힘·갈등·불안이 드러난 정도). 큰 주제의 고민은 아래 생각들의 고민을 온도로 무게 준 평균.

## 정의 파일 (`~/.local/share/pallo-brain/brain.json`)
```json
{ "title": "나", "headline": "지금 머릿속 2~3문장", "insights": ["눈에 띄는 점"],
  "nodes": [
    { "key": "mkt", "title": "📣 마케팅·유입", "note": "큰 주제 요약" },
    { "key": "mkt.meta", "parent": "mkt", "title": "메타 광고", "state": "실행", "worry": 30, "side": "B", "note": "…",
      "match": ["메타 광고", "/인스타 ?광고/"], "not": ["메타버스"], "pin": [{ "d": "2026-10-19", "w": "week", "t": "원문 인용" }] }
  ],
  "links": [["mkt.meta", "money.adcost", "왜 이어지는지"]] }
```
`side` 는 생각(큰 주제 아래 점)마다 붙인다: `L` 숫자·계약·규칙·절차·자동화·분석처럼 따지고 재는 일 / `R` 사람·관계·감정·브랜드·디자인·콘텐츠·아이디어처럼 느끼고 그리는 일 / `B` 둘이 반반. 큰 주제에는 안 붙인다(아래 생각들로 계산).
`node scripts/brain/save.mjs --dry --miss` 로 오류·온도 순위·안 걸린 최근 조각을 본 뒤 `node scripts/brain/save.mjs` 로 저장한다.

## 권한 (RLS)
| | brain_nodes · brain_links | brain_runs |
|---|---|---|
| 본인(대표) | 읽기·쓰기 (`user_id = auth.uid()` 이고 대표일 때만) | 읽기만 |
| 다른 대표·매니저·조교·로그인 없음 | 못 봄 | 못 봄 |
| 맥미니 분석(서비스 키) | 읽기·쓰기 | 쓰기 |

가운데 점은 한 사람에 하나(유니크 인덱스), 자기 아래로 옮기기·다른 사람 점 아래로 넣기는 트리거가 막는다.

## 점검
```
node --test tests/brain-core.test.mjs        # 계산 8가지
bash ~/.cache/pallo-planner-dev/test-brain.sh  # 로컬 DB 권한 16가지 (도커 필요)
```

## 운영에 처음 올릴 때
1. 화면 배포(main 푸시). DB 표가 없으면 탭은 아무에게도 안 보인다(`BRAIN.init`).
2. 운영 DB 에 `supabase/migrations/20261114200000_brain.sql` 적용 (대표가 직접).
3. 맥미니에서 `node scripts/brain/save.mjs` → 대표 화면에 지도가 나타난다.
4. 맥북 대화도 넣으려면 맥북에서 `python3 ~/wonpaper308/pallo-brain/extract-claude.py` (동기화 폴더로 넘어와 다음 분석 때 들어감).
