// ============================================================
// Application State
// ============================================================

let _renderer = null;

// Migrate legacy theme names ('dark' → 'middle', 'cartoon' → 'right').
function migrateTheme(stored) {
  if (stored === 'middle' || stored === 'right') return stored;
  if (stored === 'cartoon') return 'right';
  return 'middle';
}

export const AppState = {
  user: null,       // supabase auth user
  profile: null,    // profiles row { id, name, avatar, ... }
  currentRoom: null,
  currentView: 'login',
  routeParams: {},
  theme: migrateTheme(localStorage.getItem('accountability_theme')),
};

export function setState(updates) {
  Object.assign(AppState, updates);
  if (_renderer) _renderer();
}

export function setRenderer(fn) {
  _renderer = fn;
}
