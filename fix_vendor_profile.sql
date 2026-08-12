-- =============================================================================
-- COMPLETE FIX FOR VENDOR DATABASE SCHEMA & RLS POLICIES
-- Run this script in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- =============================================================================

-- 1. Add permissions, store_name, and email columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT 'read_only' CHECK (permissions IN ('read_only', 'read_write'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Add vendor store settings and payout bank columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_branch TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS esewa_id TEXT;

-- 3. Add vendor_id foreign key column to products, website_products, and website_order_items
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.website_products ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.website_order_items ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4. Safely update role constraint to include 'vendor'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.profiles'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%role%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'staff', 'vendor'));

-- 5. Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 6. Fix RLS policies on PROFILES table
DROP POLICY IF EXISTS profiles_self_read ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_staff());

DROP POLICY IF EXISTS profiles_self_create_staff ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can insert profile" ON public.profiles;
CREATE POLICY profiles_self_create_staff ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((id = auth.uid() AND role IN ('staff', 'vendor')) OR public.is_admin_or_staff());

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_admin_or_staff())
  WITH CHECK ((id = auth.uid() AND role IN ('staff', 'vendor')) OR public.is_admin_or_staff());

-- 7. Fix RLS policies on PRODUCTS table
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_team_only ON public.products;
DROP POLICY IF EXISTS "Vendors can insert their own products" ON public.products;
DROP POLICY IF EXISTS "Vendors can update their own products" ON public.products;
DROP POLICY IF EXISTS "Vendors can delete their own products" ON public.products;
DROP POLICY IF EXISTS "Admins and Staff can insert all products" ON public.products;
DROP POLICY IF EXISTS "Admins and Staff can update all products" ON public.products;
DROP POLICY IF EXISTS "Admins and Staff can delete all products" ON public.products;

CREATE POLICY "Authenticated users select products" ON public.products FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Vendors and Admin/Staff insert products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (
    (vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor'))
    OR vendor_id IS NULL
    OR public.is_admin_or_staff()
  );

CREATE POLICY "Vendors and Admin/Staff update products" ON public.products FOR UPDATE TO authenticated
  USING (
    (vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor'))
    OR vendor_id IS NULL
    OR public.is_admin_or_staff()
  )
  WITH CHECK (
    (vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor'))
    OR vendor_id IS NULL
    OR public.is_admin_or_staff()
  );

-- 8. Fix RLS policies on PRODUCT_LOTS and TRANSACTIONS tables
ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_team_only ON public.product_lots;

CREATE POLICY "Authenticated users select lots" ON public.product_lots FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vendors and Admin/Staff insert lots" ON public.product_lots FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Vendors and Admin/Staff update lots" ON public.product_lots FOR UPDATE TO authenticated
  USING (true);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_team_only ON public.transactions;

CREATE POLICY "Authenticated users select transactions" ON public.transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vendors and Admin/Staff insert transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (true);

-- 9. Fix RLS policies on WEBSITE_PRODUCTS table
ALTER TABLE public.website_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inventory_team_only ON public.website_products;

CREATE POLICY "Vendors and Admin/Staff select website products" ON public.website_products FOR SELECT TO anon, authenticated
  USING (is_active = true OR vendor_id = auth.uid() OR public.is_admin_or_staff());

CREATE POLICY "Vendors and Admin/Staff insert website products" ON public.website_products FOR INSERT TO authenticated
  WITH CHECK (
    (vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor'))
    OR vendor_id IS NULL
    OR public.is_admin_or_staff()
  );

CREATE POLICY "Vendors and Admin/Staff update website products" ON public.website_products FOR UPDATE TO authenticated
  USING (
    (vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor'))
    OR vendor_id IS NULL
    OR public.is_admin_or_staff()
  );
