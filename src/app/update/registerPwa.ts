import { registerSW } from 'virtual:pwa-register';
import { applyUpdateIfSafe, hasUnsavedChanges, markUpdateReady } from './updateState';

const CHECK_EVERY_MS = 30 * 60 * 1000;
const RESUME_WINDOW_MS = 10_000;

/**
 * Cómo llega una versión nueva al usuario:
 * 1. Detección: el navegador busca un service worker nuevo al cargar la app, cada 30 minutos
 *    y cada vez que la app vuelve al frente (una PWA puede pasar días abierta en segundo plano).
 * 2. El service worker nuevo se instala y queda esperando: no reemplaza al viejo por su cuenta.
 * 3. Se aplica (recarga con la versión nueva) en un momento seguro y sin cambios sin guardar:
 *    - al volver a abrir la app, si ya estaba lista o aparece en los primeros segundos sin que
 *      la persona haya tocado nada;
 *    - al pasar a otra pantalla;
 *    - o cuando la persona toca "Actualizar" en el aviso.
 */
export function setupPwaUpdates() {
  let resumedAt = 0;
  let touchedSinceResume = false;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      markUpdateReady(() => updateSW(true));
      const justResumed = Date.now() - resumedAt < RESUME_WINDOW_MS && !touchedSinceResume;
      if (justResumed && !hasUnsavedChanges()) applyUpdateIfSafe();
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      const check = () => {
        if (!navigator.onLine || registration.installing) return;
        registration.update().catch(() => {
          // Sin conexión o servidor caído: se reintenta en el próximo chequeo.
        });
      };

      window.setInterval(check, CHECK_EVERY_MS);

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        resumedAt = Date.now();
        touchedSinceResume = false;
        if (!applyUpdateIfSafe()) check();
      });
    },
  });

  const markTouched = () => {
    touchedSinceResume = true;
  };
  window.addEventListener('pointerdown', markTouched, { passive: true });
  window.addEventListener('keydown', markTouched);
}

const CHUNK_RELOAD_KEY = 'pastocontrol:chunk-reload-at';

/**
 * Si después de un deploy falla la carga de una pantalla (el archivo viejo ya no existe),
 * recargamos una vez para traer la versión nueva. Si vuelve a fallar enseguida, dejamos que
 * el error llegue a la pantalla de error, que ofrece "Actualizar".
 */
export function setupChunkErrorRecovery() {
  window.addEventListener('vite:preloadError', (event) => {
    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    } catch {
      // sin sessionStorage
    }
    if (Date.now() - last < 30_000) return;
    try {
      window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    } catch {
      // sin sessionStorage
    }
    event.preventDefault();
    window.location.reload();
  });
}

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically|error loading dynamically/i.test(
    message,
  );
}
