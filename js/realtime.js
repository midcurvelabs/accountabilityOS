import { supabase } from './supabase.js';

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
    .subscribe();
}

export function unsubscribeAll() {
  if (currentChannel) {
    supabase.removeChannel(currentChannel);
    currentChannel = null;
  }
}
