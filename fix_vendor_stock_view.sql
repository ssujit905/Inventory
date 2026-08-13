-- =============================================================================
-- FIX: inventory_stock_view missing vendor_id (SKU link separation)
-- =============================================================================
-- PROBLEM:
--   inventory_stock_view powers the "Link Inventory Master SKU" dropdown when
--   creating website products, but it did not expose products.vendor_id, so:
--     - Vendors could not filter to only their own products (the main app
--       filtered on a non-existent column -> empty/failed SKU link)
--     - Admin/Staff in the main app could not exclude vendor products, so the
--       main app SKU link showed vendor data
-- =============================================================================

DROP VIEW IF EXISTS inventory_stock_view CASCADE;

CREATE OR REPLACE VIEW inventory_stock_view AS
SELECT
    p.id,
    p.name,
    p.sku,
    p.description,
    p.image_url,
    p.vendor_id,
    COALESCE(SUM(pl.quantity_remaining), 0)::INT AS available_stock
FROM products p
LEFT JOIN product_lots pl ON pl.product_id = p.id
GROUP BY p.id, p.name, p.sku, p.description, p.image_url, p.vendor_id;

-- Step 2: Rebuild the website variant stock view (dropped via CASCADE above)
CREATE OR REPLACE VIEW website_variant_stock_view AS
WITH lot_summaries AS (
    SELECT id, available_stock FROM inventory_stock_view
),
bundle_stock_calc AS (
    -- Combo/Bundle: stock = how many full bundles can be assembled (weakest link)
    SELECT
        vb.bundle_variant_id,
        MIN(FLOOR(COALESCE(ls.available_stock, 0) / vb.quantity))::INT AS bundle_stock
    FROM website_variant_bundles vb
    LEFT JOIN lot_summaries ls ON ls.id = vb.child_inventory_id
    GROUP BY vb.bundle_variant_id
)
SELECT
    v.id              AS variant_id,
    v.product_id      AS parent_product_id,
    v.color,
    v.size,
    v.sku,
    v.price,
    v.inventory_product_id,
    v.is_bundle,
    CASE
        WHEN v.is_bundle THEN COALESCE(bs.bundle_stock, 0)
        ELSE COALESCE(ls.available_stock, 0)
    END AS current_stock
FROM website_variants v
LEFT JOIN bundle_stock_calc bs ON bs.bundle_variant_id = v.id
LEFT JOIN lot_summaries     ls ON ls.id = v.inventory_product_id;
