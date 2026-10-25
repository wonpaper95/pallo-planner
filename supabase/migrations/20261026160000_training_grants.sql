-- 🎓 training_* API 권한. 이 프로젝트는 새 테이블에 기본 GRANT 가 붙지 않아서 직접 준다 (qna_grants 와 같은 이유).
-- 누가 무엇을 하는지는 20261026150000_training.sql 의 RLS·함수가 막는다.
-- 로컬 개발 DB 는 public 새 테이블에 anon/authenticated 전체 권한이 기본으로 붙는다(운영은 아님). 어디서든 같게 동작하도록 먼저 걷어낸다.
revoke all on public.training_trainees, public.training_sessions, public.training_enter_fails, public.training_events, public.training_progress from anon, authenticated;

grant select, delete on public.training_trainees to authenticated;
grant update (name, active) on public.training_trainees to authenticated;
grant select on public.training_events, public.training_progress to authenticated;
grant all on public.training_trainees, public.training_sessions, public.training_enter_fails, public.training_events to service_role;
grant select on public.training_progress to service_role;

revoke execute on function public.training_new_code() from public, anon, authenticated;
revoke execute on function public.training_session_trainee(text) from public, anon, authenticated;
revoke execute on function public.training_add_trainee(text, bigint) from public, anon;
revoke execute on function public.training_reissue_code(uuid) from public, anon;
grant execute on function public.training_add_trainee(text, bigint), public.training_reissue_code(uuid) to authenticated;
grant execute on function public.training_enter(text, text), public.training_whoami(text), public.training_log_events(text, jsonb) to anon, authenticated;
grant execute on function public.training_my_team(), public.training_is_admin(), public.training_can_manage(bigint) to authenticated;
