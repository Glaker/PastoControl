import { Alert, Button, Card, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBan, IconCheck, IconCircleCheck, IconClockExclamation, IconPencil, IconRepeat } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useUserId } from '../../auth/AuthProvider';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobFacts } from '../../jobs/JobFacts';
import { BackLink, JobUnavailable, LoadFailed } from '../../jobs/JobPageParts';
import { JobPhotos } from '../../jobs/JobPhotos';
import { JobStatusBadge } from '../../jobs/JobStatusBadge';
import { jobDisplayStatus, jobKeys, pendingCount, useJob } from '../../jobs/queries';
import { applicationKeys } from '../../applications/queries';
import { ApplicantsList } from '../../assignment/ApplicantsList';
import { AssignedPanel } from '../../assignment/AssignedPanel';
import { cancelJob } from '../../jobs/saveJob';
import { confirmAction } from '../../lib/confirm';
import { friendlyError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';

export function PedidoDetallePage() {
  const { jobId } = useParams();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const { data: job, isPending, error, refetch } = useJob(jobId);
  const isOwner = !!job && job.client_id === userId;
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isPending) return <FullPageLoader label="Cargando el pedido…" />;
  if (error) return <LoadFailed error={error} onRetry={() => void refetch()} />;
  if (!job || !isOwner) {
    return (
      <JobUnavailable
        title="No encontramos este pedido"
        message="Puede que el link esté mal o que el pedido no sea tuyo."
        backTo="/pedir"
        backLabel="Ir a mis pedidos"
      />
    );
  }

  const status = jobDisplayStatus(job);
  const isPublished = job.status === 'publicado';
  const pending = isPublished ? pendingCount(job) : 0;
  // Con postulaciones pendientes no se edita (los cortadores se postularon a lo publicado).
  const editable = isPublished && pending === 0;
  const cancelledByCutter =
    job.status === 'cancelado' && !!job.agreement?.cancelled_by && job.agreement.cancelled_by === job.agreement.cutter_id;

  const onCancel = async () => {
    const ok = await confirmAction({
      title: '¿Cancelar este pedido?',
      message:
        pending > 0
          ? `Los cortadores ya no lo van a ver y ${pending === 1 ? 'la persona que se postuló recibe' : `las ${pending} personas que se postularon reciben`} un aviso. No se puede deshacer.`
          : 'Los cortadores ya no lo van a ver. No se puede deshacer.',
      confirmLabel: 'Sí, cancelar pedido',
      cancelLabel: 'No, volver',
      danger: true,
      confirmIcon: <IconBan size={20} aria-hidden />,
    });
    if (!ok) return;
    setActionError(null);
    setCancelling(true);
    try {
      await cancelJob(job.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: jobKeys.all }),
        queryClient.invalidateQueries({ queryKey: applicationKeys.all }),
      ]);
      notifications.show({ color: 'gray', icon: <IconCheck size={18} />, message: 'Cancelaste el pedido.' });
    } catch (e) {
      setActionError(friendlyError(e, 'No pudimos cancelar el pedido. Probá de nuevo.'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Stack gap="lg">
      <BackLink to="/pedir" label="Mis pedidos" />

      <Group justify="space-between" align="center" gap="xs">
        <Title order={1} size="h2">
          Tu pedido
        </Title>
        <JobStatusBadge status={status} />
      </Group>

      {status === 'vencido' && (
        <Alert color="orange" icon={<IconClockExclamation aria-hidden />} title="Pasó la fecha">
          Nadie lo ve en la lista de trabajos. Editalo con una fecha nueva o cancelalo.
        </Alert>
      )}
      {job.status === 'cancelado' && job.cancelled_at && (
        <Alert color="gray" icon={<IconBan aria-hidden />} title="Pedido cancelado">
          {cancelledByCutter
            ? `La persona que elegiste canceló el trabajo el ${formatDateTime(job.cancelled_at, job.locality.timezone)}. Si querés, publicalo de nuevo.`
            : `Lo cancelaste el ${formatDateTime(job.cancelled_at, job.locality.timezone)}.`}
        </Alert>
      )}
      {job.status === 'asignado' && (
        <Alert color="violet" icon={<IconCircleCheck aria-hidden />} title="Trabajo asignado">
          Ya elegiste quién corta el pasto. Coordinen los detalles por WhatsApp. Cuando esté hecho,
          cualquiera de los dos lo marca como realizado.
        </Alert>
      )}
      {job.status === 'realizado' && (
        <Alert color="teal" icon={<IconCircleCheck aria-hidden />} title="Trabajo realizado">
          ¡Listo! Si querés, calificá a quien cortó el pasto y volvé a publicar el pedido cuando lo necesites.
        </Alert>
      )}

      <Card withBorder radius="md" padding="lg">
        <JobFacts job={job} />
      </Card>

      {job.photo_paths.length > 0 && (
        <Stack gap="xs">
          <Title order={2} size="h4">
            Fotos
          </Title>
          <JobPhotos paths={job.photo_paths} />
        </Stack>
      )}

      {isPublished && <ApplicantsList job={job} />}

      {(job.status === 'asignado' || job.status === 'realizado') && <AssignedPanel job={job} viewer="cliente" />}

      {(job.status === 'cancelado' || job.status === 'realizado') && (
        <Button
          component={Link}
          to={`/pedir/nuevo?desde=${job.id}`}
          leftSection={<IconRepeat size={20} aria-hidden />}
        >
          Volver a publicar
        </Button>
      )}

      {isPublished && pending > 0 && (
        <Text size="sm" c="dimmed">
          Como ya hay postulaciones, el pedido no se puede editar. Si necesitás cambiarlo, cancelalo y
          publicalo de nuevo.
        </Text>
      )}

      {editable && (
        <Button
          component={Link}
          to={`/pedir/pedido/${job.id}/editar`}
          variant="default"
          leftSection={<IconPencil size={20} aria-hidden />}
        >
          Editar pedido
        </Button>
      )}

      {actionError && (
        <Alert color="red" title="No se pudo" role="alert">
          {actionError}
        </Alert>
      )}

      {isPublished && (
        <>
          <Divider mt="xl" label="Acciones importantes" labelPosition="left" />
          <Button
            variant="outline"
            color="red"
            loading={cancelling}
            leftSection={<IconBan size={20} aria-hidden />}
            onClick={() => void onCancel()}
          >
            Cancelar pedido
          </Button>
        </>
      )}
    </Stack>
  );
}
