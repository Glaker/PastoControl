import { Alert, Button, Container, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconHome, IconRefresh } from '@tabler/icons-react';
import { useRouteError } from 'react-router';
import { isChunkLoadError } from './update/registerPwa';

export function RouteError() {
  const error = useRouteError();

  if (isChunkLoadError(error)) {
    return (
      <Container size="xs" py="xl">
        <Stack>
          <Title order={1} size="h2">
            Hay una versión nueva de PastoControl
          </Title>
          <Text>Tocá el botón para cargarla. No perdés nada de lo que ya guardaste.</Text>
          <Button leftSection={<IconRefresh size={20} aria-hidden />} onClick={() => window.location.reload()}>
            Actualizar
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xs" py="xl">
      <Stack>
        <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="Algo salió mal">
          Hubo un error al mostrar esta pantalla.
        </Alert>
        <Button leftSection={<IconRefresh size={20} aria-hidden />} onClick={() => window.location.reload()}>
          Probar de nuevo
        </Button>
        <Button variant="default" leftSection={<IconHome size={20} aria-hidden />} component="a" href="/">
          Ir al inicio
        </Button>
      </Stack>
    </Container>
  );
}
