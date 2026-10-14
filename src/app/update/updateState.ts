import { useEffect, useSyncExternalStore } from 'react';

/**
 * Estado de las actualizaciones de la app (ver registerPwa.ts).
 * Una versión nueva se aplica sola solo en momentos seguros: al cambiar de pantalla o al volver
 * a abrir la app, y nunca si hay un formulario con cambios sin guardar.
 */
type UpdateState = { updateReady: boolean; dismissed: boolean; unsaved: boolean };

let state: UpdateState = { updateReady: false, dismissed: false, unsaved: false };
let applyFn: (() => Promise<void>) | null = null;
let applying = false;
const listeners = new Set<() => void>();
const dirtyForms = new Set<symbol>();

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribe, () => state);
}

export function markUpdateReady(apply: () => Promise<void>) {
  applyFn = apply;
  setState({ updateReady: true, dismissed: false });
}

export function dismissUpdateBanner() {
  setState({ dismissed: true });
}

export function hasUnsavedChanges() {
  return dirtyForms.size > 0;
}

/** Aplica la versión nueva ya: activa el service worker nuevo y recarga. */
export function applyUpdate() {
  if (applying) return;
  applying = true;
  void (applyFn ? applyFn() : Promise.resolve());
  // Respaldo: si el service worker no avisa que tomó el control, recargamos igual.
  window.setTimeout(() => window.location.reload(), 4000);
}

/** Aplica la versión nueva solo si hay una lista y no hay nada sin guardar. */
export function applyUpdateIfSafe(): boolean {
  if (!state.updateReady || hasUnsavedChanges()) return false;
  applyUpdate();
  return true;
}

/** Los formularios avisan mientras tienen cambios sin guardar: eso frena la actualización automática. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const key = Symbol('form');
    dirtyForms.add(key);
    setState({ unsaved: true });
    return () => {
      dirtyForms.delete(key);
      setState({ unsaved: dirtyForms.size > 0 });
    };
  }, [dirty]);
}
