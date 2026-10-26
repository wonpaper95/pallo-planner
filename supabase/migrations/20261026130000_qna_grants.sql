-- 💬 Q&A 테이블·함수 API 권한. 이 프로젝트는 새 테이블에 기본 GRANT 가 붙지 않아서 직접 준다 (sns_grants 와 같은 이유).
-- 누가 무엇을 하는지는 20261026120000_qna.sql 의 RLS·트리거가 막는다.
grant select, insert, update, delete on public.qna_items, public.qna_style, public.qna_suggestions, public.qna_limits to authenticated;
grant select on public.qna_gens to authenticated;
grant select, insert, update, delete on public.qna_items, public.qna_style, public.qna_suggestions, public.qna_gens, public.qna_limits to service_role;
grant execute on function public.qna_search(text, int) to authenticated, service_role;
revoke execute on function public.qna_pick_refs(text, bigint, int) from public, anon, authenticated;
grant execute on function public.qna_pick_refs(text, bigint, int) to service_role;
revoke execute on function public.claim_qna_notices() from public, anon, authenticated;
grant execute on function public.claim_qna_notices() to service_role;
