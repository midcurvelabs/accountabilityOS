// ============================================================
// Shared UI Components
// ============================================================
import { t } from './themes.js';

export function progressRing(percent, size = 80) {
  const colors = t('ring'); const stroke = 6; const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r; const offset = c - (percent / 100) * c; const cx = size / 2;
  return `<svg width="${size}" height="${size}" class="block">
    <circle cx="${cx}" cy="${cx}" r="${r}" stroke="${colors.track}" stroke-width="${stroke}" fill="none"/>
    <circle cx="${cx}" cy="${cx}" r="${r}" stroke="${colors.fill}" stroke-width="${stroke}" fill="none" stroke-linecap="round" class="progress-ring-circle" stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
    <text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" class="${t('mono')} ${t('accent')}" font-size="${size*0.22}" fill="currentColor">${Math.round(percent)}%</text>
  </svg>`;
}

export function toast(message, type = 'success') {
  const container = document.getElementById('toasts');
  const colors = { success: 'border-l-4 border-l-green-500', error: 'border-l-4 border-l-red-500', info: 'border-l-4 border-l-blue-500' };
  const el = document.createElement('div');
  el.className = `${t('toast')} ${colors[type] || ''} px-4 py-3 animate-toast-in min-w-[250px]`;
  el.textContent = message; container.appendChild(el);
  setTimeout(() => { el.classList.add('animate-toast-out'); el.addEventListener('animationend', () => el.remove()); }, 3000);
}

export function showModal(html) {
  const modal = document.getElementById('modal'), content = document.getElementById('modal-content');
  content.className = `relative z-10 w-full max-w-xl mx-4 max-h-[85vh] overflow-y-auto animate-slide-up ${t('modal')} max-md:max-w-none max-md:mx-0 max-md:max-h-full max-md:h-full max-md:rounded-none`;
  content.innerHTML = html; modal.classList.remove('hidden'); modal.classList.add('flex');
}

export function hideModal() {
  const m = document.getElementById('modal');
  m.classList.add('hidden'); m.classList.remove('flex');
}

export function goalCard(goal, opts = {}) {
  const isOverdue = goal.deadline && new Date(goal.deadline) < new Date() && !goal.completed;
  const isPriority = goal.type === 'priority';
  const borderClass = isOverdue ? t('dangerBorder') + ' border-l-4' : '';
  const visIcon = goal.visibility === 'anonymous' ? '&#x1f441;&#xfe0f;&#x200d;&#x1f5e8;&#xfe0f;' : '';
  const tfBadge = { weekly: 'W', monthly: 'M', quarterly: 'Q' }[goal.timeframe] || '';
  return `
    <div class="${t('card')} ${isPriority ? 'p-4' : 'p-3'} ${borderClass} flex items-start gap-3 ${t('cardHover')} theme-transition ${goal.completed ? 'opacity-60' : ''}">
      <label class="flex items-center cursor-pointer mt-0.5">
        <input type="checkbox" class="hidden" ${goal.completed ? 'checked' : ''} onchange="window.__toggleGoal('${goal.id}', !${goal.completed})">
        <div class="w-5 h-5 rounded border-2 ${goal.completed ? t('accentBg') : t('accentBorder')} flex items-center justify-center transition-all">
          ${goal.completed ? '<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>' : ''}
        </div>
      </label>
      <div class="flex-1 min-w-0">
        <div class="${isPriority ? 'font-semibold' : 'text-sm'} ${goal.completed ? 'line-through' : ''}">
          ${goal.text} ${visIcon}
        </div>
        <div class="flex items-center gap-1 mt-1 flex-wrap">
          <span class="${t('badge')} text-xs px-1.5 py-0.5">${tfBadge}</span>
          ${goal.deadline ? `<span class="${isOverdue ? t('dangerBg') : t('warningBg')} text-xs px-2 py-0.5 rounded-full ${t('mono')}">${isOverdue ? '&#9888; ' : '&#x1f4c5; '}${goal.deadline}</span>` : ''}
        </div>
      </div>
    </div>`;
}
