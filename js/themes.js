// ============================================================
// Theme System
// ============================================================
import { AppState } from './state.js';

export const THEMES = {
  dark: {
    body: 'bg-[#0a0a0f] text-gray-200 scanline-bg',
    surface: 'bg-[#13131a] border-[#1e1e2a]', surfaceHover: 'hover:bg-[#1a1a24]',
    accent: 'text-[#00ff88]', accentBg: 'bg-[#00ff88] text-black', accentBorder: 'border-[#00ff88]',
    warning: 'text-[#ffaa00]', warningBg: 'bg-[#ffaa00]/10 text-[#ffaa00] border-[#ffaa00]/30',
    danger: 'text-[#ff3b3b]', dangerBorder: 'border-[#ff3b3b]', dangerBg: 'bg-[#ff3b3b]/10 text-[#ff3b3b] border-[#ff3b3b]/30',
    heading: 'font-heading', mono: 'font-mono',
    card: 'bg-[#13131a] border border-[#1e1e2a] rounded-lg',
    cardHover: 'hover:border-[#00ff88]/30 hover:shadow-[0_0_20px_rgba(0,255,136,0.05)]',
    button: 'bg-[#00ff88] text-black font-bold rounded-lg hover:brightness-110 active:scale-95',
    buttonSecondary: 'bg-[#1e1e2a] text-gray-300 rounded-lg hover:bg-[#252530] border border-[#333]',
    buttonDanger: 'bg-[#ff3b3b]/10 text-[#ff3b3b] rounded-lg hover:bg-[#ff3b3b]/20 border border-[#ff3b3b]/30',
    input: 'bg-[#0a0a0f] border border-[#333] text-white rounded-lg focus:border-[#00ff88] focus:ring-1 focus:ring-[#00ff88]/30',
    sidebar: 'bg-[#0d0d14] border-r border-[#1e1e2a]', topbar: 'bg-[#0d0d14]/90 backdrop-blur border-b border-[#1e1e2a]',
    muted: 'text-gray-500', badge: 'bg-[#1e1e2a] text-gray-300 rounded-full', divider: 'border-[#1e1e2a]',
    modal: 'bg-[#13131a] border border-[#1e1e2a] rounded-xl',
    toast: 'bg-[#13131a] border border-[#1e1e2a] text-gray-200 rounded-lg shadow-xl',
    ring: { track: '#1e1e2a', fill: '#00ff88' },
  },
  cartoon: {
    body: 'bg-[#b8f0ff] text-gray-900',
    surface: 'bg-white border-[#222] border-3', surfaceHover: 'hover:bg-blue-50',
    accent: 'text-green-600', accentBg: 'bg-green-500 text-white', accentBorder: 'border-green-500',
    warning: 'text-amber-600', warningBg: 'bg-amber-100 text-amber-700 border-3 border-amber-400',
    danger: 'text-red-500', dangerBorder: 'border-red-500', dangerBg: 'bg-red-100 text-red-600 border-3 border-red-400',
    heading: 'font-cartoon', mono: 'font-mono',
    card: 'bg-white border-3 border-[#222] rounded-2xl shadow-[4px_4px_0_#222]',
    cardHover: 'hover:-translate-y-0.5 hover:shadow-[4px_6px_0_#222]',
    button: 'bg-green-500 text-white font-bold rounded-xl border-3 border-[#222] shadow-[3px_3px_0_#222] hover:-translate-y-0.5 hover:shadow-[3px_5px_0_#222] active:translate-y-0 active:shadow-[1px_1px_0_#222]',
    buttonSecondary: 'bg-purple-100 text-purple-700 font-bold rounded-xl border-3 border-[#222] shadow-[3px_3px_0_#222] hover:-translate-y-0.5',
    buttonDanger: 'bg-red-100 text-red-600 font-bold rounded-xl border-3 border-red-400 shadow-[3px_3px_0_#c44] hover:-translate-y-0.5',
    input: 'bg-white border-3 border-[#222] text-gray-900 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200',
    sidebar: 'bg-[#a0e0ff] border-r-3 border-[#222]', topbar: 'bg-[#a0e0ff] border-b-3 border-[#222]',
    muted: 'text-gray-500', badge: 'bg-purple-100 text-purple-700 rounded-full border-2 border-purple-300 font-cartoon', divider: 'border-[#222]',
    modal: 'bg-white border-3 border-[#222] rounded-2xl shadow-[6px_6px_0_#222]',
    toast: 'bg-white border-3 border-[#222] text-gray-900 rounded-xl shadow-[4px_4px_0_#222]',
    ring: { track: '#e0e0e0', fill: '#22c55e' },
  }
};

export function t(key) {
  return THEMES[AppState.theme][key];
}

export function toggleTheme() {
  AppState.theme = AppState.theme === 'dark' ? 'cartoon' : 'dark';
  localStorage.setItem('accountability_theme', AppState.theme);
  applyTheme();
}

export function applyTheme() {
  document.body.className = `min-h-screen overflow-hidden ${t('body')} theme-transition`;
}
