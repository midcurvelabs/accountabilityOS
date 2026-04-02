import { supabase } from '../supabase.js';

// --------------------------------------------------------------------------
// Server-side leaderboard (calls PostgreSQL function)
// --------------------------------------------------------------------------
export async function fetchLeaderboard(roomId, period = null) {
  const { data, error } = await supabase.rpc('get_room_leaderboard', {
    p_room_id: roomId,
    p_period: period,
  });
  if (error) throw error;
  // Sort by points descending
  return (data || []).sort((a, b) => b.points - a.points);
}

export async function fetchUserStats(userId, roomId, period = null) {
  const { data, error } = await supabase.rpc('calculate_user_points', {
    p_user_id: userId,
    p_room_id: roomId,
    p_period: period,
  });
  if (error) throw error;
  return data;
}

// --------------------------------------------------------------------------
// Client-side fallbacks (used when DB functions aren't deployed yet)
// --------------------------------------------------------------------------
const DEFAULT_CONFIG = {
  showUp: 10, completeGoal: 25, completeSecondary: 10,
  maintainNotToDo: 5, peerVoteGood: 15, peerVoteMeh: 7,
  streakBonus: 5, streakMilestone: 50
};

export function calculatePoints(goals, sessions, deepWork, violations, config = DEFAULT_CONFIG) {
  let pts = 0;
  const completed = goals.filter(g => g.completed);
  pts += completed.filter(g => g.type === 'priority').length * config.completeGoal;
  pts += completed.filter(g => g.type === 'secondary').length * config.completeSecondary;
  pts += (sessions || []).length * config.showUp;
  pts -= (violations || []).length * config.maintainNotToDo;
  return Math.max(0, pts);
}

export function calculateStreak(sessionDates) {
  if (!sessionDates?.length) return 0;
  const sorted = [...sessionDates].sort((a, b) => new Date(b) - new Date(a));
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = (new Date(sorted[i - 1]) - new Date(sorted[i])) / (1000 * 60 * 60 * 24);
    if (diff <= 7) streak++;
    else break;
  }
  return streak;
}

export function calculateCompletionRate(goals) {
  if (!goals.length) return 0;
  return goals.filter(g => g.completed).length / goals.length;
}
