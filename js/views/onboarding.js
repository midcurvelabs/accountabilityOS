import { t } from '../themes.js';
import { navigate } from '../router.js';

const SCREENS = [
  {
    icon: '🏠',
    title: 'Create a Room',
    desc: 'Start an accountability group with your crew. Each room gets a unique invite code — share it and your friends join instantly.',
    visual: `<div class="flex items-center gap-2 mt-4">
      <div class="px-3 py-1.5 rounded-lg bg-[#1e1e2a] border border-[#333] text-xs font-mono tracking-widest text-gray-300">AX7K2M</div>
      <span class="text-xs text-gray-500">invite code</span>
    </div>`
  },
  {
    icon: '🎯',
    title: 'Set Goals Together',
    desc: 'Add weekly, monthly, or quarterly goals. Prioritize what matters. Your crew sees your commitments — and whether you follow through.',
    visual: `<div class="space-y-2 mt-4 text-left max-w-xs mx-auto">
      <div class="flex items-center gap-2 text-sm"><span class="w-4 h-4 rounded border-2 border-green-500 inline-flex items-center justify-center text-[10px]">&#10003;</span> Ship landing page <span class="text-[10px] bg-[#1e1e2a] px-1.5 py-0.5 rounded-full text-gray-400">W</span></div>
      <div class="flex items-center gap-2 text-sm"><span class="w-4 h-4 rounded border-2 border-green-500 inline-block"></span> Record 3 podcast episodes <span class="text-[10px] bg-[#1e1e2a] px-1.5 py-0.5 rounded-full text-gray-400">M</span></div>
      <div class="flex items-center gap-2 text-sm"><span class="w-4 h-4 rounded border-2 border-green-500 inline-block"></span> Launch MVP <span class="text-[10px] bg-[#1e1e2a] px-1.5 py-0.5 rounded-full text-gray-400">Q</span></div>
    </div>`
  },
  {
    icon: '🤖',
    title: 'AI Call Transcripts',
    desc: 'Paste your accountability call transcript and AI extracts everyone\'s goals, not-to-dos, and mood automatically. Zero manual entry.',
    visual: `<div class="mt-4 text-left max-w-xs mx-auto space-y-1.5">
      <div class="text-xs text-gray-500">AI extracted:</div>
      <div class="text-sm">&#127919; 3 priority goals</div>
      <div class="text-sm">&#128683; 2 not-to-dos</div>
      <div class="text-sm">&#128200; mood: high</div>
    </div>`
  },
  {
    icon: '🏆',
    title: 'Compete & Stay Honest',
    desc: 'Leaderboards, streaks, points, and optional public shame. Add a money pot for real stakes. Dashboard tracks everything in real-time.',
    visual: `<div class="mt-4 space-y-1.5 text-left max-w-xs mx-auto">
      <div class="flex items-center justify-between text-sm"><span>&#x1f947; Alex — 185 pts</span><span class="text-green-500 text-xs">12-week streak</span></div>
      <div class="flex items-center justify-between text-sm"><span>&#x1f948; Rik — 160 pts</span><span class="text-green-500 text-xs">8-week streak</span></div>
      <div class="flex items-center justify-between text-sm"><span>&#x1f949; Sam — 95 pts</span><span class="text-red-400 text-xs">Slipping...</span></div>
    </div>`
  }
];

export function renderOnboarding() {
  const app = document.getElementById('app');
  const current = parseInt(sessionStorage.getItem('onboarding_step') || '0', 10);

  app.innerHTML = `
    <div class="flex items-center justify-center min-h-[calc(100vh-7rem)]">
      <div class="text-center animate-fade-in-up max-w-md w-full px-4">
        <!-- Progress dots -->
        <div class="flex justify-center gap-2 mb-8">
          ${SCREENS.map((_, i) => `
            <div class="w-2 h-2 rounded-full transition-all ${i === current ? 'bg-[#00ff88] w-6' : i < current ? 'bg-[#00ff88]/40' : 'bg-[#1e1e2a]'}"></div>
          `).join('')}
        </div>

        <!-- Screen content -->
        <div class="text-5xl mb-4">${SCREENS[current].icon}</div>
        <h1 class="${t('heading')} text-2xl font-extrabold mb-3">${SCREENS[current].title}</h1>
        <p class="${t('muted')} text-sm leading-relaxed mb-2">${SCREENS[current].desc}</p>

        <!-- Visual example -->
        <div class="mb-8">${SCREENS[current].visual}</div>

        <!-- Navigation -->
        <div class="flex gap-3 justify-center">
          ${current > 0 ? `
            <button class="${t('buttonSecondary')} px-5 py-3 text-sm" onclick="window.__onboardingNav(${current - 1})">Back</button>
          ` : ''}
          ${current < SCREENS.length - 1 ? `
            <button class="${t('button')} px-8 py-3 text-sm" onclick="window.__onboardingNav(${current + 1})">Next</button>
          ` : `
            <button class="${t('button')} px-8 py-3 text-sm" onclick="window.__finishOnboarding()">Let's go!</button>
          `}
        </div>

        ${current < SCREENS.length - 1 ? `
          <button class="${t('muted')} text-xs mt-4 hover:underline cursor-pointer" onclick="window.__finishOnboarding()">Skip</button>
        ` : ''}
      </div>
    </div>`;
}

window.__onboardingNav = (step) => {
  sessionStorage.setItem('onboarding_step', step.toString());
  renderOnboarding();
};

window.__finishOnboarding = () => {
  localStorage.setItem('accountability_onboarded', 'true');
  sessionStorage.removeItem('onboarding_step');
  navigate('rooms');
};
