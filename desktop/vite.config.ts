import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    ...(process.env.VITE_ELECTRON === '0'
      ? []
      : [
        electron([
          {
            // Main-Process
            entry: 'electron/main.ts',
            vite: {
              build: {
                outDir: 'dist-electron',
                minify: false,
                rollupOptions: {
                  external: ['electron'],
                  output: {
                    format: 'es',
                    entryFileNames: '[name].js',
                    chunkFileNames: 'chunks/[name]-[hash].js',
                  },
                },
              },
            },
          },
          {
            // Preload-Scripts
            entry: 'electron/preload.ts',
            onstart(options) {
              options.reload()
            },
          },
        ]),
        renderer(),
      ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,
    cssMinify: true,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Framework chunk: cached across app updates
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase client: large, versioned separately
          'vendor-supabase': ['@supabase/supabase-js'],
          // Icons: large, rarely changes
          'vendor-icons': ['lucide-react'],
          // Charts: recharts is heavy — isolate so pages without charts don't pay
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Dev-only workaround for api.xkiro.com CORS (no ACAO header).
      // Production must use the `ai-store-doctor` Edge Function.
      '/xkiro-ai': {
        target: 'https://api.xkiro.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xkiro-ai/, ''),
      },
    },
  },
})
