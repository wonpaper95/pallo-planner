-- 🌏 밋업(Meetup) 운영 (docs/meetup/README.md). 맥미니가 매시간 공식 API(JWT)로 신청·회원을 읽어 쌓고, 마케팅 탭 › 밋업 이 보여준다.
-- 지점 4곳(구미·대구영어·울산·대구일중) 행은 team_id 가 있어 그 지점 매니저도 보고, 나머지 지점(team_id null)은 대표만 본다. 쓰기 = 서비스 키(스크립트)만.
create table if not exists public.meetup_events (
  id text primary key,                                  -- 밋업 이벤트 번호
  title text not null,
  branch text,                                          -- 제목 맨 앞 [지점명]
  team_id bigint references public.teams(id) on delete set null,
  starts_at timestamptz not null,
  event_url text,
  venue text,
  seen_at timestamptz not null default now()
);
create index if not exists meetup_events_starts_idx on public.meetup_events (starts_at);

create table if not exists public.meetup_rsvps (
  id text primary key,                                  -- 밋업 신청 번호 (예 1874780639!chp)
  event_id text not null references public.meetup_events(id) on delete cascade,
  team_id bigint references public.teams(id) on delete set null,
  branch text,
  event_title text not null,
  starts_at timestamptz not null,
  member_id text not null,
  member_name text not null,
  member_city text,
  status text,                                          -- YES·WAITLIST·NO·ATTENDED·NO_SHOW·EXCUSED_ABSENCE·MAYBE·HAVENT·YES_PENDING_PAYMENT
  is_first_event boolean not null default false,
  guests int not null default 0,
  rsvp_updated timestamptz,
  first_seen_at timestamptz not null default now(),     -- 처음 읽은 때 = "새 신청" 시각
  cancelled_at timestamptz,                             -- 참석·대기 → 취소로 바뀐 걸 읽은 때
  jeonsan_status text check (jeonsan_status in ('registered', 'duplicate', 'skipped', 'failed')),
  jeonsan_note text,
  jeonsan_at timestamptz
);
create index if not exists meetup_rsvps_starts_idx on public.meetup_rsvps (starts_at);
create index if not exists meetup_rsvps_seen_idx on public.meetup_rsvps (first_seen_at);

create table if not exists public.meetup_members (
  member_id text primary key,
  name text not null,
  city text,
  joined_at timestamptz,
  first_seen_at timestamptz not null default now()
);

create table if not exists public.meetup_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  status text not null check (status in ('ok', 'partial', 'failed', 'auth_failed')),
  counts jsonb not null default '{}'::jsonb,            -- {events, rsvps, fresh, cancelled, members}
  error text
);

alter table public.meetup_events enable row level security;
alter table public.meetup_rsvps enable row level security;
alter table public.meetup_members enable row level security;
alter table public.meetup_runs enable row level security;

create policy meetup_events_read on public.meetup_events for select using (blog_is_admin() or team_id = blog_my_team());
create policy meetup_rsvps_read on public.meetup_rsvps for select using (blog_is_admin() or team_id = blog_my_team());
-- 새 회원은 아직 지점이 없다 — 대표만
create policy meetup_members_read on public.meetup_members for select using (blog_is_admin());
-- 마지막 확인 시각·상태는 모두에게 (이름 없음)
create policy meetup_runs_read on public.meetup_runs for select using (auth.role() = 'authenticated');

-- 이 프로젝트는 새 테이블에 기본 GRANT 가 안 붙는다 (20261025130000_marketing_grants.sql 참고)
grant select on public.meetup_events, public.meetup_rsvps, public.meetup_members, public.meetup_runs to authenticated;
grant select, insert, update, delete on public.meetup_events, public.meetup_rsvps, public.meetup_members, public.meetup_runs to service_role;
