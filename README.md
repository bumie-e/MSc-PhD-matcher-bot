# MSc-PhD-matcher-bot

This is a project to help find masters and phd opportunities in relevant fieldof study and interests and match them with your CV to evaluate your chances. It also gives information about the dealines for submission, requirements, ways to reach out, infor to nbote on professors website, what semester the prof/university is hi9ring for, and what you need to subvmit the aapplication.

It does two things:
1. Finds rel;evant opportunities based ony our interest from places like popular scholarship sites, universities yoiu're interesred in, or major websites
2. Matches your education, experience, and interests witht he posting requirements and evalautes your chances based on these
3. Records this information in a database and pioriutize them by deadline and chances evaluation
4. Displays this for you in a beautiful website, that is updated each time there's a new update and allows you to edit things, make notes, reorder and save youir changes in the database. It is primarily egronomic and prioiritizes user experience.

Architecture:

This is a multi agent frame work. An agent does the opportunities search everyday. Another agent does the match. While an orchestraor or [python agent handles the recording to database, update, etc. 

## Bring your own AI key

Browsing is free: the daily search fills a shared pool of openings that every
signed-in user can browse, save and track, with no setup. **Personalised
matching is optional** and runs on the user's *own* LLM key (Groq, OpenAI or
Anthropic), so nobody's usage is billed to the project owner.

How it works:

1. In Settings (or the onboarding wizard) a user pastes a key. The `save-llm-key`
   Edge Function checks it by asking the provider for its model list (no tokens
   spent), picks a default model, encrypts the key with AES-256-GCM and stores it
   in `user_llm_keys`. The browser can read only the key's status, never the key.
2. The CV is read with that key (`parse-cv.yml`), then `match.yml` scores
   openings with it. Each batch is capped (`MATCH_MAX_PER_USER_PER_RUN`, default
   40), skips openings that are closed or of the wrong degree type, and skips
   ones already scored, so costs stay predictable.
3. If a provider rejects the key, the key is marked invalid, scoring for that
   user stops, and the dashboard asks them to replace it. If the key works but
   the chosen model was retired, the key is marked `model_unavailable`, scoring
   stops, and Settings refreshes the model list and asks the user to pick another.
   Choosing one resumes scoring automatically.

Only chat models are offered (embeddings, speech, image, moderation, dated
snapshots and OpenAI's o-series are filtered out, capped at 8, cheapest sensible
default first). See `curateModels` in `supabase/functions/_shared/llm-providers.ts`.

The owner's `GROQ_API_KEY` is used **only** by the shared search agent to turn
scraped listings into structured openings. `COOKIE_ENCRYPTION_KEY` must be set in
GitHub Actions secrets and Supabase secrets (it decrypts user keys). The
`save-llm-key` function also needs `GITHUB_PAT` and `GITHUB_REPO`, like the other
dispatching functions.

Deploying this change: run migration `0012_user_llm_keys.sql`, deploy
`save-llm-key` and the updated `upload-cv` (`supabase functions deploy
save-llm-key upload-cv`), then add the new `rescore` input by merging the
updated workflows.

## Status

Phases 1–3 are implemented: Supabase schema + RLS, email and password auth with open signup, the CV
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
supabase functions deploy upload-cv
supabase functions deploy run-search
supabase functions deploy rematch-me
supabase secrets set GITHUB_PAT=<repo-scoped PAT> GITHUB_REPO=<owner>/<repo> SITE_URL=<pages url> COOKIE_ENCRYPTION_KEY=<same key as .env>
```

GitHub Pages deployment (`deploy.yml`) needs two repo secrets:
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus
Settings → Pages → Build and deployment → Source: **GitHub Actions**.