-- ============================================================================
-- Accountability Tracker — Initial Schema
-- Friends join rooms, set goals, track deep work, and hold each other honest.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. Extensions
-- --------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- --------------------------------------------------------------------------
-- 1. Custom ENUM types
-- --------------------------------------------------------------------------
create type user_role        as enum ('admin', 'member');
create type goal_type        as enum ('priority', 'secondary');
create type goal_timeframe   as enum ('weekly', 'monthly', 'quarterly');
create type goal_visibility  as enum ('public', 'anonymous');
create type violation_type   as enum ('self', 'peer');
create type mood_level       as enum ('low', 'medium', 'high');
create type ledger_entry     as enum ('deposit', 'payout');

-- --------------------------------------------------------------------------
-- 2. Tables
-- --------------------------------------------------------------------------

-- Profiles — extends auth.users
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null,
  avatar     text not null default '👤',
  role       user_role not null default 'member',
  created_at timestamptz not null default now()
);

-- Rooms — accountability groups
create table rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references profiles on delete cascade,
  invite_code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  settings    jsonb not null default '{
    "sessionFrequency": "weekly",
    "publicShame": false,
    "shameThresholds": { "goals": 50, "deepWork": 10 },
    "potEnabled": false,
    "potAmountPerPeriod": 0,
    "potPeriod": "weekly",
    "potCompletionThreshold": 80
  }'::jsonb,
  created_at  timestamptz not null default now()
);

-- Room members — many-to-many between profiles and rooms
create table room_members (
  room_id   uuid not null references rooms on delete cascade,
  user_id   uuid not null references profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Goals — what members commit to
create table goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles on delete cascade,
  room_id        uuid not null references rooms on delete cascade,
  text           text not null,
  type           goal_type not null default 'priority',
  timeframe      goal_timeframe not null default 'weekly',
  period         text not null,               -- e.g. '2026-W14', '2026-04', '2026-Q2'
  parent_goal_id uuid references goals on delete set null,
  deadline       timestamptz,
  completed      boolean not null default false,
  completed_at   timestamptz,
  visibility     goal_visibility not null default 'public',
  outcome        text,                        -- reflection after completion / failure
  created_at     timestamptz not null default now()
);

-- Not-to-dos — habits members commit to avoiding
create table not_to_dos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles on delete cascade,
  room_id    uuid not null references rooms on delete cascade,
  text       text not null,
  visibility goal_visibility not null default 'public',
  period     text not null,
  created_at timestamptz not null default now()
);

-- Violations — when someone breaks a not-to-do
create table violations (
  id            uuid primary key default gen_random_uuid(),
  not_to_do_id  uuid not null references not_to_dos on delete cascade,
  reported_by   uuid not null references profiles on delete cascade,
  type          violation_type not null default 'self',
  created_at    timestamptz not null default now()
);

-- Deep work logs — daily hours tracked per member per room
create table deep_work_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles on delete cascade,
  room_id    uuid not null references rooms on delete cascade,
  date       date not null,
  hours      numeric(4,1) not null check (hours >= 0),
  note       text,
  created_at timestamptz not null default now()
);

-- Sessions — group check-in records
create table sessions (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references rooms on delete cascade,
  date            date not null,
  transcript      text,
  session_summary text,
  created_by      uuid not null references profiles on delete cascade,
  created_at      timestamptz not null default now()
);

-- Session participants — who attended + mood
create table session_participants (
  session_id uuid not null references sessions on delete cascade,
  user_id    uuid not null references profiles on delete cascade,
  mood       mood_level,
  primary key (session_id, user_id)
);

