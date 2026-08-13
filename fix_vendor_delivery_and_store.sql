-- =============================================================================
-- COMPLETE VENDOR MIGRATION - Run in Supabase SQL Editor
-- Includes: vendor_id on delivery branches, all profile columns, RLS policies
-- =============================================================================

-- 1. Add vendor_id to website_delivery_branches
ALTER TABLE public.website_delivery_branches ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Add all vendor store profile columns (safe to run even if already exist)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_name TEXT;
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

-- 3. RLS policies for website_delivery_branches
ALTER TABLE public.website_delivery_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read delivery branches" ON public.website_delivery_branches;
DROP POLICY IF EXISTS "Authenticated full access branches" ON public.website_delivery_branches;
DROP POLICY IF EXISTS "Vendor and admin access branches" ON public.website_delivery_branches;
DROP POLICY IF EXISTS "Admin full access delivery branches" ON public.website_delivery_branches;
DROP POLICY IF EXISTS "Vendor managed delivery branches" ON public.website_delivery_branches;

-- Anyone can read delivery branches (public storefront needs this)
CREATE POLICY "Public read delivery branches" ON public.website_delivery_branches
  FOR SELECT TO anon, authenticated
  USING (true);

-- Admins can manage all branches
CREATE POLICY "Admin full access delivery branches" ON public.website_delivery_branches
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'staff')
    )
  );

-- Vendors can only manage their own branches (vendor_id = their user id)
CREATE POLICY "Vendor managed delivery branches" ON public.website_delivery_branches
  FOR ALL TO authenticated
  USING (vendor_id = auth.uid())
  WITH CHECK (vendor_id = auth.uid());
