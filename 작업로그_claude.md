- 10-22: 사용자 정정 — 기능1(자동/직접) 제거, 비율 직접 입력(0·빈칸만 기본값으로 계산+표시). 개선 효과 '전→후·필요 지원자/결제자·같은 지원자면 순매출 +' 형식, 전략 1순위 문구. [1] 지원자 줄(목표=월 계산, 현재=달력 누계). 접으면 순매출 금액 숨김. 배포.
- 10-22: 필요 표에 하루 최소(올림, 회신자=📅캘린더 최소)·하루 평균 목표매출. [3] 비율 직접 입력(members[].p %, 처음엔 자동값으로 채움), mixPlan: 비율 객단가→필요 결제자·인원, 목표 객단가 미달이면 싼 것→Premium 이동 가이드+버튼, 합계≠100 경고+맞추기. 배포.
- 10-22: [2] 카드 접기(sales-r2-open, 기본 접힘, 현재 순매출 줄은 항상 보임 — 순매출 단독 접기 제거), [3] 표 가로 스크롤. 배포.
- 10-26: 💬 매니저 Q&A 탭(feat/manager-qna) 1~3단계 로컬 완료 — qna 함수·qna_* 테이블·qna.js. planner-push 원본을 저장소 supabase/functions/planner-push 로 옮기고 Q&A 알림 추가(노트북 ~/.cache 사본으로 배포하면 Q&A 알림 사라짐 → 저장소 파일 쓸 것).
- 10-26: 🔭 경쟁사 광고 정찰 A단계 — 설계(docs/meta-marketing/competitor-ads.md), mkc_* 테이블·mkc-thumbs 버킷, mkc-core.js(+테스트 9), 광고 라이브러리 추출 스니펫, Playwright 수집기 scripts/mkc/collect.mjs. 로컬 DB에서 en 83건 수집·썸네일 확인.
- 10-26: 🔭 운영 적용 — mkc 마이그레이션 2개(테이블·버킷, 키 library_id+grp) 운영 DB에 적용, 첫 수집 en 262건·jpcn 101건(썸네일 포함). 두 그룹에 겹치는 광고가 덮어쓰이던 문제 → 키 변경.
- 10-26: 🔭 B단계 — 후보 발굴 scripts/mkc/candidates.mjs, 플래너 마케팅 탭 '경쟁사' 페이지(켜기/후보/끄기, 직접 추가, 키워드로만 본 페이지), mkc-core 별명 page_id 처리. 로컬 대표·매니저 화면 확인. 버전 202610261630.
- 10-26: 🔭 C단계 — build-daily.mjs·save-report.mjs, 스킬 pallo-competitor-ads, 예약 작업 pallo-competitor-ads-daily(05:00), 플래너 경쟁사 탭 '오늘' 화면. 운영 첫 일일 리포트 en·jpcn 저장. 로컬 매니저 화면 확인.
- 10-26: 🔭 D단계 — build-creative.mjs(추천 입력), 점검기 checkIdeas(유사도·과장·가격, 컬컴은 카피에서만 차단), save-report creative, 플래너 '주간 추천' 화면(카피·타겟 복사). 운영 첫 추천 en 5·jpcn 4 저장. 스킬에 월요일 절차 추가.
- 10-26: 🔖 버전 202610261700 — 🔭 경쟁사 광고 정찰 A~D 배포 (main 합치기: 리퀴드 글래스·Q&A 이후, index.html 버전 충돌 해결)
- 10-26: 🎓 헤더 '전산 연습' 버튼(상담 AI 옆) — 연습 사이트 매니저 진행률 화면(pallo-training.netlify.app/training/progress)을 새 탭으로. 버전 202610261427. 배포.

## 2026-10-27 조교 링크 (운영 반영)
- 0045_assistant_links 운영 DB 적용: role 'assistant', 허용 표(leaders·leader_att·leader_awards·blog_%·sns_posts·sns_jobs·feedback·profiles(자기 줄)·teams) 밖 RLS 표 전부 restrictive no_assistant. my_team() 은 조교에게 null.
- edge function planner-jo 운영 배포 (JWT 확인 OFF — 함수가 직접 확인: login=링크 해시, rotate=대표만).
- 사이트 80c59cb: 현황 카드 "🔗 조교 링크", ?jo= 로그인, 조교는 리더 현황·블로그·게시물만.
- 운영 검증: 울산점 링크 생성 → 로그인 200, 조교·울산점, 리더 66명, 다른 지점 0, 할 일·고정업무·연락처·매출·교육 등 0, app_settings 거부. 가짜 링크 401, 비로그인 rotate 401.
- 새 표 만들 때: RLS 켜면 no_assistant 정책도 같이 (tools/test_assistant.sql 이 빠진 표 잡음).

