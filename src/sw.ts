/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Solo se cachean los archivos estáticos de la app. Las llamadas a Supabase
// (datos, auth, storage) nunca pasan por la caché del service worker.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// SPA: cualquier navegación responde con index.html.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Una versión nueva queda esperando hasta que la app le pide tomar el control
// (en un momento seguro, ver src/app/update/registerPwa.ts).
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

clientsClaim();
