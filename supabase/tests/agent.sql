-- mka_items · 조교 차단 RLS 시험 (자체 완결: 사람·팀 판별 함수를 설정값으로 흉내 내고 마지막에 rollback)
-- 실행: docker exec -i supabase_db_pallo-planner psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/agent.sql
begin;
create or replace function public.blog_is_admin() returns boolean language sql stable as $f$ select current_setting('t.role', true) = 'admin' $f$;
create or replace function public.blog_my_team() returns bigint language sql stable as $f$ select current_setting('t.team', true)::bigint $f$;
create or replace function public.mkc_my_group() returns text language sql stable as $f$ select 'en' $f$;
-- 조건 확인용 임시 표 (마케팅 표는 이 로컬 DB 에 없을 수 있음)
create table public.mk_reports (team_id bigint, v int);
create table public.mkc_ads (grp text, v int);
create table public.mkc_competitors (grp text, v int);
create table public.mkc_runs (grp text, v int);
create table public.mkc_reports (grp text, v int);
create table public.mk_ad_daily (team_id bigint, v int);
create table public.mk_ad_demo (team_id bigint, v int);
create table public.mk_organic (team_id bigint, v int);
create table public.mk_leads (team_id bigint, v int);
create table public.mk_uploads (team_id bigint, v int);
alter table public.mk_reports enable row level security; alter table public.mkc_ads enable row level security; alter table public.mkc_competitors enable row level security; alter table public.mkc_runs enable row level security; alter table public.mkc_reports enable row level security;
alter table public.mk_ad_daily enable row level security; alter table public.mk_ad_demo enable row level security; alter table public.mk_organic enable row level security; alter table public.mk_leads enable row level security; alter table public.mk_uploads enable row level security;
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

-- 🤖 에이전트(맥북)가 서비스 키 없이 mka_items 를 올리는 길: 긴 비밀값으로 보호한 함수 2개.
-- 비밀값은 맥북 ad-agent/planner-push-secret.txt 에만 있고, DB 에는 sha256 해시만 둔다. 함수는 mka_items 만 건드린다(광고·전산 데이터 접근 없음).
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.mka_push_key (hash text primary key);
alter table public.mka_push_key enable row level security; -- 정책 없음 = API 로는 아무도 못 읽음

create or replace function public.mka_check_key(k text) returns boolean
language sql stable security definer set search_path = public, extensions as
$$ select coalesce(length(k), 0) >= 32 and exists (select 1 from mka_push_key where hash = encode(digest(k, 'sha256'), 'hex')) $$;

-- 올리기: items = [{kind: thread|proposal|topad, key, status, data}]. 광고 제안(proposal)은 이미 있으면 대표가 누른 승인 상태를 지킨다.
-- 이번 묶음에 없는 같은 종류 행은 지운다(끝난 제안·지난 순위 정리). 묶음이 비어 있으면 아무것도 안 지운다.
create or replace function public.mka_push(k text, items jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int := 0; it jsonb; kd text;
begin
  if not mka_check_key(k) then raise exception 'bad key' using errcode = '28000'; end if;
  for it in select * from jsonb_array_elements(items) loop
    continue when it->>'kind' not in ('thread', 'proposal', 'topad') or coalesce(it->>'key', '') = '';
    insert into mka_items (kind, key, status, data, updated_at)
    values (it->>'kind', it->>'key', coalesce(it->>'status', ''), coalesce(it->'data', '{}'::jsonb), now())
    on conflict (kind, key) do update set data = excluded.data, updated_at = now(),
      status = case when mka_items.kind = 'proposal' then mka_items.status else excluded.status end;
    n := n + 1;
  end loop;
  if n > 0 then
    foreach kd in array array['thread', 'proposal', 'topad'] loop
      delete from mka_items where kind = kd and key not in (select x->>'key' from jsonb_array_elements(items) x where x->>'kind' = kd);
    end loop;
  end if;
  return n;
end $$;

-- 내려받기: 대표가 화면에서 누른 킬스위치·승인·반려
create or replace function public.mka_state(k text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not mka_check_key(k) then raise exception 'bad key' using errcode = '28000'; end if;
  return jsonb_build_object(
    'kill', exists (select 1 from mka_items where kind = 'control' and key = 'kill' and status = 'on'),
    'approved', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'approved'), '[]'::jsonb),
    'rejected', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'rejected'), '[]'::jsonb));
end $$;

revoke all on function public.mka_check_key(text) from public, anon, authenticated;
grant execute on function public.mka_push(text, jsonb), public.mka_state(text) to anon, authenticated;
-- 🤖 에이전트 광고 제안에 [켜줘] 단계 추가: 승인 → (Claude가 꺼진 초안 생성, data.stage=drafted) → 대표가 켜줘(status 'activate') → 맥북 30분 예약작업이 그 광고만 게시(data.stage=live).
-- 대표는 'activate' 로 바꾸거나(켜줘) 다시 'approved' 로 되돌릴 수 있다(켜기 전 취소). 맥북은 mka_state 의 activate 목록을 받아 실행한다.
drop policy if exists mka_items_upd on public.mka_items;
create policy mka_items_upd on public.mka_items for update using (blog_is_admin() and kind in ('proposal', 'control'))
  with check (blog_is_admin() and kind in ('proposal', 'control') and status in ('proposed', 'approved', 'rejected', 'activate', 'on', 'off'));

