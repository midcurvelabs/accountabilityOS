# Handoff: 30x30 → AccountabilityOS integration

> Paste this whole file into a fresh thread to start. It's self-contained — no prior-conversation context required.

---

## TL;DR

I want to plug 30-day plans generated at **30x30.midcurved.com** into **AccountabilityOS** (`accountability.midcurved.com`) as a new **`challenges` feature**, so people who finish the 30x30 quiz can track their plan day-by-day instead of just seeing it once. Today (already shipped) the 30x30 frontend has a "Copy as markdown" button. Tomorrow I want the deeper integration plus the start of a challenges UX — including the harder design question of what a **50-person 30x30 challenge group** should look like (it'll be messy if everyone sees everything).

---

## What already exists

### 30x30 (`/Users/rik/Documents/rik-code/30x30-repo`)
- Cloudflare Worker + D1, single file at `src/index.js`, frontend at `public/index.html`
- D1 has a `plans` table: `id, email, ideas_json, plan_json, token (UUID), email_count, last_emailed_at, created_at` (migration `migrations/0003_plans.sql`)
- `plan_json` shape: `{ weeks: [{ label: "Week 1 — Foundation", days: [{ day: 1, title, desc }, …7] }, …4 weeks] }`
- After plan generation the frontend already calls `POST /api/save-plan`, gets a UUID token back, and stores it as `state.planToken`
- **Already shipped today:** "Copy as markdown" button on the plan-result screen (formats as `- [ ] Day 01: Title — desc`, copies to clipboard via `navigator.clipboard.writeText`)
- Domain: `30x30.midcurved.com` (also `30x30.fun` post-DNS migration)

### AccountabilityOS (`/Users/rik/Documents/rik-code/Accountability`)
- Supabase + vanilla JS modules + Tailwind CDN. Entry: `index.html` → `js/app.js`
- **Auth:** Supabase Google OAuth + email OTP — already working (`js/supabase.js`)
- **Tables (migration `supabase/migrations/001_initial_schema.sql` + 002–006):** `profiles, rooms, room_members, goals, not_to_dos, violations, deep_work_logs, sessions, session_participants, pot_ledger`. RLS everywhere via `is_room_member(room_id)` and `is_room_creator(room_id)` helpers.
- `goals` schema: `timeframe enum ('weekly','monthly','quarterly')`, `period text` (e.g. '2026-W14'), `room_id` required. **No daily timeframe.**
- Realtime is enabled on `goals, room_members, deep_work_logs, not_to_dos, violations, pot_ledger`
- Design tokens (`css/tokens.css` + `js/themes.js`): Midcurved yellow `oklch(0.82 0.20 85)` (`#E4CA00`), Bricolage Grotesque (middle theme) / Caprasimo (right theme), JetBrains Mono. Two themes: `middle` (dark liquid glass, default) and `right` (cartoon brutalist). Toggle via topbar.
- Domain: `accountability.midcurved.com`
- Router: hash-based, see `js/router.js`. Pattern for deep-link auth resume: `sessionStorage.pending_join_code` (see `js/app.js:181`).

---

## Decisions already made (do NOT relitigate)

| Question | Decision | Rationale |
|---|---|---|
| Auth | Supabase Google OAuth (already wired) | Don't add JWT/magic-link layers. |
| Storage | Extend existing Supabase Postgres | Don't introduce new DBs. |
| Domain | `accountability.midcurved.com` (already deployed) | No new DNS. |
| Data model for imported plans | **New `challenges` + `challenge_days` tables.** Not goals, not sessions. | Keeps weekly/monthly goal semantics clean; daily microtasks are a different concept. |
| Default scope | **Solo by default** (no room required), `room_id` nullable, can be "shared to a room" later. | Lowest friction for the import bridge. |
| Daily email nudge | v2, not now. | Validate that people track before adding nudges. |

---

## What to build (in this order)

### 1. Public read endpoint on 30x30 worker — small

Add to `/Users/rik/Documents/rik-code/30x30-repo/src/index.js`, near the existing `/api/email-plan` handler (~line 322):

```js
// GET /api/plan/:token — public read of a saved plan (token is the secret)
const planMatch = url.pathname.match(/^\/api\/plan\/([0-9a-f-]{36})$/i);
if (planMatch && request.method === 'GET') {
  const token = planMatch[1];
  if (!isValidUUID(token)) return jsonResponse({ error: 'Invalid token' }, 400);
  if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 500);
  const row = await env.DB.prepare(
    `SELECT plan_json, created_at FROM plans WHERE token = ? LIMIT 1`
  ).bind(token).first();
  if (!row) return jsonResponse({ error: 'Plan not found' }, 404);
  let plan;
  try { plan = JSON.parse(row.plan_json); } catch { return jsonResponse({ error: 'Plan corrupt' }, 500); }
  return jsonResponse({ plan, created_at: row.created_at });
}
```

**Notes:**
- Do NOT return the email — the token is the only auth and the public read should not leak addresses.
- `isValidUUID()` already exists at line ~447 of `index.js`.
- `jsonResponse()` already sets `Access-Control-Allow-Origin: *`, so AccOS can fetch this cross-origin.
- Test: `curl https://30x30.midcurved.com/api/plan/<uuid>` should return `{ plan: { weeks: [...] }, created_at: "..." }`.

### 2. AccountabilityOS schema migration — `007_challenges.sql`

Add to `supabase/migrations/007_challenges.sql`:

```sql
-- Challenges — imported day-by-day programs (e.g. 30x30 plans)
create table challenges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles on delete cascade,
  room_id      uuid references rooms on delete set null,  -- nullable: solo by default
  title        text not null,
  source_url   text,                                       -- e.g. https://30x30.midcurved.com
  source_token text,                                       -- 30x30 plan UUID (lookup-by re-import)
  plan_json    jsonb not null,                             -- raw plan for re-render / audit
  started_at   date not null default current_date,
  created_at   timestamptz not null default now()
);

create index idx_challenges_user on challenges (user_id);
create index idx_challenges_room on challenges (room_id) where room_id is not null;
create index idx_challenges_source_token on challenges (source_token) where source_token is not null;

-- Challenge days — the 30 (or N) checklist items
create table challenge_days (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references challenges on delete cascade,
  day_number    int not null,
  title         text not null,
  description   text,
  completed     boolean not null default false,
  completed_at  timestamptz,
  note          text,
  unique (challenge_id, day_number)
);

create index idx_challenge_days_challenge on challenge_days (challenge_id);
create index idx_challenge_days_completed on challenge_days (challenge_id, completed);

alter table challenges enable row level security;
alter table challenge_days enable row level security;

-- RLS: solo challenges visible only to owner; room-scoped visible to room members.
create policy "Challenges visible to owner or room members" on challenges for select to authenticated
  using (user_id = auth.uid() or (room_id is not null and is_room_member(room_id)));

create policy "Users can create own challenges" on challenges for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own challenges" on challenges for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can delete own challenges" on challenges for delete to authenticated
  using (user_id = auth.uid());

-- challenge_days inherit visibility from parent challenge
create policy "Challenge days visible if parent visible" on challenge_days for select to authenticated
  using (exists (
    select 1 from challenges c where c.id = challenge_days.challenge_id
      and (c.user_id = auth.uid() or (c.room_id is not null and is_room_member(c.room_id)))
  ));

create policy "Owner can insert challenge days" on challenge_days for insert to authenticated
  with check (exists (select 1 from challenges c where c.id = challenge_id and c.user_id = auth.uid()));

create policy "Owner can update challenge days" on challenge_days for update to authenticated
  using (exists (select 1 from challenges c where c.id = challenge_id and c.user_id = auth.uid()));

create policy "Owner can delete challenge days" on challenge_days for delete to authenticated
  using (exists (select 1 from challenges c where c.id = challenge_id and c.user_id = auth.uid()));

alter publication supabase_realtime add table challenge_days;
```

Apply via Supabase CLI / dashboard SQL editor.

### 3. AccountabilityOS data layer — `js/data/challenges.js`

New file. Mirror the pattern of `js/data/goals.js`:
- `fetchChallenges(userId, opts)` — list user's challenges (solo + room-shared), include `challenge_days` count + completed count via two queries (Supabase doesn't `count(*) filter` cleanly through PostgREST without an RPC).
- `fetchChallengeWithDays(challengeId)` — single challenge + all days ordered by `day_number`.
- `createChallengeFromPlan({ plan, sourceUrl, sourceToken, title, roomId })` — INSERT challenge, then bulk INSERT 30 challenge_days (`supabase.from('challenge_days').insert(arr)`).
- `toggleChallengeDay(dayId, completed)` — same shape as `toggleGoal()`.
- `shareChallengeToRoom(challengeId, roomId)` — UPDATE `room_id`.

