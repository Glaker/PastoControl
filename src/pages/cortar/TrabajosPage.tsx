import { Alert, Button, Card, Group, SegmentedControl, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import {
  IconCurrentLocation,
  IconHome,
  IconInfoCircle,
  IconList,
  IconMap,
  IconRefresh,
  IconRuler2,
  IconZoomIn,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobCard } from '../../jobs/JobCard';
import { LoadFailed } from '../../jobs/JobPageParts';
import { jobPoint, useAvailableJobs, useJobPhotoUrls, type AvailableJob } from '../../jobs/queries';
import { friendlyError } from '../../lib/errors';
import { formatPrice } from '../../lib/format';
import { isCoarsePointer, pointOf, type LatLng } from '../../lib/geo';
import { supabase } from '../../lib/supabase';
import { JobsMapView, type MapJob } from '../../map/lazy';
import { useCurrentPosition } from '../../map/useCurrentPosition';
import { BaseLocationStep } from '../../profile/BaseLocationStep';
import { myProfileKey, useMyProfile, type MyProfile } from '../../profile/queries';

type Origin = 'actual' | 'casa';
type View = 'lista' | 'mapa';

const RADII = [5, 10, 20, 50] as const;

// Preferencias de esta pantalla en este dispositivo (el radio se guarda en la cuenta).
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

export function TrabajosPage() {
  const { data: profile } = useMyProfile();
  // RequireProfile garantiza que el perfil existe.
  if (!profile) return <FullPageLoader />;

  const home = pointOf(profile.private.base_lat, profile.private.base_lng);
  // Los cortadores que todavía no cargaron su casa (obligatoria desde la Fase 8) la cargan antes de ver trabajos.
  if (!home) {
    return (
      <BaseLocationStep
        profile={profile}
        title="Antes de ver los trabajos"
        intro="Para mostrarte los trabajos que te quedan cerca, marcá desde dónde salís a cortar."
      />
    );
  }
  return <AvailableJobs profile={profile} home={home} />;
}

function AvailableJobs({ profile, home }: { profile: MyProfile; home: LatLng }) {
  const queryClient = useQueryClient();
  const gps = useCurrentPosition();
  const [origin, setOrigin] = useState<Origin>(() => readStored(ORIGIN_KEY, ['actual', 'casa'] as const) ?? 'casa');
  const [view, setView] = useState<View>(() => readStored(VIEW_KEY, ['lista', 'mapa'] as const) ?? 'lista');
  const [radius, setRadius] = useState<number>(profile.private.search_radius_km);
  const [radiusError, setRadiusError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Si la última vez se eligió la ubicación actual, se vuelve a pedir (el permiso ya estaba dado).
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (origin === 'actual') void gps.request();
  }, [origin, gps]);

  const chooseOrigin = (value: Origin) => {
    setOrigin(value);
    store(ORIGIN_KEY, value);
    if (value === 'actual') void gps.request();
  };

  const chooseView = (value: View) => {
    setView(value);
    store(VIEW_KEY, value);
  };

  const chooseRadius = async (value: number) => {
    const previous = radius;
    setRadius(value);
    setRadiusError(null);
    const { error } = await supabase.rpc('set_my_search_radius', { p_km: value });
    if (error) {
      setRadius(previous);
      setRadiusError(friendlyError(error, 'No pudimos guardar la distancia. Probá de nuevo.'));
      return;
    }
    void queryClient.invalidateQueries({ queryKey: myProfileKey(profile.id) });
  };

  // Desde la ubicación actual si se pudo obtener; si el GPS falla o no hay permiso, desde la casa.
  const waitingGps = origin === 'actual' && !gps.position && gps.loading;
  const usingGps = origin === 'actual' && !!gps.position;
  const originPoint: LatLng | null = waitingGps ? null : usingGps ? gps.position : home;
  const gpsFailed = origin === 'actual' && !gps.position && !gps.loading && !!gps.error;

  const { data: jobs, isPending, error, refetch, isRefetching } = useAvailableJobs(originPoint, radius);
  // Una sola llamada para las miniaturas de toda la lista (la primera foto de cada trabajo).
  const firstPhotos = (jobs ?? []).flatMap(({ job }) => job.photo_paths.slice(0, 1));
  const { data: thumbs } = useJobPhotoUrls(firstPhotos);

  const mapJobs = useMemo<MapJob[]>(
    () =>
      (jobs ?? []).flatMap(({ job }) => {
        const point = jobPoint(job);
        return point ? [{ id: job.id, point, priceLabel: formatPrice(job.price_ars) }] : [];
      }),
    [jobs],
  );

  const selected = (jobs ?? []).find((s) => s.job.id === selectedId) ?? null;
  const selectedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId) selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedId]);

  const card = ({ job, distanceM }: AvailableJob) => (
    <JobCard
      key={job.id}
      job={job}
      to={`/cortar/trabajo/${job.id}`}
      variant="cutter"
      distanceM={distanceM}
      thumbUrl={job.photo_paths[0] ? thumbs?.[job.photo_paths[0]] : undefined}
    />
  );

  const nextRadius = RADII.find((r) => r > radius);

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} size="h2">
          Trabajos disponibles
        </Title>
        <Text c="dimmed">
          A menos de {radius} km de {usingGps ? 'donde estás' : 'tu casa'}, los más cercanos primero.
        </Text>
      </div>

      <Stack gap="xs">
        <Text fw={600}>Buscar desde</Text>
        <SimpleGrid cols={2} spacing="xs">
          <ToggleButton
            active={origin === 'actual'}
            icon={<IconCurrentLocation size={22} aria-hidden />}
            onClick={() => chooseOrigin('actual')}
          >
            Mi ubicación actual
          </ToggleButton>
          <ToggleButton active={origin === 'casa'} icon={<IconHome size={22} aria-hidden />} onClick={() => chooseOrigin('casa')}>
            Mi casa
          </ToggleButton>
        </SimpleGrid>
        {waitingGps && <Text c="dimmed">Buscando tu ubicación…</Text>}
        {gpsFailed && (
          <Alert color="orange" icon={<IconInfoCircle aria-hidden />}>
            {gps.error} Mientras tanto, te mostramos los trabajos desde tu casa.
          </Alert>
        )}
      </Stack>

      <Stack gap="xs">
        <Group gap={6} wrap="nowrap">
          <IconRuler2 size={20} aria-hidden style={{ flex: 'none' }} />
          <Text fw={600}>Hasta qué distancia</Text>
        </Group>
        <SegmentedControl
          fullWidth
          size="md"
          aria-label="Hasta qué distancia buscar"
          value={String(radius)}
          onChange={(value) => void chooseRadius(Number(value))}
          data={RADII.map((r) => ({ value: String(r), label: `${r} km` }))}
          styles={{ label: { minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' } }}
        />
        {radiusError && (
          <Alert color="red" role="alert">
            {radiusError}
          </Alert>
        )}
      </Stack>

      <SegmentedControl
        fullWidth
        aria-label="Cómo ver los trabajos"
        value={view}
        onChange={(value) => chooseView(value as View)}
        styles={{ label: { minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' } }}
        data={[
          { value: 'lista', label: <SegmentLabel icon={<IconList size={20} aria-hidden />}>Lista</SegmentLabel> },
          { value: 'mapa', label: <SegmentLabel icon={<IconMap size={20} aria-hidden />}>Mapa</SegmentLabel> },
        ]}
      />

      {(isPending || waitingGps) && <FullPageLoader label="Buscando trabajos…" />}
      {error && <LoadFailed error={error} onRetry={() => void refetch()} />}

      {jobs && jobs.length === 0 && (
        <Card withBorder radius="md" padding="lg">
          <Stack gap="sm">
            <Text>No hay trabajos publicados a menos de {radius} km. Volvé a mirar más tarde.</Text>
            {nextRadius && (
              <Button variant="default" leftSection={<IconZoomIn size={20} aria-hidden />} onClick={() => void chooseRadius(nextRadius)}>
                Buscar hasta {nextRadius} km
              </Button>
            )}
          </Stack>
        </Card>
      )}

      {jobs && jobs.length > 0 && view === 'lista' && jobs.map(card)}

      {jobs && jobs.length > 0 && view === 'mapa' && originPoint && (
        <Stack gap="sm">
          <JobsMapView
            jobs={mapJobs}
            origin={originPoint}
            originLabel={usingGps ? 'Vos' : 'Tu casa'}
            initialCenter={originPoint}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <Text size="sm" c="dimmed">
            {isCoarsePointer() ? 'Para mover o acercar el mapa, usá dos dedos. ' : ''}
            Tocá un precio para ver el trabajo.
          </Text>
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

      {jobs && (
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
      )}
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
