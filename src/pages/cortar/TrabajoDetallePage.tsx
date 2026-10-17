import { Alert, Button, Card, Stack, Text, Title } from '@mantine/core';
import { IconBan, IconClipboardList, IconLock, IconUserCircle } from '@tabler/icons-react';
import { Link, useParams } from 'react-router';
import { ApplicationPanel } from '../../applications/ApplicationPanel';
import { useMyApplicationForJob } from '../../applications/queries';
import { useUserId } from '../../auth/AuthProvider';
import { DetailLayout } from '../../components/DetailLayout';
import { FullPageLoader } from '../../components/FullPageLoader';
import { ClientLine } from '../../jobs/JobCard';
import { JobFacts } from '../../jobs/JobFacts';
import { JobLocationCard } from '../../jobs/JobLocationCard';
import { BackLink, JobUnavailable, LoadFailed } from '../../jobs/JobPageParts';
import { JobPhotos } from '../../jobs/JobPhotos';
import { jobAddress, useJob } from '../../jobs/queries';

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

  // El RLS devuelve el trabajo solo si está publicado y no venció (para cualquier cortador) o si me postulé.
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
  // Si me eligieron, el contacto (con "Ver su perfil") está en AssignedPanel: no se repite el botón acá.
  const showsContact =
    (job.status === 'asignado' || job.status === 'realizado') && application.data?.status === 'aceptada';

  return (
    <Stack gap="lg">
      <BackLink
        to={fromApplications ? '/cortar/postulaciones' : '/cortar'}
        label={fromApplications ? 'Mis postulaciones' : 'Trabajos'}
      />

      <Title order={1} size="h2">
        {job.address_street ? `Trabajo en ${jobAddress(job)}` : 'Trabajo'}
      </Title>

      {job.status === 'cancelado' && (
        <Alert color="gray" icon={<IconBan aria-hidden />} title="Pedido cancelado">
          {job.agreement?.cancelled_by === userId ? 'Cancelaste este trabajo.' : 'El cliente canceló este pedido.'}
        </Alert>
      )}
      {(job.status === 'asignado' || job.status === 'realizado') && application.data?.status !== 'aceptada' && (
        <Alert color="gray" icon={<IconBan aria-hidden />} title="Ya tiene quien lo corte">
          El cliente eligió a otra persona para este trabajo.
        </Alert>
      )}

      <DetailLayout
        info={
          <>
            <Card withBorder radius="lg" padding="lg">
              <Stack gap="md">
                <ClientLine client={job.client} size={48} />
                {!showsContact && job.client && (
                  <Button
                    component={Link}
                    to={`/persona/${job.client.id}`}
                    variant="default"
                    leftSection={<IconUserCircle size={20} aria-hidden />}
                  >
                    Ver el perfil de {job.client.first_name}
                  </Button>
                )}
                <JobFacts
                  job={job}
                  showAgreed={application.data?.status === 'aceptada'}
                  showDirections={job.status === 'publicado' || application.data?.status === 'aceptada'}
                />
              </Stack>
            </Card>
            <JobLocationCard job={job} />

            {job.photo_paths.length > 0 && (
              <Stack gap="xs">
                <Title order={2} size="h4">
                  Fotos del terreno
                </Title>
                <JobPhotos paths={job.photo_paths} />
              </Stack>
            )}
          </>
        }
        actions={
          <>
            {!showsContact && job.client && (
              <Alert color="blue" icon={<IconLock aria-hidden />}>
                El nombre completo y el WhatsApp del cliente se comparten cuando acepta tu postulación.
              </Alert>
            )}

            <ApplicationPanel job={job} application={application.data ?? null} />
          </>
        }
      />
    </Stack>
  );
}
