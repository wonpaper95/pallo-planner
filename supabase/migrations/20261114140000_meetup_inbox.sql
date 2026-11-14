-- 📬 밋업 답할 것 (docs/meetup/README.md). 맥미니가 매시간 이벤트 댓글·주최자 계정 알림을 쌓고, 마케팅 탭 › 밋업 맨 위에 보여준다.
-- 개인 메시지는 공식 API 에 없어 여기 안 들어온다(업무폰 밋업 앱에서 본다).
-- 댓글은 그 이벤트 지점(team_id) 매니저도 보고, 계정 알림(team_id null)은 대표만. [처리함]은 볼 수 있는 사람이 done_at·done_by 만 바꾼다.
create table if not exists public.meetup_inbox (
  id text primary key,                                  -- c:<댓글 번호> · n:<알림 번호>
  source text not null check (source in ('comment', 'notice')),
  kind text not null,                                   -- COMMENT·REPLY·MUG_COMM_COMMENT·PENDING_MEMBER
  event_id text,
  team_id bigint references public.teams(id) on delete set null,
  branch text,
  event_title text,
  member_name text,
  text text,
  link text,
  created_at timestamptz,                               -- 밋업에 올라온 때
  answered boolean not null default false,              -- 주최자가 답글 달았음 / 밋업에서 알림 읽음 (스크립트가 매번 갱신)
  first_seen_at timestamptz not null default now(),
  done_at timestamptz,                                  -- 플래너 [처리함]
  done_by uuid
);
create index if not exists meetup_inbox_created_idx on public.meetup_inbox (created_at);

alter table public.meetup_inbox enable row level security;
create policy meetup_inbox_read on public.meetup_inbox for select using (blog_is_admin() or team_id = blog_my_team());
create policy meetup_inbox_done on public.meetup_inbox for update using (blog_is_admin() or team_id = blog_my_team()) with check (blog_is_admin() or team_id = blog_my_team());

grant select on public.meetup_inbox to authenticated;
grant update (done_at, done_by) on public.meetup_inbox to authenticated;
grant select, insert, update, delete on public.meetup_inbox to service_role;
