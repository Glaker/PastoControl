import { Alert, Button, Card, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { Link } from 'react-router';
import { friendlyError } from '../lib/errors';

/** "← Mis pedidos" / "← Trabajos": volver a la lista. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Button
      component={Link}
      to={to}
      variant="subtle"
      color="gray"
      px="xs"
      style={{ alignSelf: 'flex-start' }}
      leftSection={<IconArrowLeft size={20} aria-hidden />}
    >
      {label}
    </Button>
  );
}

export function LoadFailed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <Stack>
      <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="No pudimos cargar los datos">
        {friendlyError(error)}
      </Alert>
      <Button leftSection={<IconRefresh size={20} aria-hidden />} onClick={onRetry}>
        Probar de nuevo
      </Button>
    </Stack>
  );
}

export function JobUnavailable({ title, message, backTo, backLabel }: { title: string; message: string; backTo: string; backLabel: string }) {
  return (
    <Stack gap="md">
      <Title order={1} size="h2">
        {title}
      </Title>
      <Card withBorder radius="md" padding="lg">
        <Text>{message}</Text>
      </Card>
      <Button component={Link} to={backTo} leftSection={<IconArrowLeft size={20} aria-hidden />}>
        {backLabel}
      </Button>
    </Stack>
  );
}
