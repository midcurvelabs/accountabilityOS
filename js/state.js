// ============================================================
// Application State
// ============================================================

let _renderer = null;

export const AppState = {
  user: null,       // supabase auth user
  profile: null,    // profiles row { id, name, avatar, ... }
  currentRoom: null,
  currentView: 'login',
  routeParams: {},
  theme: localStorage.getItem('accountability_theme') || 'dark',
};

export function setState(updates) {
  Object.assign(AppState, updates);
  if (_renderer) _renderer();
}

export function setRenderer(fn) {
  _renderer = fn;
}
