// ============================================================
// Challenge detail view + import handler
// Both live here: they share state (the challenge being created/viewed)
// and the import resolves into the same render path.
// ============================================================
import { t } from '../themes.js';
import { AppState } from '../state.js';
import { navigate, parseRoute } from '../router.js';
import { toast, showModal, hideModal } from '../components.js';
import { formatShortDate, debounce } from '../helpers.js';
import {
  fetchChallengeWithDays,
  toggleChallengeDay,
  updateChallengeDayNote,
  createChallengeFromPlan,
  shareChallengeToRoom,
} from '../data/challenges.js';
import {
  fetchPostsForChallenge,
  createChallengePost,
  deleteChallengePost,
} from '../data/challenge-posts.js';
import { fetchUserRooms } from '../data/rooms.js';
import { subscribeToChallenge, unsubscribeChallenge } from '../realtime.js';

const PLAN_API_BASE = 'https://30x30.midcurved.com';

let cache = { id: null, challenge: null, days: [], posts: [] };

// ─── Import handler ─────────────────────────────────────────

export async function renderImport() {
  const app = document.getElementById('app');
  const route = parseRoute(location.hash.slice(1));
  const token = route.importToken;

  if (!token) return navigate('challenges');

  // Not authed: stash token, route to login. Resume in app.js onAuthChange.
  if (!AppState.user) {
    sessionStorage.setItem('pending_import_token', token);
    app.innerHTML = `
      <div class="max-w-md mx-auto text-center py-12 animate-fade-in-up">
        <div class="text-5xl mb-4">📅</div>
        <h1 class="${t('heading')} text-2xl font-bold mb-2">Import a 30-day plan</h1>
        <p class="${t('muted')} mb-6">Sign in to import this plan as a tracked challenge.</p>
        <button class="${t('button')} px-8 py-3 text-sm" onclick="window.__nav('login')">Sign in to import</button>
      </div>`;
    return;
  }

  app.innerHTML = `
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin mb-4"></div>
        <div class="${t('muted')} text-sm">Importing your 30-day plan…</div>
      </div>
    </div>`;

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
      roomId: null,
    });
    toast('Plan imported — ready to track', 'success');
    navigate(`challenge/${challenge.id}`);
  } catch (err) {
    app.innerHTML = `
      <div class="max-w-md mx-auto text-center py-12 animate-fade-in-up">
        <div class="text-5xl mb-4">😕</div>
        <h1 class="${t('heading')} text-xl font-bold mb-2">Couldn't import</h1>
        <p class="${t('danger')} mb-6">${escapeHtml(err.message)}</p>
        <button class="${t('buttonSecondary')} px-6 py-3 text-sm" onclick="window.__nav('challenges')">Go to Challenges</button>
      </div>`;
  }
}

function inferTitle(plan, createdAt) {
  // Prefer the first non-empty week label, else fall back to a date-stamped title.
  const firstLabel = (plan.weeks || []).find(w => w.label)?.label;
  if (firstLabel && !/^week\s*1/i.test(firstLabel)) return firstLabel;
  const date = createdAt ? formatShortDate(createdAt) : formatShortDate(new Date());
  return `30-day plan · ${date}`;
}

// ─── Detail view ────────────────────────────────────────────

const debouncedRender = debounce(() => renderChallenge(), 400);

