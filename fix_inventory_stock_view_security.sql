-- =============================================================================
-- FIX: Supabase Security Advisor - View defined with SECURITY DEFINER
-- =============================================================================
-- Entity: public.inventory_stock_view
-- Issue: View public.inventory_stock_view is defined with the SECURITY DEFINER property
--
-- Explanation:
--   By default in PostgreSQL, views run with the permissions of the view creator
--   (SECURITY DEFINER behavior). Setting (security_invoker = true) ensures that
--   the view enforces the Row-Level Security (RLS) policies and permissions
--   of the user executing the query (the invoker).
--
-- Application Impact:
--   inventory_stock_view is used by the desktop app for staff and admin inventory
--   stock tracking. Its underlying tables (products, product_lots) already have RLS
--   policies allowing admin and staff access. Setting security_invoker = true
--   ensures unauthorized public users cannot bypass RLS to read warehouse stock levels.
-- =============================================================================

ALTER VIEW public.inventory_stock_view SET (security_invoker = true);

-- Verification query: confirms security_invoker is now true
SELECT
  relname AS view_name,
  reloptions AS options
FROM pg_class
WHERE relname = 'inventory_stock_view';
