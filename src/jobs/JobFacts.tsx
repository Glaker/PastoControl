import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCalendarEvent, IconCash, IconHome, IconMapPin, IconNote, type Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { formatDateTimeLong, formatPrice } from '../lib/format';
import { jobTerms, type Job } from './queries';

type Props = {
  job: Job;
  /** Solo para el dueño. undefined = no se muestra; null = cargando o sin dato. */
  address?: string | null;
  /** Mostrar el acuerdo (solo a las dos partes). A los demás postulantes, lo publicado. */
  showAgreed?: boolean;
};

/** Datos de un trabajo, completos y sin cortar: precio, día y hora, zona, dirección y nota. */
export function JobFacts({ job, address, showAgreed = true }: Props) {
  const tz = job.locality.timezone;
  // Asignado o realizado: valen el precio y el horario acordados (pueden ser los de la contraoferta).
  const terms = showAgreed ? jobTerms(job) : { agreed: false, priceArs: job.price_ars, at: job.desired_at };
  return (
    <Stack gap="md">
      <Fact icon={IconCash} label={terms.agreed ? 'Precio acordado' : 'Precio'}>
        <Text fw={800} size="xl">
          {formatPrice(terms.priceArs)}
        </Text>
        {terms.agreed && terms.priceArs !== job.price_ars && (
          <Text size="sm" c="dimmed">
            Publicado: {formatPrice(job.price_ars)}
          </Text>
        )}
      </Fact>
      <Fact icon={IconCalendarEvent} label={terms.agreed ? 'Día y hora acordados' : 'Día y hora'}>
        <Text size="lg">{formatDateTimeLong(terms.at, tz)}</Text>
        {terms.agreed && terms.at !== job.desired_at && (
          <Text size="sm" c="dimmed">
            Publicado: {formatDateTimeLong(job.desired_at, tz)}
          </Text>
        )}
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
