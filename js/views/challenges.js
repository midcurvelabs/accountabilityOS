// ============================================================
// Challenges list — solo + room-shared imported plans
// ============================================================
import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { toast, showModal, hideModal, progressRing } from '../components.js';
import { formatShortDate } from '../helpers.js';
import { fetchChallenges } from '../data/challenges.js';
import { unsubscribeChallenge } from '../realtime.js';

export async function renderChallenges() {
  if (!AppState.user) return navigate('login');

  // Tear down any per-challenge realtime sub when leaving the detail view.
  unsubscribeChallenge();

  const app = document.getElementById('app');
  app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;

  try {
    const challenges = await fetchChallenges();

    app.innerHTML = `
      <div class="max-w-4xl mx-auto animate-fade-in-up">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="${t('heading')} text-2xl font-bold">Challenges</h1>
            <p class="${t('muted')} text-sm mt-1">Day-by-day programs you're tracking</p>
          </div>
          <div class="flex gap-2">
            <button class="${t('button')} px-4 py-2 text-sm" onclick="window.__showImportChallenge()">+ Import from 30x30</button>
            <button class="${t('buttonSecondary')} px-4 py-2 text-sm" onclick="window.__startBlankChallenge()">Start blank</button>
          </div>
        </div>
        ${challenges.length === 0 ? `
          <div class="${t('card')} p-12 text-center">
            <div class="text-5xl mb-4">📅</div>
            <h2 class="${t('heading')} text-xl font-bold mb-2">No challenges yet</h2>
            <p class="${t('muted')} mb-6">Generate a 30-day plan at <a href="https://30x30.midcurved.com" target="_blank" class="${t('accent')} underline">30x30.midcurved.com</a> and click "Track in AccountabilityOS" to import it here.</p>
            <button class="${t('button')} px-6 py-3" onclick="window.__showImportChallenge()">Import a plan</button>
          </div>
        ` : `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${challenges.map(c => challengeCard(c)).join('')}
          </div>
        `}
      </div>`;
  } catch (err) {
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${err.message}</div>`;
  }
}

function challengeCard(c) {
  const total = c.total_days || 0;
  const done = c.completed_days || 0;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const isMine = c.user_id === AppState.user.id;
  const roomName = c.room?.name || null;
  const sharedBadge = c.room_id
    ? `<span class="${t('badge')} text-xs px-2 py-0.5 rounded-full">🔗 ${escapeHtml(roomName || 'Cohort')}</span>`
    : `<span class="${t('badge')} text-xs px-2 py-0.5 rounded-full">Solo</span>`;
  // Shared challenges open the cohort dashboard. Solo (and other-user shared
  // challenges that have no room visible) open the per-user detail view.
  const target = c.room_id
    ? `room/${c.room_id}/challenge/${c.id}`
    : `challenge/${c.id}`;
  return `
    <button onclick="window.__nav('${target}')" class="${t('card')} ${t('cardHover')} p-5 text-left transition-all cursor-pointer w-full flex gap-4 items-center">
      <div class="shrink-0">${progressRing(pct, 64)}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="${t('heading')} font-bold text-base truncate">${escapeHtml(c.title)}</h3>
          ${!isMine ? `<span class="${t('muted')} text-xs">· someone else</span>` : ''}
        </div>
        <div class="${t('muted')} text-xs flex items-center gap-2 flex-wrap">
          <span>${done}/${total} days</span>
          <span>·</span>
          <span>Started ${formatShortDate(c.started_at)}</span>
        </div>
        <div class="mt-2">${sharedBadge}</div>
      </div>
    </button>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ─── Import modal ───────────────────────────────────────────

window.__showImportChallenge = () => {
  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-2">Import from 30x30</h2>
    <p class="${t('muted')} text-sm mb-4">Paste a 30x30 plan token (UUID) or the full plan URL.</p>
    <div class="mb-4">
      <input type="text" id="import-token" class="${t('input')} w-full px-3 py-2 text-sm ${t('mono')}"
        placeholder="e.g. 3b8a1c4d-... or https://accountability.midcurved.com/#import/..."
        onkeydown="if(event.key==='Enter')window.__doImportChallenge()">
    </div>
    <button class="${t('button')} w-full py-3 text-sm" onclick="window.__doImportChallenge()">Import plan</button>
  </div>`);
  setTimeout(() => document.getElementById('import-token')?.focus(), 60);
};

window.__doImportChallenge = () => {
  const raw = document.getElementById('import-token')?.value?.trim() || '';
  const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  if (!uuidMatch) {
    toast('Could not find a valid plan token in that input', 'error');
    return;
  }
  const token = uuidMatch[0];
  hideModal();
  navigate(`import/${token}`);
};

window.__startBlankChallenge = () => {
  toast('Coming soon — for now, generate a plan at 30x30.midcurved.com', 'info');
};
