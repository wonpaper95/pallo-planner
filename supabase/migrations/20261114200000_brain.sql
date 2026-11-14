-- 🧠 뇌 탭 (docs/brain/README.md). 대표 한 사람의 생각 지도 — 나뭇가지(parent_id) + 연관(brain_links).
-- 맥미니의 주간 분석(pallo-brain-sync, 서비스 키)이 주제·온도·근거를 채우고, 대표가 직접 생각을 더하고 잇는다.
-- 보기·고치기: 본인(대표)만. 매니저·조교·다른 대표·공유 링크 없음.

create table if not exists public.brain_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id uuid references public.brain_nodes(id) on delete cascade,   -- null = 맨 가운데(나) 하나
  key text check (key is null or char_length(key) between 1 and 80),    -- 분석이 붙인 이름표 (다시 분석해도 같은 점을 찾게). 직접 넣은 점은 null
  title text not null check (char_length(title) between 1 and 80),
  state text not null default '' check (state in ('', '관심', '고민', '실행', '루틴', '식음')),
  heat smallint not null default 0 check (heat between 0 and 100),      -- 온도: 요즘 얼마나 자주 떠올리는지
  worry smallint not null default 0 check (worry between 0 and 100),    -- 고민: 막힘·미룸·걱정이 얼마나 드러나는지
  note text not null default '' check (char_length(note) <= 6000),      -- 이 생각의 내용 (분석 요약 또는 직접 쓴 글)
  src jsonb not null default '[]'::jsonb,                               -- 근거: [{d: 날짜, w: week|claude|idea, t: 한 줄}]
  stats jsonb not null default '{}'::jsonb,                             -- {n, n30, first, last, by: {week, claude, idea}, m: {"2026-10": 12}}
  origin text not null default 'me' check (origin in ('ai', 'me')),     -- ai = 분석이 만든 점, me = 직접 넣은 점
  edited boolean not null default false,                                -- 분석이 만든 점을 직접 고쳤으면 true → 다시 분석해도 이름·내용·자리·상태를 덮어쓰지 않음
  hidden boolean not null default false,                                -- 분석이 만든 점을 지우면 숨김 → 다시 분석해도 되살아나지 않음
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists brain_nodes_parent_idx on public.brain_nodes (parent_id);
create index if not exists brain_nodes_user_idx on public.brain_nodes (user_id);
create unique index if not exists brain_nodes_one_root on public.brain_nodes (user_id) where parent_id is null; -- 가운데 점은 한 사람에 하나

-- 연관 선: 한 쌍은 한 줄만 (a < b). why = 어떻게 이어지는지
create table if not exists public.brain_links (
  a uuid not null references public.brain_nodes(id) on delete cascade,
  b uuid not null references public.brain_nodes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  why text not null default '' check (char_length(why) <= 300),
  origin text not null default 'me' check (origin in ('ai', 'me')),
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists brain_links_b_idx on public.brain_links (b);

-- 분석 기록: 분석할 때마다 한 줄 (한 줄 요약·달라진 점). 화면은 가장 새것을 보여 줌
create table if not exists public.brain_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ran_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb
);
create index if not exists brain_runs_user_idx on public.brain_runs (user_id, ran_at desc);

-- 자기 아래로 옮기기(고리)·남의 점 아래로 넣기 막기 + 고친 시각 + '직접 고침' 표시
create or replace function public.brain_node_guard() returns trigger
language plpgsql set search_path = public as $$
declare p uuid := new.parent_id; n int := 0; pu uuid;
begin
  if p is not null then
    select user_id into pu from brain_nodes where id = p;
    if pu is distinct from new.user_id then raise exception '다른 사람의 생각 아래에는 넣을 수 없어요'; end if;
  end if;
  while p is not null loop
    if p = new.id then raise exception '자기 아래 항목으로는 옮길 수 없어요'; end if;
    select parent_id into p from brain_nodes where id = p;
    n := n + 1;
    if n > 30 then raise exception '단계가 너무 깊어요'; end if;
  end loop;
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    if coalesce(auth.role(), '') = 'authenticated' then
      new.key := old.key; new.origin := old.origin;
      -- 화면에서(로그인한 본인이) 분석이 만든 점의 이름·내용·상태·자리를 바꾸면 '직접 고침'
      if old.origin = 'ai' and (new.title, new.note, new.state, new.parent_id) is distinct from (old.title, old.note, old.state, old.parent_id) then
        new.edited := true;
      end if;
    end if;
  elsif coalesce(auth.role(), '') = 'authenticated' then
    new.origin := 'me'; new.key := null; new.edited := false; new.hidden := false; -- 화면에서 넣는 점은 늘 '직접 넣은 점'
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists brain_node_guard on public.brain_nodes;
create trigger brain_node_guard before insert or update on public.brain_nodes for each row execute function public.brain_node_guard();

alter table public.brain_nodes enable row level security;
alter table public.brain_links enable row level security;
alter table public.brain_runs enable row level security;

drop policy if exists brain_nodes_own on public.brain_nodes;
drop policy if exists brain_links_own on public.brain_links;
drop policy if exists brain_runs_own on public.brain_runs;
create policy brain_nodes_own on public.brain_nodes for all using (user_id = auth.uid() and blog_is_admin()) with check (user_id = auth.uid() and blog_is_admin());
create policy brain_links_own on public.brain_links for all using (user_id = auth.uid() and blog_is_admin()) with check (user_id = auth.uid() and blog_is_admin());
create policy brain_runs_own on public.brain_runs for select using (user_id = auth.uid() and blog_is_admin());

grant select, insert, update, delete on public.brain_nodes, public.brain_links to authenticated;
grant select on public.brain_runs to authenticated;
grant select, insert, update, delete on public.brain_nodes, public.brain_links, public.brain_runs to service_role;
