import { Alert, Container, MantineProvider, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { theme } from './theme';

export function ConfigErrorScreen({ problem }: { problem: string }) {
  return (
    <MantineProvider theme={theme}>
      <Container size="sm" py="xl">
        <Title order={1} size="h2" mb="md">
          PastoControl no está configurado
        </Title>
        <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="Falta configuración">
          {problem}
        </Alert>
      </Container>
    </MantineProvider>
  );
}
