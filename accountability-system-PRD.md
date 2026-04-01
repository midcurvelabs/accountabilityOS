# PRD: Accountability OS
**Version:** 1.0  
**Author:** Rik Eerdekens  
**Status:** Ready for Build  
**Executor:** Claude Opus (vibe-code)

---

## 1. Overview

A single-file HTML accountability dashboard for small groups (starting 2 people, scalable to 5+). Powered by Claude API for transcript analysis, with GitHub as the data layer. Sessions are transcribed via Granola, pasted into the app, and Claude extracts structured goal/commitment data that updates each person's dashboard.

Think: Notion meets Strava meets crypto leaderboard — but it's one HTML file.

---

## 2. Problem

Accountability sessions work. But without a system:
- Goals get forgotten between calls
- No one tracks streaks or follow-through
- There's no skin in the game
- "We should do this again" is the only artifact

This app makes sessions count beyond the call.

---

## 3. Goals

- Turn Granola transcripts into structured goal dashboards automatically
- Give each person a personal accountability view
- Add competitive/social pressure through gamification
- Keep it dead simple to run (paste transcript → done)
- Architecture that scales from 2 to 10+ people without a backend

---

## 4. Non-Goals

- No real-time collaboration (async is fine)
- No calendar integration (v1)
- No mobile app (responsive web is enough)
- No user auth system (PIN access per person is sufficient for v1)

---

## 5. Users

| Role | Description |
|------|-------------|
| **Admin** | Rik. Manages the session, pastes transcripts, sees all users |
| **Member** | Friend/accountability partner. Has their own dashboard view |
| **Group** | 3–5 people in a shared accountability pod (v1.5 feature) |

---

## 6. Architecture

### Stack
- **App:** Single-file HTML (HTML + CSS + JS, no framework)
- **Hosting:** Cloudflare Pages (GitHub-connected, auto-deploys)
- **Data:** GitHub repo — single `data.json` file, read/written via GitHub Contents API
- **AI:** Claude API (`claude-sonnet-4-20250514`) called client-side for transcript analysis
- **Auth:** Simple PIN per user stored in `data.json` (not security-grade, just UX gating)

### Data Flow
```
Granola call
    → transcript exported (text)
    → Admin pastes into app
    → Claude API analyses transcript
    → Returns structured JSON (goals, commitments, NOT-to-dos, deadlines)
    → App writes updated user data to GitHub via API
    → Dashboard re-renders from new data
```

### `data.json` Schema
```json
{
  "users": [
    {
      "id": "rik",
      "name": "Rik",
      "pin": "1234",
      "role": "admin",
      "avatar": "🔥",
      "stats": {
        "totalPoints": 0,
        "streak": 0,
        "lastSessionDate": null,
        "sessionsAttended": 0,
        "goalsCompleted": 0,
        "goalsTotal": 0
      },
      "currentGoals": {
        "priority": [],
        "secondary": [],
        "notToDo": []
      },
      "sessions": []
    }
  ],
  "groups": [],
  "settings": {
    "sessionFrequency": "weekly",
    "pointsConfig": {
      "showUp": 10,
      "completeGoal": 25,
      "streakBonus": 5,
      "peerVote": 15
    },
    "githubRepo": "",
    "githubToken": "",
    "anthropicKey": ""
  }
}
```

### Session Object Schema
```json
{
  "id": "session_20250401",
  "date": "2025-04-01",
  "participants": ["rik", "friend1"],
  "transcript": "...(raw text)...",
  "analysis": {
    "rik": {
      "priorityGoals": [
        { "text": "Close FullSend proposal", "deadline": "2025-04-07", "completed": false }
      ],
      "secondaryGoals": [
        { "text": "Record 2 YouTube scripts", "deadline": null, "completed": false }
      ],
      "notToDo": [
        { "text": "Don't check Twitter before noon" }
      ],
      "mood": "high",
      "pointsAwarded": 10
    },
    "friend1": {}
  }
}
```

---

## 7. Features

### 7.1 Views

#### Landing / Select User
- Shows all user avatars + names
- Click → enter PIN → enter your dashboard
- Admin PIN → enters admin view

#### Personal Dashboard (Member View)
- Header: name, streak fire emoji, points total
- **Priority Goals** (max 3): big cards, checkbox to mark done
- **Secondary Goals**: smaller list, checkboxes
- **NOT-to-do List**: red-bordered cards — commitments on what to avoid
- **Completion %**: circular progress ring for current period
- **Session History**: last 5 sessions, expandable
- **Leaderboard strip**: your rank vs others (points only, no detail)

