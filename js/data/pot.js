import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

export async function fetchPotLedger(roomId, period, opts = {}) {
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;
  let query = supabase.from('pot_ledger').select('*, profiles(name, avatar)', { count: 'exact' }).eq('room_id', roomId);
  if (period) query = query.eq('period', period);
  query = query.order('created_at', { ascending: true }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  data._pagination = { total: count, limit, offset, hasMore: offset + limit < count };
  return data;
}

export async function deposit({ roomId, amount, period }) {
  const { data, error } = await supabase
    .from('pot_ledger')
    .insert({
      room_id: roomId,
      user_id: AppState.user.id,
      type: 'deposit',
      amount,
      period
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
