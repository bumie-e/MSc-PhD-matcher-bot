-- Open signup: anyone can create an account with Supabase Auth.
-- The "Before User Created" hook stays wired in the dashboard, but now allows
-- every signup, so no dashboard change is needed. Invites in pending_invites
-- remain available as an optional admin feature.

create or replace function public.check_invite_before_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object();
end;
$$;
