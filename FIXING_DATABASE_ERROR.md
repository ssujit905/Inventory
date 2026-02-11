# Fixing the "Failed to load personnel list" Error

## Problem
The Supabase `profiles` table is returning a **500 Internal Server Error** due to incorrect or conflicting Row Level Security (RLS) policies.

## Solution

### Step 1: Fix the Database Policies

1. **Open your Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Run the Fix Script**
   - Copy the entire contents of `fix_rls_policies.sql`
   - Paste it into the SQL Editor
   - Click "Run" or press `Ctrl+Enter` (Cmd+Enter on Mac)

4. **Verify Success**
   - You should see a success message
   - The last query will show you all the policies that were created

### Step 2: Test the Application

1. **Refresh your browser** (Ctrl+R or Cmd+R)
2. **Navigate to Staff Management**
3. You should now see the personnel list load successfully

## What the Fix Does

The new RLS policies allow:
- ✅ All authenticated users to **view** all profiles (needed for the staff list)
- ✅ Users to **insert** their own profile
- ✅ Users to **update** their own profile
- ✅ Admins to **manage all profiles** (create, read, update, delete)

## Alternative: Temporary Workaround

If you can't access Supabase right now, the app will still work with limited functionality:
- It will show at least your current profile
- You can still create new staff members
- The list will update after you create someone

## Need Help?

If the error persists after running the SQL script:
1. Check the Supabase logs in the Dashboard
2. Verify your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`
3. Make sure your Supabase project is active and not paused
