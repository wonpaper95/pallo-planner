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
  update public.mka_items set status='on' where kind='control'; get diagnostics c = row_count; assert c = 0, 'manager cannot flip kill';
  -- 매니저(구미 등 에이전트 없는 지점): 킬스위치 상태만
  perform set_config('t.team','9',true);
  assert (select count(*) from public.mka_items) = 1, 'other-branch manager: control only';
  -- 대표
  perform set_config('t.role','admin',true);
  assert (select count(*) from public.mka_items) = 5, 'admin sees all';
  assert (select count(*) from public.mk_reports) = 2, 'admin sees all reports';
  update public.mka_items set status='approved' where key='p_dsr'; get diagnostics c = row_count; assert c = 1, 'admin approves';
  update public.mka_items set status='on' where kind='control' and key='kill'; get diagnostics c = row_count; assert c = 1, 'admin flips kill';
  update public.mka_items set status='X' where key='a_none'; get diagnostics c = row_count; assert c = 0, 'admin cannot edit topad';
  begin update public.mka_items set status='whatever' where key='p_dsr'; assert false, 'bad status must be rejected';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
