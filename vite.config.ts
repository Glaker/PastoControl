import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Identificador de la versión (fecha y hora UTC del build). Se muestra en el perfil.
const appVersion = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '.');

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    VitePWA({
      // Service worker propio (src/sw.ts): en la fase de Web Push se le agrega el manejo de push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'PastoControl',
        short_name: 'PastoControl',
        description: 'Encontrá quién te corte el pasto, o conseguí trabajos de corte cerca tuyo.',
        lang: 'es-AR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#2b8a3e',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // La imagen para compartir links no la usa la app: no se precachea.
        globIgnores: ['og-image.png'],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
