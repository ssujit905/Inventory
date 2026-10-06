# Shopy Nepal — Website

Public storefront (React + Vite). Staff/admin tooling lives in `../desktop` and `../mobile` behind Supabase Auth + RLS — there is intentionally no `/admin` route here.

## Setup

```bash
npm install
cp .env.example .env   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run dev            # http://localhost:5174/
```

## Scripts

- `npm run dev` — local dev server (port 5174)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build
- `npm run lint` — eslint

## Env

| Var | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | yes | Supabase project URL (`src/lib/supabase.js`) |
| `VITE_SUPABASE_ANON_KEY` | yes | Supabase anon key (public reads + throttled RPCs only) |

## Deploy (Vercel)

- SPA fallback + security headers + asset caching are in `vercel.json`.
- `public/robots.txt` + `public/sitemap.xml` target `https://shopinepal.com`.

## Routes

`/`, `/shop`, `/product/:id`, `/store/:vendorId`, `/cart`, `/checkout`, `/contact`, `/my-orders`, `/payment-success`, `/payment-failure`, `/privacy`, `/terms`, `/returns`, `/shipping`.
