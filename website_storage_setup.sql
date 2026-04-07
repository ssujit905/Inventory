-- 1. Create the website-images bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('website-images', 'website-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. Drop existing policies on the bucket to prevent conflicts (optional)
DROP POLICY IF EXISTS "Public Access to Website Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Upload to Website Images" ON storage.objects;
DROP POLICY IF EXISTS "Admin Delete from Website Images" ON storage.objects;

-- 3. Allow EVERYONE to read (view/download) images from the bucket
CREATE POLICY "Public Access to Website Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'website-images');

-- 4. Allow ANYONE to insert/upload images to the bucket 
-- (You can restrict this to authenticated admins later, but this ensures your app works right now)
CREATE POLICY "Allow Uploads to Website Images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'website-images');

-- 5. Allow ANYONE to update/replace images in the bucket
CREATE POLICY "Allow Updates to Website Images"
ON storage.objects FOR UPDATE
WITH CHECK (bucket_id = 'website-images');

-- 6. Allow ANYONE to delete images from the bucket
CREATE POLICY "Allow Deletes from Website Images"
ON storage.objects FOR DELETE
USING (bucket_id = 'website-images');
