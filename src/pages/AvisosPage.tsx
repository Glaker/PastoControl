import { Badge, Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useUserId } from '../auth/AuthProvider';
import { FullPageLoader } from '../components/FullPageLoader';
import { LoadFailed } from '../jobs/JobPageParts';
import { formatDateTime } from '../lib/format';
import { describeNotification } from '../notifications/describe';
import {
  markAllNotificationsRead,
  NOTIFICATIONS_LIMIT,
  notificationKeys,
  useNotifications,
  type AppNotification,
} from '../notifications/queries';
import { useMyProfile } from '../profile/queries';
import classes from './AvisosPage.module.css';

export function AvisosPage() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const { data: items, isPending, error, refetch } = useNotifications();
  // Los que estaban sin leer al abrir la bandeja se siguen marcando como "Nuevo" mientras se mira.
  const [unseen, setUnseen] = useState<Set<string> | null>(null);
  const marking = useRef(false);

  useEffect(() => {
    if (!items || unseen !== null) return;
    const ids = new Set(items.filter((n) => !n.read_at).map((n) => n.id));
    setUnseen(ids);
    if (ids.size === 0 || marking.current) return;
    // Abrir la bandeja marca todo como leído (el contador vuelve a cero).
    marking.current = true;
    markAllNotificationsRead()
      .then(() => queryClient.invalidateQueries({ queryKey: notificationKeys.unread(userId) }))
      .catch(() => undefined)
      .finally(() => {
        marking.current = false;
      });
  }, [items, unseen, queryClient, userId]);

  // Si llegan avisos nuevos con la bandeja abierta, también se resaltan.
  useEffect(() => {
    if (!items || unseen === null) return;
    const fresh = items.filter((n) => !n.read_at && !unseen.has(n.id));
    if (fresh.length === 0) return;
    setUnseen(new Set([...unseen, ...fresh.map((n) => n.id)]));
    void markAllNotificationsRead().then(() =>
      queryClient.invalidateQueries({ queryKey: notificationKeys.unread(userId) }),
    );
  }, [items, unseen, queryClient, userId]);

  if (isPending) return <FullPageLoader label="Cargando avisos…" />;
  if (error) return <LoadFailed error={error} onRetry={() => void refetch()} />;

  const tz = profile?.locality.timezone ?? 'UTC';

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Avisos
      </Title>

      {items.length === 0 && (
        <Card withBorder radius="md" padding="lg">
          <Text>Todavía no tenés avisos. Te avisamos acá cuando pase algo con tus pedidos o postulaciones.</Text>
        </Card>
      )}

      {items.map((n) => (
        <NotificationItem key={n.id} notification={n} isNew={!!unseen?.has(n.id)} timeZone={tz} />
      ))}

      {items.length === NOTIFICATIONS_LIMIT && (
        <Text size="sm" c="dimmed" ta="center">
          Se muestran los últimos {NOTIFICATIONS_LIMIT} avisos.
        </Text>
      )}
    </Stack>
  );
}

function NotificationItem({ notification, isNew, timeZone }: { notification: AppNotification; isNew: boolean; timeZone: string }) {
  const { icon: Icon, color, title, body, to } = describeNotification(notification, timeZone);
  const content = (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <ThemeIcon variant="light" color={color} size={40} radius="xl" aria-hidden>
        <Icon size={22} />
      </ThemeIcon>
      <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
        <Group gap="xs" justify="space-between" align="flex-start">
          <Text fw={700}>{title}</Text>
          {isNew && (
            <Badge color="red" variant="filled" size="sm">
              Nuevo
            </Badge>
          )}
        </Group>
        <Text>{body}</Text>
        <Text size="sm" c="dimmed">
          {formatDateTime(notification.created_at, timeZone)}
        </Text>
      </Stack>
    </Group>
  );

  const className = `${classes.item} ${isNew ? classes.itemNew : ''}`;
  return to ? (
    <Card component={Link} to={to} withBorder radius="md" padding="md" className={className}>
      {content}
    </Card>
  ) : (
    <Card withBorder radius="md" padding="md" className={className}>
      {content}
    </Card>
  );
}
