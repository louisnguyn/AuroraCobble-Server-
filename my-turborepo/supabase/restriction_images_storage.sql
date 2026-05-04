-- Rich-text images for battle restrictions (Admin upload → public read).
-- Writes use the Backend service role key (bypasses RLS like avatars).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'restriction_images',
  'restriction_images',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read restriction_images" ON storage.objects;

CREATE POLICY "Public read restriction_images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'restriction_images');
