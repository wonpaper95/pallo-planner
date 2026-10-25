-- 🔭 경쟁사 광고 정찰: 메타 광고 라이브러리(공개 페이지) 스냅샷 + 경쟁사 목록 + 일일·주간 리포트
-- 그룹(grp) = en(영어회화: 구미·대구동성로·울산) / jpcn(일본어·중국어: 대구일중).
-- 매니저 = 자기 지점 그룹 읽기, 대표(role=admin) = 전부 읽기 + 경쟁사 목록 편집. 광고 스냅샷·실행 기록·리포트 쓰기 = 서비스 키(스킬)만.
-- 경쟁사 소재는 링크·문구·작은 스크린샷만 둔다(원본 미디어 저장 안 함).

create or replace function public.mkc_group_of_team(tid bigint) returns text
language sql stable security definer set search_path = public as
$$ select case when name ~ '(일중|일본어|중국어)' then 'jpcn' else 'en' end from teams where id = tid $$;

create or replace function public.mkc_my_group() returns text
language sql stable security definer set search_path = public as
$$ select public.mkc_group_of_team(public.blog_my_team()) $$;

create table if not exists public.mkc_competitors (
  id bigint generated always as identity primary key,
  grp text not null check (grp in ('en', 'jpcn')),
  page_name text not null,
  page_id text not null default '',          -- facebook.com/<page_id>/ (라이브러리 view_all_page_id)
  page_url text not null default '',
  team_id bigint references public.teams(id) on delete set null,   -- 지역 학원이면 지점, 전국 온라인이면 null
  status text not null default 'candidate' check (status in ('candidate', 'on', 'off')),
  note text not null default '',
  found_by text not null default '',         -- 후보로 올린 근거 (검색어 등)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grp, page_name)
);

create table if not exists public.mkc_ads (
  library_id text primary key,
  grp text not null check (grp in ('en', 'jpcn')),
  competitor_id bigint references public.mkc_competitors(id) on delete set null,
  page_name text not null default '',
  page_id text not null default '',
  partner_name text not null default '',     -- "X 페이지는 Y과(와) 함께합니다" 의 X (제휴 계정)
  start_date date,                           -- 게재 시작일
  first_seen date not null,
  last_seen date not null,
  active boolean not null default true,
  ended_on date,
  multi_version boolean not null default false,
  n_ads int not null default 1,              -- "광고 N개에서 이 크리에이티브 및 문구를 사용합니다"
  platforms text[] not null default '{}',
  media_type text not null default '',       -- video / image / carousel / ''
  duration_s int,
  body text not null default '',
  headline text not null default '',
  description text not null default '',
  cta text not null default '',
  landing_domain text not null default '',
  landing_url text not null default '',
  text_hash text not null default '',        -- 같은 문구 묶기용
  thumb_path text,                           -- Storage mkc-thumbs/<grp>/<library_id>.jpg
  keywords text[] not null default '{}',     -- 어떤 검색어·경쟁사 페이지에서 봤나
  updated_at timestamptz not null default now()
);
create index if not exists mkc_ads_grp_idx on public.mkc_ads (grp, active, start_date);
create index if not exists mkc_ads_page_idx on public.mkc_ads (grp, page_name);

create table if not exists public.mkc_runs (
  id bigint generated always as identity primary key,
  run_date date not null,
  grp text not null check (grp in ('en', 'jpcn')),
  status text not null check (status in ('ok', 'partial', 'failed')),
  counts jsonb not null default '{}',
  error text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.mkc_reports (
  grp text not null check (grp in ('en', 'jpcn')),
  day date not null,                         -- daily = 그날, creative = 그 주 월요일
  kind text not null check (kind in ('daily', 'creative')),
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (grp, day, kind)
);

alter table public.mkc_competitors enable row level security;
alter table public.mkc_ads enable row level security;
alter table public.mkc_runs enable row level security;
alter table public.mkc_reports enable row level security;

create policy mkc_competitors_read on public.mkc_competitors for select using (blog_is_admin() or grp = mkc_my_group());
create policy mkc_ads_read on public.mkc_ads for select using (blog_is_admin() or grp = mkc_my_group());
create policy mkc_runs_read on public.mkc_runs for select using (blog_is_admin() or grp = mkc_my_group());
create policy mkc_reports_read on public.mkc_reports for select using (blog_is_admin() or grp = mkc_my_group());
-- 경쟁사 목록 편집: 대표만
create policy mkc_competitors_ins on public.mkc_competitors for insert with check (blog_is_admin());
create policy mkc_competitors_upd on public.mkc_competitors for update using (blog_is_admin());
-- mkc_ads · mkc_runs · mkc_reports 쓰기 정책 없음 = 서비스 키만

-- 이 프로젝트는 새 테이블에 기본 GRANT 가 안 붙는다 (20261025130000_marketing_grants.sql 참고)
grant select, insert, update on public.mkc_competitors to authenticated;
grant select on public.mkc_ads, public.mkc_runs, public.mkc_reports to authenticated;
grant select, insert, update, delete on public.mkc_competitors, public.mkc_ads, public.mkc_runs, public.mkc_reports to service_role;

-- 썸네일: 비공개 버킷, 로그인 사용자가 자기 그룹 폴더(<grp>/…)만 읽기. 쓰기는 서비스 키.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mkc-thumbs', 'mkc-thumbs', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
create policy mkc_thumbs_read on storage.objects for select to authenticated
  using (bucket_id = 'mkc-thumbs' and (blog_is_admin() or (storage.foldername(name))[1] = mkc_my_group()));
