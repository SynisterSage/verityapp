-- Create public avatars bucket for user profile pictures
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload their own avatar
create policy avatars_upload on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (split_part(name, '/', 1))
  );

-- Allow authenticated users to update their own avatar
create policy avatars_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (split_part(name, '/', 1))
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (split_part(name, '/', 1))
  );

-- Allow anyone to read avatars (they're public)
create policy avatars_read on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Allow authenticated users to delete their own avatar
create policy avatars_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (split_part(name, '/', 1))
  );
