-- 🌳 업무분장 탭 (docs/duty/README.md). 나뭇가지(parent_id) + 연관(duty_links) 두 가지 선으로 된 업무 지도.
-- 보기: 대표는 언제나, 매니저는 대표가 [매니저에게 공개]한 뒤(duty_meta.published). 조교는 못 봄. 고치기: 대표만.
-- 공유 링크: 대표가 만든 키로 로그인 없이 읽기만(duty_shared) — 공개 여부와 따로 움직임.

create or replace function public.duty_can_read() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where user_id = auth.uid() and role <> 'assistant') $$;

create table if not exists public.duty_nodes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.duty_nodes(id) on delete cascade,  -- null = 맨 위(팔로) 하나
  title text not null check (char_length(title) between 1 and 80),
  owner text not null default '' check (char_length(owner) <= 120),    -- 담당. 쉼표로 여럿: "매니저, 조교"
  note text not null default '' check (char_length(note) <= 4000),     -- 설명·규칙 메모
  cycle text not null default '' check (char_length(cycle) <= 20),     -- 주기: 매일·매주·매월·분기·수시 (비우면 안 정함)
  backup text not null default '' check (char_length(backup) <= 120),  -- 대신할 사람 (담당이 빠질 때)
  link text not null default '' check (char_length(link) <= 500),      -- 바로가기: 플래너 탭(#sales) 또는 https 주소
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),     -- 비우면 위 가지 색을 따름
  sort int not null default 0,                                         -- 형제 사이 순서
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists duty_nodes_parent_idx on public.duty_nodes (parent_id);

-- 연관 선: 한 쌍은 한 줄만 (a < b)
create table if not exists public.duty_links (
  a uuid not null references public.duty_nodes(id) on delete cascade,
  b uuid not null references public.duty_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
create index if not exists duty_links_b_idx on public.duty_links (b);

-- 공유 링크 키 (대표만 만들고 지움). 지우면 그 링크는 바로 안 열림
create table if not exists public.duty_share (
  token text primary key check (char_length(token) >= 24),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- 공개 스위치 (한 줄). false = 초안: 대표만 봄
create table if not exists public.duty_meta (
  id boolean primary key default true check (id),
  published boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.duty_meta (id) values (true) on conflict do nothing;
create or replace function public.duty_published() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select published from duty_meta), false) $$;

-- 자기 아래로 옮기기(고리) 막기 + 고친 시각
create or replace function public.duty_node_guard() returns trigger
language plpgsql set search_path = public as $$
declare p uuid := new.parent_id; n int := 0;
begin
  while p is not null loop
    if p = new.id then raise exception '자기 아래 항목으로는 옮길 수 없어요'; end if;
    select parent_id into p from duty_nodes where id = p;
    n := n + 1;
    if n > 30 then raise exception '단계가 너무 깊어요'; end if;
  end loop;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists duty_node_guard on public.duty_nodes;
create trigger duty_node_guard before insert or update on public.duty_nodes for each row execute function public.duty_node_guard();

alter table public.duty_nodes enable row level security;
alter table public.duty_links enable row level security;
alter table public.duty_share enable row level security;
alter table public.duty_meta enable row level security;

create policy duty_nodes_read on public.duty_nodes for select using (blog_is_admin() or (duty_published() and duty_can_read()));
create policy duty_nodes_write on public.duty_nodes for all using (blog_is_admin()) with check (blog_is_admin());
create policy duty_links_read on public.duty_links for select using (blog_is_admin() or (duty_published() and duty_can_read()));
create policy duty_links_write on public.duty_links for all using (blog_is_admin()) with check (blog_is_admin());
create policy duty_share_admin on public.duty_share for all using (blog_is_admin()) with check (blog_is_admin());
create policy duty_meta_read on public.duty_meta for select using (duty_can_read());
create policy duty_meta_write on public.duty_meta for update using (blog_is_admin()) with check (blog_is_admin());

grant select, insert, update, delete on public.duty_nodes, public.duty_links, public.duty_share to authenticated;
grant select, insert, update, delete on public.duty_nodes, public.duty_links, public.duty_share to service_role;
grant select, update on public.duty_meta to authenticated;
grant select, insert, update, delete on public.duty_meta to service_role;

-- 🔗 공유 링크: 키가 맞으면 전체 지도를 읽기 전용으로 돌려줌 (로그인 없음). 틀리면 null
create or replace function public.duty_shared(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when exists (select 1 from duty_share where token = p_token) then jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'title', title, 'owner', owner, 'note', note, 'cycle', cycle, 'backup', backup, 'link', link, 'color', color, 'sort', sort, 'created_at', created_at) order by sort, created_at) from duty_nodes), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('a', a, 'b', b)) from duty_links), '[]'::jsonb)
  ) end
$$;
revoke all on function public.duty_shared(text) from public;
grant execute on function public.duty_shared(text) to anon, authenticated, service_role;
