import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode, command }) => {
  const envVars = loadEnv(mode, process.cwd(), '');
  const apiTarget = envVars.VITE_DEV_PROXY || 'http://localhost:5000';

  /**
   * Developer-only testing tools (a hidden account switcher). OFF everywhere by
   * default, so the app always looks and behaves like the real product. Turn
   * them on only for your own testing with `VITE_DEMO_TOOLS=true npm run dev`.
   *
   * `define` swaps __DEMO_TOOLS__ for a literal true/false at compile time, so
   * when it is false Rollup deletes that code and any seeded strings outright.
   * scripts/check-bundle.mjs verifies that after `npm run build`.
   */
  const demoTools = (process.env.VITE_DEMO_TOOLS ?? envVars.VITE_DEMO_TOOLS) === 'true';

  return {
    define: {
      __DEMO_TOOLS__: JSON.stringify(demoTools),
    },
    // Pre-bundle at server start. Otherwise Vite discovers these on first page
    // load and force-reloads the page once, which looks like a glitch.
    optimizeDeps: {
      include: ['@capacitor/core', 'socket.io-client', 'idb', 'qrcode', 'leaflet', 'react-leaflet'],
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        // Registration is done by hand in main.jsx so it can be skipped inside
        // the Android app, where a service worker only gets in the way.
        injectRegister: false,
        includeAssets: ['favicon.svg', 'icons/*.png'],
        manifest: {
          name: 'Madad — Local Micro-Bounties',
          short_name: 'Madad',
          description: 'Post a small local task with a cash bounty. A neighbour does it. You pay them directly on UPI.',
          theme_color: '#0B8A5B',
          background_color: '#0A573C',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          categories: ['social', 'lifestyle', 'utilities'],
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          /**
           * Our own push / notificationclick listeners, pulled into the
           * generated worker. generateSW writes the whole service worker, so
           * importScripts is the only seam for extra listeners — the
           * alternative (injectManifest) would mean maintaining the entire
           * precache layer by hand to add two event handlers.
           */
          importScripts: ['push-sw.js'],
          navigateFallback: '/index.html',
          // Never let the SW intercept API calls with a stale shell.
          navigateFallbackDenylist: [/^\/api/],
          runtimeCaching: [
            {
              // OpenStreetMap tiles — cache so the map still draws offline.
              urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osm-tiles',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // The feed: serve from network, fall back to the last good copy.
              urlPattern: /\/api\/(tasks|users\/leaderboard|config)/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'madad-api',
                networkTimeoutSeconds: 4,
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    server: {
      port: 5173,
      host: true, // listen on the LAN so a real phone can connect
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/socket.io': { target: apiTarget, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            map: ['leaflet', 'react-leaflet'],
          },
        },
      },
    },
  };
});
