-- Simple Test: Create a test profile
-- Run this in Supabase SQL Editor

-- First, let's see what's in the table
SELECT * FROM public.profiles;

-- If the table is empty or you don't see your profile, create one manually
-- Replace 'YOUR_USER_ID' with your actual auth user ID
-- You can find it by running: SELECT auth.uid();

-- Get your user ID first
SELECT auth.uid() as my_user_id;

-- Then create/update your profile (replace the ID below with the one from above)
INSERT INTO public.profiles (id, full_name, role, created_at)
VALUES (
    auth.uid(),  -- This will use your current user ID
    'Admin User',
    'admin',
    NOW()
)
ON CONFLICT (id) 
DO UPDATE SET 
    full_name = 'Admin User',
    role = 'admin';

-- Verify it was created
SELECT * FROM public.profiles WHERE id = auth.uid();
