-- 1. Create the 'images' bucket (if doesn't exist)
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow public read access to the 'images' bucket
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'images' );

-- 3. Allow authenticated users to upload files to the 'images' bucket
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'images' 
  AND auth.role() = 'authenticated'
);

-- 4. Allow authenticated users to update/delete their own files (Optional but recommended)
CREATE POLICY "Authenticated Manage"
ON storage.objects FOR ALL
USING (
  bucket_id = 'images'
  AND auth.role() = 'authenticated'
);
