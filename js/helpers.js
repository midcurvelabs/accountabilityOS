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

/**
 * Short, human-friendly date for session labels. e.g. "Apr 21".
 * Falls back to ISO if the locale formatter misbehaves.
 */
export function formatShortDate(date) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return formatDate(date);
  }
}

export const DEFAULT_AVATAR = '🙂';

const VALID_AVATARS = new Set(['🔥', '⚡', '🎯', '🚀', '💎', '🦊', '🐺', '🦁', '🎸', '🎮', '🏔️', '🌊', '⭐', '🍕', '🧠', '💪', '👤', '🙂']);

// Requires the avatar to BEGIN with a real emoji pictographic character.
// This correctly rejects mojibake like `üë§` (the Mac OS Roman rendering
// of the UTF-8 bytes of 👤) — the Apple logo is in Private-Use-Area and ü/ë/§
// are Latin-1 Supplement; none of them are Extended_Pictographic.
const EMOJI_START_RE = /^\p{Extended_Pictographic}/u;

export function safeAvatar(avatar) {
  if (!avatar) return DEFAULT_AVATAR;
  // Fast path for our curated set
  if (VALID_AVATARS.has(avatar)) return avatar;
  // Accept any string that starts with an emoji and is a reasonable length
  // (emoji + variation selector + ZWJ sequence etc. max out around 8 codepoints)
  if (avatar.length <= 8 && EMOJI_START_RE.test(avatar)) return avatar;
  return DEFAULT_AVATAR;
}
