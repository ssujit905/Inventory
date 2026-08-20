-- =============================================================================
-- FIX: Website orders invisible to vendor staff in Orders page
-- =============================================================================
-- Diagnosis (2026-08-20): vendor staff could not see website orders even though
-- the same orders appeared in Sales.
--
-- WHY:
--   * vendor RLS + app query require website_order_items.vendor_id =
--     current_vendor_id() (the vendor OWNER's profile id)
--   * create_atomic_website_order copies website_products.vendor_id onto the
--     order items -- but website_products.vendor_id was NULL or set to a
--     STAFF profile id instead of the vendor owner's id
--   * Sales stayed visible because sale_items.vendor_id comes from the
--     physical products table (products.vendor_id), which was correct
--
-- FIX:
--   1. Sync website_products.vendor_id from the linked physical products
--      (products.vendor_id), including bundle children
--   2. Backfill website_order_items.vendor_id from the fixed website_products
-- =============================================================================

-- 1. Standard products: website variant -> inventory_product_id -> products.vendor_id
UPDATE public.website_products wp
SET vendor_id = p.vendor_id
FROM public.website_variants wv
JOIN public.products p ON p.id = wv.inventory_product_id
WHERE wv.product_id = wp.id
  AND wp.vendor_id IS DISTINCT FROM p.vendor_id;

-- 2. Bundle products: website variant -> website_variant_bundles.child_inventory_id -> products.vendor_id
UPDATE public.website_products wp
SET vendor_id = p.vendor_id
FROM public.website_variants wv
JOIN public.website_variant_bundles wvb ON wvb.bundle_variant_id = wv.id
JOIN public.products p ON p.id = wvb.child_inventory_id
WHERE wv.product_id = wp.id
  AND wp.vendor_id IS DISTINCT FROM p.vendor_id;

-- 3. Backfill existing website_order_items from the (now correct) website_products
UPDATE public.website_order_items woi
SET vendor_id = wp.vendor_id
FROM public.website_products wp
WHERE woi.product_id = wp.id
  AND woi.vendor_id IS DISTINCT FROM wp.vendor_id;

-- Verification:
-- SELECT o.id, o.order_number, o.status, i.product_id, i.vendor_id
-- FROM website_orders o JOIN website_order_items i ON i.order_id = o.id
-- ORDER BY o.id DESC LIMIT 10;