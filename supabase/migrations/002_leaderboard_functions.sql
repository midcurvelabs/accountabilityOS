-- ============================================================================
-- Leaderboard & Points — Server-side calculation
-- Replaces client-side calculatePoints() with efficient DB functions
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Calculate points for a single user in a room for a given period
-- --------------------------------------------------------------------------
create or replace function calculate_user_points(
  p_user_id uuid,
  p_room_id uuid,
  p_period  text default null,
  p_config  jsonb default '{
    "showUp": 10, "completeGoal": 25, "completeSecondary": 10,
    "violationPenalty": 5, "peerVoteGood": 15, "peerVoteMeh": 7,
    "streakBonus": 5, "streakMilestone": 50
  }'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  v_pts          int := 0;
  v_priority     int;
  v_secondary    int;
  v_sessions     int;
  v_violations   int;
  v_total_goals  int;
  v_completed    int;
  v_deep_hours   numeric;
  v_streak       int;
begin
  -- Completed priority goals
  select count(*) into v_priority
  from goals
  where user_id = p_user_id and room_id = p_room_id
    and type = 'priority' and completed = true
    and (p_period is null or period = p_period);

  -- Completed secondary goals
  select count(*) into v_secondary
  from goals
  where user_id = p_user_id and room_id = p_room_id
    and type = 'secondary' and completed = true
    and (p_period is null or period = p_period);

  -- Total goals + completed (for completion rate)
  select count(*), count(*) filter (where completed)
  into v_total_goals, v_completed
  from goals
  where user_id = p_user_id and room_id = p_room_id
    and (p_period is null or period = p_period);

  -- Sessions attended
  select count(*) into v_sessions
  from session_participants sp
  join sessions s on s.id = sp.session_id
  where sp.user_id = p_user_id and s.room_id = p_room_id;

  -- Violations (NOT-to-do breaches)
  select count(*) into v_violations
  from violations v
  join not_to_dos ntd on ntd.id = v.not_to_do_id
  where ntd.user_id = p_user_id and ntd.room_id = p_room_id
    and (p_period is null or ntd.period = p_period);

  -- Deep work hours
  select coalesce(sum(hours), 0) into v_deep_hours
  from deep_work_logs
  where user_id = p_user_id and room_id = p_room_id;

  -- Calculate points
  v_pts := v_priority * (p_config->>'completeGoal')::int
         + v_secondary * (p_config->>'completeSecondary')::int
         + v_sessions * (p_config->>'showUp')::int
         - v_violations * (p_config->>'violationPenalty')::int;

  if v_pts < 0 then v_pts := 0; end if;

  -- Calculate streak (consecutive weeks with sessions)
  select count(*) into v_streak
  from (
    select date, date - (row_number() over (order by date))::int * interval '7 days' as grp
    from (
      select distinct s.date
      from sessions s
      join session_participants sp on sp.session_id = s.id
      where sp.user_id = p_user_id and s.room_id = p_room_id
      order by s.date desc
    ) dates
  ) grouped;

  return jsonb_build_object(
    'points', v_pts,
    'priorityCompleted', v_priority,
    'secondaryCompleted', v_secondary,
    'totalGoals', v_total_goals,
    'completedGoals', v_completed,
    'completionRate', case when v_total_goals > 0 then round(v_completed::numeric / v_total_goals * 100) else 0 end,
    'sessionsAttended', v_sessions,
    'violations', v_violations,
    'deepWorkHours', v_deep_hours,
    'streak', v_streak
  );
end;
$$;

-- --------------------------------------------------------------------------
-- 2. Room leaderboard — all members' stats in one query
-- --------------------------------------------------------------------------
create or replace function get_room_leaderboard(
  p_room_id uuid,
  p_period  text default null
)
returns table (
  user_id         uuid,
  name            text,
  avatar          text,
  points          int,
  completion_rate int,
  streak          int,
  deep_work_hours numeric,
  violations      int,
  sessions        int
)
language plpgsql
stable
security definer
as $$
declare
  v_member record;
  v_stats  jsonb;
