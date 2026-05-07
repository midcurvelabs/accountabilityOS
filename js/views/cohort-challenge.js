// ============================================================
// Cohort challenge dashboard
// Route: #room/<roomId>/challenge/<challengeId>
//
// Surfaces a multiplayer view of a shared challenge:
//   - Cohort progress ring (aggregate completion %)
//   - Today's-day distribution (histogram of members per current_day)
//   - Leaderboard (members sorted by completed_days desc)
//   - Today's standup feed (posts on the viewer's current day)
//   - Composer (post a 1-line standup + optional link)
//
// Realtime: posts arrive via subscribeToCohortChallenge.
// Completion-state updates arrive via 10s RPC poll (see plan task 8 for
// the rationale: challenge_days has no room_id column, so per-day filtered
// realtime would require denormalization that's deferred to v3).
// ============================================================
import { AppState } from '../state.js';
import { navigate } from '../router.js';
import { t } from '../themes.js';
import { toast } from '../components.js';
import { formatShortDate } from '../helpers.js';
import {
  fetchChallengeWithDays,
  getCohortChallengeSummary,
} from '../data/challenges.js';
import {
  fetchPostsForCohortDay,
  createChallengePost,
  deleteChallengePost,
} from '../data/challenge-posts.js';
import { fetchRoom } from '../data/rooms.js';
import {
  subscribeToCohortChallenge,
  unsubscribeAll,
} from '../realtime.js';

const POLL_MS = 10_000;
let pollHandle = null;
let lastRendered = { roomId: null, challengeId: null };

