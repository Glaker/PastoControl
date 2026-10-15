import { useSyncExternalStore } from 'react';
import { readLocal, removeLocal, writeLocal } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { isIos, isStandalone } from './device';
import { VAPID_PUBLIC_KEY } from './vapid';

/**
 * Avisos push de este dispositivo.
 * - El permiso se pide SOLO cuando la persona toca "Activar avisos" (enablePush), nunca al abrir la app.
 * - Con el permiso ya dado, al abrir la app (y al volver al frente) la suscripción se crea o se renueva
 *   sola y se guarda en el servidor para la cuenta actual (startPushSync).
 * - "Desactivar avisos" y "Cerrar sesión" la sacan del servidor y del navegador.
 */

export type PushSupport =
  /** El navegador puede recibir push. */
  | 'supported'
  /** iPhone/iPad en Safari: el push solo funciona con la app instalada en la pantalla de inicio. */
  | 'ios-needs-install'
  | 'unsupported';

export type PushState = {
  support: PushSupport;
  permission: NotificationPermission;
  /** Este dispositivo tiene una suscripción activa. */
  subscribed: boolean;
  /** La persona los desactivó a propósito en este dispositivo: no se reactivan solos. */
  disabledByUser: boolean;
  /** Ya se leyó el estado real (antes no se muestra nada, para no parpadear). */
  ready: boolean;
  /** Con el permiso dado, falló la última vez que se intentó suscribir (se ofrece reintentar). */
  failed: boolean;
};

const DISABLED_KEY = 'pastocontrol:push-disabled';
const SW_READY_TIMEOUT_MS = 15_000;

function detectSupport(): PushSupport {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'supported';
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  return 'unsupported';
}

const currentPermission = (): NotificationPermission => ('Notification' in window ? Notification.permission : 'default');

let state: PushState = {
  support: detectSupport(),
  permission: currentPermission(),
  subscribed: false,
  disabledByUser: readLocal(DISABLED_KEY) === '1',
  ready: false,
  failed: false,
};
const listeners = new Set<() => void>();

function setState(patch: Partial<PushState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function usePushState(): PushState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

async function currentRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** El service worker activo (en la primera visita puede tardar unos segundos en instalarse). */
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) =>
    window.setTimeout(() => reject(new Error('sw-timeout')), SW_READY_TIMEOUT_MS),
  );
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await currentRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const serverKey = base64UrlToBytes(VAPID_PUBLIC_KEY);

/** La suscripción se hizo con la clave VAPID actual (si se cambió el par, hay que rehacerla). */
function usesCurrentKey(sub: PushSubscription): boolean {
  const key = sub.options.applicationServerKey;
  if (!key) return false;
  const bytes = new Uint8Array(key);
  return bytes.length === serverKey.length && bytes.every((b, i) => b === serverKey[i]);
}

/** Crea (o reusa) la suscripción de este dispositivo y la guarda para la cuenta actual. */
async function subscribeAndSave(): Promise<void> {
  try {
    await doSubscribeAndSave();
    setState({ subscribed: true, failed: false });
  } catch (e) {
    setState({ failed: true });
    throw e;
  }
}

async function doSubscribeAndSave(): Promise<void> {
  const reg = await readyRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !usesCurrentKey(sub)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: serverKey });
  const { endpoint, keys } = sub.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint ?? '',
    p_p256dh: keys?.p256dh ?? '',
    p_auth: keys?.auth ?? '',
  });
  if (error) throw error;
}

/** Relee el permiso y la suscripción (el permiso se puede cambiar desde la configuración del navegador). */
export async function refreshPush(): Promise<void> {
  const permission = currentPermission();
  let subscribed = false;
  if (state.support === 'supported') {
    try {
      subscribed = !!(await currentSubscription());
    } catch {
      subscribed = false;
    }
  }
  setState({ permission, subscribed, ready: true });
}

let syncedUserId: string | null = null;
let listening = false;

async function sync(): Promise<void> {
  await refreshPush();
  if (!syncedUserId || state.support !== 'supported' || state.permission !== 'granted' || state.disabledByUser) return;
  try {
    await subscribeAndSave();
  } catch {
    // Sin conexión o sin service worker todavía: se reintenta al volver al frente (y el cartel ofrece
    // reintentar).
  }
}

/**
 * Con la sesión iniciada: si el permiso ya está dado, mantiene la suscripción de este dispositivo al día
 * (al abrir la app y cada vez que vuelve al frente, por si se habilitó el permiso desde la configuración).
 */
export function startPushSync(userId: string): void {
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void sync();
    });
  }
  if (syncedUserId === userId) return;
  syncedUserId = userId;
  void sync();
}

/** Pide el permiso (solo desde un toque de la persona) y activa los avisos en este dispositivo. */
export async function enablePush(): Promise<NotificationPermission> {
  // requestPermission tiene que ser lo primero: Safari exige que salga directo del toque.
  const permission = await Notification.requestPermission();
  setState({ permission });
  if (permission !== 'granted') return permission;
  removeLocal(DISABLED_KEY);
  setState({ disabledByUser: false });
  await subscribeAndSave();
  return permission;
}

/** Saca este dispositivo del servidor y anula la suscripción en el navegador. */
async function unsubscribeHere(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  } finally {
    // Aunque falle el servidor: sin suscripción en el navegador, el próximo envío da 410 y se borra.
    await sub.unsubscribe().catch(() => undefined);
    setState({ subscribed: false });
  }
}

/** "Desactivar avisos": no se vuelven a activar solos en este dispositivo. */
export async function disablePush(): Promise<void> {
  writeLocal(DISABLED_KEY, '1');
  setState({ disabledByUser: true });
  await unsubscribeHere();
}

/** Al cerrar sesión: que los avisos de esta cuenta no sigan llegando a este dispositivo. */
export async function forgetPushOnThisDevice(): Promise<void> {
  syncedUserId = null;
  try {
    await unsubscribeHere();
  } catch {
    // Sin conexión: se sigue con el cierre de sesión igual.
  }
}
