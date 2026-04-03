// ============================================================
// Utility Helpers
// ============================================================

export function getCurrentPeriod(timeframe) {
  const now = new Date();
  if (timeframe === 'weekly') {
    const d = new Date(now); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
  if (timeframe === 'monthly') return now.toISOString().slice(0, 7);
  return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

const VALID_AVATARS = new Set(['🔥', '⚡', '🎯', '🚀', '💎', '🦊', '🐺', '🦁', '🎸', '🎮', '🏔️', '🌊', '⭐', '🍕', '🧠', '💪', '👤']);

export function safeAvatar(avatar) {
  if (!avatar) return '👤';
  // Check against known-good set first
  if (VALID_AVATARS.has(avatar)) return avatar;
  // Allow any single emoji (catches new valid emojis) — must be 1-2 codepoints, no latin chars
  if (avatar.length <= 4 && !/[a-zA-Z0-9]/.test(avatar)) return avatar;
  return '👤';
}
