-- Security fixes C1 and M4.

-- C1. Clients must never be able to write is_admin. Replace the table-wide
-- write privilege with an explicit column allow-list. The profile row is
-- created by the signup trigger (security definer), so clients need no INSERT.
revoke insert, update on public.user_profiles from authenticated, anon;
grant update (
  display_name, field_of_study, keywords, target_countries, target_universities,
  degree_type, funding_required, start_semester, min_score_threshold, onboarding_step
) on public.user_profiles to authenticated;

-- Belt and braces: reject is_admin changes from anyone but the service role.
create or replace function public.protect_is_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and coalesce(auth.role(), current_user) <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'is_admin cannot be changed from the client';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_is_admin on public.user_profiles;
create trigger protect_is_admin
  before update on public.user_profiles
  for each row execute function public.protect_is_admin();

-- M4. mark_invite_used is security definer; nobody should call it over RPC.
revoke execute on function public.mark_invite_used(text) from public, anon, authenticated;
