import { t } from '../themes.js';
import { AppState } from '../state.js';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { toast, showModal, hideModal } from '../components.js';
import { fetchRoom } from '../data/rooms.js';
import { addGoal, addNotToDo } from '../data/goals.js';
import { createSession } from '../data/sessions.js';
import { getCurrentPeriod } from '../helpers.js';

export async function showTranscriptModal(roomId) {
  const room = await fetchRoom(roomId);
  const members = room.members || [];

  showModal(`<div class="p-6">
    <h2 class="${t('heading')} text-xl font-bold mb-4">📋 New Session</h2>
    <div class="mb-4"><label class="text-sm font-bold block mb-2">Participants</label>
      <div class="flex flex-wrap gap-2">${members.map(u => `
        <label class="${t('card')} px-3 py-2 cursor-pointer flex items-center gap-2 text-sm ${t('cardHover')}">
          <input type="checkbox" class="transcript-participant" value="${u.id}" data-name="${u.name}" checked>
          <span>${u.avatar} ${u.name}</span>
        </label>`).join('')}</div>
    </div>
    <div class="mb-4"><label class="text-sm font-bold block mb-2">Paste Transcript</label>
      <textarea id="transcript-input" class="${t('input')} w-full h-48 p-3 text-sm resize-none" placeholder="Paste your Granola transcript here..."></textarea>
    </div>
    ${!config.CLAUDE_PROXY_URL ? `
    <div class="mb-4"><label class="text-sm font-bold block mb-2">Anthropic API Key</label>
      <input type="password" id="anthropic-key" class="${t('input')} w-full px-3 py-2 text-sm" placeholder="sk-ant-..." value="${localStorage.getItem('anthropic_key') || ''}">
      <p class="${t('muted')} text-xs mt-1">Stored locally in your browser only</p>
    </div>` : `<div class="mb-4"><p class="${t('muted')} text-xs">AI analysis powered by server-side Claude</p></div>`}
    <div id="transcript-error" class="hidden ${t('dangerBg')} p-3 rounded-lg mb-4 text-sm"></div>
    <button id="analyse-btn" class="${t('button')} w-full py-3 text-sm" onclick="window.__analyseTranscript('${roomId}')">🔍 Analyse Transcript</button>
    <div id="transcript-loading" class="hidden text-center py-8">
      <div class="inline-block w-8 h-8 border-4 ${t('accentBorder')} border-t-transparent rounded-full animate-spin"></div>
      <div class="${t('muted')} mt-2 text-sm">Claude is analysing...</div>
    </div>
    <div id="transcript-results" class="hidden mt-4"></div>
  </div>`);
}

window.__analyseTranscript = async (roomId) => {
  const useProxy = !!config.CLAUDE_PROXY_URL;

  if (!useProxy) {
    const apiKey = document.getElementById('anthropic-key')?.value.trim();
    if (!apiKey) { showError('Set your Anthropic API key.'); return; }
    localStorage.setItem('anthropic_key', apiKey);
  }

  const transcript = document.getElementById('transcript-input')?.value.trim();
  if (!transcript) { showError('Paste a transcript first.'); return; }

  const participants = Array.from(document.querySelectorAll('.transcript-participant:checked'));
  if (participants.length === 0) { showError('Select at least one participant.'); return; }

  const participantMap = {};
  participants.forEach(el => { participantMap[el.dataset.name] = el.value; });
  const names = Object.keys(participantMap).join(', ');

  document.getElementById('analyse-btn').classList.add('hidden');
  document.getElementById('transcript-loading').classList.remove('hidden');
  document.getElementById('transcript-error').classList.add('hidden');

  const systemPrompt = `You are an accountability coach AI. Analyse the following session transcript and extract structured data for each participant.\n\nParticipants: ${names}\n\nFor each participant, extract:\n1. priorityGoals: Top 1-3 goals (specific, actionable)\n2. secondaryGoals: Other goals mentioned\n3. notToDo: Commitments to STOP or AVOID\n4. deadlines: Dates per goal\n5. mood: low/medium/high\n\nReturn ONLY valid JSON:\n{"participants":{"NAME":{"priorityGoals":[{"text":"...","deadline":"YYYY-MM-DD or null"}],"secondaryGoals":[{"text":"...","deadline":null}],"notToDo":[{"text":"..."}],"mood":"low|medium|high"}},"sessionSummary":"2-3 sentence summary"}`;

  const requestBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: systemPrompt + '\n\nTranscript:\n' + transcript }]
  };

  try {
    let res;
    if (useProxy) {
      // Use server-side proxy — send Supabase auth token
      const { data: { session } } = await supabase.auth.getSession();
      res = await fetch(config.CLAUDE_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });
    } else {
      // Direct browser call (fallback)
      const apiKey = localStorage.getItem('anthropic_key');
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify(requestBody),
      });
    }

    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error?.message || `API error: ${res.status}`); }
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse JSON from response');
    showPreview(JSON.parse(jsonMatch[0]), participantMap, transcript, roomId);
  } catch (err) {
    document.getElementById('transcript-loading').classList.add('hidden');
    document.getElementById('analyse-btn').classList.remove('hidden');
    showError(err.message);
  }
};

