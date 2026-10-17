// Mapas con Leaflet y tiles de OpenStreetMap. Este módulo (con Leaflet y su CSS) se carga a demanda
// desde src/map/lazy.tsx: nunca entra en el bundle principal.
//
// Celular: un dedo sigue scrolleando la página (el mapa no la atrapa). El pin se arrastra con un dedo y
// se pone tocando el mapa; el mapa se mueve y se acerca con dos dedos. En la PC se arrastra con el mouse.
// La rueda no hace zoom (atraparía el scroll): para eso están los botones + y −.

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { useEffect, useRef } from 'react';
import { isCoarsePointer, type LatLng } from '../lib/geo';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
// Atribución que exige OpenStreetMap (https://www.openstreetmap.org/copyright).
const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">colaboradores de OpenStreetMap</a>';

function createMap(el: HTMLElement, center: LatLng, zoom: number): L.Map {
  const coarse = isCoarsePointer();
  const map = L.map(el, {
    center,
    zoom,
    dragging: !coarse,
    touchZoom: true,
    scrollWheelZoom: false,
    zoomSnap: 0.5,
  });
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  return map;
}

const PIN_SVG =
  '<svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true"><path fill="var(--pin-color)" stroke="#fff" stroke-width="1.5" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.6" fill="#fff"/></svg>';

const pinIcon = (className: string) =>
  L.divIcon({ className: `pc-pin ${className}`, html: PIN_SVG, iconSize: [48, 48], iconAnchor: [24, 46] });

// ——— Selector de ubicación (publicar pedido, casa del cortador) ———

type PickerProps = {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  /** Dónde arranca el mapa si no hay pin. */
  initialCenter: LatLng;
  /** Cada vez que cambia el token, el mapa va a ese lugar (ej.: después de usar el GPS). */
  view: MapView | null;
  label: string;
};

export type MapView = { center: LatLng; zoom: number; token: number };

export function LocationPicker({ value, onChange, initialCenter, view, label }: PickerProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const start = value ?? initialCenter;
    const map = createMap(elRef.current!, start, value ? 17 : 14);
    map.on('click', (e: L.LeafletMouseEvent) => onChangeRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // El mapa se crea una sola vez; los cambios de pin se aplican abajo.
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = L.marker(value, {
        draggable: true,
        autoPan: true,
        icon: pinIcon('pc-pin--job'),
        keyboard: false,
        title: 'Ubicación marcada (arrastrala para ajustarla)',
      }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        onChangeRef.current({ lat: p.lat, lng: p.lng });
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(value);
    }
  }, [value]);

  useEffect(() => {
    if (view) mapRef.current?.setView(view.center, view.zoom);
    // Solo cuando cambia el token.
  }, [view?.token]);

  return <div ref={elRef} className="pc-map" role="application" aria-label={label} />;
}

// ——— Ubicación de un trabajo (solo lectura) ———

export function JobLocation({ point, label }: { point: LatLng; label: string }) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = createMap(elRef.current!, point, 16);
    L.marker(point, { icon: pinIcon('pc-pin--job'), keyboard: false, interactive: false }).addTo(map);
    return () => {
      map.remove();
    };
  }, [point.lat, point.lng]);

  return <div ref={elRef} className="pc-map pc-map--short" role="img" aria-label={label} />;
}

// ——— Mapa de trabajos disponibles ———

export type MapJob = { id: string; point: LatLng; priceLabel: string };

type JobsMapProps = {
  jobs: MapJob[];
  /** Desde dónde se mide la distancia (ubicación actual o casa). */
  origin: LatLng | null;
  originLabel: string;
  initialCenter: LatLng;
  selectedId: string | null;
  onSelect: (jobId: string) => void;
};

export function JobsMap({ jobs, origin, originLabel, initialCenter, selectedId, onSelect }: JobsMapProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const map = createMap(elRef.current!, initialCenter, 14);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Encuadre: todos los trabajos y el origen. Solo cuando cambia el conjunto, no al elegir uno.
  const boundsKey = jobs.map((j) => j.id).join(',') + (origin ? `|${origin.lat},${origin.lng}` : '');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points = jobs.map((j) => j.point).concat(origin ? [origin] : []);
    if (points.length === 1) map.setView(points[0]!, 16);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 17 });
  }, [boundsKey]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (origin) {
      L.marker(origin, {
        icon: L.divIcon({
          className: 'pc-origin',
          html: `<span class="pc-origin__dot"></span><span class="pc-origin__label">${escapeHtml(originLabel)}</span>`,
          iconSize: [0, 0],
        }),
        interactive: false,
        keyboard: false,
        zIndexOffset: -1000,
      }).addTo(layer);
    }
    for (const job of jobs) {
      const selected = job.id === selectedId;
      const marker = L.marker(job.point, {
        icon: L.divIcon({
          className: `pc-price${selected ? ' pc-price--selected' : ''}`,
          html: `<span>${escapeHtml(job.priceLabel)}</span>`,
          iconSize: [0, 0],
        }),
        title: `Trabajo de ${job.priceLabel}`,
        zIndexOffset: selected ? 1000 : 0,
        riseOnHover: true,
      }).addTo(layer);
      marker.on('click', () => onSelectRef.current(job.id));
    }
  }, [jobs, origin, originLabel, selectedId]);

  return <div ref={elRef} className="pc-map pc-map--tall" role="application" aria-label="Mapa de trabajos disponibles" />;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
