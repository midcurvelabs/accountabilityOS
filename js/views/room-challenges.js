// ============================================================
// Room-scoped challenges list
// Route: #room/<id>/challenges
//
// Shows challenges where room_id = currentRoom (everyone's challenges,
// since RLS allows room members to see each other's). Has a CTA to
// import a 30x30 plan and auto-share it to this room in one step.
// ============================================================
import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { toast, showModal, hideModal, progressRing } from '../components.js';
import { formatShortDate } from '../helpers.js';
import { fetchChallenges, createChallengeFromPlan } from '../data/challenges.js';
import { unsubscribeChallenge } from '../realtime.js';

const PLAN_API_BASE = 'https://30x30.midcurved.com';

export async function renderRoomChallenges() {
  if (!AppState.user) return navigate('login');
  const roomId = AppState.currentRoom;
  if (!roomId) return navigate('rooms');

  unsubscribeChallenge();

  const app = document.getElementById('app');
  app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;

  try {
    const all = await fetchChallenges();
    const challenges = (all || []).filter(c => c.room_id === roomId);
    const roomName = challenges[0]?.room?.name || 'this room';

    // Group by source_token (or title fallback) so a 50-person cohort shows
    // as one card. We render the user's own row if it exists, else the first.
    const cohortMap = new Map();
    for (const c of challenges) {
      const key = c.source_token || c.title;
      if (!cohortMap.has(key)) cohortMap.set(key, []);
      cohortMap.get(key).push(c);
    }
    const cohorts = [];
    for (const [key, list] of cohortMap) {
      const own = list.find(c => c.user_id === AppState.user.id);
      cohorts.push({ key, rep: own || list[0], all: list, isMine: !!own });
    }

    app.innerHTML = `
      <div class="max-w-4xl mx-auto animate-fade-in-up">
        <div class="mb-4">
          <button class="${t('muted')} text-sm hover:${t('heading')}" onclick="window.__nav('room/${roomId}')">← Back to room</button>
        </div>
        <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 class="${t('heading')} text-2xl font-bold">Room challenges</h1>
            <p class="${t('muted')} text-sm mt-1">Day-by-day programs the cohort is running together.</p>
          </div>
          <button class="${t('button')} px-4 py-2 text-sm" onclick="window.__importToRoom()">+ Start a 30x30 challenge here</button>
        </div>

        ${cohorts.length === 0 ? `
          <div class="${t('card')} p-12 text-center">
            <div class="text-5xl mb-4">📅</div>
            <h2 class="${t('heading')} text-xl font-bold mb-2">No challenges yet</h2>
            <p class="${t('muted')} mb-6">Generate a 30-day plan at <a href="${PLAN_API_BASE}" target="_blank" class="${t('accent')} underline">30x30.midcurved.com</a> and import it into this room. Everyone who joins can run the same plan together.</p>
            <button class="${t('button')} px-6 py-3" onclick="window.__importToRoom()">Import a plan</button>
          </div>
        ` : `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            ${cohorts.map(c => cohortCard(c, roomId)).join('')}
          </div>
        `}
      </div>`;
  } catch (err) {
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${escapeHtml(err.message)}</div>`;
  }
}

function cohortCard({ rep, all, isMine }, roomId) {
  const total = rep.total_days || 0;
  const done = isMine ? (rep.completed_days || 0) : 0;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const memberCount = all.length;
  return `
    <button onclick="window.__nav('room/${roomId}/challenge/${rep.id}')" class="${t('card')} ${t('cardHover')} p-5 text-left transition-all cursor-pointer w-full flex gap-4 items-center">
      <div class="shrink-0">${progressRing(pct, 64)}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <h3 class="${t('heading')} font-bold text-base truncate">${escapeHtml(rep.title)}</h3>
        </div>
        <div class="${t('muted')} text-xs flex items-center gap-2 flex-wrap">
          <span>${memberCount} ${memberCount === 1 ? 'member' : 'members'}</span>
          <span>·</span>
          <span>Started ${formatShortDate(rep.started_at)}</span>
        </div>
        <div class="mt-2">
          ${isMine
            ? `<span class="${t('badge')} text-xs px-2 py-0.5 rounded-full">You're in</span>`
            : `<span class="${t('badge')} text-xs px-2 py-0.5 rounded-full">Tap to join</span>`}
        </div>
      </div>
    </button>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ─── Import-to-room flow ────────────────────────────────────

window.__importToRoom = () => {
  const roomId = AppState.currentRoom;
  if (!roomId) {
    toast('Open a room first', 'error');
    return;
  }
  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-2">Import a 30x30 plan into this room</h2>
    <p class="${t('muted')} text-sm mb-4">Paste a plan token (UUID) or the full plan URL. The challenge will be added to this room so members can join and track day-by-day together.</p>
    <div class="mb-4">
      <input type="text" id="room-import-token" class="${t('input')} w-full px-3 py-2 text-sm ${t('mono')}"
        placeholder="e.g. 3b8a1c4d-... or https://30x30.midcurved.com/plan/..."
        onkeydown="if(event.key==='Enter')window.__doImportToRoom()">
    </div>
    <div class="flex gap-2">
      <button class="${t('buttonSecondary')} flex-1 py-3 text-sm" onclick="window.__hideModal()">Cancel</button>
      <button class="${t('button')} flex-1 py-3 text-sm" onclick="window.__doImportToRoom()">Import to room</button>
    </div>
  </div>`);
  setTimeout(() => document.getElementById('room-import-token')?.focus(), 60);
};

window.__hideModal = () => hideModal();

window.__doImportToRoom = async () => {
  const roomId = AppState.currentRoom;
  if (!roomId) return;
  const raw = document.getElementById('room-import-token')?.value?.trim() || '';
  const uuidMatch = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  if (!uuidMatch) {
    toast('Could not find a valid plan token in that input', 'error');
    return;
  }
  const token = uuidMatch[0];
  hideModal();

  const app = document.getElementById('app');
  app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="text-center"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin mb-4"></div><div class="${t('muted')} text-sm">Importing plan into the room…</div></div></div>`;

  try {
    const res = await fetch(`${PLAN_API_BASE}/api/plan/${token}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Plan fetch failed (${res.status})`);
    }
    const { plan, created_at } = await res.json();
    if (!plan?.weeks) throw new Error('Plan is empty or malformed');

    const title = inferTitle(plan, created_at);
    const { challenge } = await createChallengeFromPlan({
      plan,
      sourceUrl: PLAN_API_BASE,
      sourceToken: token,
      title,
      roomId,
    });
    toast(`Imported into room — ready to track`, 'success');
    navigate(`room/${roomId}/challenge/${challenge.id}`);
  } catch (err) {
    toast(err.message || 'Import failed', 'error');
    navigate(`room/${roomId}/challenges`);
  }
};

function inferTitle(plan, createdAt) {
  const firstLabel = (plan.weeks || []).find(w => w.label)?.label;
  if (firstLabel && !/^week\s*1/i.test(firstLabel)) return firstLabel;
  const date = createdAt ? formatShortDate(createdAt) : formatShortDate(new Date());
  return `30-day plan · ${date}`;
}
