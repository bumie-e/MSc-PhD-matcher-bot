-- Extend bring-your-own-key support without changing existing keys or policies.
alter table public.user_llm_keys
  drop constraint user_llm_keys_provider_check;

alter table public.user_llm_keys
  add constraint user_llm_keys_provider_check
  check (provider in ('groq', 'openai', 'anthropic', 'gemini', 'deepseek'));