export async function renderChallenge() {
  if (!AppState.user) return navigate('login');
  const app = document.getElementById('app');
  const route = parseRoute(location.hash.slice(1));
  const challengeId = route.challengeId;
  if (!challengeId) return navigate('challenges');

  // First load for this challenge — show spinner.
  if (cache.id !== challengeId) {
    cache = { id: challengeId, challenge: null, days: [], posts: [] };
    app.innerHTML = `<div class="flex items-center justify-center py-12"><div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div></div>`;
  }

  try {
    const { challenge, days } = await fetchChallengeWithDays(challengeId);
    // Posts are only meaningful when the challenge is shared to a room.
    const posts = challenge.room_id
      ? await fetchPostsForChallenge(challengeId).catch(() => [])
      : [];
    cache = { id: challengeId, challenge, days, posts };

    // Subscribe to realtime updates — debounced re-render on any change.
    subscribeToChallenge(challengeId, {
      onDayChange: () => debouncedRender(),
    });

    const total = days.length;
    const done = days.filter(d => d.completed).length;
    const pct = total > 0 ? (done / total) * 100 : 0;
    const streak = currentStreak(days);
    const grouped = groupByWeek(challenge.plan_json, days);
    const viewerDay = computeViewerDay(challenge.started_at, total);
    const postsByDay = groupPostsByDay(posts);

    app.innerHTML = `
      <div class="max-w-3xl mx-auto animate-fade-in-up">
        <div class="mb-4">
          <button class="${t('muted')} text-sm hover:${t('heading')}" onclick="window.__nav('challenges')">← All challenges</button>
        </div>
        <div class="${t('card')} p-6 mb-6 flex items-center gap-6">
          <div class="shrink-0">${ringSvg(pct)}</div>
          <div class="flex-1 min-w-0">
            <h1 class="${t('heading')} text-2xl font-bold mb-1">${escapeHtml(challenge.title)}</h1>
            <div class="${t('muted')} text-sm flex items-center gap-3 flex-wrap">
              <span>${done}/${total} days</span>
              <span>·</span>
              <span>${streak}-day streak</span>
              <span>·</span>
              <span>Started ${formatShortDate(challenge.started_at)}</span>
            </div>
          </div>
          <div class="shrink-0">
            ${challenge.room_id
              ? `<button class="${t('buttonSecondary')} px-3 py-2 text-xs" onclick="window.__makeChallengeSolo()">↩ Make solo again</button>`
              : `<button class="${t('buttonSecondary')} px-3 py-2 text-xs" onclick="window.__openShareModal()">Share to a room</button>`}
          </div>
        </div>

        ${challenge.room_id ? `
          <div class="${t('card')} p-3 mb-4 flex items-center justify-between">
            <div class="${t('muted')} text-xs">📍 In cohort — see leaderboard, today's distribution, and other members' standups.</div>
            <button class="${t('buttonSecondary')} px-3 py-1.5 text-xs" onclick="window.__nav('room/${challenge.room_id}/challenge/${challenge.id}')">Open cohort →</button>
          </div>
        ` : ''}

        ${grouped.map(group => `
          <div class="mb-6">
            ${group.label ? `<div class="${t('muted')} text-xs ${t('mono')} uppercase tracking-wider mb-2">${escapeHtml(group.label)}</div>` : ''}
            <div class="space-y-2">
              ${group.days.map(d => dayRow(d, {
                isShared: !!challenge.room_id,
                viewerDay,
                postsForDay: postsByDay[d.day_number] || [],
              })).join('')}
            </div>
          </div>
        `).join('')}
      </div>`;
  } catch (err) {
    app.innerHTML = `<div class="${t('card')} p-6 text-center ${t('danger')}">${escapeHtml(err.message)}</div>`;
  }
}

function dayRow(d, opts = {}) {
  const num = String(d.day_number).padStart(2, '0');
  const hasNote = d.note && d.note.length > 0;
  const { isShared = false, viewerDay = 1, postsForDay = [] } = opts;
  const isCurrentDay = isShared && d.day_number === viewerDay;
  const postCount = postsForDay.length;
  return `
    <div class="${t('card')} p-3 flex items-start gap-3 ${d.completed ? 'opacity-60' : ''}">
      <label class="flex items-center cursor-pointer mt-0.5">
        <input type="checkbox" class="hidden" ${d.completed ? 'checked' : ''} onchange="window.__toggleChallengeDay('${d.id}', !${d.completed})">
        <div class="w-5 h-5 rounded border-2 ${d.completed ? t('successBg') + ' ' + t('successBorder') : t('accentBorder')} flex items-center justify-center transition-all">
          ${d.completed ? '<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>' : ''}
        </div>
      </label>
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2">
          <span class="${t('mono')} ${t('accent')} text-sm font-bold shrink-0">${num}</span>
          <div class="${d.completed ? 'line-through' : ''} font-medium text-sm">${escapeHtml(d.title)}</div>
          ${isCurrentDay ? `<span class="${t('accentBg')} text-xs px-1.5 py-0.5 rounded-full ${t('mono')}">today</span>` : ''}
        </div>
        ${d.description ? `<div class="${t('muted')} text-xs mt-1">${escapeHtml(d.description)}</div>` : ''}
        <details class="mt-2" ${hasNote ? 'open' : ''}>
          <summary class="${t('muted')} text-xs cursor-pointer hover:${t('heading')}">${hasNote ? '✏️ Edit note' : '+ Add a note'}</summary>
          <textarea
            class="${t('input')} w-full px-2 py-1 text-xs mt-2 ${t('mono')}"
            rows="2"
            placeholder="What did you build / learn today?"
            onblur="window.__saveChallengeDayNote('${d.id}', this.value)">${escapeHtml(d.note || '')}</textarea>
        </details>
        ${isShared ? renderDayPosts(d.day_number, postsForDay, isCurrentDay) : ''}
      </div>
    </div>`;
}

