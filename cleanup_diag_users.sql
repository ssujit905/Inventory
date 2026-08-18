-- Cleanup: remove diagnostic/test users created during expense & ads
-- troubleshooting (diag_expenses.cjs / diag_ads.cjs).
--
-- Run step 1 first and eyeball the result. If all rows are diag/test
-- accounts (no store_name, role staff/vendor, suspicious email), run step 2.
-- If your real users are listed, STOP and adjust the email filter / IDs.

-- 1. Identify diag users
SELECT id, email, role, vendor_id, store_name, created_at
FROM public.profiles
WHERE email ILIKE '%diag%' OR email ILIKE '%test%'
   OR id IN (
        '35ef4b0d-360d-4df6-9a25-587b7cf25903',  -- diag owner
        '796ee930-42ab-4e02-a1be-a4863ee8867a',  -- diag (earlier)
        'd1f2e936-2c36-4743-98ab-6ff3283b8505'   -- diag (first)
   )
ORDER BY created_at DESC;

-- 2. Delete them (profiles first, then auth; cascades to identities/sessions)
-- DELETE FROM public.profiles
-- WHERE email ILIKE '%diag%' OR email ILIKE '%test%'
--    OR id IN (
--         '35ef4b0d-360d-4df6-9a25-587b7cf25903',
--         '796ee930-42ab-4e02-a1be-a4863ee8867a',
--         'd1f2e936-2c36-4743-98ab-6ff3283b8505'
--    );

-- DELETE FROM auth.users
-- WHERE email ILIKE '%diag%' OR email ILIKE '%test%'
--    OR id IN (
--         '35ef4b0d-360d-4df6-9a25-587b7cf25903',
--         '796ee930-42ab-4e02-a1be-a4863ee8867a',
--         'd1f2e936-2c36-4743-98ab-6ff3283b8505'
--    );