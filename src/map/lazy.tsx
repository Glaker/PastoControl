import { Center, Loader, Stack, Text } from '@mantine/core';
import { lazy, Suspense, type ComponentProps } from 'react';

// Leaflet y sus estilos viajan en un chunk aparte que se baja recién al mostrar un mapa.
const load = () => import('./LeafletMaps');
const LazyLocationPicker = lazy(() => load().then((m) => ({ default: m.LocationPicker })));
const LazyJobsMap = lazy(() => load().then((m) => ({ default: m.JobsMap })));
const LazyJobLocation = lazy(() => load().then((m) => ({ default: m.JobLocation })));

function MapFallback({ height }: { height: number | string }) {
  return (
    <Center
      h={height}
      style={{ border: '1px solid var(--mantine-color-gray-4)', borderRadius: 'var(--mantine-radius-md)' }}
      bg="gray.0"
    >
      <Stack align="center" gap="xs">
        <Loader size="md" />
        <Text c="dimmed">Cargando el mapa…</Text>
      </Stack>
    </Center>
  );
}

export function LocationPickerMap(props: ComponentProps<typeof LazyLocationPicker>) {
  return (
    <Suspense fallback={<MapFallback height={300} />}>
      <LazyLocationPicker {...props} />
    </Suspense>
  );
}

export function JobsMapView(props: ComponentProps<typeof LazyJobsMap>) {
  return (
    <Suspense fallback={<MapFallback height="min(65vh, 520px)" />}>
      <LazyJobsMap {...props} />
    </Suspense>
  );
}

export function JobLocationMap(props: ComponentProps<typeof LazyJobLocation>) {
  return (
    <Suspense fallback={<MapFallback height={240} />}>
      <LazyJobLocation {...props} />
    </Suspense>
  );
}

export type { MapJob } from './LeafletMaps';