-- Pot ledger — money-in / money-out for accountability pots
create table pot_ledger (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms on delete cascade,
  user_id    uuid not null references profiles on delete cascade,
  type       ledger_entry not null,
  amount     numeric(10,2) not null check (amount > 0),
  period     text not null,
  note       text,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 3. Indexes
-- --------------------------------------------------------------------------

-- Goals: query by room + period (the main dashboard query)
create index idx_goals_room_period       on goals (room_id, period);
create index idx_goals_user_room         on goals (user_id, room_id);
create index idx_goals_parent            on goals (parent_goal_id) where parent_goal_id is not null;

-- Not-to-dos & violations
create index idx_not_to_dos_room_period  on not_to_dos (room_id, period);
create index idx_violations_not_to_do    on violations (not_to_do_id);

-- Deep work
create index idx_deep_work_room_date     on deep_work_logs (room_id, date);
create index idx_deep_work_user_room     on deep_work_logs (user_id, room_id);

-- Sessions
create index idx_sessions_room_date      on sessions (room_id, date);

-- Pot ledger
create index idx_pot_ledger_room_period  on pot_ledger (room_id, period);
create index idx_pot_ledger_user         on pot_ledger (user_id);

-- Room members (reverse lookup: "which rooms is this user in?")
create index idx_room_members_user       on room_members (user_id);

-- --------------------------------------------------------------------------
-- 4. Row Level Security
-- --------------------------------------------------------------------------

alter table profiles           enable row level security;
alter table rooms              enable row level security;
alter table room_members       enable row level security;
alter table goals              enable row level security;
alter table not_to_dos         enable row level security;
alter table violations         enable row level security;
alter table deep_work_logs     enable row level security;
alter table sessions           enable row level security;
alter table session_participants enable row level security;
alter table pot_ledger         enable row level security;

-- Helper: check if the current user is a member of the given room
create or replace function is_room_member(rid uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from room_members
    where room_id = rid and user_id = auth.uid()
  );
$$;

-- Helper: check if the current user created the given room
create or replace function is_room_creator(rid uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from rooms
    where id = rid and created_by = auth.uid()
  );
$$;

-- ---- PROFILES ----
create policy "Profiles are viewable by authenticated users"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- ROOMS ----
create policy "Rooms are viewable by members"
  on rooms for select
  to authenticated
  using (is_room_member(id));

create policy "Authenticated users can create rooms"
  on rooms for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Room creator can update room"
  on rooms for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---- ROOM MEMBERS ----
create policy "Room members visible to fellow members"
  on room_members for select
  to authenticated
  using (is_room_member(room_id));

create policy "Users can join rooms"
  on room_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can leave rooms"
  on room_members for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Room creator can remove members"
  on room_members for delete
  to authenticated
  using (is_room_creator(room_id));

-- ---- GOALS ----
create policy "Goals visible to room members"
  on goals for select
  to authenticated
  using (is_room_member(room_id));

create policy "Users can create own goals"
  on goals for insert
  to authenticated
  with check (user_id = auth.uid() and is_room_member(room_id));

create policy "Users can update own goals"
  on goals for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own goals"
  on goals for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- NOT-TO-DOS ----
create policy "Not-to-dos visible to room members"
  on not_to_dos for select
  to authenticated
  using (is_room_member(room_id));

create policy "Users can create own not-to-dos"
  on not_to_dos for insert
  to authenticated
  with check (user_id = auth.uid() and is_room_member(room_id));

create policy "Users can update own not-to-dos"
  on not_to_dos for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own not-to-dos"
  on not_to_dos for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- VIOLATIONS ----
create policy "Violations visible to room members"
  on violations for select
  to authenticated
  using (
    exists (
      select 1 from not_to_dos ntd
      where ntd.id = violations.not_to_do_id
        and is_room_member(ntd.room_id)
    )
  );

create policy "Users can report violations"
  on violations for insert
  to authenticated
  with check (reported_by = auth.uid());

create policy "Users can delete own violations"
  on violations for delete
  to authenticated
  using (reported_by = auth.uid());

-- ---- DEEP WORK LOGS ----
create policy "Deep work logs visible to room members"
  on deep_work_logs for select
  to authenticated
  using (is_room_member(room_id));

create policy "Users can create own deep work logs"
  on deep_work_logs for insert
  to authenticated
  with check (user_id = auth.uid() and is_room_member(room_id));

create policy "Users can update own deep work logs"
  on deep_work_logs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own deep work logs"
  on deep_work_logs for delete
  to authenticated
  using (user_id = auth.uid());

-- ---- SESSIONS ----
create policy "Sessions visible to room members"
  on sessions for select
  to authenticated
  using (is_room_member(room_id));

create policy "Members can create sessions"
  on sessions for insert
  to authenticated
  with check (created_by = auth.uid() and is_room_member(room_id));

create policy "Session creator can update"
  on sessions for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---- SESSION PARTICIPANTS ----
create policy "Session participants visible to room members"
  on session_participants for select
  to authenticated
  using (
    exists (
      select 1 from sessions s
      where s.id = session_participants.session_id
        and is_room_member(s.room_id)
    )
  );

create policy "Users can add themselves as participants"
  on session_participants for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own participation"
  on session_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- POT LEDGER ----
create policy "Pot ledger visible to room members"
  on pot_ledger for select
  to authenticated
  using (is_room_member(room_id));

create policy "Users can create own pot entries"
  on pot_ledger for insert
  to authenticated
  with check (user_id = auth.uid() and is_room_member(room_id));

-- --------------------------------------------------------------------------
-- 5. Functions & Triggers
-- --------------------------------------------------------------------------

-- Auto-create a profile row when a new user signs up via Supabase Auth
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- Join a room by invite code (security definer bypasses RLS)
create or replace function join_room_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_id uuid;
begin
  -- Look up room by invite code (case-insensitive match)
  select id into v_room_id
  from rooms
  where invite_code = upper(trim(code));

  if v_room_id is null then
    raise exception 'Invalid invite code';
  end if;

  -- Insert membership (ignore if already a member)
  insert into room_members (room_id, user_id)
  values (v_room_id, auth.uid())
  on conflict (room_id, user_id) do nothing;

  return v_room_id;
end;
$$;

-- --------------------------------------------------------------------------
-- 6. Realtime
-- --------------------------------------------------------------------------
-- Enable Supabase Realtime for tables that need live updates

alter publication supabase_realtime add table goals;
alter publication supabase_realtime add table room_members;
alter publication supabase_realtime add table deep_work_logs;
alter publication supabase_realtime add table not_to_dos;
alter publication supabase_realtime add table violations;
alter publication supabase_realtime add table pot_ledger;