create or replace function public.mka_state(k text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not mka_check_key(k) then raise exception 'bad key' using errcode = '28000'; end if;
  return jsonb_build_object(
    'kill', exists (select 1 from mka_items where kind = 'control' and key = 'kill' and status = 'on'),
    'approved', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'approved'), '[]'::jsonb),
    'rejected', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'rejected'), '[]'::jsonb),
    'activate', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'activate'), '[]'::jsonb));
end $$;

insert into public.mka_push_key values (encode(extensions.digest('k'||repeat('x',40), 'sha256'), 'hex'));
-- 흉내: 역할·지점 (migration 에서 만든 함수를 설정값 기반으로 바꿔 끼움)
create or replace function public.mk_is_assistant() returns boolean language sql stable as $f$ select current_setting('t.role', true) = 'assistant' $f$;
create or replace function public.mka_branch_of_team(tid bigint) returns text language sql stable as $f$ select case tid when 1 then 'DAEGUDSR' when 2 then 'ULSAN' when 3 then 'DAEGUJPCH' end $f$;
-- 마케팅 탭은 대표·매니저만. 조교(role='assistant')는 화면에서 이미 숨겼지만, 서버에서도 읽기를 막는다 (예전엔 같은 지점이면 API 로 읽을 수 있었음).
-- mk_is_assistant() 는 20261030120000_agent.sql 에서 만든다.
drop policy if exists mk_ad_daily_read on public.mk_ad_daily;
drop policy if exists mk_ad_demo_read on public.mk_ad_demo;
drop policy if exists mk_organic_read on public.mk_organic;
drop policy if exists mk_leads_read on public.mk_leads;
drop policy if exists mk_uploads_read on public.mk_uploads;
drop policy if exists mk_reports_read on public.mk_reports;
create policy mk_ad_daily_read on public.mk_ad_daily for select using (blog_is_admin() or (team_id = blog_my_team() and not mk_is_assistant()));
create policy mk_ad_demo_read on public.mk_ad_demo for select using (blog_is_admin() or (team_id = blog_my_team() and not mk_is_assistant()));
create policy mk_organic_read on public.mk_organic for select using (blog_is_admin() or (team_id = blog_my_team() and not mk_is_assistant()));
create policy mk_leads_read on public.mk_leads for select using (blog_is_admin() or (team_id = blog_my_team() and not mk_is_assistant()));
create policy mk_uploads_read on public.mk_uploads for select using (blog_is_admin() or (team_id = blog_my_team() and not mk_is_assistant()));
create policy mk_reports_read on public.mk_reports for select using (blog_is_admin() or (team_id = blog_my_team() and not mk_is_assistant()));

drop policy if exists mkc_competitors_read on public.mkc_competitors;
drop policy if exists mkc_ads_read on public.mkc_ads;
drop policy if exists mkc_runs_read on public.mkc_runs;
drop policy if exists mkc_reports_read on public.mkc_reports;
create policy mkc_competitors_read on public.mkc_competitors for select using (blog_is_admin() or (grp = mkc_my_group() and not mk_is_assistant()));
create policy mkc_ads_read on public.mkc_ads for select using (blog_is_admin() or (grp = mkc_my_group() and not mk_is_assistant()));
create policy mkc_runs_read on public.mkc_runs for select using (blog_is_admin() or (grp = mkc_my_group() and not mk_is_assistant()));
create policy mkc_reports_read on public.mkc_reports for select using (blog_is_admin() or (grp = mkc_my_group() and not mk_is_assistant()));



grant select on public.mk_reports, public.mkc_ads to authenticated;
insert into public.mk_reports values (1, 1), (2, 2);
insert into public.mkc_ads values ('en', 1);
insert into public.mka_items (kind,key,status,data) values
  ('proposal','p_dsr','proposed','{"branch":"DAEGUDSR"}'),('proposal','p_ul','proposed','{"branch":"ULSAN"}'),
  ('thread','t_dsr','posted','{"branch":"DAEGUDSR"}'),('topad','a_none','ACTIVE','{"branch":""}');
