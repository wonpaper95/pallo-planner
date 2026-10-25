-- 🎓 training_* 검증 — 로컬 DB 에서 트랜잭션 안에서 돌리고 rollback 한다.
-- 실행: docker exec -i supabase_db_pallo-planner-dev psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/training.sql
begin;
select set_config('t.boss', (select id::text from auth.users where email = 'boss@pallo.test'), true);
select set_config('t.mgr', (select id::text from auth.users where email = 'manager@pallo.test'), true);
select set_config('t.team1', (select team_id::text from public.profiles where user_id = current_setting('t.mgr')::uuid), true);
select set_config('t.team2', (select id::text from public.teams where id <> current_setting('t.team1')::bigint order by sort limit 1), true);

-- 1) 매니저: 자기 지점에 신입 추가 → 6자리 코드
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.mgr'), 'role', 'authenticated')::text, true);
do $$ declare r record; begin
  select * into r from public.training_add_trainee('김신입', current_setting('t.team1')::bigint);
  assert r.code ~ '^[0-9]{6}$', '코드는 숫자 6자리';
  perform set_config('t.code', r.code, true);
  perform set_config('t.tid', r.trainee_id::text, true);
end $$;
-- 2) 매니저: 다른 지점엔 못 만든다
do $$ begin
  begin
    perform public.training_add_trainee('남의지점', current_setting('t.team2')::bigint);
    raise exception '다른 지점 추가가 막히지 않음';
  exception when insufficient_privilege then null;
  end;
end $$;
-- 3) 매니저: 자기 지점 신입이 보이고 코드 해시는 못 고친다
do $$ begin
  assert (select count(*) from public.training_trainees where id = current_setting('t.tid')::uuid) = 1, '자기 지점 신입이 안 보임';
  begin
    update public.training_trainees set code_hash = 'x' where id = current_setting('t.tid')::uuid;
    raise exception 'code_hash 수정이 막히지 않음';
  exception when insufficient_privilege then null;
  end;
  begin
    perform code_hash from public.training_trainees;
    raise exception 'code_hash 조회가 막히지 않음';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 4) 신입(anon): 틀린 코드 → 0행, 맞는 코드 → 토큰
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare r record; n int; begin
  select count(*) into n from public.training_enter('김신입', '000000') where current_setting('t.code') <> '000000';
  assert n = 0, '틀린 코드인데 들어가짐';
  select * into r from public.training_enter('김신입', current_setting('t.code'));
  assert r.token ~ '^[0-9a-f]{64}$', '토큰 형식';
  assert r.team_name is not null, '지점 이름';
  perform set_config('t.tok', r.token, true);
end $$;
-- 5) 신입: whoami, 이벤트 기록(중복은 한 번만)
do $$ declare ev jsonb; n int; begin
  assert (select name from public.training_whoami(current_setting('t.tok'))) = '김신입', 'whoami';
  assert (select count(*) from public.training_whoami('bad')) = 0, '잘못된 토큰 whoami';
  ev := jsonb_build_array(
    jsonb_build_object('attemptId', '00000000-0000-4000-8000-000000000001', 'missionId', 'call-03', 'kind', 'start', 'at', 1793000000000),
    jsonb_build_object('attemptId', '00000000-0000-4000-8000-000000000001', 'missionId', 'call-03', 'kind', 'step', 'step', 0, 'at', 1793000001000),
    jsonb_build_object('attemptId', '00000000-0000-4000-8000-000000000001', 'missionId', 'call-03', 'kind', 'mistake', 'mistakeId', 'absent-as-nocall', 'at', 1793000002000),
    jsonb_build_object('attemptId', '00000000-0000-4000-8000-000000000001', 'missionId', 'call-03', 'kind', 'pass', 'seconds', 95, 'at', 1793000003000));
  n := public.training_log_events(current_setting('t.tok'), ev);
  assert n = 4, '처음엔 4행';
  n := public.training_log_events(current_setting('t.tok'), ev);
  assert n = 0, '같은 이벤트는 다시 안 들어감';
  begin
    perform public.training_log_events('bad', ev);
    raise exception '무효 세션이 막히지 않음';
  exception when raise_exception then
    if sqlerrm <> 'invalid_session' then raise; end if;
  end;
end $$;
-- 6) anon 은 테이블을 직접 못 본다
do $$ begin
  begin
    perform 1 from public.training_trainees;
    raise exception 'anon 이 training_trainees 를 봄';
  exception when insufficient_privilege then null;
  end;
end $$;
-- 6b) IP 단위 제한: 한 IP 가 다른 이름으로 20번 틀리면 그 IP 만 막히고, 다른 IP 는 정상 입장
select set_config('request.headers', '{"x-forwarded-for":"1.2.3.4, 10.0.0.1"}', true);
do $$ declare i int; begin
  for i in 1..20 loop perform * from public.training_enter('없는사람' || i, '999999'); end loop;
  begin
    perform * from public.training_enter('김신입', current_setting('t.code'));
    raise exception 'IP 시도 제한이 동작하지 않음';
  exception when raise_exception then
    if sqlerrm <> 'too_many_attempts' then raise; end if;
  end;
end $$;
select set_config('request.headers', '{"x-forwarded-for":"5.6.7.8"}', true);
do $$ declare r record; begin
  select * into r from public.training_enter('김신입', current_setting('t.code'));
  assert r.token is not null, '다른 IP 는 들어가져야 함';
end $$;
select set_config('request.headers', '{}', true);

-- 7) 같은 이름 10번 틀리면 막힌다
do $$ declare i int; begin
  -- 4) 에서 이미 1번 틀렸으므로 9번 더 틀리면 10번이 된다
  for i in 1..9 loop perform * from public.training_enter('김신입', '999999'); end loop;
  begin
    perform * from public.training_enter('김신입', current_setting('t.code'));
    raise exception '시도 제한이 동작하지 않음';
  exception when raise_exception then
    if sqlerrm <> 'too_many_attempts' then raise; end if;
  end;
end $$;

-- 8) 매니저·대표: 진행률 뷰
reset role;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.mgr'), 'role', 'authenticated')::text, true);
do $$ declare r record; begin
  select * into r from public.training_progress where trainee_id = current_setting('t.tid')::uuid and mission_id = 'call-03';
  assert r.attempts = 1 and r.passed and r.best_seconds = 95 and r.mistakes = 1, '진행률 집계';
  assert r.mistake_ids = array['absent-as-nocall'], '실수 id';
end $$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('t.boss'), 'role', 'authenticated')::text, true);
do $$ begin
  assert (select count(*) from public.training_progress where trainee_id = current_setting('t.tid')::uuid) = 1, '대표도 봄';
end $$;
-- 9) 코드 재발급: 옛 세션 끊김
do $$ declare c text; begin
  c := public.training_reissue_code(current_setting('t.tid')::uuid);
  assert c ~ '^[0-9]{6}$', '재발급 코드';
  assert (select count(*) from public.training_whoami(current_setting('t.tok'))) = 0, '재발급 뒤 옛 세션이 살아 있음';
end $$;
reset role;
select '✅ training 검증 통과' as result;
rollback;
