import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { progressRing } from '../components.js';
import { fetchRoom } from '../data/rooms.js';
import { fetchRoomGoals, fetchNotToDos } from '../data/goals.js';
import { fetchDeepWork } from '../data/deep-work.js';
import { calculatePoints, calculateCompletionRate } from '../data/points.js';

export async function renderRoomLeaderboard() {
  const roomId = AppState.currentRoom;
  if (!roomId) return navigate('rooms');
  const app = document.getElementById('app');
  app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;

  try {
    const [room, goals, notToDos, deepWork] = await Promise.all([
      fetchRoom(roomId),
      fetchRoomGoals(roomId),
      fetchNotToDos(roomId),
      fetchDeepWork(roomId)
    ]);

    const shame = room.settings?.publicShame;
    const thresholds = room.settings?.shameThresholds || {};

    const members = (room.members || []).map(m => {
      const mGoals = goals.filter(g => g.user_id === m.id);
      const mCompleted = mGoals.filter(g => g.completed).length;
      const mTotal = mGoals.length;
      const mViolations = notToDos.filter(n => n.user_id === m.id).reduce((s, n) => s + (n.violations?.length || 0), 0);
      const mDeepWork = deepWork.filter(d => d.user_id === m.id).reduce((s, d) => s + parseFloat(d.hours), 0);
      const completionRate = mTotal > 0 ? mCompleted / mTotal : 0;
      const points = calculatePoints(mGoals, [], deepWork.filter(d => d.user_id === m.id), [], {});
      return { ...m, points, completed: mCompleted, total: mTotal, completionRate, violations: mViolations, deepWorkHrs: mDeepWork };
    }).sort((a, b) => b.points - a.points);

    app.innerHTML = `
      <div class="max-w-2xl mx-auto animate-fade-in-up">
        <h1 class="${t('heading')} text-2xl font-bold mb-6 text-center">🏆 ${room.name} Leaderboard</h1>
        <div class="space-y-3">
          ${members.map((m, i) => {
            const isFirst = i === 0;
            const labels = [];
            if (shame) {
              if (m.completionRate < (thresholds.minCompletion || 0.5) && m.total > 0) labels.push({ text: 'Slipping', cls: t('dangerBg') });
              if (m.violations >= (thresholds.maxViolations || 3)) labels.push({ text: 'Undisciplined', cls: t('dangerBg') });
              if (thresholds.minDeepWorkHours > 0 && m.deepWorkHrs < thresholds.minDeepWorkHours) labels.push({ text: 'Ghost', cls: t('warningBg') });
            }
            return `
              <div class="${t('card')} p-4 flex items-center gap-4 animate-fade-in-up ${isFirst ? t('accentBorder') + ' border-2' : ''}" style="animation-delay:${i * 0.1}s">
                <div class="${t('mono')} text-2xl font-bold w-10 text-center ${isFirst ? t('accent') : t('muted')}">${isFirst ? '👑' : `#${i + 1}`}</div>
                <span class="text-3xl">${m.avatar}</span>
                <div class="flex-1">
                  <div class="${t('heading')} font-bold">${m.name}</div>
                  <div class="flex items-center gap-2 text-xs ${t('muted')} ${t('mono')} flex-wrap">
                    <span>✅ ${m.completed}/${m.total}</span>
                    <span>⏱️ ${m.deepWorkHrs.toFixed(1)}h</span>
                    ${labels.map(l => `<span class="${l.cls} text-xs px-2 py-0.5 rounded-full font-bold">${l.text}</span>`).join('')}
                  </div>
                </div>
                <div class="${t('accent')} ${t('mono')} text-xl font-bold">${m.points}</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  } catch (err) {
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${err.message}</div>`;
  }
}
