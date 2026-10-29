-- 🤖 에이전트(맥북)가 서비스 키 없이 mka_items 를 올리는 길: 긴 비밀값으로 보호한 함수 2개.
-- 비밀값은 맥북 ad-agent/planner-push-secret.txt 에만 있고, DB 에는 sha256 해시만 둔다. 함수는 mka_items 만 건드린다(광고·전산 데이터 접근 없음).
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.mka_push_key (hash text primary key);
alter table public.mka_push_key enable row level security; -- 정책 없음 = API 로는 아무도 못 읽음

create or replace function public.mka_check_key(k text) returns boolean
language sql stable security definer set search_path = public, extensions as
$$ select coalesce(length(k), 0) >= 32 and exists (select 1 from mka_push_key where hash = encode(digest(k, 'sha256'), 'hex')) $$;

-- 올리기: items = [{kind: thread|proposal|topad, key, status, data}]. 광고 제안(proposal)은 이미 있으면 대표가 누른 승인 상태를 지킨다.
-- 이번 묶음에 없는 같은 종류 행은 지운다(끝난 제안·지난 순위 정리). 묶음이 비어 있으면 아무것도 안 지운다.
create or replace function public.mka_push(k text, items jsonb) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare n int := 0; it jsonb; kd text;
begin
  if not mka_check_key(k) then raise exception 'bad key' using errcode = '28000'; end if;
  for it in select * from jsonb_array_elements(items) loop
    continue when it->>'kind' not in ('thread', 'proposal', 'topad') or coalesce(it->>'key', '') = '';
    insert into mka_items (kind, key, status, data, updated_at)
    values (it->>'kind', it->>'key', coalesce(it->>'status', ''), coalesce(it->'data', '{}'::jsonb), now())
    on conflict (kind, key) do update set data = excluded.data, updated_at = now(),
      status = case when mka_items.kind = 'proposal' then mka_items.status else excluded.status end;
    n := n + 1;
  end loop;
  if n > 0 then
    foreach kd in array array['thread', 'proposal', 'topad'] loop
      delete from mka_items where kind = kd and key not in (select x->>'key' from jsonb_array_elements(items) x where x->>'kind' = kd);
    end loop;
  end if;
  return n;
end $$;

-- 내려받기: 대표가 화면에서 누른 킬스위치·승인·반려
create or replace function public.mka_state(k text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not mka_check_key(k) then raise exception 'bad key' using errcode = '28000'; end if;
  return jsonb_build_object(
    'kill', exists (select 1 from mka_items where kind = 'control' and key = 'kill' and status = 'on'),
    'approved', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'approved'), '[]'::jsonb),
    'rejected', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'rejected'), '[]'::jsonb));
end $$;

revoke all on function public.mka_check_key(text) from public, anon, authenticated;
grant execute on function public.mka_push(text, jsonb), public.mka_state(text) to anon, authenticated;
