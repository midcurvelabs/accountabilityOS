import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { toast, showModal, hideModal, progressRing } from '../components.js';
import { fetchUserRooms, createRoom, joinRoomByCode } from '../data/rooms.js';
import { fetchRoomGoals } from '../data/goals.js';
import { getCurrentPeriod } from '../helpers.js';

export async function renderRoomSelector() {
  if (!AppState.user) return navigate('login');
  const app = document.getElementById('app');
  app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;

  try {
    const rooms = await fetchUserRooms();

    // If user has exactly 1 room, go straight to it
    if (rooms.length === 1) {
      AppState.currentRoom = rooms[0].id;
      return navigate(`room/${rooms[0].id}`);
    }

    app.innerHTML = `
      <div class="max-w-4xl mx-auto animate-fade-in-up">
        <div class="flex items-center justify-between mb-6">
          <h1 class="${t('heading')} text-2xl font-bold">Your Rooms</h1>
          <div class="flex gap-2">
            <button class="${t('button')} px-4 py-2 text-sm" onclick="window.__showCreateRoom()">+ Create Room</button>
            <button class="${t('buttonSecondary')} px-4 py-2 text-sm" onclick="window.__showJoinRoom()">🔑 Join Room</button>
          </div>
        </div>
        ${rooms.length === 0 ? `
          <div class="${t('card')} p-12 text-center">
            <div class="text-5xl mb-4">🏠</div>
            <h2 class="${t('heading')} text-xl font-bold mb-2">No rooms yet</h2>
            <p class="${t('muted')} mb-6">Create a room and invite your accountability partners, or join an existing one.</p>
            <div class="flex gap-3 justify-center">
              <button class="${t('button')} px-6 py-3" onclick="window.__showCreateRoom()">Create Room</button>
              <button class="${t('buttonSecondary')} px-6 py-3" onclick="window.__showJoinRoom()">Join Room</button>
            </div>
          </div>
        ` : `
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" id="rooms-grid"></div>
        `}
      </div>`;

    // Load room stats asynchronously
    if (rooms.length > 0) {
      const grid = document.getElementById('rooms-grid');
      grid.innerHTML = rooms.map(room => `
        <button onclick="window.__navRoom('${room.id}')" class="${t('card')} ${t('cardHover')} p-5 text-left transition-all cursor-pointer w-full">
          <div class="flex items-center justify-between mb-3">
            <h3 class="${t('heading')} font-bold text-lg">${room.name}</h3>
          </div>
          <div class="${t('muted')} text-xs ${t('mono')}">
            🔑 ${room.invite_code}
          </div>
        </button>
      `).join('');
    }
  } catch (err) {
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${err.message}</div>`;
  }
}

window.__showCreateRoom = () => {
  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-4">Create Room</h2>
    <div class="mb-4">
      <label class="text-sm font-medium block mb-1">Room Name</label>
      <input type="text" id="new-room-name" class="${t('input')} w-full px-3 py-2 text-sm" placeholder="e.g., Ship Squad"
        onkeydown="if(event.key==='Enter')window.__createRoom()">
    </div>
    <button class="${t('button')} w-full py-3 text-sm" onclick="window.__createRoom()">Create Room</button>
  </div>`);
};

window.__createRoom = async () => {
  const name = document.getElementById('new-room-name')?.value.trim();
  if (!name) { toast('Enter a room name', 'error'); return; }
  try {
    const room = await createRoom(name);
    hideModal();
    toast(`Room "${name}" created! Invite code: ${room.invite_code}`);
    navigate(`room/${room.id}`);
  } catch (err) { toast(err.message, 'error'); }
};

window.__showJoinRoom = () => {
  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-4">Join Room</h2>
    <div class="mb-4">
      <label class="text-sm font-medium block mb-1">Invite Code</label>
      <input type="text" id="join-room-code" class="${t('input')} w-full px-3 py-2 text-sm uppercase tracking-widest" placeholder="ABC123" maxlength="6"
        onkeydown="if(event.key==='Enter')window.__joinRoom()">
    </div>
    <button class="${t('button')} w-full py-3 text-sm" onclick="window.__joinRoom()">Join Room</button>
  </div>`);
};

window.__joinRoom = async () => {
  const code = document.getElementById('join-room-code')?.value.trim().toUpperCase();
  if (!code) { toast('Enter an invite code', 'error'); return; }
  try {
    const roomId = await joinRoomByCode(code);
    hideModal();
    toast('Joined the room!');
    navigate(`room/${roomId}`);
  } catch (err) { toast(err.message, 'error'); }
};

window.__navRoom = (id) => navigate(`room/${id}`);