begin
  for v_member in
    select rm.user_id, p.name, p.avatar
    from room_members rm
    join profiles p on p.id = rm.user_id
    where rm.room_id = p_room_id
  loop
    v_stats := calculate_user_points(v_member.user_id, p_room_id, p_period);

    user_id         := v_member.user_id;
    name            := v_member.name;
    avatar          := v_member.avatar;
    points          := (v_stats->>'points')::int;
    completion_rate := (v_stats->>'completionRate')::int;
    streak          := (v_stats->>'streak')::int;
    deep_work_hours := (v_stats->>'deepWorkHours')::numeric;
    violations      := (v_stats->>'violations')::int;
    sessions        := (v_stats->>'sessionsAttended')::int;

    return next;
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- 3. Activity log table — tracks events for the activity feed
-- --------------------------------------------------------------------------
create table if not exists activity_log (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms on delete cascade,
  user_id    uuid not null references profiles on delete cascade,
  event_type text not null, -- 'goal_completed', 'goal_added', 'deep_work', 'session_created', 'violation', 'member_joined'
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index idx_activity_room_created on activity_log (room_id, created_at desc);

alter table activity_log enable row level security;

create policy "Activity visible to room members"
  on activity_log for select
  to authenticated
  using (is_room_member(room_id));

create policy "System can insert activity"
  on activity_log for insert
  to authenticated
  with check (is_room_member(room_id));

-- Enable realtime on activity log
alter publication supabase_realtime add table activity_log;

-- --------------------------------------------------------------------------
-- 4. Triggers to auto-log activity
-- --------------------------------------------------------------------------

-- Goal completed trigger
create or replace function log_goal_activity()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Goal was just completed
  if new.completed = true and (old.completed = false or old.completed is null) then
    insert into activity_log (room_id, user_id, event_type, metadata)
    values (new.room_id, new.user_id, 'goal_completed', jsonb_build_object(
      'goal_text', new.text,
      'goal_type', new.type
    ));
  end if;

  -- New goal added (on INSERT only)
  if TG_OP = 'INSERT' then
    insert into activity_log (room_id, user_id, event_type, metadata)
    values (new.room_id, new.user_id, 'goal_added', jsonb_build_object(
      'goal_text', new.text,
      'goal_type', new.type
    ));
  end if;

  return new;
end;
$$;

create trigger on_goal_change
  after insert or update on goals
  for each row
  execute function log_goal_activity();

-- Deep work trigger
create or replace function log_deep_work_activity()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into activity_log (room_id, user_id, event_type, metadata)
  values (new.room_id, new.user_id, 'deep_work', jsonb_build_object(
    'hours', new.hours,
    'note', coalesce(new.note, '')
  ));
  return new;
end;
$$;

create trigger on_deep_work_logged
  after insert on deep_work_logs
  for each row
  execute function log_deep_work_activity();

-- Member joined trigger
create or replace function log_member_joined_activity()
returns trigger
language plpgsql
security definer
as $$
declare
  v_name text;
begin
  select name into v_name from profiles where id = new.user_id;
  insert into activity_log (room_id, user_id, event_type, metadata)
  values (new.room_id, new.user_id, 'member_joined', jsonb_build_object(
    'name', coalesce(v_name, 'Someone')
  ));
  return new;
end;
$$;

create trigger on_member_joined
  after insert on room_members
  for each row
  execute function log_member_joined_activity();

-- Violation trigger
create or replace function log_violation_activity()
returns trigger
language plpgsql
security definer
as $$
declare
  v_ntd record;
begin
  select ntd.room_id, ntd.user_id, ntd.text
  into v_ntd
  from not_to_dos ntd
  where ntd.id = new.not_to_do_id;

  insert into activity_log (room_id, user_id, event_type, metadata)
  values (v_ntd.room_id, v_ntd.user_id, 'violation', jsonb_build_object(
    'not_to_do_text', v_ntd.text,
    'type', new.type
  ));
  return new;
end;
$$;

create trigger on_violation_reported
  after insert on violations
  for each row
  execute function log_violation_activity();
