-- 📈 마케팅 탭 › 트렌드: 업종 밖에서 오래 도는 광고(맥북 ad-agent/trend.py → 메타 광고 라이브러리 공개 페이지).
-- kind 'trend' 추가. 지점과 상관없는 자료라 조교 빼고 모두 읽는다. 올리기는 기존 mka_push 로(비밀값).
alter table public.mka_items drop constraint if exists mka_items_kind_check;
alter table public.mka_items add constraint mka_items_kind_check check (kind in ('thread', 'proposal', 'topad', 'control', 'trend'));

drop policy if exists mka_items_read on public.mka_items;
create policy mka_items_read on public.mka_items for select using (
  blog_is_admin()
  or (not mk_is_assistant() and (kind in ('control', 'trend') or data->>'branch' = mka_branch_of_team(blog_my_team())))
);

create or replace function public.mka_push(k text, items jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int := 0; it jsonb; kd text;
begin
  if not mka_check_key(k) then raise exception 'bad key' using errcode = '28000'; end if;
  for it in select * from jsonb_array_elements(items) loop
    continue when it->>'kind' not in ('thread', 'proposal', 'topad', 'trend') or coalesce(it->>'key', '') = '';
    insert into mka_items (kind, key, status, data, updated_at)
    values (it->>'kind', it->>'key', coalesce(it->>'status', ''), coalesce(it->'data', '{}'::jsonb), now())
    on conflict (kind, key) do update set data = excluded.data, updated_at = now(),
      status = case when mka_items.kind = 'proposal' then mka_items.status else excluded.status end;
    n := n + 1;
  end loop;
  if n > 0 then
    foreach kd in array array['thread', 'proposal', 'topad', 'trend'] loop
      delete from mka_items where kind = kd and key not in (select x->>'key' from jsonb_array_elements(items) x where x->>'kind' = kd);
    end loop;
  end if;
  return n;
end $$;
