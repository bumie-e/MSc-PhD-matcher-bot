-- Private bucket for uploaded CV PDFs. Only the owning user (via signed
-- upload from the client) and the service role (parse-cv.yml) can access it.

insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

create policy "users upload own cv"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users read own cv"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users replace own cv"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
