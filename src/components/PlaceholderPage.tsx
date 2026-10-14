import type { ReactNode } from 'react';
import { Card, Stack, Text, Title } from '@mantine/core';

type Props = { title: string; phase: string; children?: ReactNode };

/** Pantalla provisoria: marca qué se implementa en cada fase. */
export function PlaceholderPage({ title, phase, children }: Props) {
  return (
    <Stack gap="md">
      <Title order={1} size="h2">
        {title}
      </Title>
      <Card withBorder radius="md" padding="lg">
        <Text c="dimmed">Esta pantalla se completa en la {phase}.</Text>
        {children}
      </Card>
    </Stack>
  );
}
