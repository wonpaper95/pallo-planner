-- 🎓 전산 연습(신입 교육) 진행 기록 — 연습 사이트(pallo-sso 연습 모드)가 쓴다.
-- 신입은 계정 없이 이름 + 6자리 입장 코드로 들어오고(training_enter), 진행 이벤트는 세션 토큰으로 보낸다(training_log_events).
-- 매니저는 자기 지점 신입만, 대표(role=admin)는 전부 — profiles(team_id, role). 코드·토큰은 sha256 해시만 저장.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.training_my_team() returns bigint
language sql stable security definer set search_path = public as
$$ select team_id from profiles where user_id = auth.uid() $$;

create or replace function public.training_is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where user_id = auth.uid() and role = 'admin') $$;

create or replace function public.training_can_manage(p_team bigint) returns boolean
language sql stable security definer set search_path = public as
$$ select public.training_is_admin() or (p_team is not null and p_team = public.training_my_team()) $$;

create table if not exists public.training_trainees (
  id uuid primary key default gen_random_uuid(),
  team_id bigint not null references public.teams(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  code_hash text not null,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
create index if not exists training_trainees_team_idx on public.training_trainees (team_id);

create table if not exists public.training_sessions (
  token_hash text primary key,
  trainee_id uuid not null references public.training_trainees(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

-- 입장 실패 기록(시도 제한용). 하루 지난 건 training_enter 가 지운다
create table if not exists public.training_enter_fails (
  id bigint generated always as identity primary key,
  name text not null,
  at timestamptz not null default now()
);
create index if not exists training_enter_fails_at_idx on public.training_enter_fails (at);

create table if not exists public.training_events (
  id bigint generated always as identity primary key,
  trainee_id uuid not null references public.training_trainees(id) on delete cascade,
  attempt_id uuid not null,
  mission_id text not null check (length(mission_id) between 1 and 40),
  kind text not null check (kind in ('start', 'step', 'mistake', 'pass')),
  step int,
  mistake_id text check (mistake_id is null or length(mistake_id) <= 60),
  seconds int,
  client_at timestamptz not null,
  created_at timestamptz not null default now()
);
-- 같은 시도의 같은 이벤트는 한 번만 (브라우저 재전송·옛 기록 재전송 대비)
create unique index if not exists training_events_once
  on public.training_events (attempt_id, kind, coalesce(step, -1), coalesce(mistake_id, ''));
create index if not exists training_events_trainee_idx on public.training_events (trainee_id, created_at desc);

alter table public.training_trainees enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_enter_fails enable row level security;
alter table public.training_events enable row level security;

drop policy if exists training_trainees_read on public.training_trainees;
create policy training_trainees_read on public.training_trainees for select to authenticated
  using (public.training_can_manage(team_id));
drop policy if exists training_trainees_edit on public.training_trainees;
create policy training_trainees_edit on public.training_trainees for update to authenticated
  using (public.training_can_manage(team_id)) with check (public.training_can_manage(team_id));
drop policy if exists training_trainees_remove on public.training_trainees;
create policy training_trainees_remove on public.training_trainees for delete to authenticated
  using (public.training_can_manage(team_id));
drop policy if exists training_events_read on public.training_events;
create policy training_events_read on public.training_events for select to authenticated
  using (exists (select 1 from public.training_trainees t where t.id = trainee_id and public.training_can_manage(t.team_id)));
-- training_sessions · training_enter_fails 는 정책 없음 = 아래 security definer 함수만 접근

-- 진행률: 신입 × 미션 (RLS 가 그대로 걸리도록 security_invoker)
create or replace view public.training_progress with (security_invoker = true) as
select e.trainee_id,
       e.mission_id,
       count(distinct e.attempt_id) filter (where e.kind = 'start')::int as attempts,
       coalesce(bool_or(e.kind = 'pass'), false) as passed,
       min(e.seconds) filter (where e.kind = 'pass') as best_seconds,
       count(*) filter (where e.kind = 'mistake')::int as mistakes,
       coalesce(array_agg(distinct e.mistake_id) filter (where e.mistake_id is not null), '{}') as mistake_ids,
       max(e.created_at) as last_at
  from public.training_events e
 group by e.trainee_id, e.mission_id;

-- 활성 신입끼리 겹치지 않는 6자리 숫자 코드
create or replace function public.training_new_code() returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare b bytea; c text;
begin
  loop
    b := gen_random_bytes(4);
    c := lpad(((get_byte(b, 0)::bigint * 16777216 + get_byte(b, 1) * 65536 + get_byte(b, 2) * 256 + get_byte(b, 3)) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from training_trainees where active and code_hash = encode(digest(c, 'sha256'), 'hex'));
  end loop;
  return c;
end $$;

create or replace function public.training_add_trainee(p_name text, p_team_id bigint)
returns table (trainee_id uuid, code text)
language plpgsql volatile security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare c text; tid uuid;
begin
  if not public.training_can_manage(p_team_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  c := public.training_new_code();
  insert into training_trainees (team_id, name, code_hash, created_by)
  values (p_team_id, btrim(p_name), encode(digest(c, 'sha256'), 'hex'), auth.uid())
  returning id into tid;
  return query select tid, c;
end $$;

create or replace function public.training_reissue_code(p_trainee uuid) returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare c text; t_team bigint;
begin
  select team_id into t_team from training_trainees where id = p_trainee;
  if t_team is null or not public.training_can_manage(t_team) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  c := public.training_new_code();
  update training_trainees set code_hash = encode(digest(c, 'sha256'), 'hex'), active = true where id = p_trainee;
  delete from training_sessions where trainee_id = p_trainee;
  return c;
end $$;

create or replace function public.training_enter(p_name text, p_code text)
returns table (token text, trainee_id uuid, name text, team_name text)
language plpgsql volatile security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare t record; tok text; nm text := left(btrim(coalesce(p_name, '')), 40);
begin
  -- 같은 이름 10분에 10번, 전체 1분에 60번 틀리면 잠시 막는다
  if (select count(*) from training_enter_fails f where f.at > now() - interval '1 minute') >= 60
     or (select count(*) from training_enter_fails f where f.name = nm and f.at > now() - interval '10 minutes') >= 10 then
    raise exception 'too_many_attempts';
  end if;
  select tr.id, tr.name, tm.name as team_name into t
    from training_trainees tr join teams tm on tm.id = tr.team_id
   where tr.active and tr.name = nm and tr.code_hash = encode(digest(btrim(coalesce(p_code, '')), 'sha256'), 'hex');
  if not found then
    insert into training_enter_fails (name) values (nm);
    delete from training_enter_fails f where f.at < now() - interval '1 day';
    return;
  end if;
  tok := encode(gen_random_bytes(32), 'hex');
  insert into training_sessions (token_hash, trainee_id) values (encode(digest(tok, 'sha256'), 'hex'), t.id);
  update training_trainees set last_seen_at = now() where id = t.id;
  return query select tok, t.id, t.name, t.team_name;
end $$;

-- 세션 토큰 → 신입 (내부용)
create or replace function public.training_session_trainee(p_token text) returns uuid
language sql stable security definer set search_path = public, extensions as $$
  select s.trainee_id
    from training_sessions s join training_trainees t on t.id = s.trainee_id
   where s.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and s.expires_at > now() and t.active
$$;

create or replace function public.training_whoami(p_token text)
returns table (trainee_id uuid, name text, team_name text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, tm.name
    from training_trainees t join teams tm on tm.id = t.team_id
   where t.id = public.training_session_trainee(p_token)
$$;

create or replace function public.training_log_events(p_token text, p_events jsonb) returns int
language plpgsql volatile security definer set search_path = public as $$
declare tid uuid := public.training_session_trainee(p_token); n int;
begin
  if tid is null then raise exception 'invalid_session'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then
    raise exception 'bad_events' using errcode = '22023';
  end if;
  insert into training_events (trainee_id, attempt_id, mission_id, kind, step, mistake_id, seconds, client_at)
  select tid, (e->>'attemptId')::uuid, e->>'missionId', e->>'kind', (e->>'step')::int, e->>'mistakeId',
         (e->>'seconds')::int, to_timestamp((e->>'at')::double precision / 1000)
    from jsonb_array_elements(p_events) e
  on conflict do nothing;
  get diagnostics n = row_count;
  update training_trainees set last_seen_at = now() where id = tid;
  return n;
end $$;
