// Datos del dispositivo para elegir qué explicar (instalar, activar avisos, desbloquearlos).

/** iPhone o iPad (el iPad con iPadOS se presenta como Mac con pantalla táctil). */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

/** La app se abrió instalada (desde el ícono), no en una pestaña del navegador. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
