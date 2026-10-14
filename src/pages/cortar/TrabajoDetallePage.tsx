import { Alert, Button, Card, Stack, Text, Title } from '@mantine/core';
import { IconBan, IconClipboardList, IconLock } from '@tabler/icons-react';
import { Link, useParams } from 'react-router';
import { ApplicationPanel } from '../../applications/ApplicationPanel';
import { useMyApplicationForJob } from '../../applications/queries';
import { useUserId } from '../../auth/AuthProvider';
import { FullPageLoader } from '../../components/FullPageLoader';
import { ClientLine } from '../../jobs/JobCard';
import { JobFacts } from '../../jobs/JobFacts';
import { BackLink, JobUnavailable, LoadFailed } from '../../jobs/JobPageParts';
import { JobPhotos } from '../../jobs/JobPhotos';
import { useJob } from '../../jobs/queries';

export function TrabajoDetallePage() {
  const { jobId } = useParams();
  const userId = useUserId();
  const { data: job, isPending, error, refetch } = useJob(jobId);
  const application = useMyApplicationForJob(jobId);

  if (isPending || application.isPending) return <FullPageLoader label="Cargando el trabajo…" />;
  if (error || application.error) {
    return (
      <LoadFailed
        error={error ?? application.error}
        onRetry={() => {
          void refetch();
          void application.refetch();
        }}
      />
    );
  }

  // El RLS devuelve el trabajo solo si está disponible en mi localidad o si me postulé.
  if (!job) {
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

  const fromApplications = !!application.data;

  return (
    <Stack gap="lg">
      <BackLink
        to={fromApplications ? '/cortar/postulaciones' : '/cortar'}
        label={fromApplications ? 'Mis postulaciones' : 'Trabajos'}
      />

      <Title order={1} size="h2">
        Trabajo en {job.zone}
      </Title>

      {job.status === 'cancelado' && (
        <Alert color="gray" icon={<IconBan aria-hidden />} title="Pedido cancelado">
          {job.cancelled_by && job.cancelled_by === userId ? 'Cancelaste este trabajo.' : 'El cliente canceló este pedido.'}
        </Alert>
      )}
      {job.status === 'asignado' && application.data?.status !== 'aceptada' && (
        <Alert color="gray" icon={<IconBan aria-hidden />} title="Ya tiene quien lo corte">
          El cliente eligió a otra persona para este trabajo.
        </Alert>
      )}

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <ClientLine client={job.client} size={48} />
          <JobFacts job={job} showAgreed={application.data?.status === 'aceptada'} />
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

      {!(job.status === 'asignado' && application.data?.status === 'aceptada') && (
        <Alert color="blue" icon={<IconLock aria-hidden />}>
          La dirección exacta y el WhatsApp se comparten cuando el cliente acepta tu postulación.
        </Alert>
      )}

      <ApplicationPanel job={job} application={application.data ?? null} />
    </Stack>
  );
}
