-- ✍️ 블로그: 매니저마다 "내 기본값" (글쓴이·어투·타깃·컨셉·스타일 등). 폰·PC 어디서 열어도 같은 기본값
create table if not exists public.blog_prefs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.blog_prefs enable row level security;
create policy blog_prefs_own on public.blog_prefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