function renderDayPosts(dayNumber, posts, isCurrentDay) {
  const composer = isCurrentDay ? `
    <div class="${t('surface')} rounded-xl p-2 mt-2 mb-2">
      <textarea
        id="day-post-text-${dayNumber}"
        class="${t('input')} w-full px-2 py-1 text-xs mb-1.5"
        rows="2"
        placeholder="Post a 1-line standup for Day ${dayNumber}"></textarea>
      <div class="flex items-center gap-1.5">
        <input
          id="day-post-link-${dayNumber}"
          type="url"
          class="${t('input')} flex-1 px-2 py-1 text-xs"
          placeholder="Optional link" />
        <button class="${t('button')} px-3 py-1 text-xs" onclick="window.__submitDayPost(${dayNumber})">Post</button>
      </div>
    </div>
  ` : '';

  if (posts.length === 0 && !isCurrentDay) return '';

  const list = posts.length === 0 ? '' : `
    <details class="mt-2" ${isCurrentDay ? 'open' : ''}>
      <summary class="${t('muted')} text-xs cursor-pointer hover:${t('heading')}">${posts.length} ${posts.length === 1 ? 'standup' : 'standups'}</summary>
      <div class="space-y-1.5 mt-2">
        ${posts.map(p => {
          const profile = p.profiles || {};
          const avatar = profile.avatar || '👤';
          const name = profile.name || 'You';
          return `
            <div class="${t('surface')} rounded-lg px-2 py-1.5 flex items-start gap-2">
              <div class="text-sm shrink-0">${escapeHtml(avatar)}</div>
              <div class="flex-1 min-w-0">
                <div class="${t('muted')} text-xs">${escapeHtml(name)} · ${formatRelativeTime(p.created_at)}</div>
                <div class="text-xs whitespace-pre-wrap break-words">${escapeHtml(p.text)}</div>
                ${p.link ? `<a href="${escapeAttr(p.link)}" target="_blank" rel="noopener" class="${t('accent')} text-xs hover:underline break-all">${escapeHtml(p.link)} ↗</a>` : ''}
              </div>
              <button class="${t('muted')} text-xs hover:${t('danger')} shrink-0" onclick="window.__deleteDayPost('${p.id}')">×</button>
            </div>
          `;
        }).join('')}
      </div>
    </details>
  `;

  return `${composer}${list}`;
}

function computeViewerDay(startedAt, total) {
  if (!startedAt || !total) return 1;
  const start = new Date(startedAt);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - start) / 86_400_000);
  return Math.max(1, Math.min(diffDays + 1, total));
}

