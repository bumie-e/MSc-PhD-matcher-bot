-- Bring-your-own-key: each user supplies their own LLM API key (Groq, OpenAI
-- or Anthropic). It is used only for that user's personalised work (reading
-- their CV and scoring matches). Browsing the shared opportunity list needs no key.
--
-- The key is stored AES-256-GCM encrypted (AES-256-GCM, see agents/crypto.py).
-- The Edge Function `save-llm-key` validates and writes it with the service
-- role. The browser may read the row's status columns but never key_enc.

create table user_llm_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null check (provider in ('groq', 'openai', 'anthropic')),
  model text not null,
  available_models text[] not null default '{}',
  key_enc text not null,
  -- invalid: the provider rejected the key. model_unavailable: the key works but the
  -- chosen model was retired, so the user needs to pick another.
  status text not null default 'valid' check (status in ('valid', 'invalid', 'model_unavailable')),
  status_message text,
  validated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_llm_keys enable row level security;

create policy "users read own llm key status"
  on user_llm_keys for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete policies: only the service role writes this table.
-- Column-level grants keep the ciphertext away from the client entirely, even
-- though RLS already limits rows to their owner.
revoke all on user_llm_keys from anon, authenticated;
grant select (user_id, provider, model, available_models, status, status_message, validated_at, updated_at)
  on user_llm_keys to authenticated;

-- Why a CV could not be read (for example, the user's key was rejected),
-- so the dashboard can say what to fix instead of spinning forever.
alter table user_cv add column parse_error text;

-- Rate limit for the key-check endpoint. Without it, a signed-up user could use
-- `save-llm-key` as an oracle to test stolen API keys in bulk. Service role only.
create table llm_key_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index idx_llm_key_attempts_user_time on llm_key_attempts (user_id, attempted_at desc);
alter table llm_key_attempts enable row level security;
revoke all on llm_key_attempts from anon, authenticated;