set local role anon;
do $$ declare c int; k text := 'k'||repeat('x',40); st jsonb; begin
  begin perform public.mka_push('wrong'||repeat('y',40), '[]'::jsonb); assert false, 'bad key must fail'; exception when sqlstate '28000' then null; end;
  begin perform public.mka_state('short'); assert false, 'short key must fail'; exception when sqlstate '28000' then null; end;
  assert public.mka_push(k, '[{"kind":"proposal","key":"p_new","status":"proposed","data":{"branch":"ULSAN"}},{"kind":"topad","key":"a_new","status":"ACTIVE","data":{"branch":"ULSAN"}},{"kind":"control","key":"kill","status":"on","data":{}},{"kind":"thread","key":"","status":"x"}]'::jsonb) = 2, 'push counts 2 valid (control/empty key ignored)';
  reset role;
  assert (select count(*) from public.mka_items where kind='control' and status='off') = 1, 'push cannot flip kill';
  assert (select count(*) from public.mka_items where key in ('p_dsr','p_ul','t_dsr','a_none')) = 0, 'old rows of pushed kinds pruned';
  update public.mka_items set status='approved' where key='p_new';
  set local role anon;
  assert public.mka_push(k, '[{"kind":"proposal","key":"p_new","status":"proposed","data":{"branch":"ULSAN","x":1}}]'::jsonb) = 1;
  reset role;
  assert (select status from public.mka_items where key='p_new') = 'approved', 'approval survives re-push';
  update public.mka_items set status='on' where kind='control';
  set local role anon;
  st := public.mka_state(k);
  assert (st->>'kill')::boolean and st->'approved' = '["p_new"]'::jsonb and st->'rejected' = '[]'::jsonb, 'state';
  reset role;
  update public.mka_items set status='activate' where key='p_new';
  set local role anon;
  st := public.mka_state(k);
  assert st->'activate' = '["p_new"]'::jsonb and st->'approved' = '[]'::jsonb, 'state lists activate';
  assert public.mka_push(k, '[{"kind":"proposal","key":"p_new","status":"proposed","data":{"branch":"ULSAN","stage":"drafted"}}]'::jsonb) = 1;
  reset role;
  assert (select status from public.mka_items where key='p_new') = 'activate', 'activate survives re-push';
  set local role anon;
  assert public.mka_push(k, '[]'::jsonb) = 0, 'empty push deletes nothing';
  reset role;
  assert (select count(*) from public.mka_items where key='p_new') = 1;
  -- 시험 재료 되돌리기(아래 본시험이 쓰던 행 복구)
  delete from public.mka_items where kind <> 'control';
  insert into public.mka_items (kind,key,status,data) values ('proposal','p_dsr','proposed','{"branch":"DAEGUDSR"}'),('proposal','p_ul','proposed','{"branch":"ULSAN"}'),('thread','t_dsr','posted','{"branch":"DAEGUDSR"}'),('topad','a_none','ACTIVE','{"branch":""}');
  update public.mka_items set status='off' where kind='control';
end $$;
set local role authenticated;
do $$ declare c int; begin
  -- 조교(대구 영어 지점): 마케팅·에이전트 전부 안 보임
  perform set_config('t.role','assistant',true); perform set_config('t.team','1',true);
  assert (select count(*) from public.mka_items) = 0, 'assistant: no mka';
  assert (select count(*) from public.mk_reports) = 0, 'assistant: no mk_reports';
  assert (select count(*) from public.mkc_ads) = 0, 'assistant: no mkc_ads';
  -- 매니저(대구 영어): 자기 지점 것 + 킬스위치 상태만, 못 바꿈
  perform set_config('t.role','manager',true);
  assert (select count(*) from public.mka_items) = 3, 'manager: own branch (proposal, thread) + control';
  assert (select count(*) from public.mka_items where data->>'branch' = 'ULSAN') = 0, 'manager: not other branch';
  assert (select count(*) from public.mk_reports) = 1, 'manager: own team report';
  assert (select count(*) from public.mkc_ads) = 1, 'manager: own group ads';
  update public.mka_items set status='approved' where key='p_dsr'; get diagnostics c = row_count; assert c = 0, 'manager cannot approve';
  update public.mka_items set status='activate' where key='p_dsr'; get diagnostics c = row_count; assert c = 0, 'manager cannot activate';
  update public.mka_items set status='on' where kind='control'; get diagnostics c = row_count; assert c = 0, 'manager cannot flip kill';
  -- 매니저(구미 등 에이전트 없는 지점): 킬스위치 상태만
  perform set_config('t.team','9',true);
  assert (select count(*) from public.mka_items) = 1, 'other-branch manager: control only';
  -- 대표
  perform set_config('t.role','admin',true);
  assert (select count(*) from public.mka_items) = 5, 'admin sees all';
  assert (select count(*) from public.mk_reports) = 2, 'admin sees all reports';
  update public.mka_items set status='approved' where key='p_dsr'; get diagnostics c = row_count; assert c = 1, 'admin approves';
  update public.mka_items set status='activate' where key='p_dsr'; get diagnostics c = row_count; assert c = 1, 'admin asks activate';
  update public.mka_items set status='on' where kind='control' and key='kill'; get diagnostics c = row_count; assert c = 1, 'admin flips kill';
  update public.mka_items set status='X' where key='a_none'; get diagnostics c = row_count; assert c = 0, 'admin cannot edit topad';
  begin update public.mka_items set status='whatever' where key='p_dsr'; assert false, 'bad status must be rejected';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