### 4. AccountabilityOS views — three new

#### a. `js/views/challenges.js` — list + import
- Renders user's challenges as cards (progress ring N/30, title, started date, solo/room badge).
- "Import from 30x30" button → modal with input for token or full URL (parse token out of URL like `?token=…` or `/?paid=…&token=…`).
- "Start blank" button (manual challenge — out of scope today, leave as a stub).

#### b. `js/views/challenge.js` — single challenge detail
- Header: title, X/30 progress ring (reuse the SVG ring pattern from existing `js/components.js` if there is one — check first), current streak (consecutive completed days from `started_at`), "Share to a room" button.
- Body: 30 day-rows (or grouped by week if the plan_json had week labels). Each row: checkbox, day number, title, description, optional note textarea (collapsible).
- Realtime subscription on `challenge_days` for this challenge_id.

#### c. Import handler at `#import?token=<uuid>`
- New route in `js/router.js` parsing `import` view + `token` param.
- If user not authed: stash token in `sessionStorage.pending_import_token`, navigate to `login`. Resume in `js/app.js` `onAuthChange` handler (mirror the `pending_join_code` pattern at line ~181).
- If authed: `fetch('https://30x30.midcurved.com/api/plan/' + token)` → call `createChallengeFromPlan(...)` → navigate to `#challenge/<id>`.

