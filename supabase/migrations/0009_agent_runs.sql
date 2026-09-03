-- Agent run log (Phase 5): every search/match/cv_parse invocation records a
-- row here so the admin UI can show recent run history without digging
-- through GitHub Actions logs. Written only by agents (service role);
-- admins can read via RLS, same pattern as pending_invites (0007).

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent text not null check (agent in ('search', 'match', 'cv_parse')),
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  error text
);

alter table agent_runs enable row level security;

create policy "admins read agent runs"
  on agent_runs for select
  to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true));

create index idx_agent_runs_started_at on agent_runs (started_at desc);
