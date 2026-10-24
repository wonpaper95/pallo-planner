-- ✍️ 블로그 테이블 API 권한. 이 프로젝트는 새 테이블에 기본 GRANT 가 붙지 않아서(REFERENCES·TRIGGER·TRUNCATE 만) 직접 준다.
-- 누가 무엇을 하는지는 20261024120000_blog.sql 의 RLS 가 막는다 (매니저 = 자기 지점, 대표 = 전체·하루 제한, 생성 기록 쓰기 = Edge Function 서비스 키).
grant select, insert, update, delete on public.blog_profiles, public.blog_posts, public.blog_styles, public.blog_limits to authenticated;
grant select on public.blog_gens to authenticated;
grant select, insert, update, delete on public.blog_profiles, public.blog_posts, public.blog_gens, public.blog_styles, public.blog_limits to service_role;
