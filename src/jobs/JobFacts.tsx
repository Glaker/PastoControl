import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCalendarEvent, IconCash, IconHome, IconMapPin, IconNote, type Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { formatDateTimeLong, formatPrice } from '../lib/format';
import type { Job } from './queries';

type Props = {
  job: Job;
  /** Solo para el dueño. undefined = no se muestra; null = cargando o sin dato. */
  address?: string | null;
};

/** Datos de un trabajo, completos y sin cortar: precio, día y hora, zona, dirección y nota. */
export function JobFacts({ job, address }: Props) {
  return (
    <Stack gap="md">
      <Fact icon={IconCash} label="Precio">
        <Text fw={800} size="xl">
          {formatPrice(job.price_ars)}
        </Text>
      </Fact>
      <Fact icon={IconCalendarEvent} label="Día y hora">
        <Text size="lg">{formatDateTimeLong(job.desired_at, job.locality.timezone)}</Text>
      </Fact>
      <Fact icon={IconMapPin} label="Zona">
        <Text size="lg">{job.zone}</Text>
      </Fact>
      {address !== undefined && (
        <Fact icon={IconHome} label="Dirección (solo la ves vos)">
          <Text size="lg">{address ?? '…'}</Text>
        </Fact>
      )}
      {job.notes && (
        <Fact icon={IconNote} label="Nota">
          <Text style={{ whiteSpace: 'pre-line' }}>{job.notes}</Text>
        </Fact>
      )}
    </Stack>
  );
}

function Fact({ icon: Icon, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <ThemeIcon variant="light" size={40} radius="md" color="gray" aria-hidden>
        <Icon size={22} />
      </ThemeIcon>
      <div style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        {children}
      </div>
    </Group>
  );
}
