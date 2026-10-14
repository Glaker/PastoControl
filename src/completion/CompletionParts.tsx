import { Alert, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCircleCheck, IconHeartHandshake, IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { applicationKeys } from '../applications/queries';
import { confirmAction } from '../lib/confirm';
import dayjs from '../lib/dayjs';
import { friendlyError } from '../lib/errors';
import { jobKeys, type Job } from '../jobs/queries';
import { canMarkDone, completionKeys, markJobDone, rateJob, useHasRated } from './queries';

/** "Marcar como realizado": cualquiera de las dos partes, desde el día acordado. */
export function MarkDoneButton({ job, counterpartName }: { job: Job; counterpartName: string }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tz = job.locality.timezone;
  const agreedAt = job.agreement?.agreed_at;
  if (!agreedAt) return null;
  const enabled = canMarkDone(agreedAt, tz);

  const onClick = async () => {
    const ok = await confirmAction({
      title: '¿El trabajo ya está hecho?',
      message: `Le avisamos a ${counterpartName} y los dos van a poder calificarse. No se puede deshacer.`,
      confirmLabel: 'Sí, marcar como realizado',
      confirmIcon: <IconCircleCheck size={20} aria-hidden />,
    });
    if (!ok) return;
    setError(null);
    setSaving(true);
    try {
      await markJobDone(job.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: jobKeys.all }),
        queryClient.invalidateQueries({ queryKey: applicationKeys.all }),
      ]);
      notifications.show({ color: 'teal', icon: <IconCircleCheck size={18} />, message: 'Marcaste el trabajo como realizado.' });
    } catch (e) {
      setError(friendlyError(e, 'No pudimos marcarlo como realizado. Probá de nuevo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="xs">
      <Button
        color="teal"
        loading={saving}
        disabled={!enabled}
        leftSection={<IconCircleCheck size={20} aria-hidden />}
        onClick={() => void onClick()}
      >
        Marcar como realizado
      </Button>
      {!enabled && (
        <Text size="sm" c="dimmed">
          Se puede marcar desde el {dayjs(agreedAt).tz(tz).format('dddd D [de] MMMM')}.
        </Text>
      )}
      {error && (
        <Alert color="red" title="No se pudo" role="alert">
          {error}
        </Alert>
      )}
    </Stack>
  );
}

/** "¿Volverías a trabajar con esta persona?" Una sola vez, nadie ve la respuesta. */
export function RatingCard({ job, counterpartFirstName }: { job: Job; counterpartFirstName: string }) {
  const queryClient = useQueryClient();
  const { data: hasRated, isPending } = useHasRated(job.id, job.status === 'realizado');
  const [saving, setSaving] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (job.status !== 'realizado' || isPending) return null;

  if (hasRated) {
    return (
      <Card withBorder radius="md" padding="lg">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <IconHeartHandshake size={24} aria-hidden style={{ flex: 'none' }} />
          <Text>Ya calificaste este trabajo. ¡Gracias!</Text>
        </Group>
      </Card>
    );
  }

  const rate = async (value: boolean) => {
    const ok = await confirmAction({
      title: value ? `¿Volverías a trabajar con ${counterpartFirstName}?` : `¿No volverías a trabajar con ${counterpartFirstName}?`,
      message:
        'Tu respuesta no se puede cambiar y nadie la ve: solo suma al porcentaje del perfil, que se muestra con 5 calificaciones o más y se actualiza una vez por semana.',
      confirmLabel: value ? 'Sí, volvería' : 'No, no volvería',
      confirmIcon: value ? <IconThumbUp size={20} aria-hidden /> : <IconThumbDown size={20} aria-hidden />,
    });
    if (!ok) return;
    setError(null);
    setSaving(value);
    try {
      await rateJob(job.id, value);
      await queryClient.invalidateQueries({ queryKey: completionKeys.hasRated(job.id) });
      notifications.show({ color: 'teal', icon: <IconHeartHandshake size={18} />, message: '¡Gracias por calificar!' });
    } catch (e) {
      setError(friendlyError(e, 'No pudimos guardar tu calificación. Probá de nuevo.'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="sm">
        <Title order={2} size="h3">
          ¿Volverías a trabajar con {counterpartFirstName}?
        </Title>
        <Text size="sm" c="dimmed">
          Nadie ve tu respuesta. Suma al porcentaje público de su perfil.
        </Text>
        <SimpleGrid cols={2} spacing="sm">
          <Button
            color="teal"
            loading={saving === true}
            disabled={saving !== null}
            leftSection={<IconThumbUp size={20} aria-hidden />}
            onClick={() => void rate(true)}
          >
            Sí
          </Button>
          <Button
            variant="default"
            loading={saving === false}
            disabled={saving !== null}
            leftSection={<IconThumbDown size={20} aria-hidden />}
            onClick={() => void rate(false)}
          >
            No
          </Button>
        </SimpleGrid>
        {error && (
          <Alert color="red" title="No se pudo" role="alert">
            {error}
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
