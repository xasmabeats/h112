import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
const base = process.env.VITE_BASE_PATH || '/';
export default defineConfig(({ mode }) => ({
  base: mode === 'desktop' ? '/' : base,
  resolve: {
    alias:
      mode === 'desktop'
        ? {
            'virtual:pwa-register/react': fileURLToPath(
              new URL('./src/platform/desktop-pwa.ts', import.meta.url),
            ),
          }
        : {},
  },
  build: {
    outDir: mode === 'desktop' ? 'desktop-dist' : 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('dexie')) return 'storage';
            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
          }
        },
      },
    },
  },
  define: { __XASMA_DESKTOP_BUILD__: JSON.stringify(mode === 'desktop') },
  plugins: [
    react(),
    tailwind(),
    ...(mode === 'desktop'
      ? []
      : [
          VitePWA({
            registerType: 'prompt',
            includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
            manifest: {
              name: 'XASMA Beat Release Manager',
              short_name: 'XASMA',
              description: 'Your local music production command center',
              display: 'standalone',
              start_url: base,
              scope: base,
              background_color: '#0c0d11',
              theme_color: '#0c0d11',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                {
                  src: 'icon-512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'any maskable',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
              navigateFallback: 'index.html',
              cleanupOutdatedCaches: true,
            },
          }),
        ]),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
}));
