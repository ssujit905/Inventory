-- =============================================================================
-- FIX: Vendors cannot upload their store avatar (RLS violation on storage)
-- =============================================================================
-- PROBLEM:
--   fortress_storage_security.sql only allows:
--     * public INSERT into images/returns/
--     * admin/staff full control (storage_is_admin: role IN ('admin','staff'))
--   Vendors (role='vendor') uploading to website-images/vendor-avatars/
--   match no policy -> "new row violates row-level security policy".
-- =============================================================================

CREATE POLICY "Vendor Avatar Upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'website-images'
    AND (storage.foldername(name))[1] = 'vendor-avatars'
    AND split_part(storage.filename(name), '.', 1) = auth.uid()::text
);

CREATE POLICY "Vendor Avatar Update"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'website-images'
    AND (storage.foldername(name))[1] = 'vendor-avatars'
    AND split_part(storage.filename(name), '.', 1) = auth.uid()::text
)
WITH CHECK (
    bucket_id = 'website-images'
    AND (storage.foldername(name))[1] = 'vendor-avatars'
    AND split_part(storage.filename(name), '.', 1) = auth.uid()::text
);

-- Verification:
-- SELECT policyname, cmd, roles FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';