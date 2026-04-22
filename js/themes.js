// ============================================================
// Theme System — Midcurved Curve: middle + right
// Source of truth for tokens: /css/tokens.css
// ============================================================
import { AppState } from './state.js';

// Hex approximations of the curve oklch tokens (Tailwind CDN compatibility).
// Keep in sync with css/tokens.css.
const C = {
  accent:       '#E4CA00',   // oklch(0.82 0.20 85)
  accentDeep:   '#B8A000',
  black:        '#000000',
  white:        '#FFFFFF',
  // middle surfaces
  m_base:       '#0E0D0A',   // neutral-950
  m_raised:     '#161410',   // neutral-900
  m_sunken:     '#050504',
  m_border:     '#26231D',   // neutral-800
  m_borderUp:   '#3A3529',   // neutral-700
  m_text:       '#F7F5EF',   // neutral-50
  m_muted:      '#9E9785',   // neutral-400
  // right surfaces
  r_base:       '#FAF4D9',
  r_raised:     '#FFFFFF',
  r_sunken:     '#F2E8B8',
  // status
  warn:         '#E8B648',
  danger:       '#E8564A',
  success:      '#6DC88C',
};

export const THEMES = {
  // MIDDLE · liquid glass. Dark, Bricolage, soft radii, subtle shadow.
  middle: {
    body: `bg-[${C.m_base}] text-[${C.m_text}] scanline-bg`,
    surface: `bg-[${C.m_raised}] border border-[${C.m_border}]`,
    surfaceHover: `hover:bg-[${C.m_borderUp}]/40`,

    accent: `text-[${C.accent}]`,
    accentBg: `bg-[${C.accent}] text-black`,
    accentBorder: `border-[${C.accent}]`,

    warning: `text-[${C.warn}]`,
    warningBg: `bg-[${C.warn}]/10 text-[${C.warn}] border border-[${C.warn}]/30`,
    danger: `text-[${C.danger}]`,
    dangerBorder: `border-[${C.danger}]`,
    dangerBg: `bg-[${C.danger}]/10 text-[${C.danger}] border border-[${C.danger}]/30`,

    heading: 'font-heading',
    mono: 'font-mono',

    card: `glass-surface rounded-2xl`,
    cardHover: `hover:border-[${C.accent}]/40 hover:shadow-[0_0_40px_-8px_rgba(228,202,0,0.25)]`,

    button: `bg-[${C.accent}] text-black font-semibold rounded-xl hover:brightness-110 active:scale-[0.98] transition`,
    buttonSecondary: `bg-[${C.m_raised}] text-[${C.m_text}] rounded-xl hover:bg-[${C.m_borderUp}]/60 border border-[${C.m_border}]`,
    buttonDanger: `bg-[${C.danger}]/10 text-[${C.danger}] rounded-xl hover:bg-[${C.danger}]/20 border border-[${C.danger}]/30`,

    input: `bg-[${C.m_sunken}] border border-[${C.m_border}] text-[${C.m_text}] rounded-xl focus:border-[${C.accent}] focus:ring-1 focus:ring-[${C.accent}]/30`,

    sidebar: `bg-[${C.m_base}]/80 backdrop-blur border-r border-[${C.m_border}]`,
    topbar:  `bg-[${C.m_base}]/80 backdrop-blur border-b border-[${C.m_border}]`,

    muted: `text-[${C.m_muted}]`,
    badge: `bg-[${C.m_border}] text-[${C.m_text}] rounded-full`,
    divider: `border-[${C.m_border}]`,

    modal: `glass-surface rounded-2xl`,
    toast: `glass-surface text-[${C.m_text}] rounded-xl`,

    ring: { track: C.m_border, fill: C.accent },
  },

  // RIGHT · cartoon brutalist. Pale yellow, Caprasimo, 3px borders, 4px4px shadow.
  right: {
    body: `bg-[${C.r_base}] text-black`,
    surface: `bg-white border-3 border-black`,
    surfaceHover: `hover:bg-[${C.r_sunken}]`,

    accent: `text-[${C.accentDeep}]`,
    accentBg: `bg-[${C.accent}] text-black`,
    accentBorder: `border-black`,

    warning: `text-[${C.warn}]`,
    warningBg: `bg-[#FFF3D6] text-[${C.accentDeep}] border-3 border-black`,
    danger: `text-[${C.danger}]`,
    dangerBorder: `border-black`,
    dangerBg: `bg-[#FFD6D2] text-[${C.danger}] border-3 border-black`,

    heading: 'font-cartoon',
    mono: 'font-mono',

    card: `bg-white border-3 border-black rounded-2xl shadow-[4px_4px_0_#000]`,
    cardHover: `hover:-translate-y-0.5 hover:shadow-[4px_6px_0_#000] transition`,

    button: `bg-[${C.accent}] text-black font-bold rounded-xl border-3 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_5px_0_#000] active:translate-y-0 active:shadow-[1px_1px_0_#000] transition`,
    buttonSecondary: `bg-white text-black font-bold rounded-xl border-3 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_5px_0_#000] transition`,
    buttonDanger: `bg-[#FFD6D2] text-[${C.danger}] font-bold rounded-xl border-3 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:shadow-[3px_5px_0_#000] transition`,

    input: `bg-white border-3 border-black text-black rounded-xl focus:ring-2 focus:ring-[${C.accent}]`,

    sidebar: `bg-[${C.r_sunken}] border-r-3 border-black`,
    topbar: `bg-[${C.r_sunken}] border-b-3 border-black`,

    muted: 'text-gray-600',
    badge: `bg-[${C.r_sunken}] text-black rounded-full border-2 border-black font-cartoon`,
    divider: 'border-black',

    modal: `bg-white border-3 border-black rounded-2xl shadow-[6px_6px_0_#000]`,
    toast: `bg-white border-3 border-black text-black rounded-xl shadow-[4px_4px_0_#000]`,

    ring: { track: '#E5E0C8', fill: C.black },
  },
};

export function t(key) {
  return THEMES[AppState.theme][key];
}

export function toggleTheme() {
  AppState.theme = AppState.theme === 'middle' ? 'right' : 'middle';
  localStorage.setItem('accountability_theme', AppState.theme);
  applyTheme();
}

export function applyTheme() {
  document.documentElement.setAttribute('data-mode', AppState.theme);
  document.body.className = `min-h-screen overflow-hidden ${t('body')} theme-transition`;
}
