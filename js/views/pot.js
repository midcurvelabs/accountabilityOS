import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { toast } from '../components.js';
import { fetchRoom } from '../data/rooms.js';
import { fetchPotLedger, deposit } from '../data/pot.js';
import { getCurrentPeriod } from '../helpers.js';

export async function renderPotView() {
  const roomId = AppState.currentRoom;
  if (!roomId) return navigate('rooms');
  const app = document.getElementById('app');
  app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;

  try {
    const room = await fetchRoom(roomId);
    if (!room.settings?.potEnabled) return navigate(`room/${roomId}`);
    const period = getCurrentPeriod(room.settings.potPeriod || 'monthly');
    const ledger = await fetchPotLedger(roomId, period);
    const members = room.members || [];
    const amount = room.settings.potAmountPerPeriod || 10;

    const deposits = ledger.filter(e => e.type === 'deposit');
    const totalPot = deposits.reduce((s, e) => s + parseFloat(e.amount), 0);
    const myDeposit = deposits.find(e => e.user_id === AppState.user.id);

    app.innerHTML = `
      <div class="max-w-2xl mx-auto animate-fade-in-up">
        <h1 class="${t('heading')} text-2xl font-bold mb-6 text-center">💰 Money Pot</h1>
        <div class="${t('card')} p-6 text-center mb-6">
          <div class="${t('accent')} ${t('mono')} text-4xl font-bold">$${totalPot.toFixed(2)}</div>
          <div class="${t('muted')} text-sm mt-1">${period} · $${amount}/person</div>
        </div>

        ${!myDeposit ? `
          <button class="${t('button')} w-full py-3 text-sm mb-6" onclick="window.__deposit('${roomId}', ${amount}, '${period}')">
            💸 Deposit $${amount}
          </button>
        ` : `
          <div class="${t('card')} p-3 text-center mb-6 ${t('accent')} text-sm">✅ You've deposited for this period</div>
        `}

        <h2 class="${t('heading')} font-bold mb-3">Deposits</h2>
        <div class="space-y-2">
          ${members.map(m => {
            const dep = deposits.find(e => e.user_id === m.id);
            return `
              <div class="${t('card')} p-3 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xl">${m.avatar}</span>
                  <span class="font-semibold text-sm">${m.name}</span>
                </div>
                <span class="${dep ? t('accent') : t('danger')} text-sm font-bold">${dep ? '✅ $' + parseFloat(dep.amount).toFixed(2) : '❌ Not deposited'}</span>
              </div>`;
          }).join('')}
        </div>

        <h2 class="${t('heading')} font-bold mt-6 mb-3">Ledger</h2>
        <div class="space-y-1">
          ${ledger.length === 0 ? `<div class="${t('muted')} text-sm">No entries yet</div>` :
            ledger.map(e => `
              <div class="flex justify-between text-xs ${t('muted')} ${t('mono')}">
                <span>${e.profiles?.name || 'Unknown'} · ${e.type}</span>
                <span>$${parseFloat(e.amount).toFixed(2)} · ${new Date(e.created_at).toLocaleDateString()}</span>
              </div>
            `).join('')}
        </div>
      </div>`;
  } catch (err) {
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${err.message}</div>`;
  }
}

window.__deposit = async (roomId, amount, period) => {
  try {
    await deposit({ roomId, amount, period });
    toast('Deposit confirmed!');
    await renderPotView();
  } catch (err) { toast(err.message, 'error'); }
};
