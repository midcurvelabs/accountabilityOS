import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { toast, progressRing, goalCard, showModal, hideModal } from '../components.js';
import { getCurrentPeriod } from '../helpers.js';
import { fetchRoom } from '../data/rooms.js';
import { fetchRoomGoals, addGoal, toggleGoal, fetchNotToDos, reportViolation } from '../data/goals.js';
import { fetchDeepWork, logDeepWork } from '../data/deep-work.js';
import { fetchActivityFeed, formatActivity } from '../data/activity.js';
import { fetchUserStats } from '../data/points.js';
import { subscribeToRoom } from '../realtime.js';
import { debounce } from '../helpers.js';
import { fireConfetti } from '../confetti.js';

let roomCache = null;

// Debounced re-render to batch rapid realtime events
const debouncedRender = debounce(() => renderRoomDashboard(), 500);

export async function renderRoomDashboard() {
  const roomId = AppState.currentRoom;
  if (!roomId) return navigate('rooms');
  const app = document.getElementById('app');

  // Show loading on first load
  if (!roomCache || roomCache.id !== roomId) {
    app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;
  }

  try {
    const period = getCurrentPeriod('weekly');

    const [room, allGoals, notToDos, deepWork, activity] = await Promise.all([
      fetchRoom(roomId),
      fetchRoomGoals(roomId, { period }),
      fetchNotToDos(roomId, { period }),
      fetchDeepWork(roomId, { since: getWeekStart() }),
      fetchActivityFeed(roomId, 10).catch(() => []),
    ]);
    roomCache = room;

    const user = AppState.user;
    const members = room.members || [];

    const myGoals = allGoals.filter(g => g.user_id === user.id);
    const myWeekGoals = myGoals.filter(g => g.timeframe === 'weekly');
    const completed = myWeekGoals.filter(g => g.completed).length;
    const total = myWeekGoals.length;
    const pct = total > 0 ? (completed / total) * 100 : 0;

    const myDeepWork = deepWork.filter(d => d.user_id === user.id);
    const totalHours = myDeepWork.reduce((s, d) => s + parseFloat(d.hours), 0);

    const myNotToDos = notToDos.filter(n => n.user_id === user.id);

    app.innerHTML = `
      <div class="max-w-5xl mx-auto animate-fade-in-up">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="${t('heading')} text-2xl font-bold">${room.name}</h1>
            <div class="${t('muted')} text-sm flex items-center gap-3">
              <span>${members.length} members</span>
              <span class="cursor-pointer ${t('mono')} text-xs" onclick="window.__copyCode('${room.invite_code}')" title="Click to copy">🔑 ${room.invite_code}</span>
            </div>
          </div>
          <div class="flex items-center gap-3">
            ${progressRing(pct, 64)}
            <button class="${t('button')} px-4 py-2 text-sm" onclick="window.__showTranscript('${room.id}')">+ New Session</button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-4">
            <div class="flex gap-2">
              <input type="text" id="quick-goal" class="${t('input')} flex-1 px-3 py-2 text-sm" placeholder="Add a quick weekly goal..."
                onkeydown="if(event.key==='Enter')window.__quickAdd('${room.id}')">
              <button class="${t('button')} px-4 py-2 text-sm" onclick="window.__quickAdd('${room.id}')">Add</button>
            </div>

            <h2 class="${t('heading')} font-bold flex items-center gap-2">🎯 This Week <span class="${t('badge')} text-xs px-2 py-0.5">${period}</span></h2>
            <div id="goals-list">
            ${myWeekGoals.length === 0
              ? `<div class="${t('card')} p-6 text-center ${t('muted')}">No weekly goals yet. Add one above or paste a transcript!</div>`
              : myWeekGoals.map(g => goalCard(g, room.id)).join('')}
            </div>

            ${myNotToDos.length > 0 ? `
              <h2 class="${t('heading')} font-bold mt-4">🚫 NOT-to-do</h2>
              ${myNotToDos.map(n => `
                <div class="${t('card')} ${t('dangerBorder')} border-l-4 p-3 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="${t('danger')} text-lg">✕</span>
                    <span class="text-sm">${n.text}</span>
                    ${(n.violations || []).length > 0 ? `<span class="${t('dangerBg')} text-xs px-2 py-0.5 rounded-full">${n.violations.length} violations</span>` : ''}
                  </div>
                  <button class="${t('buttonDanger')} text-xs px-2 py-1" onclick="window.__selfReport('${n.id}')">I broke this</button>
                </div>
              `).join('')}
            ` : ''}
          </div>

          <div class="space-y-4">
            <div class="${t('card')} p-4">
              <h3 class="${t('heading')} font-bold text-sm mb-3">Your Stats</h3>
              <div class="grid grid-cols-2 gap-3 text-center">
                <div><div class="${t('accent')} ${t('mono')} text-xl font-bold">${completed}</div><div class="${t('muted')} text-xs">Completed</div></div>
                <div><div class="${t('mono')} text-xl font-bold">${total}</div><div class="${t('muted')} text-xs">Goals</div></div>
                <div><div class="${t('accent')} ${t('mono')} text-xl font-bold">${totalHours.toFixed(1)}</div><div class="${t('muted')} text-xs">Deep Work hrs</div></div>
                <div><div class="${t('mono')} text-xl font-bold">🔥 0</div><div class="${t('muted')} text-xs">Streak</div></div>
              </div>
            </div>

            <button class="${t('buttonSecondary')} w-full py-2 text-sm" onclick="window.__showDeepWork('${room.id}')">⏱️ Log Deep Work</button>

            <!-- Activity Feed -->
            <div class="${t('card')} p-4" id="activity-feed">
              <h3 class="${t('heading')} font-bold text-sm mb-3">Activity</h3>
              ${activity.length === 0
                ? `<div class="${t('muted')} text-xs text-center py-2">No activity yet</div>`
                : activity.map(a => {
                    const f = formatActivity(a);
                    return `<div class="flex items-start gap-2 py-1.5 text-xs ${t('muted')} border-b last:border-0 ${t('divider')}">
                      <span class="shrink-0">${f.avatar}</span>
                      <span class="flex-1"><strong>${f.name}</strong> ${f.text}</span>
                      <span class="shrink-0 ${t('mono')}">${f.ago}</span>
                    </div>`;
                  }).join('')}
            </div>

            <h3 class="${t('heading')} font-bold text-sm">Room Members</h3>
            ${members.map(m => {
              const mGoals = allGoals.filter(g => g.user_id === m.id && g.timeframe === 'weekly' && (g.visibility === 'public' || g.user_id === user.id));
              const mCompleted = mGoals.filter(g => g.completed).length;
              const mTotal = mGoals.length;
              const mPct = mTotal > 0 ? (mCompleted / mTotal) * 100 : 0;
              return `
                <div class="${t('card')} p-3 flex items-center gap-3">
                  <span class="text-2xl">${m.avatar}</span>
                  <div class="flex-1 min-w-0">
                    <div class="font-semibold text-sm">${m.name} ${m.id === user.id ? '(you)' : ''}</div>
                    <div class="${t('muted')} text-xs ${t('mono')}">${mCompleted}/${mTotal} goals</div>
                  </div>
                  <div class="shrink-0">${progressRing(mPct, 36)}</div>
                </div>`;
            }).join('')}

            <button onclick="window.__nav('room/${room.id}/leaderboard')" class="${t('card')} ${t('cardHover')} p-3 w-full text-left">
              <div class="flex items-center justify-between">
                <span class="${t('heading')} font-bold text-sm">🏆 Leaderboard</span>
                <span class="${t('accent')} text-sm">→</span>
              </div>
            </button>

            ${room.settings?.potEnabled ? `
              <button onclick="window.__nav('room/${room.id}/pot')" class="${t('card')} ${t('cardHover')} p-3 w-full text-left">
                <div class="flex items-center justify-between">
                  <span class="${t('heading')} font-bold text-sm">💰 Money Pot</span>
                  <span class="${t('warning')} text-sm">→</span>
                </div>
              </button>
            ` : ''}
          </div>
        </div>
      </div>`;

    // Subscribe to real-time updates — debounced to avoid flicker
    subscribeToRoom(roomId, {
      onGoalChange: () => debouncedRender(),
      onMemberChange: () => debouncedRender(),
      onDeepWorkChange: () => debouncedRender(),
      onNotToDoChange: () => debouncedRender(),
      onViolation: () => debouncedRender(),
      onActivity: (payload) => {
        // Prepend to activity feed without full re-render
        const feed = document.getElementById('activity-feed');
        if (feed && payload.new) {
          const f = formatActivity({ ...payload.new, profiles: null });
          const item = document.createElement('div');
          item.className = `flex items-start gap-2 py-1.5 text-xs ${t('muted')} border-b ${t('divider')} animate-fade-in-up`;
          item.innerHTML = `<span class="shrink-0">${f.avatar}</span><span class="flex-1"><strong>${f.name}</strong> ${f.text}</span><span class="shrink-0 ${t('mono')}">${f.ago}</span>`;
          // Insert after the h3 heading
          const heading = feed.querySelector('h3');
          if (heading?.nextSibling) heading.after(item);
          else feed.appendChild(item);
        }
      },
    });

  } catch (err) {
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${err.message}</div>`;
  }
}

function getWeekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

// Global handlers
window.__quickAdd = async (roomId) => {
  const input = document.getElementById('quick-goal');
  const text = input?.value.trim();
  if (!text) return;
  try {
    await addGoal({ roomId, text, type: 'priority', timeframe: 'weekly', period: getCurrentPeriod('weekly') });
    input.value = '';
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__toggleGoal = async (goalId, completed) => {
  try {
    await toggleGoal(goalId, completed);
    // Fire confetti when completing a goal
    if (completed) fireConfetti();
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__selfReport = async (notToDoId) => {
  try {
    await reportViolation(notToDoId, 'self');
    toast('Violation reported 😬');
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__copyCode = (code) => {
  navigator.clipboard?.writeText(code);
  toast('Invite code copied!');
};

window.__showDeepWork = (roomId) => {
  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-4">⏱️ Log Deep Work</h2>
    <div class="space-y-3">
      <div><label class="text-sm font-medium block mb-1">Hours</label>
        <input type="number" id="dw-hours" class="${t('input')} w-full px-3 py-2 text-sm" placeholder="2.5" step="0.5" min="0.5"></div>
      <div><label class="text-sm font-medium block mb-1">What did you work on?</label>
        <input type="text" id="dw-note" class="${t('input')} w-full px-3 py-2 text-sm" placeholder="Building the API..."></div>
    </div>
    <button class="${t('button')} w-full py-3 text-sm mt-4" onclick="window.__logDeepWork('${roomId}')">Log It</button>
  </div>`);
};

window.__logDeepWork = async (roomId) => {
  const hours = parseFloat(document.getElementById('dw-hours')?.value);
  const note = document.getElementById('dw-note')?.value.trim();
  if (!hours || hours <= 0) { toast('Enter valid hours', 'error'); return; }
  try {
    await logDeepWork({ roomId, hours, note });
    hideModal();
    toast(`Logged ${hours}h of deep work!`);
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__nav = (path) => navigate(path);
