-- ============================================================================
-- Challenge posts + cohort summary RPC.
--
-- challenge_posts: daily 1-line standups for cohort-shared challenges.
--   Solo challenges (room_id is null) → posts visible to owner only.
--   Shared challenges → posts visible to all room members.
--
-- cohort_challenge_summary(p_room_id, p_challenge_id): returns one row per
--   cohort member with current relative day + completion stats. A "cohort" is
--   defined as all challenges in p_room_id sharing the same source_token as
--   p_challenge_id (falls back to title match if source_token is null).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. challenge_posts table
-- ----------------------------------------------------------------------------

create table challenge_posts (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references challenges on delete cascade,
  user_id       uuid not null references profiles on delete cascade,
  day_number    int  not null,
  text          text not null,
  link          text,
  created_at    timestamptz not null default now()
);

create index idx_challenge_posts_challenge_day
  on challenge_posts (challenge_id, day_number, created_at desc);
create index idx_challenge_posts_user
  on challenge_posts (user_id);

alter table challenge_posts enable row level security;

-- SELECT: visible to anyone who can read the parent challenge
create policy "Posts visible if parent challenge visible"
  on challenge_posts for select
  to authenticated
  using (
    exists (
      select 1 from challenges c
      where c.id = challenge_posts.challenge_id
        and (
          c.user_id = auth.uid()
          or (c.room_id is not null and is_room_member(c.room_id))
        )
    )
  );

-- INSERT: only authors, and only if they can read the parent
create policy "Members can post to challenges they can see"
  on challenge_posts for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from challenges c
      where c.id = challenge_id
        and (
          c.user_id = auth.uid()
          or (c.room_id is not null and is_room_member(c.room_id))
        )
    )
  );

-- DELETE: authors only
create policy "Authors can delete their own posts"
  on challenge_posts for delete
  to authenticated
  using (user_id = auth.uid());

-- (No UPDATE policy — posts are immutable in V2.)

alter publication supabase_realtime add table challenge_posts;

-- ----------------------------------------------------------------------------
-- 2. cohort_challenge_summary RPC
-- ----------------------------------------------------------------------------

create or replace function cohort_challenge_summary(
  p_room_id      uuid,
  p_challenge_id uuid
)
returns table (
  challenge_id      uuid,
  user_id           uuid,
  name              text,
  avatar            text,
  started_at        date,
  current_day       int,
  total_days        int,
  completed_days    int,
  last_completed_at timestamptz
)
language plpgsql
stable
security definer
as $$
declare
  v_token text;
  v_title text;
begin
  -- Authorization: caller must be a member of the room
  if not is_room_member(p_room_id) then
    raise exception 'not a room member';
  end if;

  -- Find the cohort key from the reference challenge
  select c.source_token, c.title
    into v_token, v_title
    from challenges c
   where c.id = p_challenge_id
     and c.room_id = p_room_id;

  -- No reference challenge in the room: return zero rows
  if v_token is null and v_title is null then
    return;
  end if;

  return query
  with cohort as (
    select c.id, c.user_id, c.started_at
      from challenges c
     where c.room_id = p_room_id
       and (
         (v_token is not null and c.source_token = v_token)
         or (v_token is null and c.title = v_title)
       )
  ),
  day_stats as (
    select cd.challenge_id,
           count(*)::int                                      as total_days,
           count(*) filter (where cd.completed)::int          as completed_days,
           max(cd.completed_at) filter (where cd.completed)   as last_completed_at
      from challenge_days cd
     where cd.challenge_id in (select id from cohort)
     group by cd.challenge_id
  )
  select co.id                                          as challenge_id,
         co.user_id,
         p.name,
         p.avatar,
         co.started_at,
         least(
           greatest((current_date - co.started_at)::int + 1, 1),
           coalesce(ds.total_days, 1)
         )                                              as current_day,
         coalesce(ds.total_days, 0)                     as total_days,
         coalesce(ds.completed_days, 0)                 as completed_days,
         ds.last_completed_at
    from cohort co
    join profiles p on p.id = co.user_id
    left join day_stats ds on ds.challenge_id = co.id
   order by ds.completed_days desc nulls last, co.started_at asc;
end;
$$;

grant execute on function cohort_challenge_summary(uuid, uuid) to authenticated;
