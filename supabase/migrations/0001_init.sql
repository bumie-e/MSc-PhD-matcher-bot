-- Initial schema: opportunities, matches, user_profiles, user_cv,
-- linkedin_sessions, user_notes, pending_invites, lab_visits.
-- All user-scoped tables have RLS enabled. opportunities is shared/read-only to authenticated users.

create extension if not exists "pgcrypto";

-- ── opportunities (shared) ──────────────────────────────────────────────
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  university text not null,
  department text,
  professor text,
  type text not null check (type in ('msc', 'phd')),
  deadline date,
  semester text,
  location text not null,
  stipend text,
  requirements jsonb not null default '{}'::jsonb,
  how_to_apply text,
  contact_info jsonb not null default '{}'::jsonb,
  source_url text not null unique,
  source_name text not null,
  created_at timestamptz not null default now()
);

alter table opportunities enable row level security;

create policy "opportunities readable by authenticated users"
  on opportunities for select
  to authenticated
  using (true);

-- writes only via service role (agents), no client insert/update/delete policy

-- ── user_profiles ────────────────────────────────────────────────────────
create table user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  field_of_study text,
  keywords text[] not null default '{}',
  target_countries text[] not null default '{}',
  target_universities text[] not null default '{}',
  degree_type text not null default 'both' check (degree_type in ('msc', 'phd', 'both')),
  funding_required boolean not null default false,
  start_semester text,
  min_score_threshold int not null default 40,
  onboarding_step int not null default 1,
  is_admin boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table user_profiles enable row level security;

create policy "users manage own profile"
  on user_profiles for all
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── user_cv ──────────────────────────────────────────────────────────────
create table user_cv (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  filename text not null,
  raw_text text,
  parsed jsonb not null default '{}'::jsonb,
  storage_path text not null,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'done', 'error')),
  updated_at timestamptz not null default now()
);

alter table user_cv enable row level security;

create policy "users manage own cv"
  on user_cv for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── linkedin_sessions (service-role only, no client policy) ───────────────
create table linkedin_sessions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cookie_enc text not null,
  validated_at timestamptz,
  expires_est date,
  updated_at timestamptz not null default now()
);

alter table linkedin_sessions enable row level security;
-- Intentionally no policies: only the service role (GitHub Actions) can read/write.
-- The client JWT is never granted access to this table.

-- ── matches (per-user) ──────────────────────────────────────────────────
create table matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  score int not null check (score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  summary text,
  pros text[] not null default '{}',
  cons text[] not null default '{}',
  recommendations text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

alter table matches enable row level security;

create policy "users read own matches"
  on matches for select
  to authenticated
  using (auth.uid() = user_id);

-- writes only via service role (match agent)

-- ── user_notes (per-user) ────────────────────────────────────────────────
create table user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  note text,
  pinned boolean not null default false,
  status text not null default 'saved' check (status in ('saved', 'applied', 'rejected', 'offer')),
  custom_rank int,
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

alter table user_notes enable row level security;

create policy "users manage own notes"
  on user_notes for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── pending_invites (admin-managed, no direct client access) ──────────────
create table pending_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  token text not null unique,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days')
);

alter table pending_invites enable row level security;
-- No client policies: created/read only via Edge Functions using the service role.

-- ── lab_visits (research lab discovery cache, service-role only) ──────────
create table lab_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  lab_url text not null,
  status text not null check (status in ('hiring_now', 'hiring_soon', 'not_hiring', 'unclear')),
  visited_at timestamptz not null default now(),
  unique (user_id, lab_url)
);

alter table lab_visits enable row level security;
-- No client policies: read/written only by the search agent's service role.

create index idx_matches_user_id on matches (user_id);
create index idx_matches_opportunity_id on matches (opportunity_id);
create index idx_user_notes_user_id on user_notes (user_id);
create index idx_opportunities_deadline on opportunities (deadline);
create index idx_lab_visits_user_visited on lab_visits (user_id, visited_at);
