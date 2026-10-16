import { Alert, Button, Group, Stack, Text, Title } from '@mantine/core';
import { IconCheck, IconLock } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { friendlyError } from '../lib/errors';
import { isInArgentina, localityCenter, OUTSIDE_ARGENTINA, pointOf, type LatLng } from '../lib/geo';
import { LocationField } from '../map/LocationField';
import { myProfileKey, type MyProfile } from './queries';
import { saveBaseLocation } from './saveProfile';

/**
 * Ubicación base del cortador («mi casa»), obligatoria para cortar: desde ahí se miden las distancias a los
 * trabajos. Es privada. Se pide en el onboarding del cortador y, a los que todavía no la tienen, antes de ver
 * los trabajos.
 */
export function BaseLocationStep({
  profile,
  title,
  intro,
  submitLabel = 'Guardar y seguir',
  onSaved,
  extra,
}: {
  profile: MyProfile;
  title: string;
  intro: string;
  submitLabel?: string;
  onSaved?: () => void;
  extra?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [point, setPoint] = useState<LatLng | null>(pointOf(profile.private.base_lat, profile.private.base_lng));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!point) {
      setError('Marcá en el mapa desde dónde salís a cortar.');
      return;
    }
    if (!isInArgentina(point)) {
      setError(OUTSIDE_ARGENTINA);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await saveBaseLocation(point);
      await queryClient.invalidateQueries({ queryKey: myProfileKey(profile.id) });
      onSaved?.();
    } catch (e) {
      setError(friendlyError(e, 'No pudimos guardar la ubicación. Probá de nuevo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} size="h2">
          {title}
        </Title>
        <Text mt="xs">{intro}</Text>
      </div>
      <Group gap="xs" wrap="nowrap" align="flex-start" c="dimmed">
        <IconLock size={18} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
        <Text size="sm" c="inherit">
          Es privada: solo la ves vos. Los demás ven a qué distancia está cada trabajo de vos, no tu casa.
        </Text>
      </Group>
      <LocationField
        label="Tu casa (o desde donde salís)"
        description="Tocá el mapa o usá tu ubicación actual. Puede ser en cualquier ciudad."
        required
        defaultCenter={localityCenter(profile.locality)}
        value={point}
        onChange={(value) => {
          setPoint(value);
          setError(null);
        }}
      />
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      <Button loading={busy} leftSection={<IconCheck size={20} aria-hidden />} onClick={() => void save()}>
        {submitLabel}
      </Button>
      {extra}
    </Stack>
  );
}
