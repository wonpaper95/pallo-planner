-- 🧠 뇌 탭 분석이 대표 계정의 메모까지 읽게 하는 읽기 권한 (맥미니 분석 = 서비스 열쇠, 읽기만)
-- my_notes: 🧠 시뮬레이터 탭 개인 메모·계획 / weeks: 주간 회고 / team_tasks: 팀 할 일
-- 화면 쪽 권한(RLS)은 그대로다. 분석 스크립트는 이 표에서 대표 계정이 쓴 줄만 읽는다 (scripts/brain/collect-planner.mjs).
grant select on public.my_notes, public.weeks, public.team_tasks to service_role;
-- 2026-11-15 적용함. 그 뒤 대표 지시로 team_tasks 는 읽지 않기로 해, 분석 스크립트는 my_notes·weeks 만 쓴다.
