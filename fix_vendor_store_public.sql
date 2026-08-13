-- =============================================================================
-- FIX: Vendor store info not visible on the public website
-- =============================================================================
-- PROBLEM:
--   The website's ProductDetail page tried to read the vendor's profile from
--   public.profiles, but RLS (profiles_self_read) only lets the user read their
--   own profile or admins read all. Website visitors (anon / customers) got no
--   rows, so the vendor store card never rendered below the reviews.
--   Also, profiles had no avatar_url column for a store picture.
-- =============================================================================

-- 1. Add avatar_url for the store profile picture
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Safe public view exposing ONLY storefront-safe vendor fields
--    (bank / payout / email fields stay hidden from the public)
DROP VIEW IF EXISTS public.vendor_store_profiles;
CREATE OR REPLACE VIEW public.vendor_store_profiles AS
SELECT
    id,
    store_name,
    full_name,
    avatar_url,
    phone,
    whatsapp,
    address,
    city,
    description
FROM public.profiles;

GRANT SELECT ON public.vendor_store_profiles TO anon, authenticated;

-- Verification:
-- SELECT * FROM public.vendor_store_profiles;
