import { useSyncExternalStore } from 'react';
import { isStandalone } from './device';

/**
 * Instalación de la PWA. Chrome/Android (y Edge) avisan con `beforeinstallprompt` que la app se puede
 * instalar: se guarda el evento para mostrar nuestro botón "Instalar PastoControl" en vez de la barrita
 * del navegador. Safari (iPhone) no tiene este evento: ahí se explican los pasos a mano.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallState = {
  /** Se puede mostrar el diálogo de instalación del navegador. */
  canPrompt: boolean;
  /** Ya está instalada (o se está usando la app instalada). */
  installed: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: InstallState = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();

function emit(patch: Partial<InstallState>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

/** Se llama al arrancar (antes de React): el evento puede llegar enseguida. */
export function setupInstallPrompt(): void {
  snapshot = { canPrompt: false, installed: isStandalone() };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit({ canPrompt: false, installed: true });
  });
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

/** Abre el diálogo de instalación del navegador. Devuelve si la persona aceptó. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  emit({ canPrompt: false, installed: outcome === 'accepted' || snapshot.installed });
  return outcome === 'accepted';
}
