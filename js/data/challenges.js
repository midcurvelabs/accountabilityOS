import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

// ============================================================
// Challenges — imported day-by-day programs (e.g. 30x30 plans)
// ============================================================

/**
 * Fetch all challenges visible to the current user (RLS filters: own + room-shared).
 * Each challenge gets `total_days` and `completed_days` counts via embedded select.
 */
export async function fetchChallenges() {
  // Embedded count: PostgREST exposes `challenge_days(count)` to count related rows.
  // We do two embedded counts: total + completed (filtered).
  const { data, error } = await supabase
    .from('challenges')
    .select(`
      *,
      total_days:challenge_days(count),
      completed_days:challenge_days(count),
      room:rooms(id, name)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // The embedded count comes back as `[{ count: N }]`; flatten.
  // For the completed_days filter we need a second pass — Supabase JS doesn't
  // support filtered embedded counts in one query. Do it the simple way: fetch
  // completed counts in a single grouped query.
  const challengeIds = (data || []).map(c => c.id);
  if (challengeIds.length === 0) return [];

  const { data: completedRows, error: cErr } = await supabase
    .from('challenge_days')
    .select('challenge_id')
    .in('challenge_id', challengeIds)
    .eq('completed', true);
  if (cErr) throw cErr;

  const completedMap = {};
  for (const row of completedRows || []) {
    completedMap[row.challenge_id] = (completedMap[row.challenge_id] || 0) + 1;
  }

  return data.map(c => ({
    ...c,
    total_days: c.total_days?.[0]?.count ?? 0,
    completed_days: completedMap[c.id] ?? 0,
  }));
}

/**
 * Fetch a single challenge plus all its days (ordered by day_number).
 */
export async function fetchChallengeWithDays(challengeId) {
  const [challengeRes, daysRes] = await Promise.all([
    supabase.from('challenges').select('*').eq('id', challengeId).single(),
    supabase.from('challenge_days').select('*').eq('challenge_id', challengeId).order('day_number', { ascending: true }),
  ]);
  if (challengeRes.error) throw challengeRes.error;
  if (daysRes.error) throw daysRes.error;
  return { challenge: challengeRes.data, days: daysRes.data || [] };
}

/**
 * Create a new challenge from a 30x30-shaped plan and bulk-insert its days.
 * plan: { weeks: [{ label, days: [{ day, title, desc }] }] }
 * Returns { challenge, days }.
 */
export async function createChallengeFromPlan({ plan, sourceUrl, sourceToken, title, roomId = null }) {
  if (!plan || !Array.isArray(plan.weeks)) throw new Error('Invalid plan shape');

  const { data: challenge, error: cErr } = await supabase
    .from('challenges')
    .insert({
      user_id: AppState.user.id,
      room_id: roomId,
      title: title || 'Untitled challenge',
      source_url: sourceUrl || null,
      source_token: sourceToken || null,
      plan_json: plan,
    })
    .select()
    .single();
  if (cErr) throw cErr;

  // Flatten weeks → days. Don't assume 30; respect whatever the plan has.
  const dayRows = plan.weeks.flatMap(week => (week.days || []).map(d => ({
    challenge_id: challenge.id,
    day_number: d.day,
    title: d.title || `Day ${d.day}`,
    description: d.desc || null,
  })));

  if (dayRows.length === 0) {
    return { challenge, days: [] };
  }

  const { data: days, error: dErr } = await supabase
    .from('challenge_days')
    .insert(dayRows)
    .select();
  if (dErr) throw dErr;

  // Return days ordered by day_number.
  days.sort((a, b) => a.day_number - b.day_number);
  return { challenge, days };
}

/**
 * Toggle a challenge day's completion state.
 * Mirrors goals.toggleGoal() — sets completed_at timestamp on completion.
 */
export async function toggleChallengeDay(dayId, completed) {
  const { data, error } = await supabase
    .from('challenge_days')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', dayId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Update a challenge day's note independently of completion state.
 */
export async function updateChallengeDayNote(dayId, note) {
  const { data, error } = await supabase
    .from('challenge_days')
    .update({ note: note || null })
    .eq('id', dayId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Edit a challenge day's title and/or description.
 * RLS allows the challenge owner to update their own days.
 */
export async function updateChallengeDay(dayId, { title, description }) {
  const patch = {};
  if (title !== undefined)       patch.title       = (title || '').trim() || 'Untitled';
  if (description !== undefined) patch.description = (description || '').trim() || null;
  if (Object.keys(patch).length === 0) return null;
  const { data, error } = await supabase
    .from('challenge_days')
    .update(patch)
    .eq('id', dayId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Share a solo challenge to a room (or unshare with roomId = null).
 * No UI surface in Phase 1, but the function lands now so v2 can flip the bit.
 */
export async function shareChallengeToRoom(challengeId, roomId) {
  const { data, error } = await supabase
    .from('challenges')
    .update({ room_id: roomId })
    .eq('id', challengeId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Delete a challenge (cascades to challenge_days via FK).
 */
export async function deleteChallenge(challengeId) {
  const { error } = await supabase.from('challenges').delete().eq('id', challengeId);
  if (error) throw error;
}

/**
 * Cohort summary for a shared challenge — one row per cohort member with
 * current relative day, total/completed day counts, last activity timestamp.
 * Wraps the cohort_challenge_summary RPC; RLS via is_room_member().
 */
export async function getCohortChallengeSummary(roomId, challengeId) {
  const { data, error } = await supabase.rpc('cohort_challenge_summary', {
    p_room_id: roomId,
    p_challenge_id: challengeId,
  });
  if (error) throw error;
  return data || [];
}
