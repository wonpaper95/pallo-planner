-- ⚠️ 초안 (신고 #5, 미적용) — 대표 컨펌 후 supabase/migrations/0063_jc_photos.sql 로 옮겨 적용
-- ✅ [조체] 사진 모음: 링크 모음 옆 페이지. 지점 공용(매니저·조교 링크·대표), 실시간
create table jc_photos (
  id         bigint generated always as identity primary key,
  team_id    bigint not null references teams on delete cascade,
  path       text not null,                                  -- 버킷 jc-photos 안 '<team_id>/<uuid>.jpg'
  label      text not null default '' check (length(label) <= 60),
  pinned     boolean not null default false,
  sort       int not null default 0,
  by_name    text not null default '',
  created_at timestamptz not null default now()
);
alter table jc_photos enable row level security;
create policy team_all on jc_photos for all to authenticated
  using (is_admin() or team_id = coalesce(my_team(), assistant_team()))
  with check (is_admin() or team_id = coalesce(my_team(), assistant_team()));
create policy no_assistant_delete on jc_photos as restrictive for delete to authenticated using ((select not is_assistant())); -- 지우기는 매니저·대표만 (대타 명단과 같은 규칙)
grant select, insert, update, delete on jc_photos to authenticated;
alter publication supabase_realtime add table jc_photos;

-- 사진 파일: 비공개 버킷, 경로 첫 칸 = 지점 id. 같은 지점(조교 포함)·대표만 읽기/올리기, 지우기는 매니저·대표
insert into storage.buckets (id, name, public, file_size_limit)
  values ('jc-photos', 'jc-photos', false, 10485760)
  on conflict (id) do nothing;
create policy jc_photo_select on storage.objects for select to authenticated
  using (bucket_id = 'jc-photos' and (is_admin() or (storage.foldername(name))[1] = coalesce(my_team(), assistant_team())::text));
create policy jc_photo_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'jc-photos' and (is_admin() or (storage.foldername(name))[1] = coalesce(my_team(), assistant_team())::text));
create policy jc_photo_delete on storage.objects for delete to authenticated
  using (bucket_id = 'jc-photos' and not is_assistant() and (is_admin() or (storage.foldername(name))[1] = my_team()::text));

-- 적용 뒤 할 일: tools/test_assistant.sql 에 jc_photos(조교 올리기 가능·지우기 불가·다른 지점 불가) 추가,
-- 조교 허용 목록(no_assistant 예외)에 jc_photos 추가 — 0060 의 jc_ 표와 같은 방식인지 확인
