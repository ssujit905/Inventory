-- =============================================================================
-- FIX: Website activity (orders, returns, messages) routed to the correct
--      vendor only — never mixed between vendors.
-- =============================================================================
-- PROBLEMS FIXED:
--   1. website_order_returns had no vendor_id, so a return/exchange from
--      "My Orders" could never be shown to the vendor who sold the item.
--   2. Order-based returns are auto-routed to the vendor via a trigger.
--      Multi-vendor orders stay with the admin (vendor_id NULL) so nothing
--      is ever mixed between vendors. Generic Contact messages (no order)
--      also stay with the admin only.
--   3. harden_rls_policies.sql dropped the public INSERT policy on
--      website_order_returns, so customers could not submit returns or
--      contact messages anymore — restored here.
--   4. harden_rls_policies.sql also dropped the vendor policies on
--      website_orders ("Vendors read/update orders with their items"),
--      so vendors could not see their own orders — restored here.
--   5. website_order_returns was missing from the realtime publication, so
--      the vendor portal never got live updates for new returns.
-- =============================================================================

-- 1. Add vendor_id to website_order_returns (NULL = admin-only)
ALTER TABLE public.website_order_returns ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Backfill EXISTING returns from their order items
--    (only when every item of the order belongs to a single vendor)
UPDATE public.website_order_returns wor
SET vendor_id = sub.vendor_id
FROM (
    SELECT woi.order_id, (array_agg(DISTINCT woi.vendor_id))[1] AS vendor_id
    FROM public.website_order_items woi
    WHERE woi.vendor_id IS NOT NULL
    GROUP BY woi.order_id
    HAVING COUNT(DISTINCT woi.vendor_id) = 1 AND COUNT(woi.vendor_id) = COUNT(*)
) sub
WHERE wor.order_id = sub.order_id
  AND wor.vendor_id IS NULL;

-- 3. AUTO-ROUTING TRIGGER
--    When a customer submits a return/exchange, resolve the vendor from the
--    order items server-side. The public website never decides the vendor.
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
        SELECT COUNT(DISTINCT woi.vendor_id), (array_agg(DISTINCT woi.vendor_id))[1]
        INTO v_vendor_count, v_vendor_id
        FROM public.website_order_items woi
        WHERE woi.order_id = NEW.order_id
          AND woi.vendor_id IS NOT NULL;

        -- Single-vendor order -> route to that vendor.
        -- Multi-vendor (or unknown) order -> stay NULL = admin handles it,
        -- so nothing is ever mixed between vendors.
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

-- 4. RLS POLICIES -- website_order_returns -----------------------------------
--    Restore public submissions (returns, exchanges, contact messages)
DROP POLICY IF EXISTS "Public can send messages" ON public.website_order_returns;
CREATE POLICY "Public can send messages" ON public.website_order_returns FOR INSERT TO anon, authenticated
  WITH CHECK (true);

--    Vendors can read only their OWN returns/messages (admin/staff keep the
--    existing "inventory_team_only" full-access policy)
DROP POLICY IF EXISTS "Vendors read own returns" ON public.website_order_returns;
CREATE POLICY "Vendors read own returns" ON public.website_order_returns FOR SELECT TO authenticated
  USING (vendor_id = auth.uid());

--    Vendors can update only their own returns/messages (approve/reject)
DROP POLICY IF EXISTS "Vendors update own returns" ON public.website_order_returns;
CREATE POLICY "Vendors update own returns" ON public.website_order_returns FOR UPDATE TO authenticated
  USING (vendor_id = auth.uid())
  WITH CHECK (vendor_id = auth.uid());

-- 5. RLS POLICIES -- website_orders ------------------------------------------
--    Restore the vendor access that harden_rls_policies.sql removed.
DROP POLICY IF EXISTS "Vendors read orders with their items" ON public.website_orders;
CREATE POLICY "Vendors read orders with their items" ON public.website_orders FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_order_items woi
      WHERE woi.order_id = website_orders.id AND woi.vendor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Vendors update orders with their items" ON public.website_orders;
CREATE POLICY "Vendors update orders with their items" ON public.website_orders FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_order_items woi
      WHERE woi.order_id = website_orders.id AND woi.vendor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.website_order_items woi
      WHERE woi.order_id = website_orders.id AND woi.vendor_id = auth.uid()
    )
  );

-- 6. REALTIME -- live updates for the vendor returns page
--    (no IF NOT EXISTS for publications, so guard it manually)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'website_order_returns'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE website_order_returns;
    END IF;
END $$;

-- Verification:
-- SELECT id, order_id, order_number, type, vendor_id FROM website_order_returns ORDER BY id DESC LIMIT 10;
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename IN ('website_order_returns','website_orders') ORDER BY tablename, policyname;