// ============================================================
// Environment Configuration
// ============================================================
// Override these values per environment by setting window.__CONFIG
// before the app loads, or use a build step to replace them.

const defaults = {
  SUPABASE_URL: 'https://kbdiwazkyxvizjxqiggc.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZGl3YXpreXh2aXpqeHFpZ2djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzc5NDUsImV4cCI6MjA5MDcxMzk0NX0.vUCZiDduNQFoGVfuixhHjYn80N0yyKYKUS-PKIlXwFA',
  // Set this to your Supabase Edge Function URL to proxy Claude calls server-side
  // When set, the transcript view will use this instead of direct Anthropic API calls
  CLAUDE_PROXY_URL: null,
};

export const config = Object.freeze({ ...defaults, ...(window.__CONFIG || {}) });
