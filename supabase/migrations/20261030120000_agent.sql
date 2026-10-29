-- 🤖 마케팅 탭 › 에이전트 (대표: 전부 + 승인/킬스위치, 매니저: 자기 지점 것만 읽기, 조교: 안 보임)
-- 맥북의 광고·스레드 에이전트(ad-agent/)가 만든 결과를 맥미니가 서비스 키로 올리고(scripts/mka/push.mjs), 대표는 읽기 + 광고 제안 승인/반려 + 킬스위치만 한다.
-- kind: thread(스레드 글: status posted|ready) · proposal(광고 제안: proposed|approved|rejected) · topad(리드 많은 우리 광고, 링크) · control(key=kill, status on|off)
create table if not exists public.mka_items (
  kind text not null check (kind in ('thread', 'proposal', 'topad', 'control')),
  key text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default '',
  updated_at timestamptz not null default now(),
  primary key (kind, key)
);
alter table public.mka_items enable row level security;

-- 조교(role='assistant')인지 / 팀 이름 → 에이전트 지점 코드 (ad-agent 의 branch 값과 같다: DAEGUDSR·DAEGUJPCH·ULSAN, 그 외 지점은 null)
create or replace function public.mk_is_assistant() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where user_id = auth.uid() and role = 'assistant') $$;
create or replace function public.mka_branch_of_team(tid bigint) returns text
language sql stable security definer set search_path = public as
$$ select case when name ~ '(일중|일본어|중국어)' then 'DAEGUJPCH' when name ~ '울산' then 'ULSAN' when name ~ '대구' then 'DAEGUDSR' end from teams where id = tid $$;

create policy mka_items_read on public.mka_items for select using (
  blog_is_admin()
  or (not mk_is_assistant() and (kind = 'control' or data->>'branch' = mka_branch_of_team(blog_my_team())))
);
-- 대표는 광고 제안의 승인 상태와 킬스위치만 바꾼다 (다른 종류는 서비스 키만)
create policy mka_items_upd on public.mka_items for update using (blog_is_admin() and kind in ('proposal', 'control'))
  with check (blog_is_admin() and kind in ('proposal', 'control') and status in ('proposed', 'approved', 'rejected', 'on', 'off'));

-- 이 프로젝트는 새 테이블에 기본 GRANT 가 안 붙는다 (20261025130000_marketing_grants.sql 참고)
grant select, update on public.mka_items to authenticated;
grant select, insert, update, delete on public.mka_items to service_role;

-- 킬스위치 행은 처음부터 꺼진 상태로 둔다 (화면에서 update 만 하면 되게)
insert into public.mka_items (kind, key, status) values ('control', 'kill', 'off') on conflict do nothing;
