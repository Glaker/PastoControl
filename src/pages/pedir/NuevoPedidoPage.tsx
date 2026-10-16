import { Alert, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconRepeat, IconSpeakerphone } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { useUserId } from '../../auth/AuthProvider';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobForm } from '../../jobs/JobForm';
import { LoadFailed } from '../../jobs/JobPageParts';
import { jobAddress, jobKeys, jobPoint, useJob } from '../../jobs/queries';
import { createJob, type JobInput } from '../../jobs/saveJob';
import { confirmAction } from '../../lib/confirm';
import { formatDateTimeLong, formatPrice } from '../../lib/format';
import { localityCenter } from '../../lib/geo';
import { useMyProfile } from '../../profile/queries';

export function NuevoPedidoPage() {
  const userId = useUserId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  // Volver a publicar: /pedir/nuevo?desde=<id de un pedido propio cancelado o realizado>.
  const [params] = useSearchParams();
  const fromId = params.get('desde') ?? undefined;
  const source = useJob(fromId);
  const sourceOk = !!source.data && source.data.client_id === userId &&
    (source.data.status === 'cancelado' || source.data.status === 'realizado');

  // RequireProfile garantiza que el perfil existe.
  if (!profile) return <FullPageLoader />;
  if (fromId && source.isPending) return <FullPageLoader label="Cargando el pedido anterior…" />;
  if (fromId && source.error) return <LoadFailed error={source.error} onRetry={() => void source.refetch()} />;
  const { locality } = profile;
  const from = sourceOk ? source.data! : null;

  const confirmPublish = (input: JobInput) =>
    confirmAction({
      title: '¿Publicamos el pedido?',
      confirmLabel: 'Publicar',
      confirmIcon: <IconSpeakerphone size={20} aria-hidden />,
      message: (
        <Stack gap="xs">
          <Text>Lo van a ver los cortadores que buscan trabajo cerca:</Text>
          <Text fw={700} size="lg">
            {formatPrice(input.priceArs)}
          </Text>
          <Text>{formatDateTimeLong(input.desiredAt, locality.timezone)}</Text>
          <Text>
            {input.street} {input.number}
            {input.between && `, ${input.between}`}
          </Text>
          <Text size="sm" c="dimmed">
            La dirección y la ubicación las ven los cortadores. Tu apellido y tu WhatsApp, solo la persona que elijas.
          </Text>
        </Stack>
      ),
    });

  const publish = async (input: JobInput) => {
    const jobId = await createJob(userId, input, from?.id);
    await queryClient.invalidateQueries({ queryKey: jobKeys.all });
    notifications.show({ color: 'pasto', icon: <IconCheck size={18} />, message: 'Publicamos tu pedido.' });
    navigate(`/pedir/pedido/${jobId}`, { replace: true });
  };

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        {from ? 'Volver a publicar' : 'Publicar un pedido'}
      </Title>
      {from && (
        <Alert color="blue" icon={<IconRepeat aria-hidden />}>
          Copiamos los datos del pedido de {jobAddress(from)}. Revisalos y elegí un día y una hora nuevos.
          {!jobPoint(from) && ' Marcá también la ubicación en el mapa.'}
        </Alert>
      )}
      {fromId && !from && (
        <Alert color="orange">
          No encontramos el pedido para volver a publicar (tiene que ser tuyo y estar cancelado o realizado).
          Podés cargar uno nuevo.
        </Alert>
      )}
      <JobForm
        key={from?.id ?? 'nuevo'}
        timeZone={locality.timezone}
        defaultCenter={localityCenter(locality)}
        copyPhotos={!!from}
        initial={
          from
            ? {
                location: jobPoint(from),
                street: from.address_street ?? '',
                number: from.address_number ?? '',
                between: from.address_between ?? '',
                zone: from.zone ?? '',
                priceArs: from.price_ars,
                // Sin fecha: el pedido anterior ya pasó o se canceló; se elige una nueva.
                desiredAt: null,
                notes: from.notes ?? '',
                photoPaths: from.photo_paths,
              }
            : undefined
        }
        submitLabel="Publicar pedido"
        submitIcon={<IconSpeakerphone size={20} aria-hidden />}
        beforeSubmit={confirmPublish}
        onSubmit={publish}
        onCancel={() => navigate('/pedir')}
      />
    </Stack>
  );
}
