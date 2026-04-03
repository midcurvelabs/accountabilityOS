-- ============================================================================
-- Fix: Room creation RLS bug
-- Problem: After INSERT into rooms, the .select() fails because the SELECT
-- policy requires is_room_member(id) — but the user isn't in room_members yet.
-- Solution:
--   1. Add SELECT policy so creators can always see their own rooms
--   2. Add atomic RPC that creates room + adds creator as member in one tx
-- ============================================================================

-- 1. Allow room creators to always see their own rooms
create policy "Room creator can view own rooms"
  on rooms for select
  to authenticated
  using (created_by = auth.uid());

-- 2. Atomic room creation: creates room + inserts creator as first member
--    Uses security definer to bypass RLS (runs as postgres, not the user)
create or replace function create_room_with_membership(room_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room rooms;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Ensure profile exists (safety net if trigger didn't fire)
  insert into profiles (id, name)
  values (v_user_id, 'User')
  on conflict (id) do nothing;

  -- Create room
  insert into rooms (name, created_by)
  values (room_name, v_user_id)
  returning * into v_room;

  -- Add creator as first member
  insert into room_members (room_id, user_id)
  values (v_room.id, v_user_id);

  return jsonb_build_object(
    'id', v_room.id,
    'name', v_room.name,
    'created_by', v_room.created_by,
    'invite_code', v_room.invite_code,
    'settings', v_room.settings,
    'created_at', v_room.created_at
  );
end;
$$;
