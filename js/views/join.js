// ============================================================
// Deep Link Join — handles /#join/:code
// ============================================================
import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { toast } from '../components.js';
import { joinRoomByCode } from '../data/rooms.js';

export async function renderJoinRoom() {
  const app = document.getElementById('app');
  const hash = location.hash.slice(1);
  const code = hash.split('/')[1]?.toUpperCase();

  if (!code) {
    return navigate('rooms');
  }

  // Not authenticated — show login first, then auto-join after
  if (!AppState.user) {
    // Store the code so we can join after login
    sessionStorage.setItem('pending_join_code', code);
    app.innerHTML = `
      <div class="max-w-md mx-auto text-center py-12 animate-fade-in-up">
        <div class="text-5xl mb-4">🔑</div>
        <h1 class="${t('heading')} text-2xl font-bold mb-2">Join Room</h1>
        <p class="${t('muted')} mb-6">Sign in to join room with code <strong class="${t('accent')} ${t('mono')}">${code}</strong></p>
        <button class="${t('button')} px-8 py-3 text-sm" onclick="window.__nav('login')">Sign In to Join</button>
      </div>`;
    return;
  }

  // Authenticated — try to join
  app.innerHTML = `
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin mb-4"></div>
        <div class="${t('muted')} text-sm">Joining room <strong class="${t('accent')} ${t('mono')}">${code}</strong>...</div>
      </div>
    </div>`;

  try {
    const roomId = await joinRoomByCode(code);
    toast('Joined the room!');
    navigate(`room/${roomId}`);
  } catch (err) {
    app.innerHTML = `
      <div class="max-w-md mx-auto text-center py-12 animate-fade-in-up">
        <div class="text-5xl mb-4">😕</div>
        <h1 class="${t('heading')} text-xl font-bold mb-2">Couldn't Join</h1>
        <p class="${t('danger')} mb-6">${err.message}</p>
        <button class="${t('buttonSecondary')} px-6 py-3 text-sm" onclick="window.__nav('rooms')">Go to Rooms</button>
      </div>`;
  }
}
