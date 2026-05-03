-- ============================================================
-- FIX: inventory_stock_view double-subtraction bug
-- ============================================================
-- ROOT CAUSE:
--   quantity_remaining in product_lots is ALREADY reduced when
--   any sale is made (both website RPC and desktop SalesPage).
--   The old pending_sales CTE then subtracts 'processing'
--   transactions AGAIN → double-deduction → stock shows 0 when
--   there is actually 1 left.
--
-- CORRECT LOGIC:
--   quantity_remaining is the single source of truth.
--   available_stock = SUM(quantity_remaining) — no extra subtraction.
-- ============================================================

-- Step 1: Fix the base inventory view (removes double-subtraction)
DROP VIEW IF EXISTS inventory_stock_view CASCADE;
CREATE OR REPLACE VIEW inventory_stock_view AS
SELECT
    p.id,
    p.name,
    p.sku,
    p.description,
    p.image_url,
    COALESCE(SUM(pl.quantity_remaining), 0)::INT AS available_stock
FROM products p
LEFT JOIN product_lots pl ON pl.product_id = p.id
GROUP BY p.id, p.name, p.sku, p.description, p.image_url;

-- Step 2: Rebuild the website variant stock view (depends on inventory_stock_view)
-- Dropped above via CASCADE, recreate now.
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

-- Step 3: Verify — run this SELECT to confirm stock looks correct
-- SELECT variant_id, color, size, sku, current_stock
-- FROM website_variant_stock_view
-- ORDER BY parent_product_id, color, size;
