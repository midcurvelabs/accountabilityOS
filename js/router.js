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

  if (parts[0] === 'onboarding') {
    return { view: 'onboarding', roomId: null };
  }

  if (parts[0] === 'room' && parts[1]) {
    return { view: parts[2] || 'room-dashboard', roomId: parts[1] };
  }
  return { view: hash || 'login', roomId: null };
}

export function navigate(path) {
  location.hash = path;
  const route = parseRoute(path);
  AppState.currentView = route.view;
  if (route.roomId) AppState.currentRoom = route.roomId;
  else if (!['room-dashboard', 'goals', 'pot'].includes(route.view)) AppState.currentRoom = null;
  setState({});
}

export function initRouter() {
  window.addEventListener('hashchange', () => {
    const hash = location.hash.slice(1) || 'login';
    const route = parseRoute(hash);
    AppState.currentView = route.view;
    if (route.roomId) AppState.currentRoom = route.roomId;
    else if (!['room-dashboard', 'goals', 'pot'].includes(route.view)) AppState.currentRoom = null;
    setState({});
  });

  // Parse initial hash
  const hash = location.hash.slice(1);
  if (hash) {
    const route = parseRoute(hash);
    AppState.currentView = route.view;
    if (route.roomId) AppState.currentRoom = route.roomId;
  }
}
