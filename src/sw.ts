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

// ——— Web Push (Fase 6) ———
// La Edge Function send-push manda { title, body, url, tag } (solo campos públicos del aviso).

type PushMessage = { title?: string; body?: string; url?: string; tag?: string };

/** Solo rutas de la app ("/pedir/pedido/…"): nunca una URL externa que venga en el mensaje. */
function appPath(url: unknown): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/avisos';
}

self.addEventListener('push', (event) => {
  let data: PushMessage = {};
  try {
    data = (event.data?.json() as PushMessage | undefined) ?? {};
  } catch {
    // Mensaje sin JSON: se muestra el texto genérico.
  }
  // Siempre se muestra una notificación: Safari y Chrome dan de baja los push que no muestran nada.
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'PastoControl', {
      body: data.body ?? 'Tenés un aviso nuevo.',
      icon: '/pwa-192x192.png',
      tag: data.tag,
      lang: 'es-AR',
      data: { url: appPath(data.url) },
    }),
  );
});

// Tocar la notificación: si la app está abierta, la trae al frente y navega ahí; si no, la abre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = appPath((event.notification.data as { url?: unknown } | null)?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'NAVIGATE', path });
        return;
      }
      await self.clients.openWindow(path);
    })(),
  );
});
