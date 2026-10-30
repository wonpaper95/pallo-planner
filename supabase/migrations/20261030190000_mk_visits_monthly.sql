-- 📅 전산 캘린더 통계(날짜별 상담 예약·방문완) + 📊 월간 리포트(kind monthly)
-- 방문완 = 실제로 와서 상담한 사람. scripts/mk/jeonsan-visits.js 가 [캘린더 통계] 창 숫자만 읽어 push-visits.mjs 로 넣는다(이름·전화번호 없음).
create table if not exists public.mk_visits (
  team_id bigint not null references public.teams(id) on delete cascade,
  day date not null,
  total int not null default 0 check (total >= 0),    -- 총 예약
  done int not null default 0 check (done >= 0),      -- 방문완
  noshow int not null default 0 check (noshow >= 0),  -- 불참
  data jsonb not null default '{}',                   -- byStatus·byLang·byMotive·visit·enroll (전산 통계 창 값 그대로)
  updated_at timestamptz not null default now(),
  primary key (team_id, day)
);
alter table public.mk_visits enable row level security;
drop policy if exists mk_visits_read on public.mk_visits;
create policy mk_visits_read on public.mk_visits for select using (blog_is_admin() or (team_id = blog_my_team() and not mk_is_assistant()));
-- 쓰기 정책 없음 = 서비스 키(스킬)만
grant select on public.mk_visits to authenticated;
grant select, insert, update, delete on public.mk_visits to service_role;

-- 월간 리포트: week 칸 = 그 달 1일. monthly_first = 전반(1~15일, 16일에 만듦), monthly = 한 달 전체(다음 달 1일에 만듦)
alter table public.mk_reports drop constraint if exists mk_reports_kind_check;
alter table public.mk_reports add constraint mk_reports_kind_check check (kind in ('weekly', 'persona', 'monthly', 'monthly_first'));
