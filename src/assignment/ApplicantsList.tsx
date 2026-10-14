import { Alert, Avatar, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconRefresh, IconUserCheck, IconUsers } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApplicationStatusBadge, ProposalSummary } from '../applications/ApplicationParts';
import { confirmAction } from '../lib/confirm';
import dayjs from '../lib/dayjs';
import { friendlyError } from '../lib/errors';
import { formatDateTimeLong, formatPrice } from '../lib/format';
import { jobKeys, type Job } from '../jobs/queries';
import { useAvatarUrl } from '../profile/queries';
import { acceptApplication, useJobApplicants, type Applicant } from './queries';

/** Postulantes de un pedido publicado: el cliente elige a uno (aceptación atómica). */
export function ApplicantsList({ job }: { job: Job }) {
  const queryClient = useQueryClient();
  const { data: applicants, isPending, error, refetch, isRefetching } = useJobApplicants(job.id, true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pending = (applicants ?? []).filter((a) => a.status === 'pendiente');
  const others = (applicants ?? []).filter((a) => a.status !== 'pendiente');

  const choose = async (a: Applicant) => {
    const name = `${a.first_name} ${a.last_initial}.`;
    const price = a.proposed_price_ars ?? job.price_ars;
    const at = a.proposed_at ?? job.desired_at;
    const ok = await confirmAction({
      title: `¿Elegís a ${name}?`,
      confirmLabel: `Sí, elegir a ${a.first_name}`,
      confirmIcon: <IconUserCheck size={20} aria-hidden />,
      message: (
        <Stack gap="xs">
          <Text fw={700} size="lg">
            {formatPrice(price)}
          </Text>
          <Text>{formatDateTimeLong(at, job.locality.timezone)}</Text>
          <Text size="sm" c="dimmed">
            Se comparten la dirección y los WhatsApp entre ustedes dos. A las demás personas que se
            postularon les avisamos que elegiste a otra.
          </Text>
        </Stack>
      ),
    });
    if (!ok) return;

    setActionError(null);
    setAccepting(a.application_id);
    try {
      await acceptApplication(a.application_id, a.updated_at);
      await queryClient.invalidateQueries({ queryKey: jobKeys.all });
      notifications.show({ color: 'pasto', icon: <IconUserCheck size={18} />, message: `Elegiste a ${name}. Ya pueden hablar por WhatsApp.` });
    } catch (e) {
      setActionError(friendlyError(e, 'No pudimos confirmar tu elección. Probá de nuevo.'));
      // Puede que la postulación haya cambiado, se haya retirado o que el pedido ya no esté
      // publicado: se recarga la lista para mostrar lo actual junto con el mensaje.
      void refetch();
    } finally {
      setAccepting(null);
    }
  };

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap">
          <IconUsers size={24} aria-hidden style={{ flex: 'none' }} />
          <Title order={2} size="h3">
            {pending.length === 0
              ? 'Todavía nadie se postuló'
              : pending.length === 1
                ? '1 persona se postuló'
                : `${pending.length} personas se postularon`}
          </Title>
        </Group>

        {isPending && <Text c="dimmed">Cargando postulantes…</Text>}
        {error && (
          <Alert color="red" icon={<IconAlertTriangle aria-hidden />}>
            {friendlyError(error)}
          </Alert>
        )}
        {applicants && pending.length === 0 && (
          <Text size="sm" c="dimmed">
            Te avisamos en «Avisos» cuando alguien se postule.
          </Text>
        )}

        {actionError && (
          <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="No se pudo elegir" role="alert">
            {actionError}
          </Alert>
        )}

        {pending.map((a) => (
          <ApplicantCard
            key={a.application_id}
            applicant={a}
            job={job}
            accepting={accepting === a.application_id}
            disabled={accepting !== null}
            onChoose={() => void choose(a)}
          />
        ))}

        {others.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" fw={600} c="dimmed">
              Otras postulaciones
            </Text>
            {others.map((a) => (
              <ApplicantCard key={a.application_id} applicant={a} job={job} />
            ))}
          </Stack>
        )}

        {applicants && (
          <Button
            variant="subtle"
            loading={isRefetching}
            leftSection={<IconRefresh size={20} aria-hidden />}
            onClick={() => void refetch()}
          >
            Actualizar postulantes
          </Button>
        )}
      </Stack>
    </Card>
  );
}

function ApplicantCard({
  applicant: a,
  job,
  accepting,
  disabled,
  onChoose,
}: {
  applicant: Applicant;
  job: Job;
  accepting?: boolean;
  disabled?: boolean;
  onChoose?: () => void;
}) {
  const { data: avatarUrl } = useAvatarUrl(a.avatar_path);
  const at = a.proposed_at ?? job.desired_at;
  // Con el pedido vencido solo se puede elegir a quien propuso un horario futuro.
  const timePassed = !dayjs(at).isAfter(dayjs());

  return (
    <Card withBorder radius="md" padding="md" bg="gray.0">
      <Stack gap="sm">
        <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Avatar src={avatarUrl ?? null} size={48} radius={999} color="pasto" alt="">
              {`${a.first_name.charAt(0)}${a.last_initial}`}
            </Avatar>
            <Text fw={700}>
              {a.first_name} {a.last_initial}.
            </Text>
          </Group>
          {a.status !== 'pendiente' && <ApplicationStatusBadge status={a.status} />}
        </Group>
        <ProposalSummary job={job} application={a} />
        <Text size="sm" c="dimmed">
          Calificaciones y trabajos realizados: se suman en la Fase 5.
        </Text>
        {onChoose && a.status === 'pendiente' && (
          <>
            <Button
              leftSection={<IconUserCheck size={20} aria-hidden />}
              loading={accepting}
              disabled={disabled || timePassed}
              onClick={onChoose}
            >
              Elegir a {a.first_name}
            </Button>
            {timePassed && (
              <Text size="sm" c="orange.9">
                El horario de esta postulación ya pasó: no se puede elegir.
              </Text>
            )}
          </>
        )}
      </Stack>
    </Card>
  );
}
