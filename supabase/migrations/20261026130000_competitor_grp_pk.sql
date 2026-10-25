-- 🔭 경쟁사 광고: 한 광고가 두 그룹(영어·일중) 검색에 다 잡힐 수 있다(Praktika·위버스마인드 같은 어학 앱).
-- library_id 하나로 두면 나중 그룹이 앞 그룹을 덮어쓴다 → 키를 (library_id, grp) 로.
alter table public.mkc_ads drop constraint if exists mkc_ads_pkey;
alter table public.mkc_ads add primary key (library_id, grp);
