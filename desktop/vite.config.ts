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
})
