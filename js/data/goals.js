import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

export async function fetchRoomGoals(roomId, opts = {}) {
  const limit = opts.limit || 100;
  const offset = opts.offset || 0;
  let query = supabase.from('goals').select('*', { count: 'exact' }).eq('room_id', roomId);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (opts.timeframe) query = query.eq('timeframe', opts.timeframe);
  if (opts.period) query = query.eq('period', opts.period);
  if (opts.type) query = query.eq('type', opts.type);
  // sessionId filter: UUID string → eq; explicit null → is null; undefined → no filter.
  if (opts.sessionId === null) query = query.is('session_id', null);
  else if (opts.sessionId) query = query.eq('session_id', opts.sessionId);
  query = query.order('created_at', { ascending: true }).range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  // Attach pagination metadata
  data._pagination = { total: count, limit, offset, hasMore: offset + limit < count };
  return data;
}

/**
 * Move goals to a different session (carry-forward to a new epoch).
 * Also clears `completed` state optionally — default keeps state so a goal
 * carried as "still in progress" remains uncompleted.
 */
export async function carryForwardGoals(goalIds, newSessionId) {
  if (!goalIds?.length) return [];
  const { data, error } = await supabase
    .from('goals')
    .update({ session_id: newSessionId })
    .in('id', goalIds)
    .select();
  if (error) throw error;
  return data;
}

export async function addGoal({ roomId, text, type = 'priority', timeframe = 'weekly', period, parentGoalId = null, deadline = null, visibility = 'public', targetCount = null, sessionId = null }) {
  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: AppState.user.id,
      room_id: roomId, text, type, timeframe, period,
      parent_goal_id: parentGoalId, deadline, visibility,
      target_count: targetCount || null,
      session_id: sessionId || null
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

export async function incrementGoal(goalId, delta = 1) {
  const { data: goal, error: fetchErr } = await supabase
    .from('goals')
    .select('current_count, target_count')
    .eq('id', goalId)
    .single();
  if (fetchErr) throw fetchErr;

  const newCount = Math.max(0, Math.min(goal.current_count + delta, goal.target_count));
  const completed = newCount >= goal.target_count;

  const { data, error } = await supabase
    .from('goals')
    .update({
      current_count: newCount,
      completed,
      completed_at: completed ? new Date().toISOString() : null
    })
    .eq('id', goalId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateGoal(goalId, updates) {
  const { data, error } = await supabase
    .from('goals').update(updates).eq('id', goalId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteGoal(goalId) {
  const { error } = await supabase.from('goals').delete().eq('id', goalId);
  if (error) throw error;
}

export async function fetchNotToDos(roomId, opts = {}) {
  const limit = opts.limit || 50;
  const offset = opts.offset || 0;
  let query = supabase.from('not_to_dos').select('*, violations(*)', { count: 'exact' }).eq('room_id', roomId);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (opts.period) query = query.eq('period', opts.period);
  query = query.range(offset, offset + limit - 1);
  const { data, error, count } = await query;
  if (error) throw error;
  data._pagination = { total: count, limit, offset, hasMore: offset + limit < count };
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

export async function updateNotToDo(notToDoId, updates) {
  const { data, error } = await supabase
    .from('not_to_dos').update(updates).eq('id', notToDoId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteNotToDo(notToDoId) {
  const { error } = await supabase.from('not_to_dos').delete().eq('id', notToDoId);
  if (error) throw error;
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
