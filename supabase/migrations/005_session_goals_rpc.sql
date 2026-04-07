-- ============================================================================
-- Fix: Multi-participant session goal attribution
-- Problem: All goals from a multi-person transcript land on the session
--          creator's dashboard because addGoal() hardcodes user_id.
-- Solution: Atomic RPC that creates session + participants + goals + not-to-dos
--           for ALL participants in one transaction, with correct user_id per goal.
-- ============================================================================

-- 1. Add session_id FK to goals and not_to_dos (nullable — manual goals won't have one)
alter table goals add column if not exists session_id uuid references sessions on delete set null;
alter table not_to_dos add column if not exists session_id uuid references sessions on delete set null;

create index if not exists idx_goals_session on goals (session_id) where session_id is not null;
create index if not exists idx_not_to_dos_session on not_to_dos (session_id) where session_id is not null;

-- 2. Atomic RPC: create session + participants + goals + not-to-dos
create or replace function create_session_with_goals(
  p_room_id     uuid,
  p_transcript  text     default null,
  p_summary     text     default null,
  p_participants jsonb   default '[]'::jsonb,
  -- Format: [{"userId": "uuid", "mood": "low|medium|high"}]
  p_goals       jsonb    default '[]'::jsonb,
  -- Format: [{"userId": "uuid", "text": "...", "type": "priority|secondary",
  --           "timeframe": "weekly", "period": "2026-W14", "deadline": null}]
  p_not_to_dos  jsonb    default '[]'::jsonb
  -- Format: [{"userId": "uuid", "text": "...", "period": "2026-W14"}]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session   sessions;
  v_user_id   uuid := auth.uid();
  v_goals_ct  int;
  v_ntd_ct    int;
begin
  -- Auth check
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Room membership check
  if not is_room_member(p_room_id) then
    raise exception 'Not a member of this room';
  end if;

  -- Create session with date = today
  insert into sessions (room_id, date, transcript, session_summary, created_by)
  values (p_room_id, current_date, p_transcript, p_summary, v_user_id)
  returning * into v_session;

  -- Insert participants (only those who are actual room members)
  insert into session_participants (session_id, user_id, mood)
  select v_session.id,
         (p->>'userId')::uuid,
         coalesce((p->>'mood')::mood_level, 'medium')
  from jsonb_array_elements(p_participants) as p
  where (p->>'userId')::uuid in (
    select user_id from room_members where room_id = p_room_id
  );

  -- Insert goals for ALL participants (each with correct user_id)
  with inserted as (
    insert into goals (user_id, room_id, session_id, text, type, timeframe, period, deadline)
    select
      (g->>'userId')::uuid,
      p_room_id,
      v_session.id,
      g->>'text',
      coalesce((g->>'type')::goal_type, 'priority'),
      coalesce((g->>'timeframe')::goal_timeframe, 'weekly'),
      g->>'period',
      case when g->>'deadline' is not null and g->>'deadline' != 'null'
           then (g->>'deadline')::timestamptz
           else null end
    from jsonb_array_elements(p_goals) as g
    where (g->>'userId')::uuid in (
      select user_id from room_members where room_id = p_room_id
    )
    returning id
  )
  select count(*) into v_goals_ct from inserted;

  -- Insert not-to-dos for ALL participants
  with inserted as (
    insert into not_to_dos (user_id, room_id, session_id, text, period)
    select
      (n->>'userId')::uuid,
      p_room_id,
      v_session.id,
      n->>'text',
      n->>'period'
    from jsonb_array_elements(p_not_to_dos) as n
    where (n->>'userId')::uuid in (
      select user_id from room_members where room_id = p_room_id
    )
    returning id
  )
  select count(*) into v_ntd_ct from inserted;

  return jsonb_build_object(
    'id', v_session.id,
    'room_id', v_session.room_id,
    'date', v_session.date,
    'session_summary', v_session.session_summary,
    'created_by', v_session.created_by,
    'created_at', v_session.created_at,
    'goals_created', v_goals_ct,
    'not_to_dos_created', v_ntd_ct
  );
end;
$$;
