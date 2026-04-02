import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

export async function fetchDeepWork(roomId, opts = {}) {
  let query = supabase.from('deep_work_logs').select('*').eq('room_id', roomId);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (opts.since) query = query.gte('date', opts.since);
  query = query.order('date', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function logDeepWork({ roomId, date, hours, note }) {
  const { data, error } = await supabase
    .from('deep_work_logs')
    .insert({
      user_id: AppState.user.id,
      room_id: roomId,
      date: date || new Date().toISOString().split('T')[0],
      hours, note
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
