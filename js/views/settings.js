import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { toast } from '../components.js';
import { safeAvatar } from '../helpers.js';
import { fetchRoom, updateRoomSettings, removeMember, leaveRoom } from '../data/rooms.js';
import { supabase } from '../supabase.js';

export async function renderRoomSettings() {
  const roomId = AppState.currentRoom;
  if (!roomId) return navigate('rooms');
  const app = document.getElementById('app');
  app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;

  try {
    const room = await fetchRoom(roomId);
    const isCreator = room.created_by === AppState.user.id;
    const s = room.settings || {};

    app.innerHTML = `
      <div class="max-w-2xl mx-auto animate-fade-in-up">
        <h1 class="${t('heading')} text-2xl font-bold mb-6">⚙️ ${room.name} Settings</h1>

        ${isCreator ? `
        <div class="${t('card')} p-5 mb-6">
          <h2 class="${t('heading')} font-bold mb-4">Room Info</h2>
          <div class="mb-3"><label class="${t('muted')} text-sm block mb-1">Room Name</label>
            <input type="text" id="room-name" class="${t('input')} w-full px-3 py-2 text-sm" value="${room.name}"></div>
          <div class="mb-3"><label class="${t('muted')} text-sm block mb-1">Invite Code</label>
            <div class="flex gap-2">
              <input type="text" class="${t('input')} flex-1 px-3 py-2 text-sm ${t('mono')}" value="${room.invite_code}" readonly>
              <button class="${t('buttonSecondary')} px-3 py-2 text-sm" onclick="window.__copyCode('${room.invite_code}')">📋 Copy</button>
            </div>
          </div>
        </div>

        <div class="${t('card')} p-5 mb-6">
          <h2 class="${t('heading')} font-bold mb-4">Session & Shame</h2>
          <div class="mb-3"><label class="${t('muted')} text-sm block mb-1">Frequency</label>
            <select id="setting-freq" class="${t('input')} w-full px-3 py-2 text-sm">
              <option value="weekly" ${s.sessionFrequency === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="biweekly" ${s.sessionFrequency === 'biweekly' ? 'selected' : ''}>Bi-weekly</option>
            </select></div>
          <label class="flex items-center gap-2 mb-3 cursor-pointer">
            <input type="checkbox" id="setting-shame" ${s.publicShame ? 'checked' : ''}>
            <span class="text-sm">Public Shame on Leaderboard</span>
          </label>
          <div class="mb-3"><label class="${t('muted')} text-sm block mb-1">Min Completion % for Shame</label>
            <input type="number" id="setting-min-completion" class="${t('input')} w-full px-3 py-2 text-sm" value="${(s.shameThresholds?.minCompletion || 0.5) * 100}" min="0" max="100"></div>
        </div>

        <div class="${t('card')} p-5 mb-6">
          <h2 class="${t('heading')} font-bold mb-4">💰 Money Pot</h2>
          <label class="flex items-center gap-2 mb-3 cursor-pointer">
            <input type="checkbox" id="setting-pot" ${s.potEnabled ? 'checked' : ''}>
            <span class="text-sm">Enable Money Pot</span>
          </label>
          <div class="mb-3"><label class="${t('muted')} text-sm block mb-1">Amount per Person per Period ($)</label>
            <input type="number" id="setting-pot-amount" class="${t('input')} w-full px-3 py-2 text-sm" value="${s.potAmountPerPeriod || 10}"></div>
          <div class="mb-3"><label class="${t('muted')} text-sm block mb-1">Pot Period</label>
            <select id="setting-pot-period" class="${t('input')} w-full px-3 py-2 text-sm">
              <option value="weekly" ${s.potPeriod === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" ${s.potPeriod === 'monthly' ? 'selected' : ''}>Monthly</option>
            </select></div>
          <div class="mb-3"><label class="${t('muted')} text-sm block mb-1">Completion Threshold (%)</label>
            <input type="number" id="setting-pot-threshold" class="${t('input')} w-full px-3 py-2 text-sm" value="${(s.potCompletionThreshold || 0.8) * 100}"></div>
        </div>

        <button class="${t('button')} w-full py-3 text-sm mb-6" onclick="window.__saveRoomSettings('${roomId}')">💾 Save Settings</button>
        ` : `
        <div class="${t('card')} p-5 mb-6">
          <h2 class="${t('heading')} font-bold mb-2">Room Info</h2>
          <div class="${t('muted')} text-sm">🔑 Invite code: <span class="${t('mono')}">${room.invite_code}</span></div>
        </div>
        `}

        <div class="${t('card')} p-5 mb-6">
          <h2 class="${t('heading')} font-bold mb-4">Members</h2>
          <div class="space-y-2">
            ${(room.members || []).map(m => `
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xl">${safeAvatar(m.avatar)}</span>
                  <span class="text-sm font-semibold">${m.name}</span>
                  ${m.id === room.created_by ? `<span class="${t('badge')} text-xs px-2 py-0.5">Creator</span>` : ''}
                </div>
                ${isCreator && m.id !== room.created_by ? `<button class="${t('danger')} text-xs hover:underline" onclick="window.__removeMember('${roomId}', '${m.id}')">Remove</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <button class="${t('buttonDanger')} w-full py-3 text-sm" onclick="window.__leaveRoom('${roomId}')">🚪 Leave Room</button>
      </div>`;
  } catch (err) {
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${err.message}</div>`;
  }
}

window.__saveRoomSettings = async (roomId) => {
  const settings = {
    sessionFrequency: document.getElementById('setting-freq')?.value || 'weekly',
    publicShame: document.getElementById('setting-shame')?.checked ?? true,
    shameThresholds: {
      minCompletion: (parseInt(document.getElementById('setting-min-completion')?.value) || 50) / 100,
      maxViolations: 3,
      minDeepWorkHours: 0
    },
    potEnabled: document.getElementById('setting-pot')?.checked ?? false,
    potAmountPerPeriod: parseInt(document.getElementById('setting-pot-amount')?.value) || 10,
    potPeriod: document.getElementById('setting-pot-period')?.value || 'monthly',
    potCompletionThreshold: (parseInt(document.getElementById('setting-pot-threshold')?.value) || 80) / 100
  };
  try {
    await updateRoomSettings(roomId, settings);
    toast('Settings saved!');
  } catch (err) { toast(err.message, 'error'); }
};

window.__removeMember = async (roomId, userId) => {
  if (!confirm('Remove this member?')) return;
  try {
    await removeMember(roomId, userId);
    toast('Member removed');
    await renderRoomSettings();
  } catch (err) { toast(err.message, 'error'); }
};

window.__leaveRoom = async (roomId) => {
  if (!confirm('Leave this room?')) return;
  try {
    await leaveRoom(roomId);
    AppState.currentRoom = null;
    toast('Left the room');
    navigate('rooms');
  } catch (err) { toast(err.message, 'error'); }
};

export function renderGlobalSettings() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="max-w-2xl mx-auto animate-fade-in-up">
      <h1 class="${t('heading')} text-2xl font-bold mb-6">⚙️ Settings</h1>
      <div class="${t('card')} p-5 mb-6">
        <h2 class="${t('heading')} font-bold mb-4">Profile</h2>
        <div class="flex items-center gap-4 mb-4">
          <span class="text-4xl">${safeAvatar(AppState.profile?.avatar)}</span>
          <div>
            <div class="font-bold">${AppState.profile?.name || 'Unknown'}</div>
            <div class="${t('muted')} text-sm">${AppState.user?.email || ''}</div>
          </div>
        </div>
        <button class="${t('buttonSecondary')} px-4 py-2 text-sm" onclick="window.__editProfile()">Edit Profile</button>
      </div>
      <div class="${t('card')} p-5 mb-6">
        <h2 class="${t('heading')} font-bold mb-4">API Keys</h2>
        <div class="mb-3"><label class="${t('muted')} text-sm block mb-1">Anthropic API Key (for transcript analysis)</label>
          <input type="password" id="setting-anthropic-key" class="${t('input')} w-full px-3 py-2 text-sm" value="${localStorage.getItem('anthropic_key') || ''}" placeholder="sk-ant-...">
          <p class="${t('muted')} text-xs mt-1">Stored locally in your browser only</p>
        </div>
        <button class="${t('button')} px-4 py-2 text-sm" onclick="window.__saveApiKeys()">Save</button>
      </div>
      <button class="${t('buttonDanger')} w-full py-3 text-sm" onclick="window.__signOut()">Sign Out</button>
    </div>`;
}

window.__saveApiKeys = () => {
  const key = document.getElementById('setting-anthropic-key')?.value.trim();
  localStorage.setItem('anthropic_key', key);
  toast('API key saved!');
};

window.__editProfile = async () => {
  const { renderProfileSetup } = await import('./login.js');
  renderProfileSetup();
};
