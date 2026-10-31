-- 일일 현황 월요일 주간 종합(mkd_reports kind='weekly')은 전 지점 숫자(광고비·문의·등록)가 함께 들어 있어 대표만 읽는다.
-- 일일(kind='daily') 코멘트·이상 징후는 그대로 로그인한 모두가 읽는다(전 지점 공유, 대표 결정 2026-10-29). 숫자 표 mkd_daily 는 원래 자기 지점만.
drop policy if exists mkd_reports_read on public.mkd_reports;
create policy mkd_reports_read on public.mkd_reports for select
  using ((kind = 'daily' and auth.role() = 'authenticated') or blog_is_admin());
