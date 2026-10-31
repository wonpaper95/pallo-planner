-- 🤖 에이전트 광고 제안에 [켜줘] 단계 추가: 승인 → (Claude가 꺼진 초안 생성, data.stage=drafted) → 대표가 켜줘(status 'activate') → 맥북 30분 예약작업이 그 광고만 게시(data.stage=live).
-- 대표는 'activate' 로 바꾸거나(켜줘) 다시 'approved' 로 되돌릴 수 있다(켜기 전 취소). 맥북은 mka_state 의 activate 목록을 받아 실행한다.
drop policy if exists mka_items_upd on public.mka_items;
create policy mka_items_upd on public.mka_items for update using (blog_is_admin() and kind in ('proposal', 'control'))
  with check (blog_is_admin() and kind in ('proposal', 'control') and status in ('proposed', 'approved', 'rejected', 'activate', 'on', 'off'));

create or replace function public.mka_state(k text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not mka_check_key(k) then raise exception 'bad key' using errcode = '28000'; end if;
  return jsonb_build_object(
    'kill', exists (select 1 from mka_items where kind = 'control' and key = 'kill' and status = 'on'),
    'approved', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'approved'), '[]'::jsonb),
    'rejected', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'rejected'), '[]'::jsonb),
    'activate', coalesce((select jsonb_agg(key order by key) from mka_items where kind = 'proposal' and status = 'activate'), '[]'::jsonb));
end $$;
