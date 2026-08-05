-- RLS hardening for the inventory admin apps and public storefront.
-- Prerequisite: secure_customer_sessions.sql has been run.
-- Run this in the Supabase SQL editor as the project owner.
--
-- Result:
--   * only profiles with role admin or staff can use inventory/admin tables;
--   * customers, orders, order items and payment settings are never directly
--     readable or writable by the public API;
--   * the storefront can still read active catalogue data and delivery areas;
--   * checkout and customer actions continue through SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'staff')
  );
$$;

-- Ensure the function cannot be replaced or directly queried by browser roles.
REVOKE ALL ON FUNCTION public.is_admin_or_staff() FROM PUBLIC, anon, authenticated;
-- The function returns only a boolean and is used inside anonymous storefront
-- SELECT policies, so both API roles need permission to evaluate it.
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated;

DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
  protected_tables TEXT[] := ARRAY[
    'products', 'product_lots', 'transactions', 'sales', 'sale_items', 'expenses',
    'website_customers', 'customer_sessions', 'website_orders', 'website_order_items',
    'website_order_returns', 'website_settings', 'website_products',
    'website_product_images', 'website_product_variations', 'website_variants',
    'website_variant_bundles', 'website_product_ratings', 'website_delivery_branches'
  ];
BEGIN
  FOREACH table_name IN ARRAY protected_tables LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

      -- Earlier scripts created overlapping broad policies. Remove them before
      -- creating one predictable admin/staff policy per table.
      FOR policy_name IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = table_name
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, table_name);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY inventory_team_only ON public.%I FOR ALL TO authenticated
         USING (public.is_admin_or_staff())
         WITH CHECK (public.is_admin_or_staff())',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

-- Profiles are the exception: a signed-in user can read/update their own
-- profile, while only an existing admin can manage other profiles or roles.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE policy_name TEXT;
BEGIN
  FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', policy_name);
  END LOOP;
END;
$$;
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_staff());
CREATE POLICY profiles_self_create_staff ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((id = auth.uid() AND role = 'staff') OR public.is_admin_or_staff());
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_staff())
  WITH CHECK ((id = auth.uid() AND role = 'staff') OR public.is_admin_or_staff());
CREATE POLICY profiles_admin_delete ON public.profiles FOR DELETE TO authenticated
  USING (public.is_admin_or_staff());

-- Storefront read access. No public write policy is intentionally created.
DO $$
BEGIN
  IF to_regclass('public.website_products') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY storefront_read_active_products ON public.website_products FOR SELECT TO anon, authenticated USING (is_active = true OR public.is_admin_or_staff())';
  END IF;
  IF to_regclass('public.website_product_images') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY storefront_read_product_images ON public.website_product_images FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF to_regclass('public.website_product_variations') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY storefront_read_product_variations ON public.website_product_variations FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF to_regclass('public.website_variants') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY storefront_read_variants ON public.website_variants FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF to_regclass('public.website_variant_bundles') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY storefront_read_variant_bundles ON public.website_variant_bundles FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF to_regclass('public.website_product_ratings') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY storefront_read_product_ratings ON public.website_product_ratings FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF to_regclass('public.website_delivery_branches') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY storefront_read_delivery_branches ON public.website_delivery_branches FOR SELECT TO anon, authenticated USING (true)';
  END IF;
  IF to_regclass('public.website_settings') IS NOT NULL THEN
    EXECUTE $policy$
      CREATE POLICY storefront_read_safe_settings ON public.website_settings FOR SELECT TO anon, authenticated
      USING (
        key !~* '(secret|password|token|private|service[_-]?role|api[_-]?key)'
        OR public.is_admin_or_staff()
      )
    $policy$;
  END IF;
END;
$$;

-- Old PIN-based RPCs let callers submit a phone number and PIN directly. The
-- website now uses the session-token RPCs created by secure_customer_sessions.sql.
DO $$
DECLARE function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'get_customer_profile(text,text)',
    'get_customer_orders(text,text)',
    'change_customer_pin(text,text,text)',
    'update_customer_profile(text,text,text,text,text)',
    'get_customer_returns(text,text)',
    'submit_product_rating(text,text,bigint,bigint,integer,text)'
  ] LOOP
    IF to_regprocedure('public.' || function_signature) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', function_signature);
    END IF;
  END LOOP;
END;
$$;

-- Verification checks to run after this migration:
-- SELECT tablename, policyname, roles, cmd FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
-- SELECT has_table_privilege('anon', 'public.website_customers', 'select'); -- should not grant a bypass (RLS still applies)
