# MSc-PhD-matcher-bot

This is a project to help find masters and phd opportunities in relevant fieldof study and interests and match them with your CV to evaluate your chances. It also gives information about the dealines for submission, requirements, ways to reach out, infor to nbote on professors website, what semester the prof/university is hi9ring for, and what you need to subvmit the aapplication.

It does two things:
1. Finds rel;evant opportunities based ony our interest from places like linkedin, popular scholarship sites, universities yoiu're interesred in, or major websites
2. Matches your education, experience, and interests witht he posting requirements and evalautes your chances based on these
3. Records this information in a database and pioriutize them by deadline and chances evaluation
4. Displays this for you in a beautiful website, that is updated each time there's a new update and allows you to edit things, make notes, reorder and save youir changes in the database. It is primarily egronomic and prioiritizes user experience.

Architecture:

This is a multi agent frame work. An agent does the opportunities search everyday. Another agent does the match. While an orchestraor or [python agent handles the recording to database, update, etc. 

LinkedIn uses a cookie called li_at as your session token. To copy it:

1. Log into LinkedIn in Chrome/Firefox
2. Open DevTools — F12 on Windows, Cmd+Option+I on Mac
3. Go to Application tab → Cookies → https://www.linkedin.com
4. Find the row named li_at, click it, copy the value (it's a long string starting with AQED...)
5. Paste it into the LinkedIn tab in the app's Settings page

## Status

Phases 1–3 are implemented: Supabase schema + RLS, invite-only auth, the CV
parser workflow, a Search Agent covering all Phase 1–2 sources, a Match
Agent, and a static Next.js frontend (auth, onboarding wizard, dashboard
with Realtime + detail drawer). Research lab discovery (Phase 3 scraper),
Settings/Pipeline/Admin pages (Phase 4), and ResearchGate (Phase 5) are not
yet built. See the implementation plan for the full architecture and phase
breakdown.

## Local setup — backend / agents

```bash
uv sync
uv run playwright install chromium
cp .env.example .env   # fill in Supabase, Groq, Tavily keys
```

Apply the Supabase migrations in `supabase/migrations/` (via the Supabase
CLI or dashboard SQL editor), then run an agent directly, e.g.:

```bash
uv run --env-file .env python -m agents.search.agent
uv run --env-file .env python -m agents.matching.agent --opp-ids all
```

Run tests and lint:

```bash
uv run --extra dev pytest
uv run --extra dev ruff check .
```

## Local setup — frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
npm run dev
```

Deploy Functions (from `supabase/functions/`) with the Supabase CLI:

```bash
supabase functions deploy send-invite
supabase functions deploy save-linkedin
supabase functions deploy upload-cv
supabase functions deploy run-search
supabase functions deploy rematch-me
supabase secrets set GITHUB_PAT=<repo-scoped PAT> GITHUB_REPO=<owner>/<repo> SITE_URL=<pages url> COOKIE_ENCRYPTION_KEY=<same key as .env>
```

GitHub Pages deployment (`deploy.yml`) needs two repo secrets:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus
Settings → Pages → Build and deployment → Source: **GitHub Actions**.