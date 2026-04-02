import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

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
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      room_id: roomId,
      transcript: transcript?.substring(0, 10000),
      session_summary: summary,
      created_by: AppState.user.id
    })
    .select()
    .single();
  if (error) throw error;

  if (participants?.length) {
    const rows = participants.map(p => ({
      session_id: session.id,
      user_id: p.userId,
      mood: p.mood || 'medium'
    }));
    await supabase.from('session_participants').insert(rows);
  }
  return session;
}
