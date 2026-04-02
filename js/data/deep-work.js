import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

export async function fetchDeepWork(roomId, opts = {}) {
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;
  let query = supabase.from('deep_work_logs').select('*', { count: 'exact' }).eq('room_id', roomId);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (opts.since) query = query.gte('date', opts.since);
  query = query.order('date', { ascending: false }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  data._pagination = { total: count, limit, offset, hasMore: offset + limit < count };
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
