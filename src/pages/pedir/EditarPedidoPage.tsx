import { Stack, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { useUserId } from '../../auth/AuthProvider';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobForm } from '../../jobs/JobForm';
import { JobUnavailable, LoadFailed } from '../../jobs/JobPageParts';
import { jobKeys, pendingCount, useJob, useJobAddress } from '../../jobs/queries';
import { updateJob, type JobInput } from '../../jobs/saveJob';

export function EditarPedidoPage() {
  const { jobId } = useParams();
  const userId = useUserId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: job, isPending, error, refetch } = useJob(jobId);
  const isOwner = !!job && job.client_id === userId;
  const address = useJobAddress(jobId, isOwner);

  if (isPending || (isOwner && address.isPending)) return <FullPageLoader label="Cargando el pedido…" />;
  if (error || address.error) {
    return (
      <LoadFailed
        error={error ?? address.error}
        onRetry={() => {
          void refetch();
          void address.refetch();
        }}
      />
    );
  }
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
  if (job.status !== 'publicado') {
    return (
      <JobUnavailable
        title="Este pedido ya no se puede editar"
        message="Solo se editan los pedidos publicados."
        backTo={`/pedir/pedido/${job.id}`}
        backLabel="Volver al pedido"
      />
    );
  }

  if (pendingCount(job) > 0) {
    return (
      <JobUnavailable
        title="Este pedido ya tiene postulaciones"
        message="Los cortadores se postularon a lo que publicaste, así que no se puede editar. Si necesitás cambiarlo, cancelalo y publicalo de nuevo."
        backTo={`/pedir/pedido/${job.id}`}
        backLabel="Volver al pedido"
      />
    );
  }

  const save = async (input: JobInput) => {
    await updateJob(userId, job.id, input, job.photo_paths);
    await queryClient.invalidateQueries({ queryKey: jobKeys.all });
    notifications.show({ color: 'pasto', icon: <IconCheck size={18} />, message: 'Guardamos los cambios.' });
    navigate(`/pedir/pedido/${job.id}`, { replace: true });
  };

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Editar pedido
      </Title>
      <JobForm
        timeZone={job.locality.timezone}
        initial={{
          zone: job.zone,
          address: address.data ?? '',
          priceArs: job.price_ars,
          desiredAt: job.desired_at,
          notes: job.notes ?? '',
          photoPaths: job.photo_paths,
        }}
        submitLabel="Guardar cambios"
        submitIcon={<IconCheck size={20} aria-hidden />}
        onSubmit={save}
        onCancel={() => navigate(`/pedir/pedido/${job.id}`)}
      />
    </Stack>
  );
}
