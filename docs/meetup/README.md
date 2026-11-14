# 🌏 밋업 운영 (팔로플래너 마케팅 탭 "밋업" + 맥미니 매시간 예약 작업)

밋업(meetup.com) 그룹 **PALLO Language Exchange Korea**(Pro 네트워크 `pallofficial`)의 신청·회원을 맥미니가 **매시간** 공식 API로 읽어 Supabase에 쌓고,
전산이 있는 3개 지점의 새 신청은 지점 전산 캘린더에 임시 일정으로 넣는다. CS매니저는 플래너에서 본다.
2026-11-14 맥미니 세션에서 사용자와 정함. 운영 정리 페이지: https://claude.ai/artifact/NnnZTEG8AzexUgw3yxbqvY

## 한 줄 구조

```
[매시 09–23시 예약 작업 pallo-meetup-sync]
  밋업 공식 API (JWT, 사람 로그인 없음)
    ├ 앞으로 21일 예정 이벤트 중 신청 2명 이상(주최자 포함) + DB에 참석 예정자가 남은 이벤트
    └ 최근 3일 새 회원
        ▼ scripts/meetup/meetup.mjs poll
  meetup_events · meetup_rsvps · meetup_members · meetup_runs
        ├▶ 전산 3지점(대구동성로·대구일중·울산) 새 신청 → 스킬이 Claude in Chrome(맥미니)로 전산 캘린더 임시 일정 등록 → jeonsan-mark
        ▼
  플래너 마케팅 탭 › 🌏 밋업 (오늘·내일 명단, 새 신청, 앞으로 참석, 주간 요약, 새 회원)
```

## 확정된 결정 (2026-11-14)

- 외국인 참가는 **무료**.
- 알림: 카카오톡(CS 업무폰)은 **보류**. 그동안 **플래너 밋업 칸**에 쌓는다.
- 읽는 방법: **공식 GraphQL API**(`https://api.meetup.com/gql-ext`), JWT 흐름. OAuth 클라이언트 "PALLO Meetup Ops"(번호 210618) 등록 → **밋업 검토 대기 중**. 승인되면 서명 키를 만들어 맥미니에 둔다.
- 지점: 제목 맨 앞 `[지점명]`으로 판단. 플래너 지점 4곳(구미·대구영어·울산·대구일중)은 `team_id`가 붙어 그 지점 매니저도 보고, 나머지 15곳은 대표만 본다(`meetup-core.js` `TEAM_OF_BRANCH`).
- 전산 등록: 전산 계정이 들어갈 수 있는 **대구동성로(DAEGUDSR)·대구일중(DAEGUJPCH)·울산(ULSAN)만**. 구미는 플래너에만.
- 참석자 메시지(전날 안내·감사·후기 요청): 사용자는 "문구 1회 승인 후 자동 발송"을 골랐지만 **공식 API에 메시지 보내기 기능이 없다**(쓰기는 이벤트 만들기·수정·공지·신청 열고 닫기뿐). → **(가)로 결정(11-14)**: 밋업 기본 리마인드·후기 요청에 맡기고, 각 이벤트의 "찾아오는 길(howToFindUs)"·본문에 입구 사진·출구 안내를 API `editEvent`로 넣어 리마인드에 같이 나가게 한다. 안내 문구는 사용자 확인 후 반영(API 승인 뒤).

## 설정 (맥미니)

`~/.config/pallo/meetup.env` (권한 600, 내용 출력 금지)
```
MEETUP_CLIENT_KEY=…        # OAuth 클라이언트 키 (설정 화면)
MEETUP_SIGNING_KEY_ID=…    # 서명 키 번호 (설정 화면)
MEETUP_MEMBER_ID=…         # 클라이언트 주인 회원 번호 (= 주최자 계정)
MEETUP_PRIVATE_KEY=~/.config/pallo/meetup-private.pem   # 권한 600
```
Supabase 쓰기는 기존 `~/.config/pallo/marketing.env`(서비스 키)를 그대로 쓴다.

## 명령

```
node scripts/meetup/meetup.mjs check                 # 토큰 받고 계정 이름 확인
node scripts/meetup/meetup.mjs poll [--print]        # 읽고 쌓기 (--print 는 저장 안 함)
node scripts/meetup/meetup.mjs jeonsan-mark <rsvp_id> <registered|duplicate|skipped|failed> [메모]
node scripts/meetup/meetup.mjs roster [YYYY-MM-DD]   # 그날 참석 예정자
node --test tests/meetup-core.test.mjs
```

## 전산 일정 양식 (스킬이 입력)

- 제목: `밋업 / {이름} / {지점} 언어교환 참석` (대기면 끝에 `(대기)`)
- 날짜·시작: 모임 시작 시각, 길이 2시간, 종류 선택 안 함
- 메모: `[밋업 자동등록]`, 이벤트 제목, 참석자(도시·첫 참석), 신청 번호, 이벤트 주소, "외국인 참가자(무료) — 당일 응대, 취소되면 일정 직접 삭제"
- 취소는 일정을 지우지 않는다(네이버 예약 동기화와 같은 규칙). 플래너에 "취소"로 보인다.

## 남은 결정

1. 찾아오는 길 안내 문구(지점별 입구·출구) — 문구 확인 후 API 승인 뒤 `editEvent`로 반영.
2. 19개 지점·시간대를 줄일지.
3. 카카오톡 알림 연결(보류 중).

## 완료 로그

- 11-14: 그룹 현황 점검·운영 정리 페이지. OAuth 클라이언트 등록(검토 대기). `meetup-core.js`(테스트 9개)·`scripts/meetup/{api,meetup}.mjs`·마이그레이션 `20261114120000_meetup.sql`·마케팅 탭 밋업 칸(가짜 데이터로 화면 확인). API 질의 3개 스키마 검사 통과. 참석자 메시지는 (가) 결정. 운영 DB 마이그레이션 적용(정책 4), 플래너 배포.
