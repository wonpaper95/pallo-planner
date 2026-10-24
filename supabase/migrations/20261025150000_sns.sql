-- 📸 게시물 탭: 채널 계정 연결 · 게시물 · 채널별 게시 작업 + 공개 사진 버킷 (설계: docs/sns-posts/README.md)
-- 권한은 블로그와 같음: 매니저 = 자기 지점, 대표(role=admin) = 전부 (blog_my_team / blog_is_admin 재사용).
-- 토큰·키는 여기 두지 않는다 (Supabase secrets).

-- 지점 × 자동 게시 채널 연결 (2단계 설정 탭에서 대표가 채움)
create table if not exists public.sns_accounts (
  team_id bigint not null references public.teams(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'google')),
  external_id text not null,               -- 인스타 비즈니스 계정 ID / 구글 accounts/…/locations/…
  display text not null default '',
  status text not null default 'unknown' check (status in ('ok', 'token', 'perm', 'unknown')),
  checked_at timestamptz,
  primary key (team_id, channel)
);

-- 게시물 1건 (사진 + 채널별 문구)
create table if not exists public.sns_posts (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  topic text not null default '',
  tone text not null default 'friendly',
  draft text not null default '',           -- AI 공통 원고
  photos jsonb not null default '[]',       -- [{path, w, h}] 순서 = 게시 순서, path 는 sns 버킷 안 경로
  channels jsonb not null default '{}',     -- {instagram:{caption,hashtags}, google:{body,type,button}, naver:{title,body}, daangn:{title,body}}
  source text not null default 'direct',    -- direct | blog:<id> | marketing:<id>
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sns_posts_team_idx on public.sns_posts (team_id, created_at desc);

-- 게시물 × 채널 작업 (목록의 상태 뱃지는 전부 여기서)
create table if not exists public.sns_jobs (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.sns_posts(id) on delete cascade,
  team_id bigint not null references public.teams(id) on delete cascade,
  channel text not null check (channel in ('instagram', 'google', 'naver', 'daangn')),
  method text not null default 'manual' check (method in ('api', 'manual')),
  run_at timestamptz not null default now(),      -- 예약 시각 (즉시면 지금)
  status text not null default 'waiting_copy'
    check (status in ('queued', 'running', 'posted', 'failed', 'waiting_copy', 'done_manual')),
  result_url text,
  external_id text,
  error text,                                     -- 원문
  error_ko text,                                  -- 매니저에게 보여 줄 한국어 풀이
  tries int not null default 0,
  next_try_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, channel)
);
create index if not exists sns_jobs_due_idx on public.sns_jobs (status, run_at);

-- 상태 지킴: 지점이 게시물과 같아야 하고, 사람은 수동 작업의 '복사 대기 ↔ 올렸어요'만.
-- 자동 게시 상태(queued·running·posted·failed)는 Edge Function(service_role)만 바꾼다.
-- security definer 아님: 게시물 지점 확인도 부른 사람의 RLS 로 읽는다 (남의 지점 게시물이면 안 보여서 막힘).
create or replace function public.sns_jobs_guard() returns trigger language plpgsql as $$
begin
  if new.team_id is distinct from (select team_id from public.sns_posts where id = new.post_id) then
    raise exception '게시물과 작업의 지점이 달라요';
  end if;
  if current_user in ('service_role', 'postgres', 'supabase_admin') then return new; end if;
  if new.method <> 'manual' or new.status not in ('waiting_copy', 'done_manual') then
    raise exception '자동 게시 상태는 서버만 바꿀 수 있어요';
  end if;
  if tg_op = 'UPDATE' and (new.post_id, new.channel, new.method) is distinct from (old.post_id, old.channel, old.method) then
    raise exception '작업 정보는 바꿀 수 없어요';
  end if;
  new.done_at := case when new.status = 'done_manual' then coalesce(new.done_at, now()) else null end;
  return new;
end $$;
drop trigger if exists sns_jobs_guard on public.sns_jobs;
create trigger sns_jobs_guard before insert or update on public.sns_jobs for each row execute function public.sns_jobs_guard();

alter table public.sns_accounts enable row level security;
alter table public.sns_posts enable row level security;
alter table public.sns_jobs enable row level security;

create policy sns_accounts_read on public.sns_accounts for select using (blog_is_admin() or team_id = blog_my_team());
create policy sns_accounts_admin on public.sns_accounts for all using (blog_is_admin()) with check (blog_is_admin());

create policy sns_posts_rw on public.sns_posts for all
  using (blog_is_admin() or team_id = blog_my_team())
  with check (blog_is_admin() or team_id = blog_my_team());

create policy sns_jobs_read on public.sns_jobs for select using (blog_is_admin() or team_id = blog_my_team());
create policy sns_jobs_ins on public.sns_jobs for insert with check (blog_is_admin() or team_id = blog_my_team());
create policy sns_jobs_upd on public.sns_jobs for update
  using (blog_is_admin() or team_id = blog_my_team())
  with check (blog_is_admin() or team_id = blog_my_team());
create policy sns_jobs_del on public.sns_jobs for delete
  using ((blog_is_admin() or team_id = blog_my_team()) and method = 'manual');

-- 사진 버킷: 인스타·구글 API가 공개 https 주소로 가져가야 해서 공개. blog-temp 와 같은 패턴(JPEG, 무작위 이름, 자기 지점 폴더만).
-- 모자이크·자르기는 기기 안에서 끝낸 뒤 올리므로 원본 얼굴 사진은 올라오지 않는다. 정리는 4단계(끝난 뒤 7일).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sns', 'sns', true, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy sns_photo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sns' and (blog_is_admin() or (storage.foldername(name))[1] = blog_my_team()::text));
create policy sns_photo_select on storage.objects for select to authenticated
  using (bucket_id = 'sns' and (blog_is_admin() or (storage.foldername(name))[1] = blog_my_team()::text));
create policy sns_photo_update on storage.objects for update to authenticated
  using (bucket_id = 'sns' and (blog_is_admin() or (storage.foldername(name))[1] = blog_my_team()::text));
create policy sns_photo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'sns' and (blog_is_admin() or (storage.foldername(name))[1] = blog_my_team()::text));
