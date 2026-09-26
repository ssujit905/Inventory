import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        proxy: {
            // Dev-only workaround for api.xkiro.com CORS (no ACAO header).
            // Production must use the `ai-store-doctor` Edge Function.
            '/xkiro-ai': {
                target: 'https://api.xkiro.com',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/xkiro-ai/, ''); },
            },
        },
    },
});
