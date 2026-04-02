import { supabase } from './supabase.js';
import { toast } from './components.js';
import { AppState } from './state.js';
import { formatActivity } from './data/activity.js';

let currentChannel = null;

export function subscribeToRoom(roomId, handlers = {}) {
  unsubscribeAll();
  currentChannel = supabase
    .channel(`room:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter: `room_id=eq.${roomId}` },
      payload => handlers.onGoalChange?.(payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
      payload => handlers.onMemberChange?.(payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'deep_work_logs', filter: `room_id=eq.${roomId}` },
      payload => handlers.onDeepWorkChange?.(payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'not_to_dos', filter: `room_id=eq.${roomId}` },
      payload => handlers.onNotToDoChange?.(payload))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'violations' },
      payload => handlers.onViolation?.(payload))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pot_ledger', filter: `room_id=eq.${roomId}` },
      payload => handlers.onPotChange?.(payload))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log', filter: `room_id=eq.${roomId}` },
      payload => {
        // Show toast for activity from OTHER users
        const activity = payload.new;
        if (activity && activity.user_id !== AppState.user?.id) {
          const formatted = formatActivity({ ...activity, profiles: null });
          // We don't have profile data in the payload, so just show event
          showActivityToast(activity);
        }
        handlers.onActivity?.(payload);
      })
    .subscribe();
}

async function showActivityToast(activity) {
  // Fetch the user's profile for the toast
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, avatar')
    .eq('id', activity.user_id)
    .single();

  const name = profile?.name || 'Someone';
  const avatar = profile?.avatar || '👤';
  const formatted = formatActivity({ ...activity, profiles: profile });
  toast(`${avatar} ${name} ${formatted.text}`, 'info');
}

export function unsubscribeAll() {
  if (currentChannel) {
    supabase.removeChannel(currentChannel);
    currentChannel = null;
  }
}
