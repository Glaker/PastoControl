import { Card, Stack, Text } from '@mantine/core';
import { useIsDesktop } from '../app/useIsDesktop';
import { JobLocationMap } from '../map/lazy';
import { jobAddress, jobPoint, type Job } from './queries';

/** Escritorio: el pin del pedido en un mapa chico, debajo de los datos. En el celular no se muestra. */
export function JobLocationCard({ job }: { job: Job }) {
  const desktop = useIsDesktop();
  const point = jobPoint(job);
  if (!desktop || !point) return null;
  return (
    <Card withBorder radius="lg" padding="md">
      <Stack gap="xs">
        <Text fw={700}>Ubicación</Text>
        <JobLocationMap point={point} label={`Mapa con la ubicación de ${jobAddress(job)}`} />
      </Stack>
    </Card>
  );
}
