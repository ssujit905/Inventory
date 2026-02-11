-- Diagnostic Script for Profiles Table
-- Run this in Supabase SQL Editor to diagnose the issue

-- 1. Check if the profiles table exists and its structure
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 2. Check if there are any profiles in the table
SELECT COUNT(*) as total_profiles FROM public.profiles;

-- 3. Try to select all profiles (this is what the app is trying to do)
SELECT * FROM public.profiles ORDER BY created_at DESC;

-- 4. Check RLS status
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE tablename = 'profiles';

-- 5. Check if your current user can access profiles
SELECT 
    auth.uid() as current_user_id,
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) as profile_exists;

-- 6. Test the SELECT policy directly
SELECT * FROM public.profiles WHERE true LIMIT 5;
