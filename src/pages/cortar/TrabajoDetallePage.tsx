import { Alert, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconClipboardList, IconLock, IconSend } from '@tabler/icons-react';
import { Link, useParams } from 'react-router';
import { useUserId } from '../../auth/AuthProvider';
import { FullPageLoader } from '../../components/FullPageLoader';
import { ClientLine } from '../../jobs/JobCard';
import { JobFacts } from '../../jobs/JobFacts';
import { BackLink, JobUnavailable, LoadFailed } from '../../jobs/JobPageParts';
import { JobPhotos } from '../../jobs/JobPhotos';
import { jobDisplayStatus, useJob } from '../../jobs/queries';

export function TrabajoDetallePage() {
  const { jobId } = useParams();
  const userId = useUserId();
  const { data: job, isPending, error, refetch } = useJob(jobId);

  if (isPending) return <FullPageLoader label="Cargando el trabajo…" />;
  if (error) return <LoadFailed error={error} onRetry={() => void refetch()} />;

  // El RLS no devuelve trabajos vencidos, cancelados ni de otra localidad.
  if (!job || (job.client_id !== userId && jobDisplayStatus(job) !== 'publicado')) {
    return (
      <JobUnavailable
        title="Este trabajo ya no está disponible"
        message="Puede que lo hayan cancelado o que ya haya pasado la fecha."
        backTo="/cortar"
        backLabel="Ver trabajos disponibles"
      />
    );
  }

  if (job.client_id === userId) {
    return (
      <Stack gap="lg">
        <BackLink to="/cortar" label="Trabajos" />
        <Title order={1} size="h2">
          Este pedido es tuyo
        </Title>
        <Text>No te podés postular a tus propios pedidos.</Text>
        <Button component={Link} to={`/pedir/pedido/${job.id}`} leftSection={<IconClipboardList size={20} aria-hidden />}>
          Ver mi pedido
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <BackLink to="/cortar" label="Trabajos" />

      <Title order={1} size="h2">
        Trabajo en {job.zone}
      </Title>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <ClientLine client={job.client} size={48} />
          <JobFacts job={job} />
        </Stack>
      </Card>

      {job.photo_paths.length > 0 && (
        <Stack gap="xs">
          <Title order={2} size="h4">
            Fotos del terreno
          </Title>
          <JobPhotos paths={job.photo_paths} />
        </Stack>
      )}

      <Alert color="blue" icon={<IconLock aria-hidden />}>
        La dirección exacta y el WhatsApp se comparten cuando el cliente acepta tu postulación.
      </Alert>

      <Card withBorder radius="md" padding="lg">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <IconSend size={24} aria-hidden style={{ flex: 'none' }} />
          <Text c="dimmed">Postularte (aceptando o con otro precio u horario): se completa en la Fase 3.</Text>
        </Group>
      </Card>
    </Stack>
  );
}
