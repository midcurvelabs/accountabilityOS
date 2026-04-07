import { supabase } from '../supabase.js';

export async function fetchRoomSessions(roomId, opts = {}) {
  const limit = opts.limit || 20;
  const offset = opts.offset || 0;
  const { data, error, count } = await supabase
    .from('sessions')
    .select('*, session_participants(user_id, mood, profiles(name, avatar))', { count: 'exact' })
    .eq('room_id', roomId)
    .order('date', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  data._pagination = { total: count, limit, offset, hasMore: offset + limit < count };
  return data;
}

export async function createSession({ roomId, transcript, summary, participants }) {
  const { data, error } = await supabase.rpc('create_session_with_participants', {
    p_room_id: roomId,
    p_transcript: transcript?.substring(0, 10000) || null,
    p_summary: summary || null,
    p_participants: participants || []
  });
  if (error) throw error;
  return data;
}

export async function createSessionWithGoals({ roomId, transcript, summary, participants, goals, notToDos }) {
  const { data, error } = await supabase.rpc('create_session_with_goals', {
    p_room_id: roomId,
    p_transcript: transcript?.substring(0, 10000) || null,
    p_summary: summary || null,
    p_participants: participants || [],
    p_goals: goals || [],
    p_not_to_dos: notToDos || []
  });
  if (error) throw error;
  return data;
}
