-- 💬 매니저 Q&A 탭: 질문·답 · 말투 메모 · 메모 제안 · AI 사용 기록 · 하루 한도 (설계: docs/manager-qna/README.md)
-- 권한은 블로그와 같은 도우미(blog_my_team / blog_is_admin). 매니저 질문은 Edge Function(service_role)만 넣는다.
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.qna_items (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(user_id) on delete set null, -- 물어본 매니저 (캡처로 들어온 건 null)
  team_id bigint references public.teams(id) on delete set null,       -- 물어본 매니저 지점
  asker_label text not null default '',                                -- 캡처용 가린 이름 (○○ 매니저)
  question text not null check (length(question) between 2 and 2000),
  private boolean not null default false,                              -- 🔒 본인 + 대표만, AI 참고에서도 빠짐
  auto_private boolean not null default false,                         -- AI 가 켠 🔒 (표시용)
  status text not null default 'waiting' check (status in ('ai', 'waiting', 'final')),
  ai_answer text not null default '',                                  -- AI 초안 원본 (고친 정도 비교용)
  answer text not null default '',                                     -- 보여 줄 답: ai 면 AI 답, final 이면 대표 확정 답
  ai_flags jsonb not null default '{}',                                -- {grounded, decision_request, sensitive, reason}
  refs bigint[] not null default '{}',                                 -- AI 가 참고한 qna_items.id
  only_team bigint references public.teams(id) on delete set null,     -- ○○점만 해당
  reviewed boolean not null default false,                             -- 대표가 봤는지 (ai 답 사후 확인)
  resolved boolean not null default false,                             -- 매니저 👍
  escalated boolean not null default false,                            -- 매니저 🙋 (AI 답 → 대표님께)
  source text not null default 'ask' check (source in ('ask', 'capture')),
  notified_wait boolean not null default true,                         -- false = 대표에게 💬 알림 보낼 차례 (planner-push)
  notified_final boolean not null default true,                        -- false = 매니저에게 ✅ 알림 보낼 차례
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  final_at timestamptz
);
create index if not exists qna_items_status_idx on public.qna_items (status, created_at desc);
create index if not exists qna_items_user_idx on public.qna_items (user_id, created_at desc);
create index if not exists qna_items_q_trgm on public.qna_items using gin (question extensions.gin_trgm_ops);

-- 지킴: 대표·서버는 자유, 매니저는 자기 것 중 👍(resolved)·🔒 켜기·🙋(ai → waiting)만. 나머지 칸은 old 값으로 되돌린다
create or replace function public.qna_items_guard() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'final' and (tg_op = 'INSERT' or old.status <> 'final') then
    new.final_at := now(); new.reviewed := true;
    new.notified_final := new.user_id is null or new.source = 'capture';
  end if;
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.blog_is_admin() then return new; end if;
  if tg_op = 'INSERT' then raise exception '질문은 Q&A 화면에서 보내 주세요'; end if;
  if old.user_id is distinct from auth.uid() then raise exception '내 질문만 바꿀 수 있어요'; end if;
  if new.status <> old.status and not (old.status = 'ai' and new.status = 'waiting') then
    raise exception '답 확정은 대표님만 할 수 있어요';
  end if;
  new.escalated := old.escalated or (old.status = 'ai' and new.status = 'waiting');
  new.notified_wait := case when old.status = 'ai' and new.status = 'waiting' then false else old.notified_wait end;
  new.reviewed := case when old.status = 'ai' and new.status = 'waiting' then false else old.reviewed end;
  new.private := old.private or new.private;
  new.user_id := old.user_id; new.team_id := old.team_id; new.asker_label := old.asker_label; new.question := old.question;
  new.auto_private := old.auto_private; new.ai_answer := old.ai_answer; new.answer := old.answer; new.ai_flags := old.ai_flags;
  new.refs := old.refs; new.only_team := old.only_team; new.source := old.source; new.notified_final := old.notified_final;
  new.created_at := old.created_at; new.final_at := old.final_at;
  return new;
end $$;
drop trigger if exists qna_items_guard on public.qna_items;
create trigger qna_items_guard before insert or update on public.qna_items for each row execute function public.qna_items_guard();

alter table public.qna_items enable row level security;
drop policy if exists qna_items_read on public.qna_items;
create policy qna_items_read on public.qna_items for select to authenticated using (
  public.blog_is_admin() or user_id = auth.uid()
  or (status = 'final' and not private and (only_team is null or only_team = public.blog_my_team())));
drop policy if exists qna_items_ins on public.qna_items;
create policy qna_items_ins on public.qna_items for insert to authenticated with check (public.blog_is_admin());
drop policy if exists qna_items_upd on public.qna_items;
create policy qna_items_upd on public.qna_items for update to authenticated
  using (public.blog_is_admin() or user_id = auth.uid()) with check (public.blog_is_admin() or user_id = auth.uid());
drop policy if exists qna_items_del on public.qna_items;
create policy qna_items_del on public.qna_items for delete to authenticated
  using (public.blog_is_admin() or (user_id = auth.uid() and status = 'waiting'));

