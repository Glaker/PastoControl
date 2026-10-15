import { Button, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconCalendarEvent, IconCash, IconHome, IconMapPin, IconNavigation, IconNote, type Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { formatDateTimeLong, formatPrice } from '../lib/format';
import { directionsUrl } from '../lib/geo';
import { jobAddress, jobBetween, jobPoint, jobTerms, type Job } from './queries';

type Props = {
  job: Job;
  /** Mostrar el acuerdo (solo a las dos partes). A los demás postulantes, lo publicado. */
  showAgreed?: boolean;
  /** Botón "Cómo llegar" (para el cortador): abre la navegación del celular con el pin. */
  showDirections?: boolean;
};

/** Datos de un trabajo, completos y sin cortar: precio, día y hora, dirección, zona y nota. */
export function JobFacts({ job, showAgreed = true, showDirections = false }: Props) {
  const point = jobPoint(job);
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
      <Fact icon={IconHome} label="Dirección">
        <Text size="lg">{jobAddress(job)}</Text>
        {job.address_between && <Text c="dimmed">{jobBetween(job)}</Text>}
        {showDirections && point && (
          <Button
            component="a"
            href={directionsUrl(point)}
            target="_blank"
            rel="noopener noreferrer"
            mt="sm"
            leftSection={<IconNavigation size={22} aria-hidden />}
          >
            Cómo llegar
          </Button>
        )}
      </Fact>
      {job.zone && (
        <Fact icon={IconMapPin} label="Zona">
          <Text size="lg">{job.zone}</Text>
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
