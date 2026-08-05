-- Run this in your Supabase SQL Editor to fix the missing columns

-- 1. Add permissions column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions TEXT DEFAULT 'read_only' CHECK (permissions IN ('read_only', 'read_write'));

-- 2. Add store_name column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_name TEXT;

-- 3. Add email column so it shows in Staff Management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 4. Safely drop the existing check constraint on the role column.
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

-- 5. Add the new constraint that includes 'vendor'
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'staff', 'vendor'));
