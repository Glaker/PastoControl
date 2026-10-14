import { Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconChevronRight, IconListSearch, IconMapPin } from '@tabler/icons-react';
import { Link } from 'react-router';
import { ApplicationStatusBadge, ProposalSummary } from '../../applications/ApplicationParts';
import { useMyApplications, type MyApplication } from '../../applications/queries';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobStatusBadge } from '../../jobs/JobStatusBadge';
import { LoadFailed } from '../../jobs/JobPageParts';
import { jobDisplayStatus } from '../../jobs/queries';
import classes from '../../jobs/jobs.module.css';

export function MisPostulacionesPage() {
  const { data: applications, isPending, error, refetch } = useMyApplications();

  if (isPending) return <FullPageLoader label="Cargando tus postulaciones…" />;
  if (error) return <LoadFailed error={error} onRetry={() => void refetch()} />;

  const active = applications.filter((a) => a.status === 'pendiente' || a.status === 'aceptada');
  const past = applications.filter((a) => a.status !== 'pendiente' && a.status !== 'aceptada');

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Mis postulaciones
      </Title>

      {applications.length === 0 && (
        <>
          <Card withBorder radius="md" padding="lg">
            <Text>Todavía no te postulaste a ningún trabajo.</Text>
          </Card>
          <Button component={Link} to="/cortar" leftSection={<IconListSearch size={20} aria-hidden />}>
            Ver trabajos disponibles
          </Button>
        </>
      )}

      {active.length > 0 && (
        <Stack gap="sm">
          <Title order={2} size="h3">
            Activas
          </Title>
          {active.map((a) => (
            <ApplicationCard key={a.id} application={a} />
          ))}
        </Stack>
      )}

      {past.length > 0 && (
        <Stack gap="sm">
          <Title order={2} size="h3">
            Anteriores
          </Title>
          {past.map((a) => (
            <ApplicationCard key={a.id} application={a} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ApplicationCard({ application }: { application: MyApplication }) {
  const { job } = application;
  const jobStatus = jobDisplayStatus(job);
  return (
    <Card component={Link} to={`/cortar/trabajo/${job.id}`} withBorder radius="md" padding="md" className={classes.card}>
      <Stack gap="xs">
        <Group gap="xs">
          <ApplicationStatusBadge status={application.status} />
          {application.status === 'pendiente' && jobStatus !== 'publicado' && <JobStatusBadge status={jobStatus} />}
        </Group>
        <Group gap={6} wrap="nowrap" align="flex-start">
          <IconMapPin size={20} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
          <Text fw={700}>{job.zone}</Text>
        </Group>
        <ProposalSummary job={job} application={application} />
        <Group gap={2} c="pasto.8" justify="flex-end">
          <Text fw={700} c="inherit">
            Ver detalle
          </Text>
          <IconChevronRight size={20} aria-hidden />
        </Group>
      </Stack>
    </Card>
  );
}
