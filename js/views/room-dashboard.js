import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { toast, progressRing, goalCard, showModal, hideModal } from '../components.js';
import { getCurrentPeriod, safeAvatar, formatShortDate } from '../helpers.js';
import { fetchRoom } from '../data/rooms.js';
import { fetchRoomGoals, addGoal, toggleGoal, incrementGoal, updateGoal, deleteGoal, carryForwardGoals, fetchNotToDos, updateNotToDo, deleteNotToDo, reportViolation } from '../data/goals.js';
import { fetchRoomSessions, createEmptySession } from '../data/sessions.js';
import { fetchDeepWork, logDeepWork } from '../data/deep-work.js';
import { fetchActivityFeed, formatActivity } from '../data/activity.js';
import { fetchUserStats } from '../data/points.js';
import { fetchChallenges } from '../data/challenges.js';
import { subscribeToRoom } from '../realtime.js';
import { debounce } from '../helpers.js';
import { fireConfetti } from '../confetti.js';

let roomCache = null;
let goalsCache = [];          // goals for current epoch only (used by edit modals)
let notToDosCache = [];       // same for not-to-dos
let sessionsCache = [];
let epochsCache = [];
let currentCursor = 0;        // 0 = newest epoch; grows going backwards
let lastRenderedRoom = null;

// Debounced re-render to batch rapid realtime events
const debouncedRender = debounce(() => renderRoomDashboard(), 500);

/**
 * Build the ordered list of "epochs" (sessions) for a room.
 * An epoch is whatever scope the dashboard shows at a time.
 * Order: newest session → older session → optional null-bucket for
 * legacy/orphan goals that predate the first session.
 */
function buildEpochs(sessions, goals) {
  const hasOrphans = goals.some(g => g.session_id == null);
  const epochs = sessions.map(s => ({
    id: s.id,
    date: s.date,
    session: s,
  }));
  if (hasOrphans) epochs.push({ id: null, date: null, session: null, isLegacy: true });
  // Virtual "this week" for fresh rooms so the UI always has something to show.
  if (epochs.length === 0) epochs.push({ id: null, date: null, session: null, isVirtual: true });
  return epochs;
}

function epochLabel(epoch, isCurrent) {
  if (isCurrent) return 'This Week';
  if (epoch.isLegacy) return 'Before first session';
  if (epoch.date) return `Previous · ${formatShortDate(epoch.date)}`;
  return 'Previous';
}

function epochBadge(epoch, isCurrent) {
  if (epoch.isVirtual) return 'new';
  if (epoch.isLegacy) return 'legacy';
  if (epoch.date) return formatShortDate(epoch.date);
  return isCurrent ? 'now' : '';
}

