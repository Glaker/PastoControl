import { Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconSpeakerphone } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { useUserId } from '../../auth/AuthProvider';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobForm } from '../../jobs/JobForm';
import { jobKeys } from '../../jobs/queries';
import { createJob, type JobInput } from '../../jobs/saveJob';
import { confirmAction } from '../../lib/confirm';
import { formatDateTimeLong, formatPrice } from '../../lib/format';
import { useMyProfile } from '../../profile/queries';

export function NuevoPedidoPage() {
  const userId = useUserId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();

  // RequireProfile garantiza que el perfil existe.
  if (!profile) return <FullPageLoader />;
  const { locality } = profile;

  const confirmPublish = (input: JobInput) =>
    confirmAction({
      title: '¿Publicamos el pedido?',
      confirmLabel: 'Publicar',
      confirmIcon: <IconSpeakerphone size={20} aria-hidden />,
      message: (
        <Stack gap="xs">
          <Text>Lo van a ver los cortadores de {locality.name}:</Text>
          <Text fw={700} size="lg">
            {formatPrice(input.priceArs)}
          </Text>
          <Text>{formatDateTimeLong(input.desiredAt, locality.timezone)}</Text>
          <Text>{input.zone}</Text>
          <Text size="sm" c="dimmed">
            La dirección no se muestra: solo la ve la persona que elijas.
          </Text>
        </Stack>
      ),
    });

  const publish = async (input: JobInput) => {
    const jobId = await createJob(userId, input);
    await queryClient.invalidateQueries({ queryKey: jobKeys.all });
    notifications.show({ color: 'pasto', icon: <IconCheck size={18} />, message: 'Publicamos tu pedido.' });
    navigate(`/pedir/pedido/${jobId}`, { replace: true });
  };

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Publicar un pedido
      </Title>
      <JobForm
        timeZone={locality.timezone}
        submitLabel="Publicar pedido"
        submitIcon={<IconSpeakerphone size={20} aria-hidden />}
        beforeSubmit={confirmPublish}
        onSubmit={publish}
        onCancel={() => navigate('/pedir')}
      />
    </Stack>
  );
}
