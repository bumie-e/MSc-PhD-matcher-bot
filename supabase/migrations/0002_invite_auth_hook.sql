-- Auth hook: block signup unless the email has a valid, unused, unexpired invite.
-- Wire this function up in Supabase Dashboard → Authentication → Hooks →
-- "Before User Created" hook, pointing at public.check_invite_before_signup.

create or replace function public.check_invite_before_signup(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_email text := event -> 'claims' ->> 'email';
  has_valid_invite boolean;
begin
  select exists (
    select 1 from pending_invites
    where email = invite_email
      and used_at is null
      and expires_at > now()
  ) into has_valid_invite;

  if not has_valid_invite then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This email does not have a valid invite.'
      )
    );
  end if;

  return jsonb_build_object();
end;
$$;

-- Marks the invite used once the account is actually created.
-- Call from the client (or a Postgres trigger on auth.users) right after signup succeeds.
create or replace function public.mark_invite_used(invite_email text)
returns void
language sql
security definer
set search_path = public
as $$
  update pending_invites
  set used_at = now()
  where email = invite_email
    and used_at is null;
$$;
