-- 📸 게시물 테이블 API 권한. 이 프로젝트는 새 테이블에 기본 GRANT 가 붙지 않아서(REFERENCES·TRIGGER·TRUNCATE 만) 직접 준다 (블로그 20261025140000_blog_grants.sql 과 같은 이유).
-- 누가 무엇을 하는지는 20261025150000_sns.sql 의 RLS·트리거가 막는다 (매니저 = 자기 지점, 대표 = 전체, 자동 게시 상태·서버 전용 칸 = 서비스 키만).
grant select, insert, update, delete on public.sns_posts, public.sns_jobs to authenticated;
grant select on public.sns_accounts to authenticated;
grant insert, update, delete on public.sns_accounts to authenticated; -- 대표만: RLS sns_accounts_admin
grant select, insert, update, delete on public.sns_accounts, public.sns_posts, public.sns_jobs to service_role;
