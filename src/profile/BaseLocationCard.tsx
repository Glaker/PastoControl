import { Alert, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCheck, IconHome, IconLock, IconPencil } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { isInArgentina, localityCenter, OUTSIDE_ARGENTINA, pointOf, type LatLng } from '../lib/geo';
import { LocationField } from '../map/LocationField';
import { myProfileKey, type MyProfile } from './queries';
import { saveBaseLocation } from './saveProfile';

/**
 * Ubicación base del cortador ("mi casa"): obligatoria para cortar y privada. Desde ahí se miden las
 * distancias a los trabajos. Se puede cambiar, no borrar. El mapa se carga recién al tocar "Cambiar".
 */
export function BaseLocationCard({ profile }: { profile: MyProfile }) {
  const queryClient = useQueryClient();
  const saved = pointOf(profile.private.base_lat, profile.private.base_lng);
  const [editing, setEditing] = useState(false);
  const [point, setPoint] = useState<LatLng | null>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: LatLng) => {
    if (!isInArgentina(value)) {
      setError(OUTSIDE_ARGENTINA);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await saveBaseLocation(value);
      await queryClient.invalidateQueries({ queryKey: myProfileKey(profile.id) });
      setEditing(false);
      notifications.show({ color: 'pasto', icon: <IconCheck size={18} />, message: 'Guardamos tu ubicación.' });
    } catch (e) {
      setError(friendlyError(e, 'No pudimos guardar la ubicación. Probá de nuevo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Title order={2} size="h4">
          Desde dónde salís a cortar
        </Title>
        <Text>Desde acá medimos qué tan lejos te queda cada trabajo. Para cortar pasto es obligatoria.</Text>
        <Group gap="xs" wrap="nowrap" align="flex-start" c="dimmed">
          <IconLock size={18} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
          <Text size="sm" c="inherit">
            Es privada: solo la ves vos.
          </Text>
        </Group>

        {!editing && (
          <>
            <Text fw={600}>{saved ? 'Ubicación cargada.' : 'Todavía no la cargaste.'}</Text>
            <Button
              variant={saved ? 'default' : 'filled'}
              leftSection={saved ? <IconPencil size={20} aria-hidden /> : <IconHome size={20} aria-hidden />}
              onClick={() => {
                setPoint(saved);
                setError(null);
                setEditing(true);
              }}
            >
              {saved ? 'Cambiar la ubicación' : 'Cargar mi ubicación'}
            </Button>
          </>
        )}

        {editing && (
          <>
            <LocationField
              label="Tu casa (o desde donde salís)"
              description="Tocá el mapa o usá tu ubicación actual. Puede ser en cualquier ciudad."
              defaultCenter={localityCenter(profile.locality)}
              value={point}
              onChange={setPoint}
            />
            <Button
              loading={busy}
              disabled={!point}
              leftSection={<IconCheck size={20} aria-hidden />}
              onClick={() => point && void save(point)}
            >
              Guardar ubicación
            </Button>
            <Button
              variant="default"
              disabled={busy}
              leftSection={<IconArrowLeft size={20} aria-hidden />}
              onClick={() => setEditing(false)}
            >
              Volver sin guardar
            </Button>
          </>
        )}

        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
