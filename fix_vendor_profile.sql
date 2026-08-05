-- =============================================================================
-- COMPLETE FIX FOR VENDOR PROFILES TABLE SCHEMA & RLS POLICIES
-- Run this script in your Supabase SQL Editor (SQL Editor -> New Query -> Run)
-- =============================================================================

-- 1. Add permissions, store_name, and email columns
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT 'read_only' CHECK (permissions IN ('read_only', 'read_write'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Add vendor store settings and payout bank columns
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

-- 3. Safely update role constraint to include 'vendor'
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

-- 4. Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 5. Fix RLS policies to allow Vendor accounts to update their own profile
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
