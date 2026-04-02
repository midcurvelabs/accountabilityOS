import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

export async function fetchPotLedger(roomId, period) {
  let query = supabase.from('pot_ledger').select('*, profiles(name, avatar)').eq('room_id', roomId);
  if (period) query = query.eq('period', period);
  query = query.order('created_at', { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
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
