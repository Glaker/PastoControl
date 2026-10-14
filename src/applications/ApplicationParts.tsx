import { Badge, Group, Stack, Text } from '@mantine/core';
import { IconBan, IconCalendarEvent, IconCash, IconCircleCheck, IconClock, IconUserX, IconArrowBackUp, type Icon } from '@tabler/icons-react';
import { formatDateTime, formatPrice } from '../lib/format';
import type { ApplicationStatus, Job } from '../jobs/queries';
import type { Application } from './queries';

export const APPLICATION_STATUS: Record<ApplicationStatus, { label: string; color: string; icon: Icon }> = {
  pendiente: { label: 'Pendiente', color: 'blue', icon: IconClock },
  aceptada: { label: 'Aceptada', color: 'teal', icon: IconCircleCheck },
  rechazada: { label: 'No elegida', color: 'gray', icon: IconUserX },
  retirada: { label: 'Retirada', color: 'gray', icon: IconArrowBackUp },
  cancelada: { label: 'Pedido cancelado', color: 'gray', icon: IconBan },
};

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const { label, color, icon: Icon } = APPLICATION_STATUS[status];
  return (
    <Badge size="lg" variant="light" color={color} leftSection={<Icon size={16} aria-hidden />}>
      {label}
    </Badge>
  );
}

/** Lo que propuso el cortador: precio y horario, aclarando si son los publicados. */
export function ProposalSummary({ job, application }: { job: Job; application: Pick<Application, 'proposed_price_ars' | 'proposed_at'> }) {
  const tz = job.locality.timezone;
  return (
    <Stack gap={6}>
      <Group gap={8} wrap="nowrap" align="flex-start">
        <IconCash size={20} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
        <Text>
          <Text span fw={700}>
            {formatPrice(application.proposed_price_ars ?? job.price_ars)}
          </Text>{' '}
          <Text span c="dimmed" size="sm">
            {application.proposed_price_ars === null ? '(el publicado)' : `(publicado: ${formatPrice(job.price_ars)})`}
          </Text>
        </Text>
      </Group>
      <Group gap={8} wrap="nowrap" align="flex-start">
        <IconCalendarEvent size={20} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
        <Text>
          <Text span fw={700}>
            {formatDateTime(application.proposed_at ?? job.desired_at, tz)}
          </Text>{' '}
          <Text span c="dimmed" size="sm">
            {application.proposed_at === null ? '(el publicado)' : '(otro horario)'}
          </Text>
        </Text>
      </Group>
    </Stack>
  );
}
