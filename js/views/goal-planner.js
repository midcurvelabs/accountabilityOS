import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { toast, showModal, hideModal, goalCard } from '../components.js';
import { getCurrentPeriod } from '../helpers.js';
import { fetchRoomGoals, addGoal } from '../data/goals.js';
import { fetchRoom } from '../data/rooms.js';

export async function renderGoalPlanner() {
  const roomId = AppState.currentRoom;
  if (!roomId) return navigate('rooms');
  const app = document.getElementById('app');
  app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;

  try {
    const goals = await fetchRoomGoals(roomId, { userId: AppState.user.id });
    const quarterGoals = goals.filter(g => g.timeframe === 'quarterly');
    const monthGoals = goals.filter(g => g.timeframe === 'monthly');
    const weekGoals = goals.filter(g => g.timeframe === 'weekly' && g.period === getCurrentPeriod('weekly'));

    app.innerHTML = `
      <div class="max-w-4xl mx-auto animate-fade-in-up">
        <div class="flex items-center justify-between mb-6">
          <h1 class="${t('heading')} text-2xl font-bold">Goal Planner</h1>
          <button class="${t('button')} px-4 py-2 text-sm" onclick="window.__showAddGoal('${roomId}')">+ Add Goal</button>
        </div>
        <div class="mb-6">
          <h2 class="${t('heading')} font-bold text-lg mb-3 flex items-center gap-2">🗓️ Quarterly <span class="${t('badge')} text-xs px-2 py-0.5">${getCurrentPeriod('quarterly')}</span></h2>
          ${quarterGoals.length === 0 ? `<div class="${t('muted')} text-sm mb-2">No quarterly goals</div>` :
            quarterGoals.map(g => goalCard(g, roomId)).join('')}
        </div>
        <div class="mb-6">
          <h2 class="${t('heading')} font-bold text-lg mb-3 flex items-center gap-2">📅 Monthly <span class="${t('badge')} text-xs px-2 py-0.5">${getCurrentPeriod('monthly')}</span></h2>
          ${monthGoals.length === 0 ? `<div class="${t('muted')} text-sm mb-2">No monthly goals</div>` :
            monthGoals.map(g => goalCard(g, roomId)).join('')}
        </div>
        <div class="mb-6">
          <h2 class="${t('heading')} font-bold text-lg mb-3 flex items-center gap-2">🎯 Weekly <span class="${t('badge')} text-xs px-2 py-0.5">${getCurrentPeriod('weekly')}</span></h2>
          ${weekGoals.length === 0 ? `<div class="${t('muted')} text-sm mb-2">No weekly goals</div>` :
            weekGoals.map(g => goalCard(g, roomId)).join('')}
        </div>
      </div>`;
  } catch (err) {
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${err.message}</div>`;
  }
}

window.__showAddGoal = async (roomId) => {
  const goals = await fetchRoomGoals(roomId, { userId: AppState.user.id });
  const monthGoals = goals.filter(g => g.timeframe === 'monthly');
  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-4">Add Goal</h2>
    <div class="space-y-3">
      <div><label class="text-sm font-medium block mb-1">Goal</label><input type="text" id="goal-text" class="${t('input')} w-full px-3 py-2 text-sm" placeholder="What do you want to achieve?"></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-sm font-medium block mb-1">Type</label><select id="goal-type" class="${t('input')} w-full px-3 py-2 text-sm"><option value="priority">🎯 Priority</option><option value="secondary">📝 Secondary</option></select></div>
        <div><label class="text-sm font-medium block mb-1">Timeframe</label><select id="goal-timeframe" class="${t('input')} w-full px-3 py-2 text-sm"><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></select></div>
      </div>
      <div id="parent-goal-section"><label class="text-sm font-medium block mb-1">Parent Goal (optional)</label><select id="goal-parent" class="${t('input')} w-full px-3 py-2 text-sm"><option value="">None</option>${monthGoals.map(g => `<option value="${g.id}">${g.text}</option>`).join('')}</select></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-sm font-medium block mb-1">Deadline</label><input type="date" id="goal-deadline" class="${t('input')} w-full px-3 py-2 text-sm"></div>
        <div><label class="text-sm font-medium block mb-1">Visibility</label><select id="goal-visibility" class="${t('input')} w-full px-3 py-2 text-sm"><option value="public">👁️ Public</option><option value="anonymous">🔒 Anonymous</option></select></div>
      </div>
    </div>
    <button class="${t('button')} w-full py-3 text-sm mt-4" onclick="window.__addGoal('${roomId}')">Add Goal</button>
  </div>`);
};

window.__addGoal = async (roomId) => {
  const text = document.getElementById('goal-text')?.value.trim();
  if (!text) { toast('Enter a goal', 'error'); return; }
  const type = document.getElementById('goal-type').value;
  const timeframe = document.getElementById('goal-timeframe').value;
  const parentGoalId = document.getElementById('goal-parent')?.value || null;
  const deadline = document.getElementById('goal-deadline')?.value || null;
  const visibility = document.getElementById('goal-visibility').value;
  try {
    await addGoal({ roomId, text, type, timeframe, period: getCurrentPeriod(timeframe), parentGoalId, deadline, visibility });
    hideModal();
    toast('Goal added!');
    await renderGoalPlanner();
  } catch (err) { toast(err.message, 'error'); }
};
