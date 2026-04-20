-- ============================================================
-- THE STORAGE FORTRESS: PROTECTING YOUR ASSETS
-- ============================================================

-- 1. CLEANUP: Remove those dangerous "Allow Anyone" policies
DROP POLICY IF EXISTS "Public Access to Website Images" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads to Website Images" ON storage.objects;
DROP POLICY IF EXISTS "Allow Updates to Website Images" ON storage.objects;
DROP POLICY IF EXISTS "Allow Deletes from Website Images" ON storage.objects;
DROP POLICY IF EXISTS "Public Access to Images" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads to Images" ON storage.objects;

-- 2. READ ACCESS: Everyone can SEE product images
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id IN ('images', 'website-images'));

-- 3. SECURE UPLOADS: Public can ONLY upload to 'returns/' folder in 'images' bucket
CREATE POLICY "Public Secure Upload Returns"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'images' 
    AND (storage.foldername(name))[1] = 'returns'
);

-- 4. ADMIN MASTER ACCESS: Admin/Staff can do ANYTHING (Manage Products, Delete, etc.)
-- We reuse our 'is_admin_or_staff' logic from Phase 3
CREATE OR REPLACE FUNCTION storage_is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
        AND role IN ('admin', 'staff')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Admin Full Control"
ON storage.objects FOR ALL
USING (storage_is_admin())
WITH CHECK (storage_is_admin());

-- 5. FINAL LOCKDOWN: No one else can UPDATE or DELETE
-- (Handled by the fact that there are no standard policies for Update/Delete except for Admin)
