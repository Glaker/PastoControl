import { notifications as toasts } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useUserId } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { useMyProfile } from '../profile/queries';
import { describeNotification } from './describe';

/** Solo campos públicos (lista blanca en private.notify). */
export type NotificationPayload = {
  zone?: string;
  actor_name?: string;
  price_ars?: number;
  desired_at?: string;
  proposed_price_ars?: number;
  proposed_at?: string;
  tz?: string;
};

export type AppNotification = {
  id: string;
  kind: string;
  job_id: string | null;
  application_id: string | null;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
};

export const NOTIFICATIONS_LIMIT = 50;

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (userId: string) => ['notifications', 'list', userId] as const,
  unread: (userId: string) => ['notifications', 'unread', userId] as const,
};

export function useNotifications() {
  const userId = useUserId();
  return useQuery({
    queryKey: notificationKeys.list(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, kind, job_id, application_id, payload, read_at, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(NOTIFICATIONS_LIMIT);
      if (error) throw error;
      return data as AppNotification[];
    },
  });
}

/** Cantidad de avisos sin leer (solo cuenta, sin traer filas). */
export function useUnreadCount() {
  const userId = useUserId();
  return useQuery({
    queryKey: notificationKeys.unread(userId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 60_000,
  });
}

export async function markAllNotificationsRead() {
  const { error } = await supabase.rpc('mark_notifications_read', {});
  if (error) throw error;
}

/**
 * Mantiene el contador al día: escucha por Realtime los avisos nuevos del usuario (el RLS hace que
 * solo lleguen los propios) y refresca al volver la app al frente o al reconectar, por si se perdió
 * alguno. Con un aviso nuevo también se refrescan pedidos y postulaciones, y se muestra un cartel.
 */
export function useNotificationsLive() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const { data: profile } = useMyProfile();
  const timeZoneRef = useRef(profile?.locality.timezone);
  timeZoneRef.current = profile?.locality.timezone;

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
    };

    const channel = supabase
      .channel(`avisos:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (change) => {
          refresh();
          const { title, body } = describeNotification(change.new as AppNotification, timeZoneRef.current ?? 'UTC');
          toasts.show({ color: 'blue', title, message: body });
        },
      )
      .subscribe((status) => {
        // Al (re)conectarse pueden haber llegado avisos mientras no escuchábamos.
        if (status === 'SUBSCRIBED') void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
