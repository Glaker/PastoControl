// Ubicaciones, distancias y GPS. Sin Leaflet: esto va en el bundle principal (el mapa se carga aparte).

export type LatLng = { lat: number; lng: number };

/** Centro de la localidad por defecto: donde arranca el mapa sin GPS (la localidad ya no limita nada). */
export type MapCenter = { center_lat: number; center_lng: number };

const EARTH_RADIUS_M = 6371008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Distancia en metros en línea recta (haversine). La misma fórmula que private.distance_m. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

const kmFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/** "a 800 m", "a 2,3 km", "a 15 km". */
export function formatDistance(meters: number): string {
  if (meters < 100) return 'a menos de 100 m';
  if (meters < 1000) return `a ${Math.round(meters / 100) * 100} m`;
  const km = meters / 1000;
  return `a ${kmFormatter.format(km < 10 ? Math.round(km * 10) / 10 : Math.round(km))} km`;
}

export function localityCenter(area: MapCenter): LatLng {
  return { lat: area.center_lat, lng: area.center_lng };
}

// Argentina continental y Tierra del Fuego, como caja aproximada. La misma que private.check_in_argentina.
const ARGENTINA = { minLat: -55.1, maxLat: -21.7, minLng: -73.6, maxLng: -53.6 };

/** El pin vale en cualquier lugar de Argentina (aproximado: es una caja). */
export function isInArgentina(point: LatLng): boolean {
  return (
    point.lat >= ARGENTINA.minLat && point.lat <= ARGENTINA.maxLat && point.lng >= ARGENTINA.minLng && point.lng <= ARGENTINA.maxLng
  );
}

export const OUTSIDE_ARGENTINA = 'La ubicación marcada está fuera de Argentina. Revisá el pin en el mapa.';

/** Ubicación de un pedido o de la casa del cortador (null en los pedidos anteriores al mapa). */
export function pointOf(lat: number | null | undefined, lng: number | null | undefined): LatLng | null {
  return lat == null || lng == null ? null : { lat, lng };
}

/**
 * Link universal para "Cómo llegar": en el celular abre Google Maps (o el navegador si no está), con el
 * destino en coordenadas. Sin API de rutas.
 */
export function directionsUrl(to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat.toFixed(6)},${to.lng.toFixed(6)}`;
}

// ——— GPS ———

export type CurrentPosition = LatLng & { accuracy: number };

export class GeoError extends Error {}

/** Pide la ubicación actual. Los errores ya traen un texto para mostrar. */
export function getCurrentPosition(): Promise<CurrentPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new GeoError('Este navegador no puede darnos tu ubicación.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new GeoError(
            e.code === e.PERMISSION_DENIED
              ? 'No tenemos permiso para usar tu ubicación. Podés darlo en los ajustes del navegador.'
              : e.code === e.TIMEOUT
                ? 'El GPS tardó demasiado. Probá de nuevo, mejor al aire libre.'
                : 'No pudimos obtener tu ubicación. Revisá que el GPS esté prendido.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  });
}

/** Estado del permiso de ubicación sin pedirlo (null si el navegador no lo informa). */
export async function geolocationPermission(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state ?? null;
  } catch {
    return null;
  }
}

/** Pantalla táctil: el mapa se mueve con dos dedos para que un dedo siga scrolleando la página. */
export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}
