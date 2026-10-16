import { Button, List, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconMail } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { CONTACT_EMAIL } from '../../legal/terms';

/** "Volver": a la pantalla anterior si se llegó desde la app; si no (link directo), al inicio. */
export function BackButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="subtle"
      color="gray"
      px="xs"
      style={{ alignSelf: 'flex-start' }}
      leftSection={<IconArrowLeft size={20} aria-hidden />}
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
    >
      Volver
    </Button>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="xs" component="section">
      <Title order={2} size="h4">
        {title}
      </Title>
      {children}
    </Stack>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <List spacing="xs" withPadding>
      {items.map((item, i) => (
        <List.Item key={i}>{item}</List.Item>
      ))}
    </List>
  );
}

/** El mail dentro de una frase (sin link: el botón para escribir va aparte, con su área táctil). */
export function ContactEmail() {
  return (
    <Text span fw={600} inherit>
      {CONTACT_EMAIL}
    </Text>
  );
}

export function MailButton({ subject }: { subject?: string }) {
  return (
    <Button
      component="a"
      href={`mailto:${CONTACT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}
      variant="default"
      leftSection={<IconMail size={20} aria-hidden />}
      style={{ alignSelf: 'flex-start' }}
    >
      Escribir un mail
    </Button>
  );
}

export function DraftNote({ version, date }: { version: number; date: string }) {
  return (
    <Text size="sm" c="dimmed">
      Versión {version} · {date}
    </Text>
  );
}
