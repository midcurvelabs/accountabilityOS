-- ============================================================================
-- Challenges — imported day-by-day programs (e.g. 30-day plans from 30x30.fun)
-- Solo by default; room_id nullable so a challenge can be shared to a room later.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Tables
-- --------------------------------------------------------------------------

create table challenges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles on delete cascade,
  room_id      uuid references rooms on delete set null,   -- nullable: solo by default
  title        text not null,
  source_url   text,                                       -- e.g. https://30x30.midcurved.com
  source_token text,                                       -- 30x30 plan UUID (re-import lookup)
  plan_json    jsonb not null,                             -- raw plan for re-render / audit
  started_at   date not null default current_date,
  created_at   timestamptz not null default now()
);

create table challenge_days (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references challenges on delete cascade,
  day_number    int  not null,
  title         text not null,
  description   text,
  completed     boolean not null default false,
  completed_at  timestamptz,
  note          text,
  unique (challenge_id, day_number)
);

-- --------------------------------------------------------------------------
-- 2. Indexes
-- --------------------------------------------------------------------------

create index idx_challenges_user           on challenges (user_id);
create index idx_challenges_room           on challenges (room_id) where room_id is not null;
create index idx_challenges_source_token   on challenges (source_token) where source_token is not null;

create index idx_challenge_days_challenge  on challenge_days (challenge_id);
create index idx_challenge_days_completed  on challenge_days (challenge_id, completed);

-- --------------------------------------------------------------------------
-- 3. Row Level Security
-- --------------------------------------------------------------------------

alter table challenges      enable row level security;
alter table challenge_days  enable row level security;

-- ---- CHALLENGES ----
-- Visible to owner OR (if shared to a room) to members of that room.
create policy "Challenges visible to owner or room members"
  on challenges for select
  to authenticated
  using (
    user_id = auth.uid()
    or (room_id is not null and is_room_member(room_id))
  );

create policy "Users can create own challenges"
  on challenges for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own challenges"
  on challenges for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own challenges"
  on challenges for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- CHALLENGE DAYS ----
-- Read inherits from parent challenge; only the owner can write.
create policy "Challenge days visible if parent visible"
  on challenge_days for select
  to authenticated
  using (
    exists (
      select 1 from challenges c
      where c.id = challenge_days.challenge_id
        and (
          c.user_id = auth.uid()
          or (c.room_id is not null and is_room_member(c.room_id))
        )
    )
  );

create policy "Owner can insert challenge days"
  on challenge_days for insert
  to authenticated
  with check (
    exists (
      select 1 from challenges c
      where c.id = challenge_id and c.user_id = auth.uid()
    )
  );

create policy "Owner can update challenge days"
  on challenge_days for update
  to authenticated
  using (
    exists (
      select 1 from challenges c
      where c.id = challenge_id and c.user_id = auth.uid()
    )
  );

create policy "Owner can delete challenge days"
  on challenge_days for delete
  to authenticated
  using (
    exists (
      select 1 from challenges c
      where c.id = challenge_id and c.user_id = auth.uid()
    )
  );

-- --------------------------------------------------------------------------
-- 4. Realtime
-- --------------------------------------------------------------------------

alter publication supabase_realtime add table challenge_days;
alter publication supabase_realtime add table challenges;