export async function renderCohortChallenge() {
  if (!AppState.user) return navigate('login');
  const roomId = AppState.currentRoom;
  const challengeId = AppState.routeParams?.challengeId;
  if (!roomId || !challengeId) return navigate('challenges');

  const app = document.getElementById('app');

  // First load → show spinner. Re-renders skip the spinner to avoid flicker.
  if (lastRendered.roomId !== roomId || lastRendered.challengeId !== challengeId) {
    app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;
    lastRendered = { roomId, challengeId };
  }

  try {
    const [room, withDays, summary] = await Promise.all([
      fetchRoom(roomId),
      fetchChallengeWithDays(challengeId),
      getCohortChallengeSummary(roomId, challengeId),
    ]);
    const { challenge, days } = withDays;

    // Viewer's row in the cohort (if they have one).
    const myRow = summary.find(s => s.user_id === AppState.user.id);
    const viewerDay = myRow?.current_day ?? 1;

    // Posts for the viewer's day across the whole cohort.
    const cohortChallengeIds = summary.map(s => s.challenge_id);
    const todayPosts = await fetchPostsForCohortDay(cohortChallengeIds, viewerDay);

    // Aggregate stats
    const totalCompleted = summary.reduce((s, r) => s + (r.completed_days || 0), 0);
    const totalPossible  = summary.reduce((s, r) => s + (r.total_days || 0), 0);
    const cohortPct = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    // Today's-day distribution
    const dayHistogram = summary.reduce((acc, s) => {
      const d = s.current_day || 1;
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {});
    const histogramMax = Object.values(dayHistogram).reduce((m, v) => Math.max(m, v), 0);

    app.innerHTML = renderCohortHTML({
      room, challenge, days, summary, viewerDay, todayPosts,
      dayHistogram, histogramMax, cohortPct, totalCompleted, totalPossible, myRow,
    });

    // Realtime: cohort posts
    subscribeToCohortChallenge(roomId, challengeId, new Set(cohortChallengeIds), {
      onPost: () => renderCohortChallenge(),
    });

    // Poll the RPC every 10s for completion-state updates.
    if (pollHandle) clearInterval(pollHandle);
    pollHandle = setInterval(() => {
      if (AppState.currentView === 'cohort-challenge') {
        renderCohortChallenge();
      } else {
        clearInterval(pollHandle);
        pollHandle = null;
        unsubscribeAll();
        lastRendered = { roomId: null, challengeId: null };
      }
    }, POLL_MS);

    wireCohortHandlers(challengeId, viewerDay, summary);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${escapeHtml(err.message || 'Failed to load cohort')}</div>`;
  }
}

// ─── HTML ──────────────────────────────────────────────────

function renderCohortHTML({
  room, challenge, days, summary, viewerDay, todayPosts,
  dayHistogram, histogramMax, cohortPct, totalCompleted, totalPossible, myRow,
}) {
  const totalDays = days.length;
  const memberCount = summary.length;

  const distribution = renderDistribution(dayHistogram, histogramMax, totalDays, viewerDay);
  const leaderboard  = renderLeaderboard(summary, AppState.user.id);
  const feed         = renderFeed(todayPosts, viewerDay, !!myRow);

  return `
    <div class="max-w-4xl mx-auto animate-fade-in-up">
      <div class="mb-4 flex items-center justify-between">
        <button class="${t('muted')} text-sm hover:${t('heading')}" onclick="window.__nav('room/${room.id}/room-dashboard')">← ${escapeHtml(room.name)}</button>
        <button class="${t('buttonSecondary')} px-3 py-1.5 text-xs" onclick="window.__nav('challenge/${challenge.id}')">Open my view →</button>
      </div>

      <div class="${t('card')} p-6 mb-6 flex items-center gap-6">
        <div class="shrink-0">${ringSvg(cohortPct)}</div>
        <div class="flex-1 min-w-0">
          <h1 class="${t('heading')} text-2xl font-bold mb-1">${escapeHtml(challenge.title)}</h1>
          <div class="${t('muted')} text-sm flex items-center gap-3 flex-wrap">
            <span>${memberCount} ${memberCount === 1 ? 'member' : 'members'}</span>
            <span>·</span>
            <span>${totalCompleted}/${totalPossible} days completed</span>
            <span>·</span>
            <span>You're on Day ${viewerDay}${myRow ? '' : ' (not started)'}</span>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div class="${t('card')} p-4">
          <div class="${t('muted')} text-xs ${t('mono')} uppercase tracking-wider mb-3">Today's day distribution</div>
          ${distribution}
        </div>
        <div class="${t('card')} p-4">
          <div class="${t('muted')} text-xs ${t('mono')} uppercase tracking-wider mb-3">Leaderboard</div>
          ${leaderboard}
        </div>
      </div>

      <div class="${t('card')} p-4">
        <div class="${t('muted')} text-xs ${t('mono')} uppercase tracking-wider mb-3">Day ${viewerDay} standups</div>
        ${feed}
      </div>
    </div>
  `;
}

function renderDistribution(histogram, histogramMax, totalDays, viewerDay) {
  if (Object.keys(histogram).length === 0) {
    return `<div class="${t('muted')} text-sm py-2">Nobody has started yet.</div>`;
  }
  // Show only days with members on them, sorted ascending.
  const entries = Object.entries(histogram)
    .map(([d, count]) => ({ day: parseInt(d, 10), count }))
    .sort((a, b) => a.day - b.day);

  return `
    <div class="space-y-1.5">
      ${entries.map(e => {
        const pct = histogramMax > 0 ? (e.count / histogramMax) * 100 : 0;
        const isMine = e.day === viewerDay;
        return `
          <div class="flex items-center gap-3">
            <div class="${t('mono')} text-xs w-16 shrink-0 ${isMine ? t('accent') : t('muted')}">Day ${String(e.day).padStart(2, '0')}</div>
            <div class="flex-1 h-5 rounded-md overflow-hidden ${t('surface')} relative">
              <div class="h-full ${isMine ? t('successBg') : t('accentBg')} transition-all" style="width:${pct}%"></div>
            </div>
            <div class="${t('mono')} text-xs w-8 text-right shrink-0">${e.count}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderLeaderboard(summary, viewerId) {
  if (summary.length === 0) {
    return `<div class="${t('muted')} text-sm py-2">No cohort members yet — be the first to share a plan.</div>`;
  }
  // Already ordered by completed_days desc from the RPC.
  const top = summary.slice(0, 10);
  return `
    <div class="space-y-1.5">
      ${top.map((row, i) => {
        const isMe = row.user_id === viewerId;
        const total = row.total_days || 1;
        const pct = Math.round((row.completed_days / total) * 100);
        const avatar = row.avatar || '👤';
        const name = row.name || 'Member';
        return `
          <div class="flex items-center gap-2 ${isMe ? `${t('accentBorder')} border` : ''} rounded-lg px-2 py-1.5">
            <div class="${t('mono')} text-xs ${t('muted')} w-5 shrink-0">${i + 1}</div>
            <div class="text-base shrink-0">${escapeHtml(avatar)}</div>
            <div class="flex-1 min-w-0">
              <div class="text-sm truncate ${isMe ? t('accent') : ''}">${escapeHtml(name)}${isMe ? ' (you)' : ''}</div>
            </div>
            <div class="${t('mono')} text-xs ${t('muted')} shrink-0">${row.completed_days}/${row.total_days}</div>
            <div class="${t('mono')} text-xs ${t('accent')} w-10 text-right shrink-0">${pct}%</div>
          </div>
        `;
      }).join('')}
      ${summary.length > 10 ? `<div class="${t('muted')} text-xs text-center pt-2">+${summary.length - 10} more</div>` : ''}
    </div>
  `;
}

function renderFeed(posts, viewerDay, viewerInCohort) {
  const composer = viewerInCohort ? `
    <div class="${t('surface')} rounded-xl p-3 mb-3">
      <textarea
        id="cohort-post-text"
        class="${t('input')} w-full px-3 py-2 text-sm mb-2"
        rows="2"
        placeholder="What did you build / learn on Day ${viewerDay}? (1 line)"></textarea>
      <div class="flex items-center gap-2">
        <input
          id="cohort-post-link"
          type="url"
          class="${t('input')} flex-1 px-3 py-1.5 text-xs"
          placeholder="Optional link (your build, repo, video…)" />
        <button class="${t('button')} px-4 py-1.5 text-xs" onclick="window.__submitCohortPost()">Post</button>
      </div>
    </div>
  ` : `
    <div class="${t('muted')} text-xs italic mb-3">Share this challenge to a room you're in to post a standup.</div>
  `;

  const list = posts.length === 0
    ? `<div class="${t('muted')} text-sm py-2 text-center">No standups for Day ${viewerDay} yet — go first.</div>`
    : posts.map(p => {
        const profile = p.profiles || {};
        const avatar = profile.avatar || '👤';
        const name = profile.name || 'Member';
        const isMine = p.user_id === AppState.user.id;
        return `
          <div class="${t('surface')} rounded-xl p-3 flex items-start gap-3">
            <div class="text-lg shrink-0">${escapeHtml(avatar)}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline gap-2 flex-wrap">
                <div class="${t('heading')} text-sm font-medium">${escapeHtml(name)}</div>
                <div class="${t('muted')} text-xs">${formatRelativeTime(p.created_at)}</div>
                ${isMine ? `<button class="${t('muted')} text-xs hover:${t('danger')}" onclick="window.__deleteCohortPost('${p.id}')">delete</button>` : ''}
              </div>
              <div class="text-sm mt-0.5 whitespace-pre-wrap break-words">${escapeHtml(p.text)}</div>
              ${p.link ? `<a href="${escapeAttr(p.link)}" target="_blank" rel="noopener" class="${t('accent')} text-xs hover:underline break-all inline-block mt-1">${escapeHtml(p.link)} ↗</a>` : ''}
            </div>
          </div>
        `;
      }).join('');

  return `
    ${composer}
    <div class="space-y-2">${list}</div>
  `;
}

// ─── Helpers ───────────────────────────────────────────────

function ringSvg(percent) {
  const size = 84, stroke = 7, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c, cx = size / 2;
  const colors = t('ring');
  return `<svg width="${size}" height="${size}" class="block">
    <circle cx="${cx}" cy="${cx}" r="${r}" stroke="${colors.track}" stroke-width="${stroke}" fill="none"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" stroke="${colors.fill}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cx})"/>
    <text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" class="${t('mono')} ${t('accent')}" font-size="${size * 0.22}" fill="currentColor">${Math.round(percent)}%</text>
  </svg>`;
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now  = Date.now();
  const diff = Math.max(0, Math.floor((now - then) / 1000));
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatShortDate(iso);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// ─── Window handlers ───────────────────────────────────────

function wireCohortHandlers(challengeId, viewerDay, summary) {
  // The viewer posts under THEIR challenge in the cohort, not the
  // reference challengeId — find their row.
  const myRow = summary.find(s => s.user_id === AppState.user.id);
  const myChallengeId = myRow?.challenge_id || challengeId;

  window.__submitCohortPost = async () => {
    const textEl = document.getElementById('cohort-post-text');
    const linkEl = document.getElementById('cohort-post-link');
    const text = (textEl?.value || '').trim();
    const link = (linkEl?.value || '').trim() || null;
    if (!text) {
      toast('Write a quick line first', 'info');
      return;
    }
    try {
      await createChallengePost({
        challengeId: myChallengeId,
        dayNumber: viewerDay,
        text,
        link,
      });
      if (textEl) textEl.value = '';
      if (linkEl) linkEl.value = '';
      // Realtime will re-render. Force one immediately so the post appears
      // even if the user's own INSERT event is filtered (depends on RLS).
      await renderCohortChallenge();
    } catch (err) {
      toast(err.message || 'Failed to post', 'error');
    }
  };

  window.__deleteCohortPost = async (postId) => {
    if (!confirm('Delete this post?')) return;
    try {
      await deleteChallengePost(postId);
      await renderCohortChallenge();
    } catch (err) {
      toast(err.message || 'Failed to delete', 'error');
    }
  };
}
