import { Avatar, Badge, Card, Group, Stack, Text } from '@mantine/core';
import { IconCalendarEvent, IconChevronRight, IconMapPin, IconPhoto, IconSend, IconUsers } from '@tabler/icons-react';
import { Link } from 'react-router';
import { formatDateTime, formatPrice } from '../lib/format';
import { displayName, useAvatarUrl } from '../profile/queries';
import { JobStatusBadge } from './JobStatusBadge';
import { jobDisplayStatus, jobTerms, pendingCount, type Job } from './queries';
import classes from './jobs.module.css';

type Props = {
  job: Job;
  to: string;
  /** Mis pedidos: muestra el estado. Trabajos disponibles: muestra quién publica. */
  variant: 'owner' | 'cutter';
  thumbUrl?: string;
};

export function JobCard({ job, to, variant, thumbUrl }: Props) {
  const tz = job.locality.timezone;
  const terms = jobTerms(job);
  return (
    <Card component={Link} to={to} withBorder radius="md" padding="md" className={classes.card}>
      <Stack gap="xs">
        {variant === 'owner' && (
          <Group gap="xs">
            <JobStatusBadge status={jobDisplayStatus(job)} />
            <PendingBadge count={job.status === 'publicado' ? pendingCount(job) : 0} />
          </Group>
        )}
        {variant === 'cutter' && <ClientLine client={job.client} />}
        {/* Con la sesión de un cortador, el RLS solo trae su propia postulación. */}
        {variant === 'cutter' && job.applications.some((a) => a.status === 'pendiente') && (
          <Badge size="lg" variant="light" color="pasto" leftSection={<IconSend size={16} aria-hidden />}>
            Te postulaste
          </Badge>
        )}

        <Group align="flex-start" wrap="nowrap" gap="sm">
          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
            <Text fw={800} size="xl">
              {formatPrice(terms.priceArs)}
              {terms.agreed && (
                <Text span size="sm" fw={600} c="dimmed">
                  {' '}
                  (acordado)
                </Text>
              )}
            </Text>
            <Group gap={6} wrap="nowrap" align="flex-start">
              <IconCalendarEvent size={20} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
              <Text>{formatDateTime(terms.at, tz)}</Text>
            </Group>
            <Group gap={6} wrap="nowrap" align="flex-start">
              <IconMapPin size={20} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
              <Text>{job.zone}</Text>
            </Group>
          </Stack>
          {thumbUrl && (
            <div className={classes.cardThumb}>
              <img src={thumbUrl} alt="" className={classes.thumbImg} loading="lazy" />
            </div>
          )}
        </Group>

        <Group justify="space-between" gap="xs">
          <Text size="sm" c="dimmed">
            {job.photo_paths.length > 0 && (
              <>
                <IconPhoto size={16} aria-hidden style={{ verticalAlign: '-3px' }} />{' '}
                {job.photo_paths.length === 1 ? '1 foto' : `${job.photo_paths.length} fotos`}
              </>
            )}
          </Text>
          <Group gap={2} c="pasto.8">
            <Text fw={700} c="inherit">
              Ver detalle
            </Text>
            <IconChevronRight size={20} aria-hidden />
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}

function PendingBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <Badge size="lg" variant="filled" color="blue" leftSection={<IconUsers size={16} aria-hidden />}>
      {count === 1 ? '1 postulación' : `${count} postulaciones`}
    </Badge>
  );
}

export function ClientLine({ client, size = 40 }: { client: Job['client']; size?: number }) {
  const { data: url } = useAvatarUrl(client.avatar_path);
  return (
    <Group gap="sm" wrap="nowrap">
      <Avatar src={url ?? null} size={size} radius={999} color="blue" alt="">
        {`${client.first_name.charAt(0)}${client.last_initial}`}
      </Avatar>
      <Text fw={600}>{displayName(client)}</Text>
    </Group>
  );
}
