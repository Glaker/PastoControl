import { Alert, Button, Card, Group, SegmentedControl, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconCurrentLocation, IconHome, IconInfoCircle, IconList, IconMap, IconRefresh } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobCard } from '../../jobs/JobCard';
import { LoadFailed } from '../../jobs/JobPageParts';
import { jobPoint, useAvailableJobs, useJobPhotoUrls, type Job } from '../../jobs/queries';
import { formatPrice } from '../../lib/format';
import { distanceMeters, geolocationPermission, isCoarsePointer, localityCenter, pointOf, type LatLng } from '../../lib/geo';
import { JobsMapView, type MapJob } from '../../map/lazy';
import { useCurrentPosition } from '../../map/useCurrentPosition';
import { useMyProfile } from '../../profile/queries';

type Origin = 'actual' | 'casa';
type View = 'lista' | 'mapa';

// Preferencias de esta pantalla en este dispositivo.
const ORIGIN_KEY = 'pastocontrol.trabajos.origen';
const VIEW_KEY = 'pastocontrol.trabajos.vista';

function readStored<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sin localStorage (modo privado): no se recuerda.
  }
}

type SortedJob = { job: Job; distanceM: number | null };

export function TrabajosPage() {
  const { data: profile } = useMyProfile();
  const { data: jobs, isPending, error, refetch, isRefetching } = useAvailableJobs(profile?.locality_id);
  // Una sola llamada para las miniaturas de toda la lista (la primera foto de cada trabajo).
  const firstPhotos = (jobs ?? []).flatMap((j) => j.photo_paths.slice(0, 1));
  const { data: thumbs } = useJobPhotoUrls(firstPhotos);

  const home = pointOf(profile?.private.base_lat, profile?.private.base_lng);
  const gps = useCurrentPosition();
  const [origin, setOrigin] = useState<Origin | null>(() => readStored(ORIGIN_KEY, ['actual', 'casa'] as const));
  const [view, setView] = useState<View>(() => readStored(VIEW_KEY, ['lista', 'mapa'] as const) ?? 'lista');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Sin preferencia guardada: la casa si está cargada; si no, el GPS solo si el permiso ya estaba dado
  // (no se pide permiso sin que la persona toque el botón).
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !profile) return;
    decided.current = true;
    if (origin === 'actual') {
      void gps.request();
      return;
    }
    if (origin) return;
    if (home) {
      setOrigin('casa');
      return;
    }
    void geolocationPermission().then((state) => {
      if (state === 'granted') {
        setOrigin('actual');
        void gps.request();
      }
    });
  }, [profile, origin, home, gps]);

  const chooseOrigin = (value: Origin) => {
    setOrigin(value);
    store(ORIGIN_KEY, value);
    if (value === 'actual') void gps.request();
  };

  const chooseView = (value: View) => {
    setView(value);
    store(VIEW_KEY, value);
  };

  const originPoint: LatLng | null = origin === 'casa' ? home : origin === 'actual' ? gps.position : null;

  // Por distancia si hay origen (los trabajos sin pin, al final); si no, por fecha (como vienen).
  const sorted = useMemo<SortedJob[]>(() => {
    const list = (jobs ?? []).map((job) => {
      const point = jobPoint(job);
      return { job, distanceM: originPoint && point ? distanceMeters(originPoint, point) : null };
    });
    if (!originPoint) return list;
    return list.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity));
  }, [jobs, originPoint]);

  const mapJobs = useMemo<MapJob[]>(
    () =>
      sorted.flatMap(({ job }) => {
        const point = jobPoint(job);
        return point ? [{ id: job.id, point, priceLabel: formatPrice(job.price_ars) }] : [];
      }),
    [sorted],
  );

  const selected = sorted.find((s) => s.job.id === selectedId) ?? null;
  const selectedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId) selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId]);

  const card = ({ job, distanceM }: SortedJob) => (
    <JobCard
      key={job.id}
      job={job}
      to={`/cortar/trabajo/${job.id}`}
      variant="cutter"
      distanceM={distanceM}
      thumbUrl={job.photo_paths[0] ? thumbs?.[job.photo_paths[0]] : undefined}
    />
  );

  const refresh = (
    <Button
      variant="default"
      loading={isRefetching || gps.loading}
      leftSection={<IconRefresh size={20} aria-hidden />}
      onClick={() => {
        void refetch();
        if (origin === 'actual') void gps.request();
      }}
    >
      Actualizar
    </Button>
  );

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} size="h2">
          Trabajos disponibles
        </Title>
        {profile && (
          <Text c="dimmed">
            En {profile.locality.name}, {originPoint ? 'los más cercanos primero.' : 'ordenados por fecha.'}
          </Text>
        )}
      </div>

      <Stack gap="xs">
        <Text fw={600}>Ordenar por distancia</Text>
        <SimpleGrid cols={2} spacing="xs">
          <ToggleButton
            active={origin === 'actual'}
            icon={<IconCurrentLocation size={22} aria-hidden />}
            onClick={() => chooseOrigin('actual')}
          >
            Desde mi ubicación actual
          </ToggleButton>
          <ToggleButton active={origin === 'casa'} icon={<IconHome size={22} aria-hidden />} onClick={() => chooseOrigin('casa')}>
            Desde mi casa
          </ToggleButton>
        </SimpleGrid>
        {origin === 'actual' && gps.loading && !gps.position && <Text c="dimmed">Buscando tu ubicación…</Text>}
        {!originPoint && !(origin === 'actual' && gps.loading) && (
          <OriginNotice
            reason={
              origin === 'actual' && gps.error
                ? gps.error
                : origin === 'casa'
                  ? 'Todavía no cargaste tu casa.'
                  : null
            }
            hasHome={!!home}
            onUseGps={() => chooseOrigin('actual')}
          />
        )}
      </Stack>

      <SegmentedControl
        fullWidth
        aria-label="Cómo ver los trabajos"
        value={view}
        onChange={(value) => chooseView(value as View)}
        data={[
          { value: 'lista', label: <SegmentLabel icon={<IconList size={20} aria-hidden />}>Lista</SegmentLabel> },
          { value: 'mapa', label: <SegmentLabel icon={<IconMap size={20} aria-hidden />}>Mapa</SegmentLabel> },
        ]}
      />

      {isPending && <FullPageLoader label="Buscando trabajos…" />}
      {error && <LoadFailed error={error} onRetry={() => void refetch()} />}

      {jobs && jobs.length === 0 && (
        <Card withBorder radius="md" padding="lg">
          <Text>Por ahora no hay trabajos publicados. Volvé a mirar más tarde.</Text>
        </Card>
      )}

      {jobs && jobs.length > 0 && view === 'lista' && sorted.map(card)}

      {jobs && jobs.length > 0 && view === 'mapa' && profile && (
        <Stack gap="sm">
          <JobsMapView
            jobs={mapJobs}
            origin={originPoint}
            originLabel={origin === 'casa' ? 'Tu casa' : 'Vos'}
            initialCenter={localityCenter(profile.locality)}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <Text size="sm" c="dimmed">
            {isCoarsePointer() ? 'Para mover o acercar el mapa, usá dos dedos. ' : ''}
            Tocá un precio para ver el trabajo.
          </Text>
          {mapJobs.length < jobs.length && (
            <Text size="sm" c="dimmed">
              {jobs.length - mapJobs.length === 1
                ? '1 trabajo no tiene ubicación en el mapa: lo ves en la lista.'
                : `${jobs.length - mapJobs.length} trabajos no tienen ubicación en el mapa: los ves en la lista.`}
            </Text>
          )}
          {/* Margen para que el scroll deje la tarjeta entera, sin la barra de abajo ni el encabezado encima. */}
          <div
            ref={selectedRef}
            style={{
              scrollMarginBottom: 'calc(var(--app-shell-footer-offset, 0px) + 12px)',
              scrollMarginTop: 'calc(var(--app-shell-header-offset, 0px) + 12px)',
            }}
          >
            {selected && card(selected)}
          </div>
        </Stack>
      )}

      {jobs && refresh}
    </Stack>
  );
}

function ToggleButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant={active ? 'filled' : 'default'}
      size="md"
      h="auto"
      mih={56}
      py={6}
      px="sm"
      aria-pressed={active}
      leftSection={icon}
      justify="flex-start"
      styles={{ label: { whiteSpace: 'normal', lineHeight: 1.25, textAlign: 'left' } }}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function SegmentLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <Group gap={6} justify="center" wrap="nowrap">
      {icon}
      <span>{children}</span>
    </Group>
  );
}

function OriginNotice({ reason, hasHome, onUseGps }: { reason: string | null; hasHome: boolean; onUseGps: () => void }) {
  return (
    <Alert color="blue" icon={<IconInfoCircle aria-hidden />}>
      <Stack gap="sm">
        <Text>
          {reason && `${reason} `}
          {hasHome
            ? 'Para ver primero los trabajos que te quedan más cerca, usá tu ubicación actual o elegí «Desde mi casa».'
            : 'Para ver primero los trabajos que te quedan más cerca, usá tu ubicación actual o cargá tu casa en el perfil.'}
        </Text>
        <Button variant="white" leftSection={<IconCurrentLocation size={20} aria-hidden />} onClick={onUseGps}>
          Usar mi ubicación actual
        </Button>
        {!hasHome && (
          <Button component={Link} to="/perfil" variant="white" leftSection={<IconHome size={20} aria-hidden />}>
            Cargar mi casa
          </Button>
        )}
      </Stack>
    </Alert>
  );
}
