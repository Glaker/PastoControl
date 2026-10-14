import { Button, Card, Stack, Text, Title } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { FullPageLoader } from '../../components/FullPageLoader';
import { JobCard } from '../../jobs/JobCard';
import { LoadFailed } from '../../jobs/JobPageParts';
import { useAvailableJobs, useJobPhotoUrls } from '../../jobs/queries';
import { useMyProfile } from '../../profile/queries';

export function TrabajosPage() {
  const { data: profile } = useMyProfile();
  const { data: jobs, isPending, error, refetch, isRefetching } = useAvailableJobs(profile?.locality_id);
  // Una sola llamada para las miniaturas de toda la lista (la primera foto de cada trabajo).
  const firstPhotos = (jobs ?? []).flatMap((j) => j.photo_paths.slice(0, 1));
  const { data: thumbs } = useJobPhotoUrls(firstPhotos);

  const refresh = (
    <Button
      variant="default"
      loading={isRefetching}
      leftSection={<IconRefresh size={20} aria-hidden />}
      onClick={() => void refetch()}
    >
      Actualizar
    </Button>
  );

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} size="h2">
          Trabajos disponibles
        </Title>
        {profile && <Text c="dimmed">En {profile.locality.name}, ordenados por fecha.</Text>}
      </div>

      {isPending && <FullPageLoader label="Buscando trabajos…" />}
      {error && <LoadFailed error={error} onRetry={() => void refetch()} />}

      {jobs && jobs.length === 0 && (
        <>
          <Card withBorder radius="md" padding="lg">
            <Text>Por ahora no hay trabajos publicados. Volvé a mirar más tarde.</Text>
          </Card>
          {refresh}
        </>
      )}

      {jobs && jobs.length > 0 && (
        <>
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              to={`/cortar/trabajo/${job.id}`}
              variant="cutter"
              thumbUrl={job.photo_paths[0] ? thumbs?.[job.photo_paths[0]] : undefined}
            />
          ))}
          {refresh}
        </>
      )}
    </Stack>
  );
}
