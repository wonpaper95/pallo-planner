-- 📣 마케팅 테이블 API 권한. 이 프로젝트는 새 테이블에 기본 GRANT 가 붙지 않아서(REFERENCES·TRIGGER·TRUNCATE 만) 직접 준다.
-- 실제로 누가 무엇을 하는지는 RLS(20261025120000_marketing.sql)가 막는다: 매니저 = 자기 지점 읽기, 대표 = CSV 쓰기, 리드·리포트 쓰기 = 서비스 키.
grant select, insert, update on public.mk_ad_daily, public.mk_ad_demo, public.mk_organic to authenticated;
grant select, insert on public.mk_uploads to authenticated;
grant select on public.mk_leads, public.mk_reports to authenticated;
grant select, insert, update, delete on public.mk_ad_daily, public.mk_ad_demo, public.mk_organic, public.mk_leads, public.mk_uploads, public.mk_reports to service_role;
