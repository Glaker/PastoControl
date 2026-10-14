import { Center, Loader, Stack, Text } from '@mantine/core';

export function FullPageLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <Center mih="60dvh" p="md">
      <Stack align="center" gap="sm">
        <Loader size="lg" />
        <Text c="dimmed">{label}</Text>
      </Stack>
    </Center>
  );
}
