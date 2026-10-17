import { Button, Flex, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconCircleCheck, IconPlant2, IconPlus, IconSpeakerphone, IconUserCheck, IconUsers, type Icon } from '@tabler/icons-react';
import { Link } from 'react-router';
import { CardGrid } from '../../components/CardGrid';
import { EmptyState } from '../../components/EmptyState';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobCard } from '../../jobs/JobCard';
import { LoadFailed } from '../../jobs/JobPageParts';
import { jobDisplayStatus, pendingCount, useMyJobs, type Job } from '../../jobs/queries';

export function MisPedidosPage() {
  const { data: jobs, isPending, error, refetch } = useMyJobs();

  // En el celular, el botón ocupa todo el ancho debajo del título; en escritorio, va al lado.
  const header = (
    <Flex direction={{ base: 'column', md: 'row' }} justify="space-between" align={{ base: 'stretch', md: 'center' }} gap="md">
      <Title order={1} size="h2">
        Mis pedidos
      </Title>
      <Button component={Link} to="/pedir/nuevo" leftSection={<IconPlus size={20} aria-hidden />}>
        Publicar un pedido
      </Button>
    </Flex>
  );

  if (isPending) {
    return (
      <Stack gap="lg">
        {header}
        <FullPageLoader label="Cargando tus pedidos…" />
      </Stack>
    );
  }
  if (error) {
    return (
      <Stack gap="lg">
        {header}
        <LoadFailed error={error} onRetry={() => void refetch()} />
      </Stack>
    );
  }

  const byDate = (a: Job, b: Job) => a.desired_at.localeCompare(b.desired_at);
  const active = jobs.filter((j) => j.status === 'publicado' || j.status === 'asignado').sort(byDate);
  const history = jobs.filter((j) => j.status === 'realizado' || j.status === 'cancelado').sort((a, b) => byDate(b, a));
  const expired = active.filter((j) => jobDisplayStatus(j) === 'vencido').length;
  const stats: Stat[] = [
    { label: 'Publicados', value: active.filter((j) => j.status === 'publicado').length, icon: IconSpeakerphone, color: 'blue' },
    {
      label: 'Postulaciones por revisar',
      value: active.reduce((n, j) => n + (j.status === 'publicado' ? pendingCount(j) : 0), 0),
      icon: IconUsers,
      color: 'orange',
    },
    { label: 'Asignados', value: active.filter((j) => j.status === 'asignado').length, icon: IconUserCheck, color: 'violet' },
    { label: 'Realizados', value: jobs.filter((j) => j.status === 'realizado').length, icon: IconCircleCheck, color: 'teal' },
  ];

  return (
    <Stack gap="lg">
      {header}

      {jobs.length > 0 && <StatsRow stats={stats} />}

      {jobs.length === 0 && (
        <EmptyState icon={IconPlant2} title="Todavía no publicaste pedidos">
          <Text c="dimmed">Contá dónde, cuándo y cuánto pagás, y los cortadores de la zona se postulan.</Text>
        </EmptyState>
      )}

      {active.length > 0 && (
        <Stack gap="sm">
          <Title order={2} size="h3">
            Activos
          </Title>
          {expired > 0 && (
            <Text size="sm" c="dimmed">
              Los vencidos ya no los ve nadie: editalos con una fecha nueva o cancelalos.
            </Text>
          )}
          <CardGrid>
            {active.map((job) => (
              <JobCard key={job.id} job={job} to={`/pedir/pedido/${job.id}`} variant="owner" />
            ))}
          </CardGrid>
        </Stack>
      )}

      {history.length > 0 && (
        <Stack gap="sm">
          <Title order={2} size="h3">
            Anteriores
          </Title>
          <CardGrid>
            {history.map((job) => (
              <JobCard key={job.id} job={job} to={`/pedir/pedido/${job.id}`} variant="owner" />
            ))}
          </CardGrid>
        </Stack>
      )}
    </Stack>
  );
}

type Stat = { label: string; value: number; icon: Icon; color: string };

/** Escritorio: resumen de los pedidos en una fila de números. */
function StatsRow({ stats }: { stats: Stat[] }) {
  return (
    <SimpleGrid cols={4} spacing="md" visibleFrom="md">
      {stats.map(({ label, value, icon: StatIcon, color }) => (
        <Paper key={label} withBorder radius="lg" p="md">
          <Group gap="sm" wrap="nowrap">
            <ThemeIcon size={44} radius="md" variant="light" color={color}>
              <StatIcon size={24} aria-hidden />
            </ThemeIcon>
            <div style={{ minWidth: 0 }}>
              <Text fw={800} size="1.5rem" lh={1.1}>
                {value}
              </Text>
              <Text size="sm" c="dimmed" lh={1.2}>
                {label}
              </Text>
            </div>
          </Group>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
