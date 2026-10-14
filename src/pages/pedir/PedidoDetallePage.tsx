import { Alert, Button, Card, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBan, IconCheck, IconClockExclamation, IconPencil, IconUsers } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useUserId } from '../../auth/AuthProvider';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobFacts } from '../../jobs/JobFacts';
import { BackLink, JobUnavailable, LoadFailed } from '../../jobs/JobPageParts';
import { JobPhotos } from '../../jobs/JobPhotos';
import { JobStatusBadge } from '../../jobs/JobStatusBadge';
import { jobDisplayStatus, jobKeys, useJob, useJobAddress } from '../../jobs/queries';
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
  const { data: address } = useJobAddress(jobId, isOwner);
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
  const editable = job.status === 'publicado';

  const onCancel = async () => {
    const ok = await confirmAction({
      title: '¿Cancelar este pedido?',
      message: 'Los cortadores ya no lo van a ver. No se puede deshacer.',
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
      await queryClient.invalidateQueries({ queryKey: jobKeys.all });
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
          Lo cancelaste el {formatDateTime(job.cancelled_at, job.locality.timezone)}.
        </Alert>
      )}

      <Card withBorder radius="md" padding="lg">
        <JobFacts job={job} address={address ?? null} />
      </Card>

      {job.photo_paths.length > 0 && (
        <Stack gap="xs">
          <Title order={2} size="h4">
            Fotos
          </Title>
          <JobPhotos paths={job.photo_paths} />
        </Stack>
      )}

      {job.status === 'publicado' && (
        <Card withBorder radius="md" padding="lg">
          <Group gap="sm" wrap="nowrap" align="flex-start">
            <IconUsers size={24} aria-hidden style={{ flex: 'none' }} />
            <Text c="dimmed">Los postulantes aparecen acá. Se completa en la Fase 3.</Text>
          </Group>
        </Card>
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

      {editable && (
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
