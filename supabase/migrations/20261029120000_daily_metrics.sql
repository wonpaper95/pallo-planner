-- 📊 일일 마케팅 현황 (docs/daily-metrics/README.md). 매일 새벽 맥미니가 "어제" 숫자를 채널×단위로 쌓고, 플래너가 5칸으로 보여준다.
-- 매니저 = 자기 지점 읽기(+키워드 자기 지점 쓰기), 대표(blog_is_admin) = 전체. 일별 숫자·리포트 쓰기 = 서비스 키(스킬)만.
create table if not exists public.mkd_daily (
  team_id bigint not null references public.teams(id) on delete cascade,
  date date not null,                                   -- 수집 대상일(어제)
  channel text not null check (channel in ('naver_ad', 'google_ad', 'meta_ad', 'blog', 'daangn', 'jeonsan')),
  unit text not null default '전체',                    -- 캠페인명 / 광고세트명 / 키워드 / 유입경로 / '전체'
  metrics jsonb not null default '{}'::jsonb,           -- 채널이 쓰는 키만 (impressions, clicks, spend(원), ctr, cpc, conversions, leads, reach, rank, visitors, views, followers, chats, inquiries, enrolls, flags[], note)
  status text not null default 'ok' check (status in ('ok', 'partial', 'failed', 'login_required')),
  collected_at timestamptz not null default now(),
  primary key (team_id, date, channel, unit)
);
create index if not exists mkd_daily_date_idx on public.mkd_daily (date, channel);

create table if not exists public.mkd_reports (
  date date not null,
  kind text not null check (kind in ('daily', 'weekly')),
  data jsonb not null default '{}'::jsonb,              -- daily: {status, summary, flags[], comment} / weekly: {body…}
  updated_at timestamptz not null default now(),
  primary key (date, kind)
);

create table if not exists public.mkd_keywords (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  keyword text not null,
  enabled boolean not null default true,
  target_url text,                                      -- 우리 글 주소(있으면 그 글의 순위, 없으면 우리 블로그 아무 글)
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (team_id, keyword)
);

alter table public.mkd_daily enable row level security;
alter table public.mkd_reports enable row level security;
alter table public.mkd_keywords enable row level security;

create policy mkd_daily_read on public.mkd_daily for select using (blog_is_admin() or team_id = blog_my_team());
-- 일일 리포트(코멘트·이상 징후)는 전 지점 공유 — 대표 결정 2026-10-29. 숫자 표(mkd_daily)는 자기 지점만.
create policy mkd_reports_read on public.mkd_reports for select using (auth.role() = 'authenticated');
create policy mkd_keywords_read on public.mkd_keywords for select using (blog_is_admin() or team_id = blog_my_team());
create policy mkd_keywords_ins on public.mkd_keywords for insert with check (blog_is_admin() or team_id = blog_my_team());
create policy mkd_keywords_upd on public.mkd_keywords for update using (blog_is_admin() or team_id = blog_my_team());

-- 이 프로젝트는 새 테이블에 기본 GRANT 가 안 붙는다 (20261025130000_marketing_grants.sql 참고)
grant select on public.mkd_daily, public.mkd_reports to authenticated;
grant select, insert, update on public.mkd_keywords to authenticated;
grant select, insert, update, delete on public.mkd_daily, public.mkd_reports, public.mkd_keywords to service_role;
