// ============================================================
// Hash-based Router
// ============================================================
import { AppState, setState } from './state.js';

export function parseRoute(hash) {
  const parts = hash.split('/');

  // Deep link: join/:code
  if (parts[0] === 'join' && parts[1]) {
    return { view: 'join', roomId: null, joinCode: parts[1] };
  }

  if (parts[0] === 'room' && parts[1]) {
    // Sub-route: room/<id>/challenge/<challengeId> → cohort dashboard
    if (parts[2] === 'challenge' && parts[3]) {
      return { view: 'cohort-challenge', roomId: parts[1], challengeId: parts[3] };
    }
    return { view: parts[2] || 'room-dashboard', roomId: parts[1] };
  }

  // Deep link: import/:token (30x30 plan handoff)
  if (parts[0] === 'import' && parts[1]) {
    return { view: 'import', roomId: null, importToken: parts[1] };
  }

  // Challenge views
  if (parts[0] === 'challenge' && parts[1]) {
    return { view: 'challenge', roomId: null, challengeId: parts[1] };
  }
  if (parts[0] === 'challenges') {
    return { view: 'challenges', roomId: null };
  }

  return { view: hash || 'login', roomId: null };
}

function applyRoute(route) {
  if (route.view === 'rooms' && AppState.currentRoom) {
    AppState._cameFromRoom = true;
  }
  AppState.currentView = route.view;
  if (route.roomId) {
    AppState.currentRoom = route.roomId;
    AppState._cameFromRoom = false;
  } else if (!['room-dashboard', 'goals', 'pot'].includes(route.view)) {
    AppState.currentRoom = null;
  }
  // Stash route-derived params so views can read them without re-parsing the hash.
  AppState.routeParams = {
    challengeId: route.challengeId || null,
    importToken: route.importToken || null,
    joinCode:    route.joinCode    || null,
  };
  setState({});
}

export function navigate(path) {
  location.hash = path;
  applyRoute(parseRoute(path));
}

export function initRouter() {
  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1) || 'login';
    applyRoute(parseRoute(hash));
  });

  // Parse initial hash
  const hash = location.hash.slice(1);
  if (hash) {
    const route = parseRoute(hash);
    AppState.currentView = route.view;
    if (route.roomId) AppState.currentRoom = route.roomId;
  }
}
