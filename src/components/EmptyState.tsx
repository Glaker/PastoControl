import { Card, Stack, Text, ThemeIcon } from '@mantine/core';
import type { Icon } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/** Lista vacía: ícono grande, título, explicación y, si hace falta, una acción. */
export function EmptyState({ icon: EmptyIcon, title, children }: { icon: Icon; title: string; children?: ReactNode }) {
  return (
    <Card withBorder radius="lg" padding="xl">
      <Stack align="center" gap="sm" ta="center">
        <ThemeIcon size={64} radius={999} variant="light" color="pasto">
          <EmptyIcon size={34} stroke={1.6} aria-hidden />
        </ThemeIcon>
        <Text fw={800} size="lg">
          {title}
        </Text>
        {children}
      </Stack>
    </Card>
  );
}