#### Admin Dashboard
- All users in a grid — each showing streak, points, completion %
- "Paste Transcript" button → opens transcript modal
- Session log — all sessions, who attended
- Settings panel (API keys, repo config, point values)
- Manual goal override (admin can edit anyone's goals)

#### Leaderboard View
- Full leaderboard: rank, avatar, name, points, streak
- "Public shame" section: who hasn't completed their goals (configurable on/off)
- Weekly delta: who went up/down

### 7.2 Core Actions

#### Paste Transcript (Admin only)
1. Admin clicks "New Session"
2. Selects participants from checklist
3. Pastes Granola transcript into textarea
4. Clicks "Analyse"
5. Claude API processes transcript — extracts per-person:
   - Priority goals (up to 3)
   - Secondary goals
   - NOT-to-do commitments
   - Deadlines mentioned
   - Mood/energy (if detectable)
6. App shows preview of extracted data per person
7. Admin can edit/approve before saving
8. Confirm → writes to GitHub → dashboards update

#### Mark Goal Complete (Member)
- Click checkbox on any goal
- App recalculates points (goal completion = +25 pts)
- If all priority goals done → streak increments
- Writes to GitHub

#### Peer Vote (optional per session)
- After a session, each person rates their partner's week: 👎 / 😐 / 👍
- Vote = +0 / +7 / +15 points
- Adds social accountability layer

#### Streak Logic
- Streak = consecutive periods (weekly/biweekly) where user:
  - Attended the session (+1 condition)
  - Completed ≥ 1 priority goal (+1 condition)
- Both conditions must be true to maintain streak
- Streak broken = resets to 0
- Streak bonus: +5 pts per session while on streak (multiplies at 5, 10, 20 streak)

---

## 8. Claude Prompt (Transcript Analyser)

```
You are an accountability coach AI. Analyse the following session transcript and extract structured data for each participant.

Participants in this session: {participantNames}

For each participant, extract:
1. priorityGoals: Their top 1-3 goals for the next period (specific, actionable)
2. secondaryGoals: Other goals or intentions mentioned
3. notToDo: Explicit commitments to STOP doing or AVOID
4. deadlines: Any specific dates or timeframes mentioned per goal
5. mood: Overall energy/mood inferred from transcript (low/medium/high)

Return ONLY valid JSON in this exact structure, no other text:
{
  "participants": {
    "NAME": {
      "priorityGoals": [{ "text": "...", "deadline": "YYYY-MM-DD or null" }],
      "secondaryGoals": [{ "text": "...", "deadline": null }],
      "notToDo": [{ "text": "..." }],
      "mood": "low|medium|high"
    }
  },
  "sessionSummary": "2-3 sentence summary of the session themes"
}

Transcript:
{transcript}
```

---

## 9. Gamification System

### Points Table
| Action | Points |
|--------|--------|
| Show up to session | +10 |
| Complete a priority goal | +25 |
| Complete a secondary goal | +10 |
| Maintain NOT-to-do (self-reported) | +5 |
| Peer vote: 👍 | +15 |
| Peer vote: 😐 | +7 |
| Streak bonus (active streak) | +5/session |
| Streak milestone (5, 10, 20) | +50 bonus |

### Shame Mechanics
- Anyone with 0 priority goals completed after a full period gets a 🚨 badge
- Leaderboard shows "Slipping" label under their name
- Admin can toggle public shame on/off in settings

### Decay (optional, v1.5)
- Goals not touched in 2 periods auto-archive
- Points don't decay but streak resets

---

## 10. Design Direction

### Aesthetic: Dark Terminal Meets Sports Dashboard
- Dark background (`#0a0a0f`) with card surfaces (`#13131a`)
- Accent: electric green (`#00ff88`) for streaks/completions
- Warning: amber (`#ffaa00`) for at-risk goals
- Danger: red (`#ff3b3b`) for NOT-to-do and shame
- Font: `Geist Mono` or `Space Mono` for stats/numbers, `Syne` for headings
- Subtle grid/scanline background texture
- Progress rings (SVG), not bars
- Smooth transitions on state changes
- Mobile-responsive (single column on mobile)

### Layout
- Full-screen app, no scroll on desktop (everything fits in viewport)
- Sidebar nav: user avatars + icons for views
- Main content area: cards in grid
- Top bar: current user, streak, points
- Floating "New Session" button (admin only)

---

## 11. GitHub Integration

### Setup (one-time)
Admin enters in settings:
- GitHub username
- Repo name (e.g. `accountability-os-data`)
- Personal Access Token (PAT) with `repo` scope
- Repo must have a `data.json` file at root

### Read
- On app load: `GET https://api.github.com/repos/{owner}/{repo}/contents/data.json`
- Decode base64 content → parse JSON

### Write
- `PUT` same endpoint with updated base64-encoded JSON + commit SHA
- Commit message: `"Session update: {date}"` or `"Goal completed: {user}"`

### Error Handling
- If GitHub unreachable → app works in local mode (localStorage fallback)
- Show sync status indicator (synced / pending / error)

---

## 12. Settings Panel (Admin)

| Setting | Description |
|---------|-------------|
| Anthropic API Key | For transcript analysis |
| GitHub Repo | `owner/repo` format |
| GitHub PAT | Personal access token |
| Session Frequency | Weekly / Biweekly |
| Point Values | Editable per action |
| Public Shame | Toggle on/off |
| Add User | Name, PIN, avatar emoji |
| Remove User | Soft-delete (keeps history) |

---

## 13. Build Order (for Opus)

Execute in this order:

1. **Data layer** — `data.json` schema + GitHub read/write functions
2. **App shell** — layout, routing between views, PIN auth
3. **Personal dashboard** — goals display, checkboxes, stats
4. **Admin view** — user grid, session log
5. **Transcript modal** — paste UI + Claude API call + preview/edit
6. **Gamification** — points calculation, streak logic
7. **Leaderboard view** — ranking, shame mechanics
8. **Settings panel** — API keys, user management
9. **Polish** — animations, mobile responsiveness, sync indicators
10. **localStorage fallback** — offline/no-GitHub mode

---

## 14. Future Scope (v2+)

- **Group sessions** — 3–5 person pods, transcript analysis identifies all speakers
- **Granola API integration** — auto-pull transcripts without copy-paste
- **Weekly digest** — auto-generated recap via Claude, shareable as image
- **Goal templates** — common goal types (fitness, revenue, content output)
- **Webhook / n8n** — trigger dashboard update from automation
- **Public profile** — shareable read-only view of someone's streak/goals

---

## 15. Success Metrics

- Sessions logged consistently for 4+ weeks
- Each person's goal completion % trending up over time
- At least one streak > 4 sessions achieved
- "I actually remembered my goals from last week" — qualitative

---

*Ship it. Iterate in public. The system is only as good as the sessions.*