function groupPostsByDay(posts) {
  const out = {};
  for (const p of posts) {
    (out[p.day_number] = out[p.day_number] || []).push(p);
  }
  // Posts arrive newest-first from the data layer; preserve that order.
  return out;
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

function escapeAttr(s) {
  return escapeHtml(s);
}

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

function currentStreak(days) {
  // Longest run of consecutive completed days starting from day 1.
  // Simple definition: how many leading days are completed.
  const sorted = [...days].sort((a, b) => a.day_number - b.day_number);
  let n = 0;
  for (const d of sorted) {
    if (d.completed) n++;
    else break;
  }
  return n;
}

function groupByWeek(planJson, days) {
  // If the plan_json preserved week labels, group days by those week boundaries.
  // Otherwise return a single ungrouped bucket.
  const weeks = planJson?.weeks;
  if (!Array.isArray(weeks) || weeks.length === 0) {
    return [{ label: null, days: [...days].sort((a, b) => a.day_number - b.day_number) }];
  }
  const dayById = new Map(days.map(d => [d.day_number, d]));
  return weeks.map(week => ({
    label: week.label || null,
    days: (week.days || [])
      .map(d => dayById.get(d.day))
      .filter(Boolean),
  }));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ─── Window handlers ────────────────────────────────────────

window.__toggleChallengeDay = async (dayId, completed) => {
  try {
    await toggleChallengeDay(dayId, completed);
    // Optimistic: realtime will fire and trigger a debounced re-render.
    // Also update local cache so an immediate re-render reflects the change.
    const day = cache.days.find(d => d.id === dayId);
    if (day) {
      day.completed = completed;
      day.completed_at = completed ? new Date().toISOString() : null;
    }
    debouncedRender();
  } catch (err) {
    toast(err.message || 'Failed to toggle day', 'error');
  }
};

window.__saveChallengeDayNote = async (dayId, note) => {
  const day = cache.days.find(d => d.id === dayId);
  if (day && (day.note || '') === (note || '')) return; // no change
  try {
    await updateChallengeDayNote(dayId, note);
    if (day) day.note = note || null;
    // No re-render — the textarea is already in sync; avoid stealing focus.
  } catch (err) {
    toast(err.message || 'Failed to save note', 'error');
  }
};

window.__openShareModal = async () => {
  if (!cache.challenge) return;
  let rooms = [];
  try {
    rooms = await fetchUserRooms();
  } catch (err) {
    toast(err.message || 'Failed to load rooms', 'error');
    return;
  }
  if (rooms.length === 0) {
    toast('Join or create a room first', 'info');
    return;
  }
  const challengeId = cache.challenge.id;
  showModal(`
    <div class="p-6">
      <h2 class="${t('heading')} text-lg font-bold mb-1">Share to a room</h2>
      <p class="${t('muted')} text-sm mb-4">Members will see this challenge and can post daily standups under each day.</p>
      <div class="space-y-2 max-h-80 overflow-y-auto">
        ${rooms.map(r => `
          <button
            class="${t('card')} ${t('cardHover')} w-full text-left p-3 flex items-center justify-between"
            onclick="window.__confirmShareTo('${challengeId}', '${r.id}', '${escapeHtml(r.name).replace(/'/g, '&#39;')}')">
            <div class="${t('heading')} font-medium text-sm">${escapeHtml(r.name)}</div>
            <div class="${t('accent')} text-lg">→</div>
          </button>
        `).join('')}
      </div>
      <div class="flex justify-end mt-4">
        <button class="${t('buttonSecondary')} px-4 py-2 text-sm" onclick="window.__hideModal()">Cancel</button>
      </div>
    </div>
  `);
};

window.__hideModal = () => hideModal();

window.__confirmShareTo = async (challengeId, roomId, roomName) => {
  hideModal();
  try {
    await shareChallengeToRoom(challengeId, roomId);
    toast(`Shared to ${roomName}`, 'success');
    navigate(`room/${roomId}/challenge/${challengeId}`);
  } catch (err) {
    toast(err.message || 'Failed to share', 'error');
  }
};

window.__makeChallengeSolo = async () => {
  if (!cache.challenge) return;
  if (!confirm('Make this challenge solo? Members will lose access; your toggles and notes are preserved.')) return;
  try {
    await shareChallengeToRoom(cache.challenge.id, null);
    toast('Challenge is now solo', 'success');
    await renderChallenge();
  } catch (err) {
    toast(err.message || 'Failed to make solo', 'error');
  }
};

window.__submitDayPost = async (dayNumber) => {
  if (!cache.challenge) return;
  const textEl = document.getElementById(`day-post-text-${dayNumber}`);
  const linkEl = document.getElementById(`day-post-link-${dayNumber}`);
  const text = (textEl?.value || '').trim();
  const link = (linkEl?.value || '').trim() || null;
  if (!text) {
    toast('Write a quick line first', 'info');
    return;
  }
  try {
    await createChallengePost({
      challengeId: cache.challenge.id,
      dayNumber,
      text,
      link,
    });
    if (textEl) textEl.value = '';
    if (linkEl) linkEl.value = '';
    await renderChallenge();
  } catch (err) {
    toast(err.message || 'Failed to post', 'error');
  }
};

window.__deleteDayPost = async (postId) => {
  if (!confirm('Delete this post?')) return;
  try {
    await deleteChallengePost(postId);
    await renderChallenge();
  } catch (err) {
    toast(err.message || 'Failed to delete', 'error');
  }
};