function showError(msg) {
  const el = document.getElementById('transcript-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function showPreview(analysis, participantMap, transcript, roomId) {
  document.getElementById('transcript-loading').classList.add('hidden');
  const results = document.getElementById('transcript-results');
  results.classList.remove('hidden');

  let html = `<h3 class="${t('heading')} font-bold mb-3">Preview Results</h3>`;
  if (analysis.sessionSummary) html += `<div class="${t('card')} p-3 mb-4 text-sm ${t('muted')}">${analysis.sessionSummary}</div>`;

  for (const [name, data] of Object.entries(analysis.participants || {})) {
    const userId = participantMap[name];
    const moodEmoji = { low: '😔', medium: '😐', high: '🔥' };
    html += `<div class="${t('card')} p-4 mb-3">
      <div class="flex items-center gap-2 mb-3"><span class="${t('heading')} font-bold">${name}</span><span class="${t('badge')} text-xs px-2 py-0.5">${moodEmoji[data.mood] || '😐'} ${data.mood || 'medium'}</span></div>
      <div class="space-y-1">
        ${(data.priorityGoals || []).map(g => `<div class="text-sm">🎯 ${g.text}</div>`).join('')}
        ${(data.secondaryGoals || []).map(g => `<div class="text-sm text-gray-400">📝 ${g.text}</div>`).join('')}
        ${(data.notToDo || []).map(g => `<div class="text-sm text-red-400">🚫 ${g.text}</div>`).join('')}
      </div>
    </div>`;
  }

  // Store analysis data for save
  window.__pendingAnalysis = { analysis, participantMap, transcript, roomId };
  html += `<button class="${t('button')} w-full py-3 text-sm mt-4" onclick="window.__saveSession()">✅ Confirm & Save Session</button>`;
  results.innerHTML = html;
}

window.__saveSession = async () => {
  const { analysis, participantMap, transcript, roomId } = window.__pendingAnalysis || {};
  if (!analysis) return;
  const period = getCurrentPeriod('weekly');

  try {
    const sessionParticipants = [];
    for (const [name, data] of Object.entries(analysis.participants || {})) {
      const userId = participantMap[name];
      if (!userId) continue;
      sessionParticipants.push({ userId, mood: data.mood || 'medium' });

      for (const g of (data.priorityGoals || [])) {
        await addGoal({ roomId, text: g.text, type: 'priority', timeframe: 'weekly', period, deadline: g.deadline || null });
      }
      for (const g of (data.secondaryGoals || [])) {
        await addGoal({ roomId, text: g.text, type: 'secondary', timeframe: 'weekly', period });
      }
      for (const g of (data.notToDo || [])) {
        await addNotToDo({ roomId, text: g.text, period });
      }
    }

    await createSession({
      roomId,
      transcript: transcript?.substring(0, 10000),
      summary: analysis.sessionSummary,
      participants: sessionParticipants
    });

    hideModal();
    toast('Session saved! Goals and NOT-to-dos added.');
    window.__pendingAnalysis = null;

    // Trigger re-render of dashboard
    const { renderRoomDashboard } = await import('./room-dashboard.js');
    await renderRoomDashboard();
  } catch (err) { toast(err.message, 'error'); }
};

window.__showTranscript = (roomId) => showTranscriptModal(roomId);
