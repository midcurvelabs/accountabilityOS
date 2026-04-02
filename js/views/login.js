import { t } from '../themes.js';
import { AppState } from '../state.js';
import { supabase, signIn, signInWithGoogle } from '../supabase.js';
import { toast } from '../components.js';
import { navigate } from '../router.js';

const AVATARS = ['🔥', '⚡', '🎯', '🚀', '💎', '🦊', '🐺', '🦁', '🎸', '🎮', '🏔️', '🌊', '⭐', '🍕', '🧠', '💪'];

export function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="flex items-center justify-center min-h-[calc(100vh-7rem)]">
      <div class="text-center animate-fade-in-up max-w-sm w-full px-4">
        <h1 class="${t('heading')} text-3xl font-extrabold mb-2">Accountability OS</h1>
        <p class="${t('muted')} mb-8">Sign in to start tracking goals with your crew</p>
        <div class="${t('card')} p-6 space-y-4">
          <div>
            <label class="text-sm font-medium block mb-1 text-left">Email</label>
            <input type="email" id="login-email" class="${t('input')} w-full px-3 py-2 text-sm" placeholder="you@example.com"
              onkeydown="if(event.key==='Enter')window.__sendMagicLink()">
          </div>
          <button id="magic-link-btn" class="${t('button')} w-full py-3 text-sm" onclick="window.__sendMagicLink()">
            ✉️ Send Magic Link
          </button>
          <div class="flex items-center gap-3 ${t('muted')} text-xs">
            <div class="flex-1 border-t ${t('divider')}"></div>
            <span>or</span>
            <div class="flex-1 border-t ${t('divider')}"></div>
          </div>
          <button class="${t('buttonSecondary')} w-full py-3 text-sm opacity-50 cursor-not-allowed" disabled>
            🔑 Sign in with Google (coming soon)
          </button>
        </div>
        <div id="magic-link-sent" class="hidden mt-4 ${t('card')} p-4">
          <div class="text-3xl mb-2">📬</div>
          <p class="text-sm font-medium">Check your email!</p>
          <p class="${t('muted')} text-xs mt-1">Click the link we sent to sign in</p>
        </div>
      </div>
    </div>`;
}

export function renderProfileSetup() {
  document.getElementById('app').innerHTML = `
    <div class="flex items-center justify-center min-h-[calc(100vh-7rem)]">
      <div class="text-center animate-fade-in-up max-w-sm w-full px-4">
        <h1 class="${t('heading')} text-2xl font-extrabold mb-2">Set up your profile</h1>
        <p class="${t('muted')} mb-6">Pick a name and avatar</p>
        <div class="${t('card')} p-6 space-y-4">
          <div>
            <label class="text-sm font-medium block mb-1 text-left">Display Name</label>
            <input type="text" id="profile-name" class="${t('input')} w-full px-3 py-2 text-sm"
              placeholder="Your name" value="${AppState.profile?.name || ''}">
          </div>
          <div>
            <label class="text-sm font-medium block mb-1 text-left">Avatar</label>
            <div class="grid grid-cols-8 gap-2" id="avatar-grid">
              ${AVATARS.map(a => `
                <button class="${t('card')} ${t('cardHover')} p-2 text-xl cursor-pointer avatar-pick transition-all"
                  data-avatar="${a}" onclick="window.__pickAvatar('${a}')">${a}</button>
              `).join('')}
            </div>
            <input type="hidden" id="profile-avatar" value="${AppState.profile?.avatar || '🔥'}">
          </div>
          <button class="${t('button')} w-full py-3 text-sm" onclick="window.__saveProfile()">
            Let's go! 🚀
          </button>
        </div>
      </div>
    </div>`;
  highlightAvatar(AppState.profile?.avatar || '🔥');
}

function highlightAvatar(emoji) {
  document.querySelectorAll('.avatar-pick').forEach(el => {
    el.classList.toggle('ring-2', el.dataset.avatar === emoji);
    el.classList.toggle('ring-green-500', el.dataset.avatar === emoji);
  });
}

// Register global handlers
window.__sendMagicLink = async () => {
  const email = document.getElementById('login-email')?.value.trim();
  if (!email) { toast('Enter your email', 'error'); return; }
  const btn = document.getElementById('magic-link-btn');
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    await signIn(email);
    document.getElementById('magic-link-sent')?.classList.remove('hidden');
    btn.textContent = 'Link sent!';
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false; btn.textContent = '✉️ Send Magic Link';
  }
};

window.__signInGoogle = async () => {
  try { await signInWithGoogle(); }
  catch (err) { toast(err.message, 'error'); }
};

window.__pickAvatar = (emoji) => {
  document.getElementById('profile-avatar').value = emoji;
  highlightAvatar(emoji);
};

window.__saveProfile = async () => {
  const name = document.getElementById('profile-name')?.value.trim();
  const avatar = document.getElementById('profile-avatar')?.value || '🔥';
  if (!name) { toast('Enter a name', 'error'); return; }
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ name, avatar })
      .eq('id', AppState.user.id);
    if (error) throw error;
    AppState.profile = { ...AppState.profile, name, avatar };
    toast('Profile saved!');
    navigate('rooms');
  } catch (err) { toast(err.message, 'error'); }
};
