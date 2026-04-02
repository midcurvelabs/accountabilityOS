import { supabase } from '../supabase.js';
import { AppState } from '../state.js';

export async function fetchUserRooms() {
  const { data, error } = await supabase
    .from('room_members')
    .select('room_id, rooms(id, name, invite_code, settings, created_by, created_at)')
    .eq('user_id', AppState.user.id);
  if (error) throw error;
  return data.map(rm => rm.rooms);
}

export async function fetchRoom(roomId) {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single();
  if (error) throw error;

  const { data: members } = await supabase
    .from('room_members')
    .select('user_id, joined_at, profiles(id, name, avatar, role)')
    .eq('room_id', roomId);

  room.members = (members || []).map(m => ({ ...m.profiles, joinedAt: m.joined_at }));
  return room;
}

export async function createRoom(name) {
  const { data: room, error } = await supabase
    .from('rooms')
    .insert({ name, created_by: AppState.user.id })
    .select()
    .single();
  if (error) throw error;

  await supabase.from('room_members').insert({ room_id: room.id, user_id: AppState.user.id });
  return room;
}

export async function joinRoomByCode(code) {
  const { data, error } = await supabase.rpc('join_room_by_code', { code });
  if (error) throw error;
  return data; // room id
}

export async function leaveRoom(roomId) {
  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', AppState.user.id);
  if (error) throw error;
}

export async function updateRoomSettings(roomId, settings) {
  const { error } = await supabase
    .from('rooms')
    .update({ settings })
    .eq('id', roomId);
  if (error) throw error;
}

export async function removeMember(roomId, userId) {
  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) throw error;
}
