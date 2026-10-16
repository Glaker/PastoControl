import { Alert, Button, Input, Stack, Text } from '@mantine/core';
import { IconCircleCheck, IconCurrentLocation, IconInfoCircle } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import {
  geolocationPermission,
  getCurrentPosition,
  GeoError,
  isCoarsePointer,
  isInArgentina,
  OUTSIDE_ARGENTINA,
  type LatLng,
} from '../lib/geo';
import { LocationPickerMap } from './lazy';
import type { MapView } from './LeafletMaps';

type Props = {
  label: string;
  description: string;
  required?: boolean;
  /** Dónde arranca el mapa sin pin ni GPS (25 de Mayo, la localidad por defecto). */
  defaultCenter: LatLng;
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  error?: string | null;
};

// Más que esto, el GPS dio una ubicación aproximada: se pide revisar el pin.
const IMPRECISE_M = 50;

/**
 * Ubicación con un pin: botón grande "Usar mi ubicación actual" y un mapa donde el pin se pone tocando y
 * se ajusta arrastrándolo. Vale en cualquier lugar de Argentina. Sin pin, el mapa arranca en el centro por
 * defecto; si el permiso de ubicación ya estaba dado, se mueve a donde estás (sin poner el pin: puede que no
 * estés en el terreno). Se puede mover y marcar en cualquier lado.
 */
export function LocationField({ label, description, required, defaultCenter, value, onChange, error }: Props) {
  const [locating, setLocating] = useState(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [imprecise, setImprecise] = useState<number | null>(null);
  const [view, setView] = useState<MapView | null>(null);
  const [initialCenter] = useState<LatLng>(() => value ?? defaultCenter);
  const hasPin = useRef(!!value);
  hasPin.current = !!value;

  useEffect(() => {
    if (hasPin.current) return;
    let cancelled = false;
    void (async () => {
      if ((await geolocationPermission()) !== 'granted') return;
      try {
        const here = await getCurrentPosition();
        if (!cancelled && !hasPin.current && isInArgentina(here)) {
          setView({ center: here, zoom: 16, token: Date.now() });
        }
      } catch {
        // Sin GPS: queda el centro por defecto.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo al montar.
  }, []);

  const locateMe = async () => {
    setGpsMessage(null);
    setImprecise(null);
    setLocating(true);
    try {
      const here = await getCurrentPosition();
      if (!isInArgentina(here)) {
        setGpsMessage('Tu ubicación actual está fuera de Argentina. Marcá el lugar tocando el mapa.');
        return;
      }
      const point = { lat: here.lat, lng: here.lng };
      onChange(point);
      setView({ center: point, zoom: 17, token: Date.now() });
      if (here.accuracy > IMPRECISE_M) setImprecise(Math.round(here.accuracy));
    } catch (e) {
      setGpsMessage(e instanceof GeoError ? e.message : 'No pudimos obtener tu ubicación.');
    } finally {
      setLocating(false);
    }
  };

  const outside = value && !isInArgentina(value) ? OUTSIDE_ARGENTINA : null;

  return (
    <Input.Wrapper
      label={label}
      description={description}
      withAsterisk={required}
      error={outside ?? error ?? null}
      size="lg"
    >
      <Stack gap="sm" mt="xs">
        <Button
          variant="light"
          h="auto"
          mih={56}
          py={8}
          styles={{ label: { whiteSpace: 'normal', textAlign: 'center' } }}
          loading={locating}
          leftSection={<IconCurrentLocation size={24} aria-hidden />}
          onClick={() => void locateMe()}
        >
          Usar mi ubicación actual
        </Button>
        {gpsMessage && (
          <Alert color="orange" icon={<IconInfoCircle aria-hidden />} role="alert">
            {gpsMessage}
          </Alert>
        )}

        <LocationPickerMap
          value={value}
          onChange={(p) => {
            setImprecise(null);
            onChange(p);
          }}
          initialCenter={initialCenter}
          view={view}
          label={`${label}: mapa para marcar la ubicación`}
        />

        <Text size="sm" c="dimmed">
          {isCoarsePointer()
            ? 'Tocá el mapa para poner el pin y arrastralo para ajustarlo. Para mover o acercar el mapa, usá dos dedos.'
            : 'Hacé clic en el mapa para poner el pin y arrastralo para ajustarlo.'}
        </Text>
        {imprecise !== null && (
          <Alert color="yellow" icon={<IconInfoCircle aria-hidden />}>
            El GPS dio una ubicación aproximada (± {imprecise} m). Fijate que el pin esté en el lugar y movelo si hace falta.
          </Alert>
        )}
        {value && !outside && (
          <Text size="sm" c="pasto.9" fw={600}>
            <IconCircleCheck size={18} aria-hidden style={{ verticalAlign: '-3px' }} /> Ubicación marcada
          </Text>
        )}
      </Stack>
    </Input.Wrapper>
  );
}