-- 대표 말투·원칙 메모 (한 줄짜리 표)
create table if not exists public.qna_style (
  id int primary key default 1 check (id = 1),
  memo text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.qna_style (id) values (1) on conflict do nothing;
alter table public.qna_style enable row level security;
drop policy if exists qna_style_admin on public.qna_style;
create policy qna_style_admin on public.qna_style for all to authenticated using (public.blog_is_admin()) with check (public.blog_is_admin());

-- AI 가 낸 메모 추가 제안 (수락한 것만 메모에 들어감)
create table if not exists public.qna_suggestions (
  id bigint generated always as identity primary key,
  item_id bigint references public.qna_items(id) on delete set null,
  line text not null,
  why text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);
alter table public.qna_suggestions enable row level security;
drop policy if exists qna_suggestions_admin on public.qna_suggestions;
create policy qna_suggestions_admin on public.qna_suggestions for all to authenticated using (public.blog_is_admin()) with check (public.blog_is_admin());

-- AI 사용 기록: 하루 한도·비용·캡처 기록(meta={shots, pairs}). Edge Function(서비스 키)만 쓴다
create table if not exists public.qna_gens (
  id bigint generated always as identity primary key,
  team_id bigint references public.teams(id) on delete set null,
  user_id uuid not null,
  kind text not null check (kind in ('ask', 'extract', 'suggest')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists qna_gens_team_idx on public.qna_gens (team_id, kind, created_at desc);
alter table public.qna_gens enable row level security;
drop policy if exists qna_gens_admin on public.qna_gens;
create policy qna_gens_admin on public.qna_gens for select to authenticated using (public.blog_is_admin());

-- 지점별 하루 질문 한도 (없으면 50)
create table if not exists public.qna_limits (
  team_id bigint primary key references public.teams(id) on delete cascade,
  daily int not null default 50 check (daily between 0 and 1000)
);
alter table public.qna_limits enable row level security;
drop policy if exists qna_limits_admin on public.qna_limits;
create policy qna_limits_admin on public.qna_limits for all to authenticated using (public.blog_is_admin()) with check (public.blog_is_admin());

-- FAQ 검색 ("이미 있는 답"): 확정 · 🔒 아님 · 우리 지점 해당. 부른 사람 권한(RLS) 그대로
create or replace function public.qna_search(q text, n int default 5)
returns table (id bigint, question text, answer text, only_team bigint, final_at timestamptz, score real)
language sql stable security invoker set search_path = public, extensions as $$
  select i.id, i.question, i.answer, i.only_team, i.final_at,
         greatest(similarity(i.question, q), word_similarity(q, i.question)) as score
  from qna_items i
  where i.status = 'final' and not i.private
    and (i.only_team is null or i.only_team = blog_my_team() or blog_is_admin())
    and (greatest(similarity(i.question, q), word_similarity(q, i.question)) > 0.2
         or i.question ilike '%' || q || '%' or i.answer ilike '%' || q || '%')
  order by score desc, i.final_at desc
  limit least(greatest(n, 1), 20)
$$;

-- AI 참고 예시: 확정 · 🔒 아님 · (지점 한정 없음 또는 이 지점). 300개 이하면 전부(최신순), 넘으면 비슷한 것 n개
create or replace function public.qna_pick_refs(q text, team bigint, n int default 40)
returns table (id bigint, question text, answer text)
language sql stable security definer set search_path = public, extensions as $$
  with e as (
    select i.id, i.question, i.answer, i.final_at, greatest(similarity(i.question, q), word_similarity(q, i.question)) as s
    from qna_items i
    where i.status = 'final' and not i.private and (i.only_team is null or i.only_team = team)
  ), c as (select count(*) as k from e)
  select e.id, e.question, e.answer from e, c
  order by case when c.k <= 300 then 0 else e.s end desc, e.final_at desc
  limit case when (select k from c) <= 300 then 300 else n end
$$;

-- planner-push(1분마다)가 부른다: 대표에게 💬 새 대기 질문, 매니저에게 ✅ 확정 알림. 가져간 건 보낸 것으로 표시
create or replace function public.claim_qna_notices()
returns table (user_id uuid, title text, body text, tag text)
language sql volatile security definer set search_path = public as $$
  with w as (
    update qna_items set notified_wait = true
    where notified_wait = false and status = 'waiting'
    returning qna_items.id, qna_items.user_id as asker, qna_items.team_id, qna_items.question
  ), f as (
    update qna_items set notified_final = true
    where notified_final = false and status = 'final' and qna_items.user_id is not null
    returning qna_items.id, qna_items.user_id as asker, qna_items.question
  )
  select b.user_id, '💬 ' || coalesce(t.name || ' ', '') || coalesce(p.name, '매니저') || '님 질문',
         left(regexp_replace(w.question, '\s+', ' ', 'g'), 80), 'qna-' || w.id
  from w cross join profiles b
  left join profiles p on p.user_id = w.asker left join teams t on t.id = w.team_id
  where b.role = 'admin'
  union all
  select f.asker, '✅ 대표님이 답했어요', left(regexp_replace(f.question, '\s+', ' ', 'g'), 80), 'qna-' || f.id from f
$$;

-- 실시간: 대표 확인 목록·매니저 내 질문이 바로 바뀌게 (RLS 로 걸러서 감)
do $$ begin
  alter publication supabase_realtime add table public.qna_items;
exception when duplicate_object or undefined_object then null;
end $$;