Wire into the dispatcher in `js/app.js`:
- Add `case 'challenges': return renderChallenges();` in the global views switch.
- Add `case 'challenge': return renderChallenge();` (room-independent) — note the existing `currentRoom` logic in `applyRoute()` clears `currentRoom` for non-room views, so this slots cleanly.
- Add a sidebar icon for Challenges (🎯 or similar) in the global sidebar (currently only `rooms` and `global-settings`).

### 5. 30x30 frontend — "Track in AccountabilityOS" button

In `/Users/rik/Documents/rik-code/30x30-repo/public/index.html`, add a third action inside the "Don't lose your plan" card (next to the existing email button + the "Copy as markdown" button shipped today):

```html
<a id="btn-track-accos"
   href="#"
   onclick="trackInAccOS(event)"
   style="display:block; width:100%; margin-top:10px; text-align:center; background:transparent; color:var(--accent); border:1px solid var(--border); font-family:'DM Mono',monospace; font-size:12px; letter-spacing:0.06em; text-transform:uppercase; padding:14px; border-radius:var(--radius); text-decoration:none;">
  Track in AccountabilityOS →
</a>
```

```js
function trackInAccOS(e) {
  e.preventDefault();
  if (!state.planToken) { alert('Plan still saving — try again in a sec'); return; }
  window.open(`https://accountability.midcurved.com/#import?token=${state.planToken}`, '_blank');
}
```

---

## The hard open question — group UX for large challenges

**Scenario:** I run a Ship Season cohort. 50 people import the same 30x30 plan and join one shared room. If the room dashboard renders all 50 × 30 = 1500 day-checkboxes, it's noise.

**Help me decide between (or invent better):**

- **A. Cohort dashboard** — single aggregate view: leaderboard by completion %, today's-day spotlight (everyone working on Day N), X/50 finished today, recent activity feed. Individual progress is one click away.
- **B. Squad split** — auto-bucket into squads of 5 inside the room, each squad sees only their squad's progress in detail (with the cohort number as a topline metric).
- **C. Daily standup feed** — the only "shared" surface is a per-day feed where each member can post a 1-line note + optional link (the build they shipped). Checkboxes stay private; the social layer is the post.
- **D. Rolling cohort wave** — visualize all 50 as dots on a 30-day timeline showing where each person currently is; drill into any dot for their plan.

Constraints:
- RLS as designed allows room members to see all challenges shared to the room — fine for small rooms, painful for 50.
- Realtime on `challenge_days` will fan out events; for 50 members × 30 days that's manageable but watch the channel cardinality.
- Don't overbuild — pick the simplest thing that turns 50 people into a useful social signal, not a wall of noise.

**My current lean:** C (daily standup feed) for the social surface, A (cohort dashboard topline) for the room landing page. Squad split (B) is a v2 if rooms grow past ~30. Open to being talked out of this.

---

## Files to read first (in this order)

1. `/Users/rik/Documents/rik-code/Accountability/js/app.js` — entry, render dispatcher, auth flow
2. `/Users/rik/Documents/rik-code/Accountability/js/router.js` — hash routing patterns
3. `/Users/rik/Documents/rik-code/Accountability/js/data/goals.js` — data-layer pattern to mirror for challenges
4. `/Users/rik/Documents/rik-code/Accountability/js/views/room-dashboard.js` — view rendering pattern
5. `/Users/rik/Documents/rik-code/Accountability/supabase/migrations/001_initial_schema.sql` — RLS helpers (`is_room_member`, `is_room_creator`)
6. `/Users/rik/Documents/rik-code/Accountability/js/themes.js` + `css/tokens.css` — design tokens for any new UI
7. `/Users/rik/Documents/rik-code/30x30-repo/src/index.js` — where the new GET endpoint goes (existing patterns: `/api/save-plan`, `/api/email-plan`)
8. `/Users/rik/Documents/rik-code/30x30-repo/public/index.html` line ~760 — the "Don't lose your plan" card where the new button slots in

---

## Verification

1. **Endpoint:** `curl https://30x30.midcurved.com/api/plan/<known-token>` returns plan JSON (no email).
2. **Migration:** apply `007_challenges.sql` against a Supabase branch first; confirm RLS by `select * from challenges` as two different authenticated users.
3. **Import flow end-to-end:**
   - Generate a plan at 30x30.midcurved.com → click "Track in AccountabilityOS"
   - Land on AccOS, sign in if needed (verify `pending_import_token` resume works)
   - Land on `#challenge/<id>` with all 30 days rendered
   - Toggle a day → realtime updates the progress ring, persists across reload
4. **Group UX:** once decided, validate with a manual 3-person test before scaling — open three browser sessions, share one challenge to a room, confirm everyone sees the right thing and nothing they shouldn't.

---

## Out of scope for this thread

- Daily email nudges (v2)
- "Start blank" manual challenges (stub only)
- Migrating existing 30x30 D1 subscribers into Supabase (separate question)
- Pots / financial commitment on challenges (interesting later, not now)

---

## Start here

Read the seven files above, confirm you understand the existing AccOS patterns, then propose an implementation plan that covers steps 1–5. Ask me about the group-UX question (A/B/C/D) before designing the room-shared challenge view — that's the only fork left.
