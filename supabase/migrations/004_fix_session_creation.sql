-- ============================================================================
-- Fix: Session creation — RLS + missing date
-- Problems:
--   1. session_participants INSERT policy only allows user_id = auth.uid(),
--      but the session creator needs to add all participants at once.
--   2. createSession() never sets the NOT NULL `date` column.
-- Solution: Atomic RPC that creates session + all participants in one tx.
-- ============================================================================

create or replace function create_session_with_participants(
  p_room_id uuid,
  p_transcript text default null,
  p_summary text default null,
  p_participants jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session sessions;
  v_user_id uuid := auth.uid();
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
  select v_session.id, (p->>'userId')::uuid, coalesce((p->>'mood')::mood_level, 'medium')
  from jsonb_array_elements(p_participants) as p
  where (p->>'userId')::uuid in (
    select user_id from room_members where room_id = p_room_id
  );

  return jsonb_build_object(
    'id', v_session.id,
    'room_id', v_session.room_id,
    'date', v_session.date,
    'session_summary', v_session.session_summary,
    'created_by', v_session.created_by,
    'created_at', v_session.created_at
  );
end;
$$;
