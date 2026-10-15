import { Alert, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCheck, IconHome, IconLock, IconPencil, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { isInsideLocality, outsideLocalityMessage, pointOf, type LatLng } from '../lib/geo';
import { LocationField } from '../map/LocationField';
import { myProfileKey, type MyProfile } from './queries';
import { saveBaseLocation } from './saveProfile';

/**
 * Ubicación base del cortador ("mi casa"): opcional y privada. Sirve para ordenar los trabajos por
 * distancia sin prender el GPS. El mapa se carga recién al tocar "Cargar" o "Cambiar".
 */
export function BaseLocationCard({ profile }: { profile: MyProfile }) {
  const queryClient = useQueryClient();
  const saved = pointOf(profile.private.base_lat, profile.private.base_lng);
  const [editing, setEditing] = useState(false);
  const [point, setPoint] = useState<LatLng | null>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: LatLng | null) => {
    if (value && !isInsideLocality(profile.locality, value)) {
      setError(outsideLocalityMessage(profile.locality));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await saveBaseLocation(value);
      await queryClient.invalidateQueries({ queryKey: myProfileKey(profile.id) });
      setEditing(false);
      notifications.show({
        color: 'pasto',
        icon: <IconCheck size={18} />,
        message: value ? 'Guardamos tu ubicación.' : 'Borramos tu ubicación.',
      });
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
        <Text>
          Opcional. Si la cargás, en «Trabajos» podés ver primero los que te quedan más cerca de tu casa sin
          prender el GPS.
        </Text>
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
            {saved && (
              <Button
                variant="subtle"
                color="red"
                loading={busy}
                leftSection={<IconTrash size={20} aria-hidden />}
                onClick={() => void save(null)}
              >
                Borrar mi ubicación
              </Button>
            )}
          </>
        )}

        {editing && (
          <>
            <LocationField
              label="Tu casa (o desde donde salís)"
              description="Tocá el mapa o usá tu ubicación actual."
              locality={profile.locality}
              value={point}
              onChange={setPoint}
            />
            <Button
              loading={busy}
              disabled={!point}
              leftSection={<IconCheck size={20} aria-hidden />}
              onClick={() => void save(point)}
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
