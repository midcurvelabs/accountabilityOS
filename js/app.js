// ============================================================
// Accountability OS — Main Entry Point
// ============================================================
import { supabase, onAuthChange, signOut } from './supabase.js';
import { AppState, setState, setRenderer } from './state.js';
import { t, applyTheme, toggleTheme } from './themes.js';
import { initRouter, navigate } from './router.js';
import { hideModal } from './components.js';
import { unsubscribeAll } from './realtime.js';

// Views
import { renderLogin, renderProfileSetup } from './views/login.js';
import { renderRoomSelector } from './views/rooms.js';
import { renderRoomDashboard } from './views/room-dashboard.js';
import { renderGoalPlanner } from './views/goal-planner.js';
import { renderRoomLeaderboard } from './views/leaderboard.js';
import { renderPotView } from './views/pot.js';
import { renderRoomSettings, renderGlobalSettings } from './views/settings.js';

// ============================================================
// Render dispatcher
// ============================================================
function render() {
  applyTheme();
  renderSidebar();
  renderTopbar();

  const v = AppState.currentView;

  // Not authenticated
  if (!AppState.user) {
    if (v === 'profile-setup') return renderProfileSetup();
    return renderLogin();
  }

  // Need profile setup
  if (!AppState.profile?.name || AppState.profile.name === AppState.user.email?.split('@')[0]) {
    // Auto-generated name from trigger, let user customize
  }

  // Room views
  if (AppState.currentRoom) {
    switch (v) {
      case 'room-dashboard': return renderRoomDashboard();
      case 'goals': return renderGoalPlanner();
      case 'leaderboard': return renderRoomLeaderboard();
      case 'pot': return renderPotView();
      case 'settings': return renderRoomSettings();
    }
  }

  // Global views
  switch (v) {
    case 'rooms': return renderRoomSelector();
    case 'global-settings': return renderGlobalSettings();
    default: return renderRoomSelector();
  }
}

setRenderer(render);

// ============================================================
// Sidebar
// ============================================================
function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.className = `fixed left-0 top-0 bottom-0 w-16 flex flex-col items-center py-4 gap-2 z-30 theme-transition ${t('sidebar')} max-md:top-auto max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:w-full max-md:h-16 max-md:flex-row max-md:justify-around max-md:py-0 max-md:px-4`;

  if (!AppState.user) {
    sidebar.innerHTML = `<div class="text-xl mt-2">🎯</div>`;
    return;
  }

  const room = AppState.currentRoom;
  const v = AppState.currentView;

  if (room) {
    const items = [
      { icon: '←', action: 'rooms', label: 'Rooms', active: false },
      { icon: '🏠', action: `room/${room}`, label: 'Dashboard', active: v === 'room-dashboard' },
      { icon: '📋', action: `room/${room}/goals`, label: 'Goals', active: v === 'goals' },
      { icon: '🏆', action: `room/${room}/leaderboard`, label: 'Board', active: v === 'leaderboard' },
      { icon: '⚙️', action: `room/${room}/settings`, label: 'Settings', active: v === 'settings' },
      { icon: '🚪', action: 'global-settings', label: 'Account', active: false },
    ];
    sidebar.innerHTML = items.map(i =>
      `<button onclick="window.__nav('${i.action}')" class="w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all ${i.active ? t('accentBg') + ' shadow-lg' : t('surfaceHover')}" title="${i.label}">${i.icon}</button>`
    ).join('');
  } else {
    sidebar.innerHTML = `
      <div class="text-xl mt-2">🎯</div>
      <div class="flex-1"></div>
      <button onclick="window.__nav('global-settings')" class="w-10 h-10 rounded-lg flex items-center justify-center text-lg ${t('surfaceHover')}" title="Settings">⚙️</button>
    `;
  }
}

// ============================================================
// Topbar
// ============================================================
function renderTopbar() {
  const topbar = document.getElementById('topbar');
  topbar.className = `fixed top-0 left-16 right-0 h-14 flex items-center justify-between px-6 z-20 theme-transition ${t('topbar')} max-md:left-0`;

  if (!AppState.user) {
    topbar.innerHTML = `<div class="${t('heading')} font-bold text-lg">Accountability OS</div>
      <button onclick="window.__toggleTheme()" class="w-8 h-8 rounded-lg flex items-center justify-center ${t('surfaceHover')} text-lg">${AppState.theme === 'dark' ? '🌙' : '☀️'}</button>`;
    return;
  }

  const profile = AppState.profile;
  topbar.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-lg">${profile?.avatar || '👤'}</span>
      <span class="${t('heading')} font-bold text-sm">${profile?.name || ''}</span>
    </div>
    <div class="flex items-center gap-3">
      <button onclick="window.__toggleTheme()" class="w-8 h-8 rounded-lg flex items-center justify-center ${t('surfaceHover')} text-lg">${AppState.theme === 'dark' ? '🌙' : '☀️'}</button>
    </div>`;
}

// ============================================================
// Global window handlers
// ============================================================
window.__nav = (path) => navigate(path);
window.__toggleTheme = () => { toggleTheme(); render(); };
window.__signOut = async () => {
  await signOut();
  unsubscribeAll();
  AppState.user = null;
  AppState.profile = null;
  AppState.currentRoom = null;
  navigate('login');
};

// Keyboard shortcuts
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideModal(); });
document.getElementById('modal-backdrop')?.addEventListener('click', hideModal);

// ============================================================
// Init
// ============================================================
async function init() {
  // Check for existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    AppState.user = session.user;
    // Load profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    AppState.profile = profile;
  }

  // Listen for auth changes
  onAuthChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      AppState.user = session.user;
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      AppState.profile = profile;
      navigate('rooms');
    } else if (event === 'SIGNED_OUT') {
      AppState.user = null;
      AppState.profile = null;
      AppState.currentRoom = null;
      unsubscribeAll();
      navigate('login');
    }
  });

  initRouter();
  render();
}

init();
