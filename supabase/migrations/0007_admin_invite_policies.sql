-- Admin invite manager (Phase 4): let admins list/manage pending_invites
-- directly from the client instead of needing a dedicated Edge Function
-- for every read. Creation still goes through send-invite (service role,
-- so email delivery + token generation stay server-side).

create policy "admins read pending invites"
  on pending_invites for select
  to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true));

create policy "admins delete pending invites"
  on pending_invites for delete
  to authenticated
  using (exists (select 1 from user_profiles where id = auth.uid() and is_admin = true));
