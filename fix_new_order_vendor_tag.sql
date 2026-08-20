-- =============================================================================
-- FIX: NEW website orders invisible to vendor staff in Orders page
-- =============================================================================
-- Diagnosis (2026-08-20): backfilling vendor_id on website_products and
-- website_order_items worked for EXISTING orders, but newly placed orders
-- again had wrong/NULL vendor_id on their items.
--
-- WHY: the deployed create_atomic_website_order copies website_products.vendor_id
-- onto order items. Any stale RPC version, or products whose vendor_id is NULL
-- at checkout time, produces order items that fail the vendor RLS match
-- (vendor_id = current_vendor_id()).
--
-- FIX: a BEFORE INSERT trigger on website_order_items that resolves vendor_id
-- from the linked PHYSICAL product (products.vendor_id) at insert time,
-- falling back to website_products.vendor_id. This works no matter which
-- RPC version is deployed or what the RPC passes in.
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_fill_order_item_vendor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_vendor UUID;
BEGIN
    IF NEW.vendor_id IS NULL THEN
        -- 1. Prefer the physical product's vendor (products.vendor_id)
        SELECT p.vendor_id INTO v_vendor
        FROM website_variants wv
        LEFT JOIN products p ON p.id = wv.inventory_product_id
        WHERE wv.id = NEW.variant_id
        LIMIT 1;

        -- 2. Fallback: website_products.vendor_id
        IF v_vendor IS NULL THEN
            SELECT wp.vendor_id INTO v_vendor
            FROM website_variants wv
            JOIN website_products wp ON wp.id = wv.product_id
            WHERE wv.id = NEW.variant_id
            LIMIT 1;
        END IF;

        NEW.vendor_id := v_vendor;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_fill_order_item_vendor ON public.website_order_items;
CREATE TRIGGER trg_auto_fill_order_item_vendor
BEFORE INSERT ON public.website_order_items
FOR EACH ROW
EXECUTE FUNCTION auto_fill_order_item_vendor();

-- Backfill anything placed between the last fix and now
UPDATE public.website_order_items woi
SET vendor_id = p.vendor_id
FROM public.website_variants wv
LEFT JOIN public.products p ON p.id = wv.inventory_product_id
WHERE woi.variant_id = wv.id
  AND woi.vendor_id IS NULL
  AND p.vendor_id IS NOT NULL;

-- Verification (after placing a NEW test order):
-- SELECT o.id, o.order_number, i.vendor_id, i.product_id
-- FROM website_orders o JOIN website_order_items i ON i.order_id = o.id
-- ORDER BY o.id DESC LIMIT 5;