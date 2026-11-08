-- Security fixes H1, H2, M8.

-- H2. Server-side size limits. NOT VALID so existing rows cannot block the
-- migration; new and updated rows are checked.
alter table public.user_profiles
  add constraint user_profiles_keywords_len check (cardinality(keywords) <= 10) not valid,
  add constraint user_profiles_universities_len check (cardinality(target_universities) <= 10) not valid,
  add constraint user_profiles_countries_len check (cardinality(target_countries) <= 10) not valid,
  add constraint user_profiles_field_len check (char_length(field_of_study) <= 100) not valid,
  add constraint user_profiles_name_len check (char_length(display_name) <= 60) not valid,
  add constraint user_profiles_semester_len check (char_length(start_semester) <= 40) not valid;

update storage.buckets
set file_size_limit = 5242880,                       -- 5 MB
    allowed_mime_types = array['application/pdf']
where id = 'cvs';

-- M8. Clients may read and delete their CV rows; only the Edge Function and
-- agents (service role) create or change them.
revoke insert, update on public.user_cv from authenticated, anon;

-- H1. Per-user (and global) cooldowns for the costly Edge Functions.
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  fn text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_limit_events_lookup on public.rate_limit_events (fn, user_id, created_at desc);
alter table public.rate_limit_events enable row level security;  -- no client policies

-- Returns true and records the call if under the limit, else false.
-- p_user_id null means a global limit for the function.
create or replace function public.rate_limit_hit(p_user_id uuid, p_fn text, p_max int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare recent int;
begin
  delete from rate_limit_events where created_at < now() - interval '2 days';
  select count(*) into recent from rate_limit_events
   where fn = p_fn and created_at > now() - p_window
     and (p_user_id is null or user_id = p_user_id);
  if recent >= p_max then
    return false;
  end if;
  insert into rate_limit_events (user_id, fn)
  values (coalesce(p_user_id, '00000000-0000-0000-0000-000000000000'), p_fn);
  return true;
end;
$$;
revoke execute on function public.rate_limit_hit(uuid, text, int, interval) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(uuid, text, int, interval) to service_role;
