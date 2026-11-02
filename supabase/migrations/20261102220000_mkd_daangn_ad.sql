-- 일일 현황에 당근 광고(전문가모드) 채널 추가 — 11/2 시작한 지점 광고 3개의 비용·클릭을 총 광고비에 합친다. 허용 값만 늘린다(기존 행 영향 없음).
alter table public.mkd_daily drop constraint if exists mkd_daily_channel_check;
alter table public.mkd_daily add constraint mkd_daily_channel_check check (channel in ('naver_ad','google_ad','meta_ad','daangn_ad','blog','daangn','jeonsan'));
