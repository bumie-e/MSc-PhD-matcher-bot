-- The Auth Hooks picker in the dashboard only lists Postgres functions that
-- supabase_auth_admin can execute. Without these grants,
-- check_invite_before_signup never shows up as a selectable hook.

grant usage on schema public to supabase_auth_admin;

grant execute
  on function public.check_invite_before_signup(jsonb)
  to supabase_auth_admin;

revoke execute
  on function public.check_invite_before_signup(jsonb)
  from authenticated, anon, public;
