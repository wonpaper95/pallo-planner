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

drop policy if exists mkc_thumbs_read on storage.objects;
create policy mkc_thumbs_read on storage.objects for select to authenticated
  using (bucket_id = 'mkc-thumbs' and (blog_is_admin() or (not mk_is_assistant() and (storage.foldername(name))[1] = mkc_my_group())));
