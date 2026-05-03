-- ============================================================
-- THE ULTIMATE STOCK SYNCHRONIZATION FIX
-- Matches Website Stock exactly with Desktop App Logic
-- ============================================================

-- Step 1: Create the base inventory view using App's exact logic
-- (Total IN) - (Total Active Sales)
DROP VIEW IF EXISTS inventory_stock_view CASCADE;
CREATE OR REPLACE VIEW inventory_stock_view AS
WITH app_logic_stock AS (
    SELECT 
        t.product_id,
        COALESCE(SUM(CASE WHEN t.type = 'in' THEN t.quantity_changed ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE 
            WHEN t.type = 'sale' AND s.parcel_status IN ('processing', 'sent', 'delivered') 
            THEN ABS(t.quantity_changed) 
            ELSE 0 
        END), 0) as total_sold
    FROM transactions t
    LEFT JOIN sales s ON s.id = t.sale_id
    GROUP BY t.product_id
)
SELECT
    p.id,
    p.name,
    p.sku,
    p.description,
    p.image_url,
    COALESCE(als.total_in - als.total_sold, 0)::INT AS available_stock
FROM products p
LEFT JOIN app_logic_stock als ON als.product_id = p.id;

-- Step 2: Recreate the website variant stock view (which cascades from above)
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
