import { Badge } from '@mantine/core';
import { IconBan, IconCircleCheck, IconClockExclamation, IconSpeakerphone, IconUserCheck, type Icon } from '@tabler/icons-react';
import type { JobDisplayStatus } from './queries';

export const JOB_STATUS: Record<JobDisplayStatus, { label: string; color: string; icon: Icon }> = {
  publicado: { label: 'Publicado', color: 'blue', icon: IconSpeakerphone },
  vencido: { label: 'Vencido', color: 'orange', icon: IconClockExclamation },
  asignado: { label: 'Asignado', color: 'violet', icon: IconUserCheck },
  realizado: { label: 'Realizado', color: 'teal', icon: IconCircleCheck },
  cancelado: { label: 'Cancelado', color: 'gray', icon: IconBan },
};

export function JobStatusBadge({ status }: { status: JobDisplayStatus }) {
  const { label, color, icon: Icon } = JOB_STATUS[status];
  return (
    <Badge size="lg" variant="light" color={color} leftSection={<Icon size={16} aria-hidden />}>
      {label}
    </Badge>
  );
}
