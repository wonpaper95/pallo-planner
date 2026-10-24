-- ✍️ 블로그 작성기: 지점 프로필·글 보관함·생성 기록(사용량)·스타일 프리셋·하루 제한
-- 지점 = teams.id, 사람 = profiles(user_id, team_id, role). 매니저는 자기 지점만, 대표(role=admin)는 전부.

create or replace function public.blog_my_team() returns bigint
language sql stable security definer set search_path = public as
$$ select team_id from profiles where user_id = auth.uid() $$;

create or replace function public.blog_is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where user_id = auth.uid() and role = 'admin') $$;

-- 지점 프로필 (지역·과목·위치 설명·강점·키워드 묶음). data 는 화면이 쓰는 그대로 저장
create table if not exists public.blog_profiles (
  team_id bigint primary key references public.teams(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- 글 보관함
create table if not exists public.blog_posts (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  title text not null default '',
  keyword text not null default '',
  body text not null default '',          -- 복붙용 평문 (유사도 검사에도 씀)
  post jsonb not null default '{}',        -- 시안 전체 (titles·blocks·hashtags·options)
  status text not null default 'draft',    -- draft | published
  url text,                                -- 발행 후 네이버 글 주소
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_posts_team_idx on public.blog_posts (team_id, created_at desc);

-- 생성 기록: 하루 제한·사용량·비용 확인용. Edge Function(서비스 키)만 쓴다
create table if not exists public.blog_gens (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  user_id uuid not null,
  kind text not null,                      -- write | convert | style | keywords
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists blog_gens_team_idx on public.blog_gens (team_id, created_at desc);

-- 매니저가 URL로 추가한 스타일 프리셋 (team_id null = 전 지점 공용)
create table if not exists public.blog_styles (
  id bigint generated always as identity primary key,
  team_id bigint references public.teams(id) on delete cascade,
  name text not null,
  source_url text,
  rules text not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- 지점별 하루 생성 제한 (없으면 10). 대표만 바꿈
create table if not exists public.blog_limits (
  team_id bigint primary key references public.teams(id) on delete cascade,
  daily int not null default 10 check (daily between 0 and 200)
);

alter table public.blog_profiles enable row level security;
alter table public.blog_posts enable row level security;
alter table public.blog_gens enable row level security;
alter table public.blog_styles enable row level security;
alter table public.blog_limits enable row level security;

create policy blog_profiles_rw on public.blog_profiles for all
  using (blog_is_admin() or team_id = blog_my_team())
  with check (blog_is_admin() or team_id = blog_my_team());

create policy blog_posts_rw on public.blog_posts for all
  using (blog_is_admin() or team_id = blog_my_team())
  with check (blog_is_admin() or team_id = blog_my_team());

create policy blog_gens_read on public.blog_gens for select
  using (blog_is_admin() or team_id = blog_my_team());

create policy blog_styles_read on public.blog_styles for select
  using (team_id is null or blog_is_admin() or team_id = blog_my_team());
create policy blog_styles_write on public.blog_styles for insert
  with check (blog_is_admin() or team_id = blog_my_team());
create policy blog_styles_delete on public.blog_styles for delete
  using (blog_is_admin() or created_by = auth.uid());

create policy blog_limits_read on public.blog_limits for select
  using (blog_is_admin() or team_id = blog_my_team());
create policy blog_limits_admin on public.blog_limits for all
  using (blog_is_admin()) with check (blog_is_admin());
