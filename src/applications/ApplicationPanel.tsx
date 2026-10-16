import { Alert, Button, Card, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp, IconCheck, IconConfetti, IconInfoCircle, IconPencil, IconSend } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { confirmAction } from '../lib/confirm';
import dayjs from '../lib/dayjs';
import { friendlyError } from '../lib/errors';
import { jobDisplayStatus, jobKeys, type Job } from '../jobs/queries';
import { AssignedPanel } from '../assignment/AssignedPanel';
import { DELETED_USER } from '../profile/queries';
import { ApplicationForm } from './ApplicationForm';
import { ApplicationStatusBadge, ProposalSummary } from './ApplicationParts';
import { applicationKeys, withdrawApplication, type Application } from './queries';

type Props = { job: Job; application: Application | null };

/** Sección del detalle del trabajo para el cortador: postularse, ver, editar o retirar su postulación. */
export function ApplicationPanel({ job, application }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = jobDisplayStatus(job) === 'publicado';
  const pending = application?.status === 'pendiente';
  const canApply = available && (!application || application.status === 'retirada');

  if (editing) {
    return (
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Title order={2} size="h3">
            {pending ? 'Cambiar mi postulación' : 'Postularme'}
          </Title>
          <ApplicationForm
            job={job}
            existing={pending ? application : undefined}
            onDone={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </Stack>
      </Card>
    );
  }

  const onWithdraw = async () => {
    if (!application) return;
    const ok = await confirmAction({
      title: '¿Retirar tu postulación?',
      message: 'El cliente ya no la va a ver. Mientras el pedido siga publicado, podés volver a postularte.',
      confirmLabel: 'Sí, retirar',
      cancelLabel: 'No, volver',
      danger: true,
      confirmIcon: <IconArrowBackUp size={20} aria-hidden />,
    });
    if (!ok) return;
    setError(null);
    setWithdrawing(true);
    try {
      await withdrawApplication(application.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationKeys.all }),
        queryClient.invalidateQueries({ queryKey: jobKeys.all }),
      ]);
      notifications.show({ color: 'gray', icon: <IconCheck size={18} />, message: 'Retiraste tu postulación.' });
    } catch (e) {
      setError(friendlyError(e, 'No pudimos retirar tu postulación. Probá de nuevo.'));
    } finally {
      setWithdrawing(false);
    }
  };

  if (!application || application.status === 'retirada') {
    return (
      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          {application?.status === 'retirada' && (
            <Text c="dimmed">Retiraste tu postulación.{canApply ? ' Si querés, podés volver a postularte.' : ''}</Text>
          )}
          {canApply ? (
            <>
              <Text>Podés aceptar el precio y el horario publicados, o proponer otros.</Text>
              <Button leftSection={<IconSend size={20} aria-hidden />} onClick={() => setEditing(true)}>
                {application ? 'Volver a postularme' : 'Postularme'}
              </Button>
            </>
          ) : (
            !application && <Text c="dimmed">Este trabajo ya no recibe postulaciones.</Text>
          )}
        </Stack>
      </Card>
    );
  }

  // Me eligieron: contacto del cliente (dirección y WhatsApp), marcar realizado / calificar, cancelar.
  if (application.status === 'aceptada' && (job.status === 'asignado' || job.status === 'realizado')) {
    const clientName = job.client?.first_name ?? DELETED_USER;
    return (
      <Stack gap="md">
        {job.status === 'asignado' ? (
          <Alert color="teal" icon={<IconConfetti aria-hidden />} title="¡Te eligieron!">
            {clientName} aceptó tu postulación. Escribile por WhatsApp para coordinar. Cuando
            termines, cualquiera de los dos lo marca como realizado.
          </Alert>
        ) : (
          <Alert color="teal" icon={<IconConfetti aria-hidden />} title="Trabajo realizado">
            {job.client ? `¡Buen trabajo! Si querés, calificá a ${clientName}.` : '¡Buen trabajo!'}
          </Alert>
        )}
        <AssignedPanel job={job} viewer="cortador" />
      </Stack>
    );
  }

  // El cliente puede aceptar una postulación de un pedido vencido si el horario propuesto es futuro.
  const proposedFuture = !!application.proposed_at && dayjs(application.proposed_at).isAfter(dayjs());

  return (
    <Stack gap="md">
      <Card withBorder radius="md" padding="lg">
        <Stack gap="sm">
          <Group justify="space-between" gap="xs">
            <Title order={2} size="h3">
              Tu postulación
            </Title>
            <ApplicationStatusBadge status={application.status} />
          </Group>
          <ProposalSummary job={job} application={application} />
          {application.status === 'cancelada' && (
            <Text c="dimmed">
              {job.agreement?.cancelled_by === application.cutter_id
                ? 'Cancelaste este trabajo.'
                : 'El cliente canceló el pedido.'}
            </Text>
          )}
          {application.status === 'rechazada' && <Text c="dimmed">El cliente eligió a otra persona.</Text>}
          {pending && (
            <Text size="sm" c="dimmed">
              Si el cliente te elige, te avisamos y se comparten la dirección y los WhatsApp.
            </Text>
          )}
        </Stack>
      </Card>

      {pending && jobDisplayStatus(job) === 'vencido' && (
        <Alert color="orange" icon={<IconInfoCircle aria-hidden />} title="Pasó la fecha publicada">
          {proposedFuture
            ? 'El cliente todavía puede elegirte, porque propusiste un horario que no pasó.'
            : 'Para que el cliente todavía pueda elegirte, proponé un horario que no haya pasado.'}
        </Alert>
      )}

      {pending && (
        <Button variant="default" leftSection={<IconPencil size={20} aria-hidden />} onClick={() => setEditing(true)}>
          Cambiar mi propuesta
        </Button>
      )}

      {error && (
        <Alert color="red" title="No se pudo" role="alert">
          {error}
        </Alert>
      )}

      {pending && (
        <>
          <Divider mt="lg" label="Acciones importantes" labelPosition="left" />
          <Button
            variant="outline"
            color="red"
            loading={withdrawing}
            leftSection={<IconArrowBackUp size={20} aria-hidden />}
            onClick={() => void onWithdraw()}
          >
            Retirar postulación
          </Button>
        </>
      )}
    </Stack>
  );
}
