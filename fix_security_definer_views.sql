-- =============================================================================
-- FIX: Supabase Security Advisor - Views defined with SECURITY DEFINER
-- =============================================================================
-- Entities:
--   1. public.inventory_stock_view
--   2. public.website_variant_stock_view
--   3. public.vendor_store_profiles
--
-- Issue:
--   "View ... is defined with the SECURITY DEFINER property. These views enforce
--    Postgres permissions and row level security policies (RLS) of the view creator,
--    rather than that of the querying user."
--
-- Solution:
--   1. Set (security_invoker = on) on all 3 views so they run with caller privileges.
--   2. Grant column-restricted SELECT permissions to anon & authenticated on the
--      underlying tables so the website storefront continues to display variant
--      stock and vendor store cards, while strictly keeping sensitive fields
--      (vendor bank accounts, payout info, product lot cost prices) inaccessible.
-- =============================================================================

-- ── 1. CONFIGURE RLS & PERMISSIONS FOR UNDERLYING TABLES ─────────────────────

-- A. Vendor Store Profiles (exposes only public store fields, hides bank details)
GRANT SELECT (id, role, store_name, full_name, avatar_url, phone, whatsapp, address, city, description)
  ON public.profiles TO anon, authenticated;

DROP POLICY IF EXISTS storefront_read_vendor_profiles ON public.profiles;
CREATE POLICY storefront_read_vendor_profiles ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (role = 'vendor');

-- B. Products (exposes product catalog identifiers for stock lookup)
GRANT SELECT (id, name, sku, description, image_url, vendor_id)
  ON public.products TO anon, authenticated;

DROP POLICY IF EXISTS storefront_read_products ON public.products;
CREATE POLICY storefront_read_products ON public.products
  FOR SELECT TO anon, authenticated
  USING (true);

-- C. Product Lots (exposes ONLY quantity_remaining, hides cost_price)
GRANT SELECT (id, product_id, quantity_remaining)
  ON public.product_lots TO anon, authenticated;

DROP POLICY IF EXISTS storefront_read_product_lots ON public.product_lots;
CREATE POLICY storefront_read_product_lots ON public.product_lots
  FOR SELECT TO anon, authenticated
  USING (true);

-- D. Website Variants & Bundles
GRANT SELECT ON public.website_variants TO anon, authenticated;
GRANT SELECT ON public.website_variant_bundles TO anon, authenticated;

DROP POLICY IF EXISTS storefront_read_variants ON public.website_variants;
CREATE POLICY storefront_read_variants ON public.website_variants
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS storefront_read_variant_bundles ON public.website_variant_bundles;
CREATE POLICY storefront_read_variant_bundles ON public.website_variant_bundles
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── 2. REBUILD VIEWS WITH SECURITY_INVOKER = ON ──────────────────────────────

-- View 1: inventory_stock_view
DROP VIEW IF EXISTS public.inventory_stock_view CASCADE;
CREATE OR REPLACE VIEW public.inventory_stock_view
WITH (security_invoker = on) AS
SELECT
    p.id,
    p.name,
    p.sku,
    p.description,
    p.image_url,
    p.vendor_id,
    COALESCE(SUM(pl.quantity_remaining), 0)::INT AS available_stock
FROM public.products p
LEFT JOIN public.product_lots pl ON pl.product_id = p.id
GROUP BY p.id, p.name, p.sku, p.description, p.image_url, p.vendor_id;

GRANT SELECT ON public.inventory_stock_view TO anon, authenticated;

-- View 2: website_variant_stock_view
DROP VIEW IF EXISTS public.website_variant_stock_view CASCADE;
CREATE OR REPLACE VIEW public.website_variant_stock_view
WITH (security_invoker = on) AS
WITH lot_summaries AS (
    SELECT id, available_stock FROM public.inventory_stock_view
),
bundle_stock_calc AS (
    SELECT 
        vb.bundle_variant_id,
        MIN(FLOOR(COALESCE(ls.available_stock, 0) / vb.quantity))::INT as bundle_stock
    FROM public.website_variant_bundles vb
    LEFT JOIN lot_summaries ls ON ls.id = vb.child_inventory_id
    GROUP BY vb.bundle_variant_id
)
SELECT 
    v.id as variant_id,
    v.product_id as parent_product_id,
    v.color,
    v.size,
    v.sku,
    v.price,
    v.inventory_product_id,
    v.is_bundle,
    CASE 
        WHEN v.is_bundle THEN COALESCE(bs.bundle_stock, 0)
        ELSE COALESCE(ls.available_stock, 0)
    END as current_stock
FROM public.website_variants v
LEFT JOIN lot_summaries ls ON ls.id = v.inventory_product_id
LEFT JOIN bundle_stock_calc bs ON bs.bundle_variant_id = v.id;

GRANT SELECT ON public.website_variant_stock_view TO anon, authenticated;

-- View 3: vendor_store_profiles
DROP VIEW IF EXISTS public.vendor_store_profiles CASCADE;
CREATE OR REPLACE VIEW public.vendor_store_profiles
WITH (security_invoker = on) AS
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
FROM public.profiles
WHERE role = 'vendor';

GRANT SELECT ON public.vendor_store_profiles TO anon, authenticated;

-- Ensure option is set explicitly
ALTER VIEW IF EXISTS public.inventory_stock_view SET (security_invoker = on);
ALTER VIEW IF EXISTS public.website_variant_stock_view SET (security_invoker = on);
ALTER VIEW IF EXISTS public.vendor_store_profiles SET (security_invoker = on);

-- ── 3. VERIFICATION QUERY ────────────────────────────────────────────────────
-- All views should return options = {security_invoker=true}
SELECT
  c.relname AS view_name,
  c.reloptions AS options
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname = 'public';