## 2026-10-27 📎 할 일 참고 자료 (운영 반영)
- 0048_task_refs: tasks.refs jsonb, 비공개 버킷 task-files (자기 폴더 <user_id>/ 만 읽기·올리기·지우기, 조교 올리기 막음).
- refs.js + 주간 할 일 줄 📎 버튼(.rf — .chip 쓰면 데드라인 새로고침이 첫 .chip 을 바꿔서 사라짐).
- 보관함 주소에 한글 안 됨(Invalid key) → 주소는 영문 랜덤, 원래 이름은 refs.name.
- 운영 검증: 임시 할 일에 링크+한글 파일 올림 → 📎 2, 파일 열어 내용 일치 → 임시 할 일·파일 지움.

## 2026-10-27 🧠 시뮬레이션: 줄마다 색 · 📜 기록 · 실시간 보완
- 글자색: plan.w = {칸: [줄마다 쓴 사람]} — 투명 textarea 뒤 .tbbk 에 색 글자. 마야=민주 핑크.
- 📜 기록: 0050 team_note_days(운영 적용) + 매니저 시뮬 박스·현황 카드·대표 개인 탭 버튼, 읽기 전용.
- 실시간 안 보이던 진짜 원인: 매니저는 "내일" 칸에 적는데 현황 카드는 "오늘"만 보여 줌 → 카드에 오늘/내일(내일 적은 게 있으면 내일).
- 보완: TB.sync 10초·화면 복귀 때 서버 글 다시 받기(적는 중·저장 전 칸은 안 덮음), 끊긴 채널 재연결.
- (23:50) 새로고침하면 글 사라짐 = 통째 저장 덮어쓰기. 0051 team_note_patch(운영 적용): 바뀐 칸만 저장·전송, 서버가 칸 단위로 합침. 매니저/현황 같은 날 기본 + 다른 날 따라감.
- 남은 한계: 같은 칸(특히 브레인 덤프 한 칸)을 두 사람이 동시에 고치면 마지막 저장이 이김. 예전 버전 켜 둔 화면은 여전히 통째 저장 → 새로 열어야.
- (23:57) 브레인 덤프·시간표 줄 단위 합치기: sim-merge.js merge3 (+tools/test-simmerge.js, check-all). 저장 전 서버 최신 글 위에 내가 바꾼 줄만, 실시간은 직전 전송→지금 바뀐 줄만. DB 변경 없음.

## 2026-10-28 📁 지점 중요 서류 · 🌱 언젠가 📎
- 0055 someday.refs (운영 적용): 언젠가 할 일 📎, 날짜로 옮기면 할 일로 같이. refs.js REF.open(행, 저장방법) 일반화.
- 0056 branch_docs + 비공개 버킷 branch-docs (운영 적용): 바로가기 탭 맨 위 지점 탭(대표), 대표만 올리기·지우기, 매니저 자기 지점 내려받기, 조교 막음. tools/test_branch_docs.sql.
- 운영 확인: 구미점에 테스트 파일 올림→내려받기 내용 일치→지움.
- (13:42) 얼굴 자동 모자이크 개선: 6단 확대 조각 + 다시 확인으로 헛것 거름, 버튼 다시 누르면 놓친 얼굴만 추가, 작은 얼굴 모자이크 최소 칸 = 사진/120. 공개 단체사진 시험: 식당 6명 3→5, 100명 0→91.
- (13:55) 📖 백과사전 탭: wiki-data.js(WIKI 36개 · 새 기능 만들면 한 줄 추가) + wiki.js 검색(조사 떼기·끝글자 뗀 말·약한 결과 거름) + 바로 가기. tools/test-wiki.js(탭 존재 확인) check-all 포함.
