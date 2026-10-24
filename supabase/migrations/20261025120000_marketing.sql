-- 📣 메타 마케팅: 대표가 올린 CSV(광고 일별·연령성별·오가닉) + 스킬이 쓴 전산 리드·주간 리포트
-- 지점 = teams.id. 매니저는 자기 지점 읽기만, 대표(role=admin)는 전부 + CSV 쓰기. 리드·리포트는 서비스 키(스킬)만 쓴다.
-- 전산 리드에는 이름·전화번호 열을 두지 않는다.

create table if not exists public.mk_ad_daily (
  team_id bigint not null references public.teams(id) on delete cascade,
  date date not null,
  ad_name text not null,
  campaign text not null default '',
  adset text not null default '',
  impressions int not null default 0,
  reach int not null default 0,
  clicks int not null default 0,
  leads int not null default 0,
  spend numeric(12, 2) not null default 0,   -- 달러(USD)
  primary key (team_id, date, ad_name)
);

create table if not exists public.mk_ad_demo (
  team_id bigint not null references public.teams(id) on delete cascade,
  period_from date not null,
  period_to date not null,
  ad_name text not null,
  age text not null default '',
  gender text not null default '',
  impressions int not null default 0,
  clicks int not null default 0,
  leads int not null default 0,
  spend numeric(12, 2) not null default 0,   -- 달러(USD)
  primary key (team_id, period_from, period_to, ad_name, age, gender)
);

create table if not exists public.mk_organic (
  team_id bigint not null references public.teams(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'facebook')),
  post_id text not null,
  published_at date not null,
  type text not null default '',
  permalink text not null default '',
  caption text not null default '',
  views int not null default 0,
  reach int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  saves int not null default 0,
  shares int not null default 0,
  follows int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (team_id, platform, post_id)
);

create table if not exists public.mk_leads (
  team_id bigint not null references public.teams(id) on delete cascade,
  source_key text not null,                -- 전산 리드 번호 (사람 이름·번호 아님)
  ad_name text not null default '',
  lead_date date not null,
  status text not null check (status in ('lead', 'consult', 'visit', 'enroll', 'lost')),
  age_band text,
  subject text,
  updated_at timestamptz not null default now(),
  primary key (team_id, source_key)
);
create index if not exists mk_leads_date_idx on public.mk_leads (team_id, lead_date);

create table if not exists public.mk_uploads (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('ads_daily', 'ads_demo', 'organic')),
  filename text not null default '',
  rows int not null default 0,
  date_from date,
  date_to date,
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.mk_reports (
  team_id bigint not null references public.teams(id) on delete cascade,
  week date not null,                       -- 그 주 월요일 (페르소나는 그 달 1일)
  kind text not null check (kind in ('weekly', 'persona')),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (team_id, week, kind)
);

alter table public.mk_ad_daily enable row level security;
alter table public.mk_ad_demo enable row level security;
alter table public.mk_organic enable row level security;
alter table public.mk_leads enable row level security;
alter table public.mk_uploads enable row level security;
alter table public.mk_reports enable row level security;

-- 읽기: 대표 전부, 매니저 자기 지점
create policy mk_ad_daily_read on public.mk_ad_daily for select using (blog_is_admin() or team_id = blog_my_team());
create policy mk_ad_demo_read on public.mk_ad_demo for select using (blog_is_admin() or team_id = blog_my_team());
create policy mk_organic_read on public.mk_organic for select using (blog_is_admin() or team_id = blog_my_team());
create policy mk_leads_read on public.mk_leads for select using (blog_is_admin() or team_id = blog_my_team());
create policy mk_uploads_read on public.mk_uploads for select using (blog_is_admin() or team_id = blog_my_team());
create policy mk_reports_read on public.mk_reports for select using (blog_is_admin() or team_id = blog_my_team());

-- CSV 쓰기: 대표만 (upsert = insert + update)
create policy mk_ad_daily_ins on public.mk_ad_daily for insert with check (blog_is_admin());
create policy mk_ad_daily_upd on public.mk_ad_daily for update using (blog_is_admin());
create policy mk_ad_demo_ins on public.mk_ad_demo for insert with check (blog_is_admin());
create policy mk_ad_demo_upd on public.mk_ad_demo for update using (blog_is_admin());
create policy mk_organic_ins on public.mk_organic for insert with check (blog_is_admin());
create policy mk_organic_upd on public.mk_organic for update using (blog_is_admin());
create policy mk_uploads_ins on public.mk_uploads for insert with check (blog_is_admin());
-- mk_leads · mk_reports 쓰기 정책 없음 = 서비스 키(스킬)만
