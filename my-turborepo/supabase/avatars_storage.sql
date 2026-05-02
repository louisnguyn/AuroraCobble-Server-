-- Profile avatar uploads → Supabase Storage bucket `avatars` (public read; writes via Backend service role).
-- Run this whole file once in Supabase → SQL Editor (same project as SUPABASE_URL).

-- Bucket (safe to run again)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do nothing;

-- So anyone can load <img src="public URL">
drop policy if exists "Public read avatars" on storage.objects;

create policy "Public read avatars"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'avatars');
