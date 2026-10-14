import { Button, Stack, Text, Title } from '@mantine/core';
import { IconHome } from '@tabler/icons-react';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <Stack gap="md">
      <Title order={1} size="h2">
        No encontramos esta página
      </Title>
      <Text>Puede que el link esté mal o que la página ya no exista.</Text>
      <Button component={Link} to="/" leftSection={<IconHome size={22} aria-hidden />}>
        Ir al inicio
      </Button>
    </Stack>
  );
}
