-- =============================================================================
-- VENDOR STORE VERIFICATION + AVATAR
-- =============================================================================
-- 1. Adds is_verified to profiles (admin grants the badge; vendors can never
--    self-verify).
-- 2. Exposes it through the public vendor_store_profiles view so the website
--    can render the Verified badge next to store names.
-- 3. avatar_url already exists; both desktop & vendor apps upload store logos
--    to the 'website-images' bucket under vendor-avatars/.
-- =============================================================================

-- 1. Verified badge column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;

-- 2. Rebuild the public storefront view with is_verified
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
    description
FROM public.profiles;

GRANT SELECT ON public.vendor_store_profiles TO anon, authenticated;

-- Verification:
-- SELECT id, store_name, avatar_url, is_verified FROM public.vendor_store_profiles;