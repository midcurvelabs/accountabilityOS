import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

// ============================================================
// Challenge posts — daily 1-line standups under shared challenges
// ============================================================

/**
 * All posts on a single challenge (across all days), most-recent first.
 * Each row joins the author's profile (name + avatar).
 */
export async function fetchPostsForChallenge(challengeId, { limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('challenge_posts')
    .select('*, profiles:user_id(name, avatar)')
    .eq('challenge_id', challengeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * Posts for a given day_number across a set of challenge_ids
 * (the cohort's challenges). Used by the cohort dashboard's "today's check-ins".
 */
export async function fetchPostsForCohortDay(challengeIds, dayNumber) {
  if (!challengeIds || challengeIds.length === 0) return [];
  const { data, error } = await supabase
    .from('challenge_posts')
    .select('*, profiles:user_id(name, avatar)')
    .in('challenge_id', challengeIds)
    .eq('day_number', dayNumber)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Create a post under a challenge for a specific day.
 * RLS enforces user_id = auth.uid() and parent-challenge visibility.
 */
export async function createChallengePost({ challengeId, dayNumber, text, link = null }) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Post text is required');
  const { data, error } = await supabase
    .from('challenge_posts')
    .insert({
      challenge_id: challengeId,
      user_id: AppState.user.id,
      day_number: dayNumber,
      text: trimmed,
      link: link || null,
    })
    .select('*, profiles:user_id(name, avatar)')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChallengePost(postId) {
  const { error } = await supabase
    .from('challenge_posts')
    .delete()
    .eq('id', postId);
  if (error) throw error;
}
