import { Avatar, Badge, Button, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconArrowLeft, IconClipboardCheck, IconHeartHandshake, IconScissors } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { FullPageLoader } from '../components/FullPageLoader';
import { useProfileStats } from '../completion/queries';
import { JobUnavailable, LoadFailed } from '../jobs/JobPageParts';
import dayjs from '../lib/dayjs';
import { supabase } from '../lib/supabase';
import { displayName, useAvatarUrl } from '../profile/queries';

type PublicProfile = {
  id: string;
  first_name: string;
  last_initial: string;
  avatar_path: string | null;
  is_client: boolean;
  is_cutter: boolean;
  created_at: string;
  /** Solo para la zona horaria («En PastoControl desde…»): la localidad ya no se muestra. */
  locality: { timezone: string } | null;
};

/** Perfil público: nombre visible, foto, roles, trabajos realizados y % de "volverían a trabajar". */
export function PersonaPage() {
  const { personId } = useParams();
  const navigate = useNavigate();
  const profile = useQuery({
    queryKey: ['public-profile', personId],
    queryFn: async () => {
      // Solo columnas públicas: nunca profile_private (apellido y teléfono).
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_initial, avatar_path, is_client, is_cutter, created_at, locality:localities(timezone)')
        .eq('id', personId!)
        .maybeSingle();
      if (error) throw error;
      return data as PublicProfile | null;
    },
    enabled: !!personId,
  });
  const stats = useProfileStats(profile.data ? personId : undefined);
  const { data: avatarUrl } = useAvatarUrl(profile.data?.avatar_path);

  if (profile.isPending) return <FullPageLoader label="Cargando el perfil…" />;
  if (profile.error) return <LoadFailed error={profile.error} onRetry={() => void profile.refetch()} />;
  if (!profile.data) {
    return (
      <JobUnavailable title="No encontramos este perfil" message="Puede que el link esté mal." backTo="/" backLabel="Ir al inicio" />
    );
  }

  const p = profile.data;
  const since = dayjs(p.created_at).tz(p.locality?.timezone ?? 'UTC').format('MMMM [de] YYYY');

  return (
    <Stack gap="lg">
      <Button
        variant="subtle"
        color="gray"
        px="xs"
        style={{ alignSelf: 'flex-start' }}
        leftSection={<IconArrowLeft size={20} aria-hidden />}
        onClick={() => navigate(-1)}
      >
        Volver
      </Button>

      <Card withBorder radius="md" padding="lg">
        <Stack align="center" gap="xs">
          <Avatar src={avatarUrl ?? null} size={112} radius={999} color="pasto" alt="">
            {`${p.first_name.charAt(0)}${p.last_initial}`}
          </Avatar>
          <Title order={1} size="h2" ta="center">
            {displayName(p)}
          </Title>
          <Group gap="xs" justify="center">
            {p.is_cutter && (
              <Badge size="lg" color="pasto" variant="light">
                Corta pasto
              </Badge>
            )}
            {p.is_client && (
              <Badge size="lg" color="blue" variant="light">
                Pide cortes
              </Badge>
            )}
          </Group>
          <Text c="dimmed" ta="center">
            En PastoControl desde {since}
          </Text>
        </Stack>
      </Card>

      {stats.isPending && <Text c="dimmed">Cargando estadísticas…</Text>}
      {stats.data && (
        <>
          {/* Cada cifra se muestra si tiene ese rol o si ya hizo trabajos así (puede haber cambiado de rol). */}
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            {(p.is_cutter || stats.data.done_as_cutter > 0) && (
              <StatCard icon={<IconScissors size={22} />} label="Trabajos realizados como cortador" value={String(stats.data.done_as_cutter)} />
            )}
            {(p.is_client || stats.data.done_as_client > 0) && (
              <StatCard icon={<IconClipboardCheck size={22} />} label="Trabajos realizados como cliente" value={String(stats.data.done_as_client)} />
            )}
          </SimpleGrid>
          <Card withBorder radius="md" padding="lg">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" color="teal" size={44} radius="md" aria-hidden>
                <IconHeartHandshake size={24} />
              </ThemeIcon>
              <Stack gap={4} style={{ minWidth: 0 }}>
                <Text size="sm" c="dimmed">
                  Volverían a trabajar con esta persona
                </Text>
                {stats.data.yes_pct !== null ? (
                  <Text fw={800} size="xl">
                    {stats.data.yes_pct} %
                  </Text>
                ) : (
                  <Text>Todavía no hay suficientes calificaciones para mostrar un porcentaje.</Text>
                )}
                <Text size="sm" c="dimmed">
                  Se calcula con 5 calificaciones o más, se redondea y se actualiza una vez por semana.
                </Text>
              </Stack>
            </Group>
          </Card>
        </>
      )}
    </Stack>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card withBorder radius="md" padding="md">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon variant="light" color="gray" size={40} radius="md" aria-hidden>
          {icon}
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text size="sm" c="dimmed">
            {label}
          </Text>
          <Text fw={800} size="xl">
            {value}
          </Text>
        </div>
      </Group>
    </Card>
  );
}