export async function renderRoomDashboard() {
  const roomId = AppState.currentRoom;
  if (!roomId) return navigate('rooms');
  const app = document.getElementById('app');

  // Reset session cursor when switching rooms
  if (lastRenderedRoom !== roomId) {
    currentCursor = 0;
    lastRenderedRoom = roomId;
  }

  // Show loading on first load
  if (!roomCache || roomCache.id !== roomId) {
    app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;
  }

  try {
    const [room, sessions, allGoals, allNotToDos, deepWork, activity, allChallenges] = await Promise.all([
      fetchRoom(roomId),
      fetchRoomSessions(roomId, { limit: 50 }),
      fetchRoomGoals(roomId, { timeframe: 'weekly', limit: 500 }),
      fetchNotToDos(roomId, { limit: 200 }),
      fetchDeepWork(roomId, { since: getWeekStart() }),
      fetchActivityFeed(roomId, 10).catch(() => []),
      fetchChallenges().catch(() => []),
    ]);
    // Distinct cohort cards: dedupe by source_token (or title fallback) so 50 members
    // running the same plan show as one cohort, not 50.
    const roomChallenges = (allChallenges || []).filter(c => c.room_id === roomId);
    const cohortCards = [];
    const seenKey = new Set();
    for (const c of roomChallenges) {
      const key = c.source_token || c.title;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      // Pick a representative challenge — prefer the viewer's own if they have one,
      // else the first match — so the deep-link lands somewhere meaningful.
      const own = roomChallenges.find(o => (o.source_token || o.title) === key && o.user_id === AppState.user.id);
      cohortCards.push({ rep: own || c, key });
    }
    roomCache = room;
    sessionsCache = sessions;

    // Build epoch list and clamp cursor into range
    const epochs = buildEpochs(sessions, allGoals);
    epochsCache = epochs;
    if (currentCursor >= epochs.length) currentCursor = 0;
    const currentEpoch = epochs[currentCursor];
    const isCurrentEpoch = currentCursor === 0;

    // Filter goals & not-to-dos to the visible epoch
    const matchEpoch = (row) => {
      if (currentEpoch.id === null) return row.session_id == null;
      return row.session_id === currentEpoch.id;
    };
    const epochGoals = allGoals.filter(matchEpoch);
    const epochNotToDos = allNotToDos.filter(matchEpoch);
    goalsCache = epochGoals;
    notToDosCache = epochNotToDos;

    const user = AppState.user;
    const members = room.members || [];

    const myGoals = epochGoals.filter(g => g.user_id === user.id);
    const myWeekGoals = myGoals.filter(g => g.timeframe === 'weekly');
    const completed = myWeekGoals.filter(g => g.completed).length;
    const total = myWeekGoals.length;
    const pct = total > 0 ? (completed / total) * 100 : 0;

    const myDeepWork = deepWork.filter(d => d.user_id === user.id);
    const totalHours = myDeepWork.reduce((s, d) => s + parseFloat(d.hours), 0);

    const myNotToDos = epochNotToDos.filter(n => n.user_id === user.id);

    // Session navigation state
    const prevDisabled = currentCursor >= epochs.length - 1;
    const nextDisabled = currentCursor <= 0;
    const label = epochLabel(currentEpoch, isCurrentEpoch);
    const badge = epochBadge(currentEpoch, isCurrentEpoch);

    // For past-session goal rendering we need the current epoch's session id
    // (carry-forward target). If we're viewing the newest epoch, these are
    // irrelevant.
    const latestEpoch = epochs[0];
    const carryTargetSessionId = latestEpoch && !latestEpoch.isVirtual ? latestEpoch.id : null;

    // Render a single goal. On past epochs, wrap in a read-only card and append
    // carry/mark-done action bar for incomplete goals owned by the viewer.
    const renderMyGoal = (g) => {
      if (isCurrentEpoch) return goalCard(g, room.id);
      const isMine = g.user_id === user.id;
      const card = goalCard(g, { readOnly: true });
      if (!isMine || g.completed) return card;
      // Past-epoch, my own, incomplete → show action bar
      const canCarry = carryTargetSessionId != null && carryTargetSessionId !== g.session_id;
      return `
        <div>
          ${card}
          <div class="flex gap-2 mt-1 mb-2 pl-1">
            <button class="${t('buttonSecondary')} text-xs px-2 py-1" onclick="window.__markBelatedDone('${g.id}')">✅ Mark done</button>
            ${canCarry ? `<button class="${t('buttonSecondary')} text-xs px-2 py-1" onclick="window.__carryGoalForward('${g.id}')">➡️ Carry to this week</button>` : ''}
          </div>
        </div>`;
    };

    app.innerHTML = `
      <div class="max-w-5xl mx-auto animate-fade-in-up">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="${t('heading')} text-2xl font-bold flex items-center gap-2">
              <button onclick="window.__nav('rooms')" class="w-8 h-8 rounded-lg flex items-center justify-center ${t('surfaceHover')} text-lg" title="Back to Rooms">←</button>
              ${room.name}
            </h1>
            <div class="${t('muted')} text-sm flex items-center gap-3">
              <span>${members.length} members</span>
              <span class="cursor-pointer ${t('mono')} text-xs" onclick="window.__copyCode('${room.invite_code}')" title="Click to copy">🔑 ${room.invite_code}</span>
            </div>
          </div>
          <div class="flex items-center gap-3">
            ${progressRing(pct, 64)}
            ${isCurrentEpoch ? `<button class="${t('button')} px-4 py-2 text-sm" onclick="window.__showTranscript('${room.id}')">+ New Session</button>` : ''}
          </div>
        </div>

        <div class="${t('card')} p-4 mb-6">
          <div class="flex items-center justify-between mb-3">
            <div class="${t('heading')} font-bold text-sm">📅 Cohort challenges</div>
            <div class="flex items-center gap-3">
              ${cohortCards.length > 0 ? `<div class="${t('muted')} text-xs">${cohortCards.length} active</div>` : ''}
              <button class="${t('buttonSecondary')} text-xs px-2.5 py-1" onclick="window.__importToRoom()">+ Add</button>
            </div>
          </div>
          ${cohortCards.length > 0 ? `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${cohortCards.map(({ rep }) => {
                const memberCount = roomChallenges.filter(c => (c.source_token || c.title) === (rep.source_token || rep.title)).length;
                return `
                  <button onclick="window.__nav('room/${room.id}/challenge/${rep.id}')" class="${t('surface')} ${t('surfaceHover')} rounded-xl px-3 py-2 text-left flex items-center justify-between gap-3 transition">
                    <div class="min-w-0">
                      <div class="${t('heading')} font-semibold text-sm truncate">${rep.title}</div>
                      <div class="${t('muted')} text-xs">${memberCount} ${memberCount === 1 ? 'member' : 'members'}</div>
                    </div>
                    <div class="${t('accent')} text-lg shrink-0">→</div>
                  </button>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="${t('muted')} text-xs italic">No cohort challenges yet — import a 30-day plan and everyone in this room can run it together.</div>
          `}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-4">
            ${isCurrentEpoch ? `
              <div class="flex gap-2 flex-wrap">
                <input type="text" id="quick-goal" class="${t('input')} flex-1 min-w-[160px] px-3 py-2 text-sm" placeholder="Add a quick weekly goal..."
                  onkeydown="if(event.key==='Enter')window.__quickAdd('${room.id}')">
                <select id="quick-goal-freq" class="${t('input')} px-2 py-2 text-sm shrink-0" title="How often?">
                  <option value="1">✓ Once</option>
                  <option value="7">🔁 Daily</option>
                  <option value="2">2×/wk</option>
                  <option value="3">3×/wk</option>
                  <option value="4">4×/wk</option>
                  <option value="5">5×/wk</option>
                  <option value="6">6×/wk</option>
                </select>
                <button class="${t('button')} px-4 py-2 text-sm shrink-0" onclick="window.__quickAdd('${room.id}')">Add</button>
              </div>
            ` : ''}

            <div class="flex items-center justify-between flex-wrap gap-2">
              <h2 class="${t('heading')} font-bold flex items-center gap-2">
                🎯 ${label}
                ${badge ? `<span class="${t('badge')} text-xs px-2 py-0.5">${badge}</span>` : ''}
              </h2>
              <div class="flex items-center gap-1">
                <button class="${t('buttonSecondary')} text-xs px-2 py-1 ${prevDisabled ? 'opacity-40 cursor-not-allowed' : ''}" ${prevDisabled ? 'disabled' : ''} onclick="window.__navSession(1)" title="Previous session">← prev</button>
                <button class="${t('buttonSecondary')} text-xs px-2 py-1 ${nextDisabled ? 'opacity-40 cursor-not-allowed' : ''}" ${nextDisabled ? 'disabled' : ''} onclick="window.__navSession(-1)" title="Next session">next →</button>
                ${isCurrentEpoch ? `<button class="${t('buttonSecondary')} text-xs px-2 py-1 ml-2" onclick="window.__startNewWeek('${room.id}')" title="Close this week and start a new one">🗓️ Start new week</button>` : ''}
              </div>
            </div>

            <div id="goals-list">
              ${myWeekGoals.length === 0
                ? `<div class="${t('card')} p-6 text-center ${t('muted')}">${isCurrentEpoch ? 'No weekly goals yet. Add one above or paste a transcript!' : 'No goals in this session.'}</div>`
                : myWeekGoals.map(renderMyGoal).join('')}
            </div>

            ${myNotToDos.length > 0 ? `
              <h2 class="${t('heading')} font-bold mt-4">🚫 NOT-to-do</h2>
              ${myNotToDos.map(n => `
                <div class="${t('card')} ${t('dangerBorder')} border-l-4 p-3 flex items-center justify-between">
                  <div class="flex items-center gap-3 flex-1 min-w-0 ${isCurrentEpoch ? 'cursor-pointer' : ''}" ${isCurrentEpoch ? `onclick="window.__editNotToDo('${n.id}')"` : ''}>
                    <span class="${t('danger')} text-lg">✕</span>
                    <span class="text-sm">${n.text}</span>
                    ${(n.violations || []).length > 0 ? `<span class="${t('dangerBg')} text-xs px-2 py-0.5 rounded-full">${n.violations.length} violations</span>` : ''}
                  </div>
                  ${isCurrentEpoch ? `<button class="${t('buttonDanger')} text-xs px-2 py-1 shrink-0" onclick="window.__selfReport('${n.id}')">I broke this</button>` : ''}
                </div>
              `).join('')}
            ` : ''}

            ${(() => {
              const others = members.filter(m => m.id !== user.id);
              if (others.length === 0) return '';
              const blocks = others.map(m => {
                const mGoals = epochGoals.filter(g =>
                  g.user_id === m.id &&
                  g.timeframe === 'weekly' &&
                  g.visibility === 'public'
                );
                const mNotToDos = epochNotToDos.filter(n => n.user_id === m.id && n.visibility === 'public');
                if (mGoals.length === 0 && mNotToDos.length === 0) return '';
                const mCompleted = mGoals.filter(g => g.completed).length;
                return `
                  <div class="mt-2">
                    <div class="flex items-center gap-2 mb-2">
                      <span class="text-xl">${safeAvatar(m.avatar)}</span>
                      <span class="${t('heading')} font-semibold text-sm">${m.name}</span>
                      <span class="${t('muted')} text-xs ${t('mono')}">${mCompleted}/${mGoals.length} goals</span>
                    </div>
                    <div class="space-y-2">
                      ${mGoals.map(g => goalCard(g, { readOnly: true })).join('')}
                      ${mNotToDos.map(n => `
                        <div class="${t('card')} ${t('dangerBorder')} border-l-4 p-3 flex items-center gap-3">
                          <span class="${t('danger')} text-lg">✕</span>
                          <span class="text-sm flex-1">${n.text}</span>
                          ${(n.violations || []).length > 0 ? `<span class="${t('dangerBg')} text-xs px-2 py-0.5 rounded-full">${n.violations.length} violations</span>` : ''}
                        </div>
                      `).join('')}
                    </div>
                  </div>`;
              }).filter(Boolean).join('');
              if (!blocks) return '';
              return `
                <h2 class="${t('heading')} font-bold mt-6">👥 Teammates</h2>
                ${blocks}
              `;
            })()}
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
                      <span class="shrink-0">${safeAvatar(f.avatar)}</span>
                      <span class="flex-1"><strong>${f.name}</strong> ${f.text}</span>
                      <span class="shrink-0 ${t('mono')}">${f.ago}</span>
                    </div>`;
                  }).join('')}
            </div>

            <h3 class="${t('heading')} font-bold text-sm">Room Members</h3>
            ${members.map(m => {
              const mGoals = epochGoals.filter(g => g.user_id === m.id && g.timeframe === 'weekly' && (g.visibility === 'public' || g.user_id === user.id));
              const mCompleted = mGoals.filter(g => g.completed).length;
              const mTotal = mGoals.length;
              const mPct = mTotal > 0 ? (mCompleted / mTotal) * 100 : 0;
              return `
                <div class="${t('card')} p-3 flex items-center gap-3">
                  <span class="text-2xl">${safeAvatar(m.avatar)}</span>
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
          item.innerHTML = `<span class="shrink-0">${safeAvatar(f.avatar)}</span><span class="flex-1"><strong>${f.name}</strong> ${f.text}</span><span class="shrink-0 ${t('mono')}">${f.ago}</span>`;
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
  const freqEl = document.getElementById('quick-goal-freq');
  const text = input?.value.trim();
  if (!text) return;
  const freq = parseInt(freqEl?.value) || 1;
  // freq=1 → boolean goal (no target); freq>1 → counter goal with weekly target
  const targetCount = freq > 1 ? freq : null;
  // Attach to the current (newest) session if one exists — so the goal shows up
  // in "This Week" on every device regardless of calendar week.
  const latest = epochsCache[0];
  const sessionId = latest && !latest.isLegacy && !latest.isVirtual ? latest.id : null;
  try {
    await addGoal({ roomId, text, type: 'priority', timeframe: 'weekly', period: getCurrentPeriod('weekly'), targetCount, sessionId });
    input.value = '';
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__navSession = async (direction) => {
  // +1 = prev (older), -1 = next (newer)
  const next = currentCursor + direction;
  if (next < 0 || next >= epochsCache.length) return;
  currentCursor = next;
  await renderRoomDashboard();
};

window.__startNewWeek = (roomId) => {
  // Count the viewer's unfinished goals in the current (latest) epoch
  const userId = AppState.user?.id;
  const latest = epochsCache[0];
  const unfinished = (goalsCache || []).filter(g => g.user_id === userId && !g.completed);
  const count = unfinished.length;
  const isLegacyOrVirtual = latest?.isLegacy || latest?.isVirtual;

  const body = count === 0
    ? `<p class="text-sm ${t('muted')}">You have nothing unfinished. Start a new week with a clean slate?</p>`
    : `<p class="text-sm">You have <strong>${count}</strong> unfinished goal${count === 1 ? '' : 's'} in ${isLegacyOrVirtual ? 'your current list' : 'this week'}.</p>
       <p class="text-sm ${t('muted')} mt-2">Starting a new week closes this session. Unfinished goals stay where they are — you can carry them forward or mark them done.</p>`;

  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-4">🗓️ Start new week?</h2>
    ${body}
    <div class="flex gap-2 mt-5 flex-wrap">
      <button class="${t('buttonSecondary')} py-2 px-4 text-sm" onclick="window.__closeModal()">Cancel</button>
      ${count > 0 ? `<button class="${t('button')} py-2 px-4 text-sm" onclick="window.__confirmStartNewWeek('${roomId}', true)">Carry all forward</button>` : ''}
      <button class="${t('button')} py-2 px-4 text-sm" onclick="window.__confirmStartNewWeek('${roomId}', false)">${count > 0 ? 'Start fresh' : 'Start new week'}</button>
    </div>
  </div>`);
};

window.__closeModal = () => hideModal();

window.__confirmStartNewWeek = async (roomId, carry) => {
  const userId = AppState.user?.id;
  const unfinishedIds = (goalsCache || [])
    .filter(g => g.user_id === userId && !g.completed)
    .map(g => g.id);
  try {
    const session = await createEmptySession({ roomId });
    if (carry && unfinishedIds.length > 0) {
      await carryForwardGoals(unfinishedIds, session.id);
    }
    hideModal();
    toast(carry && unfinishedIds.length > 0
      ? `New week started. Carried ${unfinishedIds.length} goal${unfinishedIds.length === 1 ? '' : 's'} forward.`
      : 'New week started.');
    currentCursor = 0;
    await renderRoomDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.__markBelatedDone = async (goalId) => {
  try {
    await toggleGoal(goalId, true);
    fireConfetti();
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__carryGoalForward = async (goalId) => {
  const latest = epochsCache[0];
  if (!latest || latest.isLegacy || latest.isVirtual) {
    toast('No current session to carry into. Start a new week first.', 'error');
    return;
  }
  try {
    await carryForwardGoals([goalId], latest.id);
    toast('Moved to this week.');
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

window.__incrementGoal = async (goalId) => {
  try {
    const updated = await incrementGoal(goalId, 1);
    if (updated.completed) fireConfetti();
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__decrementGoal = async (goalId) => {
  try {
    await incrementGoal(goalId, -1);
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

// --- Edit Goal Modal ---
window.__editGoal = (goalId) => {
  const goal = goalsCache.find(g => g.id === goalId);
  if (!goal) return;
  const isCounter = goal.target_count != null;
  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-4">Edit Goal</h2>
    <div class="space-y-3">
      <div>
        <label class="text-sm font-medium block mb-1">Goal text</label>
        <input type="text" id="edit-goal-text" class="${t('input')} w-full px-3 py-2 text-sm" value="${goal.text.replace(/"/g, '&quot;')}">
      </div>
      <div>
        <label class="text-sm font-medium block mb-1">Type</label>
        <select id="edit-goal-type" class="${t('input')} w-full px-3 py-2 text-sm">
          <option value="priority" ${goal.type === 'priority' ? 'selected' : ''}>Priority</option>
          <option value="secondary" ${goal.type === 'secondary' ? 'selected' : ''}>Secondary</option>
        </select>
      </div>
      <div>
        <label class="text-sm font-medium block mb-1">Deadline</label>
        <input type="date" id="edit-goal-deadline" class="${t('input')} w-full px-3 py-2 text-sm" value="${goal.deadline || ''}">
      </div>
      ${isCounter ? `<div>
        <label class="text-sm font-medium block mb-1">Target count</label>
        <input type="number" id="edit-goal-target" class="${t('input')} w-full px-3 py-2 text-sm" value="${goal.target_count}" min="1">
      </div>` : ''}
    </div>
    <div class="flex gap-2 mt-4">
      <button class="${t('button')} flex-1 py-3 text-sm" onclick="window.__saveGoal('${goal.id}')">Save</button>
      <button class="${t('buttonDanger')} py-3 px-4 text-sm" id="delete-goal-btn" onclick="window.__deleteGoal('${goal.id}')">Delete</button>
    </div>
  </div>`);
};

window.__saveGoal = async (goalId) => {
  const text = document.getElementById('edit-goal-text')?.value.trim();
  if (!text) { toast('Goal text is required', 'error'); return; }
  const type = document.getElementById('edit-goal-type')?.value;
  const deadline = document.getElementById('edit-goal-deadline')?.value || null;
  const targetEl = document.getElementById('edit-goal-target');
  const updates = { text, type, deadline };
  if (targetEl) updates.target_count = parseInt(targetEl.value) || 1;
  try {
    await updateGoal(goalId, updates);
    hideModal();
    toast('Goal updated');
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__deleteGoal = async (goalId) => {
  const btn = document.getElementById('delete-goal-btn');
  if (btn && !btn.dataset.confirmed) {
    btn.dataset.confirmed = 'true';
    btn.textContent = 'Confirm delete?';
    return;
  }
  try {
    await deleteGoal(goalId);
    hideModal();
    toast('Goal deleted');
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

// --- Edit Not-To-Do Modal ---
window.__editNotToDo = (notToDoId) => {
  const ntd = notToDosCache.find(n => n.id === notToDoId);
  if (!ntd) return;
  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-4">Edit NOT-to-do</h2>
    <div class="space-y-3">
      <div>
        <label class="text-sm font-medium block mb-1">Text</label>
        <input type="text" id="edit-ntd-text" class="${t('input')} w-full px-3 py-2 text-sm" value="${ntd.text.replace(/"/g, '&quot;')}">
      </div>
    </div>
    <div class="flex gap-2 mt-4">
      <button class="${t('button')} flex-1 py-3 text-sm" onclick="window.__saveNotToDo('${ntd.id}')">Save</button>
      <button class="${t('buttonDanger')} py-3 px-4 text-sm" id="delete-ntd-btn" onclick="window.__deleteNotToDo('${ntd.id}')">Delete</button>
    </div>
  </div>`);
};

window.__saveNotToDo = async (notToDoId) => {
  const text = document.getElementById('edit-ntd-text')?.value.trim();
  if (!text) { toast('Text is required', 'error'); return; }
  try {
    await updateNotToDo(notToDoId, { text });
    hideModal();
    toast('NOT-to-do updated');
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__deleteNotToDo = async (notToDoId) => {
  const btn = document.getElementById('delete-ntd-btn');
  if (btn && !btn.dataset.confirmed) {
    btn.dataset.confirmed = 'true';
    btn.textContent = 'Confirm delete?';
    return;
  }
  try {
    await deleteNotToDo(notToDoId);
    hideModal();
    toast('NOT-to-do deleted');
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};
