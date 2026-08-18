-- =============================================================================
-- ADD: joined date, phone, whatsapp to the public store view
-- =============================================================================
DROP VIEW IF EXISTS public.vendor_store_profiles;
CREATE OR REPLACE VIEW public.vendor_store_profiles AS
SELECT
    id,
    store_name,
    full_name,
    avatar_url,
    is_verified,
    phone,
    whatsapp,
    address,
    city,
    description,
    created_at
FROM public.profiles;

GRANT SELECT ON public.vendor_store_profiles TO anon, authenticated;

-- Verification:
-- SELECT id, store_name, created_at, phone, whatsapp FROM public.vendor_store_profiles;