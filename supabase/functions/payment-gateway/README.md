# Payment gateway Edge Function

Deploy this public checkout function with JWT verification disabled:

```bash
supabase functions deploy payment-gateway --no-verify-jwt
supabase secrets set ESEWA_TEST_SECRET_KEY=... ESEWA_LIVE_SECRET_KEY=...
supabase secrets set FONEPAY_TEST_SECRET_KEY=... FONEPAY_LIVE_SECRET_KEY=...
```

Continue choosing the payment environment and merchant ID in the desktop/mobile Website Settings page. The function reads those non-secret settings with the built-in `SUPABASE_SERVICE_ROLE_KEY`, so storefront RLS can deny public reads of protected settings. It then selects the matching `*_TEST_SECRET_KEY` or `*_LIVE_SECRET_KEY`. Never store a secret in `website_settings` or any `VITE_*` variable.

After deploying this function, run `harden_rls_policies.sql` in the Supabase SQL editor. That migration blocks public reads of settings whose key contains terms such as `secret`, `token`, or `password`.
