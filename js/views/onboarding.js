import { t } from '../themes.js';

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
      <div class="flex items-center justify-between text-sm"><span>&#x1f947; Matt — 185 pts</span><span class="text-green-500 text-xs">12-week streak</span></div>
      <div class="flex items-center justify-between text-sm"><span>&#x1f948; Rik — 160 pts</span><span class="text-green-500 text-xs">8-week streak</span></div>
      <div class="flex items-center justify-between text-sm"><span>&#x1f949; Mina — 95 pts</span><span class="text-red-400 text-xs">Slipping...</span></div>
    </div>`
  }
];

let currentStep = 0;

function renderOverlayContent() {
  const el = document.getElementById('onboarding-overlay');
  if (!el) return;

  const screen = SCREENS[currentStep];
  el.innerHTML = `
    <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" onclick="window.__dismissOnboarding()"></div>
    <div class="relative z-10 w-full max-w-md mx-4 animate-slide-up">
      <div class="${t('modal')} p-8 text-center">
        <!-- Close button -->
        <button onclick="window.__dismissOnboarding()" class="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center ${t('surfaceHover')} ${t('muted')} text-lg hover:text-white">&times;</button>

        <!-- Tag -->
        <div class="inline-block ${t('badge')} text-[10px] px-2 py-0.5 mb-4 uppercase tracking-widest ${t('mono')}">onboarding</div>

        <!-- Progress dots -->
        <div class="flex justify-center gap-2 mb-6">
          ${SCREENS.map((_, i) => `
            <div class="h-1.5 rounded-full transition-all ${i === currentStep ? 'bg-[#00ff88] w-6' : i < currentStep ? 'bg-[#00ff88]/40 w-1.5' : 'bg-[#1e1e2a] w-1.5'}"></div>
          `).join('')}
        </div>

        <!-- Screen content -->
        <div class="text-5xl mb-4">${screen.icon}</div>
        <h2 class="${t('heading')} text-2xl font-extrabold mb-3">${screen.title}</h2>
        <p class="${t('muted')} text-sm leading-relaxed mb-2">${screen.desc}</p>

        <!-- Visual example -->
        <div class="mb-6">${screen.visual}</div>

        <!-- Step counter -->
        <div class="${t('muted')} text-xs mb-4 ${t('mono')}">${currentStep + 1} / ${SCREENS.length}</div>

        <!-- Navigation -->
        <div class="flex gap-3 justify-center">
          ${currentStep > 0 ? `
            <button class="${t('buttonSecondary')} px-5 py-2.5 text-sm" onclick="window.__onboardingNav(${currentStep - 1})">Back</button>
          ` : ''}
          ${currentStep < SCREENS.length - 1 ? `
            <button class="${t('button')} px-8 py-2.5 text-sm" onclick="window.__onboardingNav(${currentStep + 1})">Next</button>
          ` : `
            <button class="${t('button')} px-8 py-2.5 text-sm" onclick="window.__dismissOnboarding()">Let's go!</button>
          `}
        </div>

        ${currentStep < SCREENS.length - 1 ? `
          <button class="${t('muted')} text-xs mt-3 hover:underline cursor-pointer" onclick="window.__dismissOnboarding()">Skip</button>
        ` : ''}
      </div>
    </div>`;
}

/** Show the onboarding overlay on top of whatever is currently rendered */
export function showOnboardingOverlay() {
  if (localStorage.getItem('accountability_onboarded')) return;

  // Create overlay container if it doesn't exist
  let el = document.getElementById('onboarding-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'onboarding-overlay';
    el.className = 'fixed inset-0 z-50 flex items-center justify-center';
    document.body.appendChild(el);
  }

  currentStep = 0;
  renderOverlayContent();
}

/** Check if onboarding should show */
export function shouldShowOnboarding() {
  return !localStorage.getItem('accountability_onboarded');
}

window.__onboardingNav = (step) => {
  currentStep = step;
  renderOverlayContent();
};

window.__dismissOnboarding = () => {
  localStorage.setItem('accountability_onboarded', 'true');
  const el = document.getElementById('onboarding-overlay');
  if (el) el.remove();
};
