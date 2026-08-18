-- =============================================================================
-- ADD VENDOR PLAN (basic / full)
--   basic: limited menus (Dashboard, Inventory, Stock In, Sales, Website
--          Products, Orders, Returns, Delivery, Settings, Staff Management)
--   full:  all menus (current behavior)
--   Existing vendors keep 'full' by default — nothing changes for them.
-- =============================================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'full'
    CHECK (plan IN ('basic', 'full'));

-- Verification:
-- SELECT id, email, role, plan FROM profiles WHERE role = 'vendor' ORDER BY created_at DESC;