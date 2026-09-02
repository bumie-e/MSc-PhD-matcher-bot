-- Root-cause fix: no user_profiles row was ever created for a new auth
-- user. The onboarding wizard only ever UPDATEs user_profiles (by design,
-- since RLS lets a user touch only their own row) — with no row to update,
-- every save silently affected zero rows. This trigger creates the row the
-- moment an auth user is created, covering both the real signup flow and
-- users created manually via the dashboard.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, display_name)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any existing auth users that predate this trigger.
insert into public.user_profiles (id, display_name)
select id, email from auth.users
on conflict (id) do nothing;
