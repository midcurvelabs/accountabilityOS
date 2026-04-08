-- ============================================================================
-- Counter Goals: progress tracking with numeric targets
-- Adds target_count and current_count to goals table, enabling goals like
-- "make 6 videos" where users tick off each one (1/6, 2/6... 6/6).
-- When target_count IS NULL → boolean goal (existing behavior).
-- When target_count IS NOT NULL → counter goal with incremental progress.
-- ============================================================================

-- 1. Add counter columns to goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS target_count integer CHECK (target_count > 0);
ALTER TABLE goals ADD COLUMN IF NOT EXISTS current_count integer NOT NULL DEFAULT 0 CHECK (current_count >= 0);

-- 2. Update create_session_with_goals RPC to support targetCount from transcripts
CREATE OR REPLACE FUNCTION create_session_with_goals(
  p_room_id     uuid,
  p_transcript  text     DEFAULT NULL,
  p_summary     text     DEFAULT NULL,
  p_participants jsonb   DEFAULT '[]'::jsonb,
  p_goals       jsonb    DEFAULT '[]'::jsonb,
  p_not_to_dos  jsonb    DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session   sessions;
  v_user_id   uuid := auth.uid();
  v_goals_ct  int;
  v_ntd_ct    int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT is_room_member(p_room_id) THEN
    RAISE EXCEPTION 'Not a member of this room';
  END IF;

  INSERT INTO sessions (room_id, date, transcript, session_summary, created_by)
  VALUES (p_room_id, current_date, p_transcript, p_summary, v_user_id)
  RETURNING * INTO v_session;

  INSERT INTO session_participants (session_id, user_id, mood)
  SELECT v_session.id,
         (p->>'userId')::uuid,
         coalesce((p->>'mood')::mood_level, 'medium')
  FROM jsonb_array_elements(p_participants) AS p
  WHERE (p->>'userId')::uuid IN (
    SELECT user_id FROM room_members WHERE room_id = p_room_id
  );

  WITH inserted AS (
    INSERT INTO goals (user_id, room_id, session_id, text, type, timeframe, period, deadline, target_count)
    SELECT
      (g->>'userId')::uuid,
      p_room_id,
      v_session.id,
      g->>'text',
      coalesce((g->>'type')::goal_type, 'priority'),
      coalesce((g->>'timeframe')::goal_timeframe, 'weekly'),
      g->>'period',
      CASE WHEN g->>'deadline' IS NOT NULL AND g->>'deadline' != 'null'
           THEN (g->>'deadline')::timestamptz
           ELSE NULL END,
      CASE WHEN g->>'targetCount' IS NOT NULL AND g->>'targetCount' != 'null'
           THEN (g->>'targetCount')::integer
           ELSE NULL END
    FROM jsonb_array_elements(p_goals) AS g
    WHERE (g->>'userId')::uuid IN (
      SELECT user_id FROM room_members WHERE room_id = p_room_id
    )
    RETURNING id
  )
  SELECT count(*) INTO v_goals_ct FROM inserted;

  WITH inserted AS (
    INSERT INTO not_to_dos (user_id, room_id, session_id, text, period)
    SELECT
      (n->>'userId')::uuid,
      p_room_id,
      v_session.id,
      n->>'text',
      n->>'period'
    FROM jsonb_array_elements(p_not_to_dos) AS n
    WHERE (n->>'userId')::uuid IN (
      SELECT user_id FROM room_members WHERE room_id = p_room_id
    )
    RETURNING id
  )
  SELECT count(*) INTO v_ntd_ct FROM inserted;

  RETURN jsonb_build_object(
    'id', v_session.id,
    'room_id', v_session.room_id,
    'date', v_session.date,
    'session_summary', v_session.session_summary,
    'created_by', v_session.created_by,
    'created_at', v_session.created_at,
    'goals_created', v_goals_ct,
    'not_to_dos_created', v_ntd_ct
  );
END;
$$;
