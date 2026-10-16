import { Alert, Button, Stack, Text, Title } from '@mantine/core';
import { IconCircleCheck, IconHome } from '@tabler/icons-react';
import { Link } from 'react-router';

/** Después de borrar la cuenta (pública: la sesión ya no existe). */
export function CuentaBorradaPage() {
  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Borramos tu cuenta
      </Title>
      <Alert color="teal" icon={<IconCircleCheck aria-hidden />}>
        Tus datos ya no están en PastoControl. Los trabajos que compartías con otras personas quedaron sin tu nombre.
      </Alert>
      <Text>Gracias por haber usado PastoControl. Si algún día lo necesitás de nuevo, podés crear otra cuenta.</Text>
      <Button component={Link} to="/ingresar" replace leftSection={<IconHome size={20} aria-hidden />}>
        Ir al inicio
      </Button>
    </Stack>
  );
}
