import { supabase } from '../supabase.js';

export async function fetchActivityFeed(roomId, limit = 20) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*, profiles(name, avatar)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

const EVENT_TEMPLATES = {
  goal_completed: (a) => `completed "${a.metadata.goal_text}"`,
  goal_added:     (a) => `set a new ${a.metadata.goal_type} goal`,
  deep_work:      (a) => `logged ${a.metadata.hours}h of deep work`,
  session_created:(a) => `started a new session`,
  violation:      (a) => `broke "${a.metadata.not_to_do_text}" ${a.metadata.type === 'self' ? '(self-reported)' : ''}`,
  member_joined:  (a) => `joined the room`,
};

export function formatActivity(activity) {
  const formatter = EVENT_TEMPLATES[activity.event_type];
  const text = formatter ? formatter(activity) : activity.event_type;
  const name = activity.profiles?.name || 'Someone';
  const avatar = activity.profiles?.avatar || '👤';
  const ago = timeAgo(activity.created_at);
  return { name, avatar, text, ago, type: activity.event_type };
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
