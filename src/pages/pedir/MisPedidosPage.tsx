import { Button, Flex, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobCard } from '../../jobs/JobCard';
import { LoadFailed } from '../../jobs/JobPageParts';
import { jobDisplayStatus, useMyJobs, type Job } from '../../jobs/queries';
import { IconPlant2, IconPlus } from '@tabler/icons-react';
import { EmptyState } from '../../components/EmptyState';
import { CardGrid } from '../../components/CardGrid';

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

  return (
    <Stack gap="lg">
      {header}

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
