-- =============================================================================
-- FIX: Vendor returns/exchanges still landing in the ADMIN Returns page
-- =============================================================================
-- Diagnosis (2026-08-21): the app already filters correctly
--   (vendor -> vendor_id = current vendor, admin -> vendor_id IS NULL),
-- yet admins still see vendor returns. Root cause: resolve_return_vendor()
-- reads website_order_items.vendor_id, which was NULL/wrong on orders placed
-- before fix_new_order_vendor_tag.sql. Any return created from such an order
-- could not be routed and stayed with vendor_id NULL (= admin).
--
-- FIX:
--   1. Clean website_order_items.vendor_id again (same as
--      fix_new_order_vendor_tag.sql, kept here so this file is standalone)
--   2. Upgrade resolve_return_vendor() to fall back to the PHYSICAL product's
--      vendor (products.vendor_id) when an item's vendor_id is NULL
--   3. Re-backfill existing returns that are stuck with vendor_id NULL
-- =============================================================================

-- 1. Make sure order items carry the right vendor ----------------------------
UPDATE public.website_order_items woi
SET vendor_id = p.vendor_id
FROM public.website_variants wv
LEFT JOIN public.products p ON p.id = wv.inventory_product_id
WHERE woi.variant_id = wv.id
  AND woi.vendor_id IS NULL
  AND p.vendor_id IS NOT NULL;

-- 2. Upgraded auto-routing trigger -------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_return_vendor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vendor_count INT;
    v_vendor_id    UUID;
BEGIN
    IF NEW.vendor_id IS NULL AND NEW.order_id IS NOT NULL THEN
        -- Per item prefer its own vendor_id, else the physical product's vendor
        SELECT COUNT(DISTINCT s.v), (array_agg(DISTINCT s.v))[1]
        INTO v_vendor_count, v_vendor_id
        FROM (
            SELECT COALESCE(woi.vendor_id, p.vendor_id) AS v
            FROM public.website_order_items woi
            JOIN public.website_variants wv ON wv.id = woi.variant_id
            LEFT JOIN public.products p ON p.id = wv.inventory_product_id
            WHERE woi.order_id = NEW.order_id
        ) s
        WHERE s.v IS NOT NULL;

        -- Single-vendor order -> route to that vendor.
        -- Multi-vendor / mixed / unknown -> stay NULL = admin handles it.
        IF v_vendor_count = 1 THEN
            NEW.vendor_id := v_vendor_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_return_resolve_vendor ON public.website_order_returns;
CREATE TRIGGER on_return_resolve_vendor
BEFORE INSERT OR UPDATE OF order_id ON public.website_order_returns
FOR EACH ROW EXECUTE FUNCTION public.resolve_return_vendor();

-- 3. Re-backfill returns stuck with vendor_id NULL ----------------------------
UPDATE public.website_order_returns wor
SET vendor_id = sub.vendor_id
FROM (
    SELECT s.order_id, (array_agg(DISTINCT s.v))[1] AS vendor_id
    FROM (
        SELECT woi.order_id, COALESCE(woi.vendor_id, p.vendor_id) AS v
        FROM public.website_order_items woi
        JOIN public.website_variants wv ON wv.id = woi.variant_id
        LEFT JOIN public.products p ON p.id = wv.inventory_product_id
        WHERE woi.order_id IS NOT NULL
    ) s
    WHERE s.v IS NOT NULL
    GROUP BY s.order_id
    HAVING COUNT(DISTINCT s.v) = 1
) sub
WHERE wor.order_id = sub.order_id
  AND wor.vendor_id IS NULL;

-- Verification:
-- SELECT id, order_id, order_number, type, status, vendor_id
-- FROM website_order_returns ORDER BY id DESC LIMIT 10;
