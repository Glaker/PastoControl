import { Alert, Avatar, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconRefresh, IconScissors, IconUserCheck, IconUserCircle, IconUserOff, IconUsers } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { ApplicationStatusBadge, ProposalSummary } from '../applications/ApplicationParts';
import { confirmAction } from '../lib/confirm';
import dayjs from '../lib/dayjs';
import { friendlyError } from '../lib/errors';
import { formatDateTimeLong, formatPrice } from '../lib/format';
import { jobKeys, type Job } from '../jobs/queries';
import { DELETED_USER, displayName, useAvatarUrl } from '../profile/queries';
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
    const name = displayName(a);
    const price = a.proposed_price_ars ?? job.price_ars;
    const at = a.proposed_at ?? job.desired_at;
    const ok = await confirmAction({
      title: `¿Elegís a ${name}?`,
      confirmLabel: `Sí, elegir a ${a.first_name ?? DELETED_USER}`,
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
  const deleted = a.cutter_id === null;
  // Con el pedido vencido solo se puede elegir a quien propuso un horario futuro.
  const timePassed = !dayjs(at).isAfter(dayjs());

  return (
    <Card withBorder radius="md" padding="md" bg="gray.0">
      <Stack gap="sm">
        <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <Avatar src={avatarUrl ?? null} size={48} radius={999} color={deleted ? 'gray' : 'pasto'} alt="">
              {deleted ? <IconUserOff size={24} aria-hidden /> : `${a.first_name?.charAt(0)}${a.last_initial}`}
            </Avatar>
            <Text fw={700}>{displayName(a)}</Text>
          </Group>
          {a.status !== 'pendiente' && <ApplicationStatusBadge status={a.status} />}
        </Group>
        <ProposalSummary job={job} application={a} />
        {!deleted && (
          <Group gap={6} wrap="nowrap" align="flex-start">
            <IconScissors size={18} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
            <Text size="sm">
              {a.done_jobs === 1 ? '1 trabajo realizado' : `${a.done_jobs ?? 0} trabajos realizados`}
              {' · '}
              {a.yes_pct !== null
                ? `${a.yes_pct} % volvería a trabajar con ${a.first_name}`
                : 'todavía sin suficientes calificaciones'}
            </Text>
          </Group>
        )}
        {!deleted && (
          <Button
            component={Link}
            to={`/persona/${a.cutter_id}`}
            variant="default"
            leftSection={<IconUserCircle size={20} aria-hidden />}
          >
            Ver el perfil de {a.first_name}
          </Button>
        )}
        {onChoose && a.status === 'pendiente' && !deleted && (
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
