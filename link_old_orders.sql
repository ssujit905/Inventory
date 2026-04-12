-- ────────── 🔗 LINKING OLD ORDERS 🔗 ──────────
-- This script matches existing Website Orders to Sales so the sync starts working for them.

UPDATE website_orders w
SET sale_id = s.id
FROM sales s
WHERE w.sale_id IS NULL 
  AND w.customer_name = s.customer_name
  AND w.phone = s.phone1
  AND s.order_date >= (w.created_at::date - interval '1 day')
  AND s.order_date <= (w.created_at::date + interval '1 day');

-- Check how many were successfully linked
SELECT count(*) as linked_orders_count FROM website_orders WHERE sale_id IS NOT NULL;
