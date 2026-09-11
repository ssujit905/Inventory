import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  build: {
    // PERF: keep the initial JS small under traffic spikes.
    minify: 'esbuild',
    cssMinify: true,
    cssCodeSplit: true,
    assetsInlineLimit: 4096, // don't base64-inline images into the JS bundle
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          // Framework chunk: cached across deploys, shared by all routes
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase client: used everywhere, versioned separately
          'vendor-supabase': ['@supabase/supabase-js'],
          // Icons: large, rarely changes
          'vendor-icons': ['lucide-react'],
          // heic2any is only used by the MyOrders return-image flow —
          // isolate it so homepage visitors never download it
          'vendor-heic': ['heic2any'],
        },
      },
    },
  },
})
