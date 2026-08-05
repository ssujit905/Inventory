-- Run this in your Supabase SQL Editor to allow creating Vendors

-- 1. Safely drop the existing check constraint on the role column.
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

-- 2. Add the new constraint that includes 'vendor'
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'staff', 'vendor'));

-- 3. Add store_name column so the Staff Management form can save it
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS store_name TEXT;
