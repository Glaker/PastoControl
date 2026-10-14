// Preferencias por dispositivo (ej.: último modo usado). Nada que tenga que persistir
// de verdad vive acá: el navegador puede borrarlo o bloquearlo.
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado, bloqueado): se ignora.
  }
}
