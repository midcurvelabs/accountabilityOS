// ============================================================
// Accountability OS — Main Entry Point
// ============================================================
import { supabase, onAuthChange, signOut } from './supabase.js';
import { AppState, setState, setRenderer } from './state.js';
import { t, applyTheme, toggleTheme } from './themes.js';
import { initRouter, navigate, parseRoute } from './router.js';
import { hideModal } from './components.js';
import { safeAvatar } from './helpers.js';
import { unsubscribeAll } from './realtime.js';

// Views
import { renderLogin, renderProfileSetup } from './views/login.js';
import { renderRoomSelector } from './views/rooms.js';
import { renderRoomDashboard } from './views/room-dashboard.js';
import { renderGoalPlanner } from './views/goal-planner.js';
import { renderRoomLeaderboard } from './views/leaderboard.js';
import { renderPotView } from './views/pot.js';
import { renderRoomSettings, renderGlobalSettings } from './views/settings.js';
import { renderJoinRoom } from './views/join.js';
import { renderChallenges } from './views/challenges.js';
import { renderChallenge, renderImport } from './views/challenge.js';
import { renderCohortChallenge } from './views/cohort-challenge.js';
import { showOnboardingOverlay, shouldShowOnboarding } from './views/onboarding.js';
import './views/transcript.js';

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
    // Capture import deep links before redirecting to login so we can resume after sign-in.
    if (v === 'import') {
      const route = parseRoute(location.hash.slice(1));
      if (route.importToken) sessionStorage.setItem('pending_import_token', route.importToken);
    }
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
      case 'room-dashboard':    return renderRoomDashboard();
      case 'goals':             return renderGoalPlanner();
      case 'leaderboard':       return renderRoomLeaderboard();
      case 'pot':               return renderPotView();
      case 'settings':          return renderRoomSettings();
      case 'cohort-challenge':  return renderCohortChallenge();
    }
  }

  // Global views
  switch (v) {
    case 'rooms':
      renderRoomSelector();
      if (shouldShowOnboarding()) setTimeout(showOnboardingOverlay, 300);
      return;
    case 'global-settings': return renderGlobalSettings();
    case 'join':       return renderJoinRoom();
    case 'challenges': return renderChallenges();
    case 'challenge':  return renderChallenge();
    case 'import':     return renderImport();
    default:
      renderRoomSelector();
      if (shouldShowOnboarding()) setTimeout(showOnboardingOverlay, 300);
      return;
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

  const expanded = document.documentElement.getAttribute('data-sidebar-expanded') === 'true';
  const toggleIcon = expanded ? '⟨' : '⟩';
  const toggleLabel = expanded ? 'Collapse' : 'Expand';

  const sidebarBtn = (i) => `
    <button onclick="window.__nav('${i.action}')" class="w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-all ${i.active ? t('accentBg') + ' shadow-lg' : t('surfaceHover')}" title="${i.label}">
      <span>${i.icon}</span>
      <span class="sidebar-label">${i.label}</span>
    </button>`;

  const toggleBtn = `
    <button onclick="window.__toggleSidebar()" class="w-10 h-10 rounded-lg flex items-center justify-center text-lg ${t('surfaceHover')} max-md:hidden" title="${toggleLabel} sidebar">
      <span>${toggleIcon}</span>
      <span class="sidebar-label">${toggleLabel}</span>
    </button>`;

  if (room) {
    const items = [
      { icon: '←', action: 'rooms', label: 'Rooms', active: false },
      { icon: '🏠', action: `room/${room}`, label: 'Dashboard', active: v === 'room-dashboard' },
      { icon: '📋', action: `room/${room}/goals`, label: 'Goals', active: v === 'goals' },
      { icon: '🏆', action: `room/${room}/leaderboard`, label: 'Board', active: v === 'leaderboard' },
      { icon: '📅', action: 'challenges', label: 'Challenges', active: v === 'challenges' || v === 'challenge' || v === 'import' || v === 'cohort-challenge' },
      { icon: '⚙️', action: `room/${room}/settings`, label: 'Settings', active: v === 'settings' },
      { icon: '🚪', action: 'global-settings', label: 'Account', active: false },
    ];
    sidebar.innerHTML = items.map(sidebarBtn).join('') + `<div class="flex-1"></div>` + toggleBtn;
  } else {
    const items = [
      { icon: '🎯', action: 'rooms', label: 'Rooms', active: v === 'rooms' },
      { icon: '📅', action: 'challenges', label: 'Challenges', active: v === 'challenges' || v === 'challenge' || v === 'import' },
    ];
    sidebar.innerHTML = items.map(sidebarBtn).join('') + `<div class="flex-1"></div>` + toggleBtn + sidebarBtn({ icon: '⚙️', action: 'global-settings', label: 'Settings', active: false });
  }
}

window.__toggleSidebar = () => {
  const root = document.documentElement;
  const isExpanded = root.getAttribute('data-sidebar-expanded') === 'true';
  if (isExpanded) {
    root.removeAttribute('data-sidebar-expanded');
    localStorage.setItem('sidebar_expanded', '0');
  } else {
    root.setAttribute('data-sidebar-expanded', 'true');
    localStorage.setItem('sidebar_expanded', '1');
  }
  // Re-render sidebar so the toggle icon flips.
  renderSidebar();
};

// ============================================================
// Topbar
// ============================================================
function renderTopbar() {
  const topbar = document.getElementById('topbar');
  topbar.className = `fixed top-0 left-16 right-0 h-14 flex items-center justify-between px-6 z-20 theme-transition ${t('topbar')} max-md:left-0`;

  if (!AppState.user) {
    topbar.innerHTML = `<div class="${t('heading')} font-bold text-lg">Accountability OS</div>
      <button onclick="window.__toggleTheme()" class="w-8 h-8 rounded-lg flex items-center justify-center ${t('surfaceHover')} text-lg">${AppState.theme === 'middle' ? '🌙' : '☀️'}</button>`;
    return;
  }

  const profile = AppState.profile;
  topbar.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-lg">${safeAvatar(profile?.avatar)}</span>
      <span class="${t('heading')} font-bold text-sm">${profile?.name || ''}</span>
    </div>
    <div class="flex items-center gap-3">
      <button onclick="window.__toggleTheme()" class="w-8 h-8 rounded-lg flex items-center justify-center ${t('surfaceHover')} text-lg">${AppState.theme === 'middle' ? '🌙' : '☀️'}</button>
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

      // Check for pending deep links — import token takes priority over join code.
      const pendingImport = sessionStorage.getItem('pending_import_token');
      if (pendingImport) {
        sessionStorage.removeItem('pending_import_token');
        navigate(`import/${pendingImport}`);
        return;
      }
      const pendingCode = sessionStorage.getItem('pending_join_code');
      if (pendingCode) {
        sessionStorage.removeItem('pending_join_code');
        navigate(`join/${pendingCode}`);
      } else {
        navigate('rooms');
      }
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
