-- ✍️ 블로그: 네이버 붙여넣기·끌어놓기용 임시 사진 보관함
-- 스마트에디터는 data:/blob: 이미지를 거부하고 https 주소 이미지는 가져가서 다시 올린다 → 모자이크 처리된 사진을 여기 공개 주소로 둔다.
-- 파일 이름은 무작위, blog-write 의 usage 호출 때 2일 지난 파일을 지운다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-temp', 'blog-temp', true, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

-- 올리기: 로그인한 사람이 자기 지점 폴더(<team_id>/…)에만. 대표는 전부
create policy blog_temp_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'blog-temp' and (blog_is_admin() or (storage.foldername(name))[1] = blog_my_team()::text));
