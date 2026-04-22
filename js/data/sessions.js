import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

/**
 * Fetch the most recent session for a room. Returns null if none exist yet
 * (e.g. rooms that have never had a transcript uploaded or a manual
 * "Start new week" press).
 */
export async function fetchLatestSession(roomId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('room_id', roomId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Create an "empty" session — no transcript, no AI analysis.
 * Used by the manual "Start new week" button to close the current epoch
 * and open a new one on demand (e.g. weeks where sessions happen on Tuesday,
 * not Monday).
 */
export async function createEmptySession({ roomId, summary = null }) {
  const userId = AppState.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      room_id: roomId,
      date: today,
      session_summary: summary,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

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
