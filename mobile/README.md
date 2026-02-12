# Inventory Mobile (Android via Capacitor)

This is a separate mobile app workspace that reuses the same UI logic and Supabase backend as the desktop app.

## 1) Setup

```bash
cd mobile
cp .env.example .env
# fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
```

## 2) Create Android project (first time)

```bash
npx cap add android
```

## 3) Build and sync web app to Android

```bash
npm run mobile:sync
```

## 4) Open Android Studio

```bash
npm run android:open
```

From Android Studio:
- Build debug APK: `Build > Build APK(s)`
- Signed release: `Build > Generate Signed Bundle / APK`

## Optional CLI debug APK

```bash
npm run apk:debug
```

APK path:
`android/app/build/outputs/apk/debug/app-debug.apk`
