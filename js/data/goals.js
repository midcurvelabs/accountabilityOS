import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

export async function fetchRoomGoals(roomId, opts = {}) {
  let query = supabase.from('goals').select('*').eq('room_id', roomId);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (opts.timeframe) query = query.eq('timeframe', opts.timeframe);
  if (opts.period) query = query.eq('period', opts.period);
  if (opts.type) query = query.eq('type', opts.type);
  query = query.order('created_at', { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addGoal({ roomId, text, type = 'priority', timeframe = 'weekly', period, parentGoalId = null, deadline = null, visibility = 'public' }) {
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: AppState.user.id,
      room_id: roomId, text, type, timeframe, period,
      parent_goal_id: parentGoalId, deadline, visibility
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function toggleGoal(goalId, completed) {
  const { data, error } = await supabase
    .from('goals')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null
    })
    .eq('id', goalId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(goalId) {
  const { error } = await supabase.from('goals').delete().eq('id', goalId);
  if (error) throw error;
}

export async function fetchNotToDos(roomId, opts = {}) {
  let query = supabase.from('not_to_dos').select('*, violations(*)').eq('room_id', roomId);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (opts.period) query = query.eq('period', opts.period);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function addNotToDo({ roomId, text, period, visibility = 'public' }) {
  const { data, error } = await supabase
    .from('not_to_dos')
    .insert({ user_id: AppState.user.id, room_id: roomId, text, period, visibility })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reportViolation(notToDoId, type = 'self') {
  const { data, error } = await supabase
    .from('violations')
    .insert({ not_to_do_id: notToDoId, reported_by: AppState.user.id, type })
    .select()
    .single();
  if (error) throw error;
  return data;
}
