import { Avatar, Badge, Button, Card, Divider, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconFileText, IconLogout, IconPencil, IconShieldLock, IconTrash, IconUserCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { FullPageLoader } from '../components/FullPageLoader';
import { formatPhone } from '../lib/phone';
import { signOut } from '../auth/signOut';
import { DeviceSettings } from '../push/DeviceSettings';
import { BaseLocationCard } from '../profile/BaseLocationCard';
import { ProfileForm } from '../profile/ProfileForm';
import { useAvatarUrl, useMyProfile } from '../profile/queries';

export function PerfilPage() {
  const { session } = useAuth();
  const { data: profile } = useMyProfile();
  const { data: avatarUrl } = useAvatarUrl(profile?.avatar_path);
  const [editing, setEditing] = useState(false);

  // RequireProfile garantiza que el perfil existe.
  if (!profile) return <FullPageLoader />;

  if (editing) {
    return (
      <Stack gap="lg">
        <Title order={1} size="h2">
          Editar mis datos
        </Title>
        <ProfileForm
          profile={profile}
          initialRoles={{ isClient: profile.is_client, isCutter: profile.is_cutter }}
          showRoles
          submitLabel="Guardar cambios"
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            notifications.show({ color: 'pasto', icon: <IconCheck size={18} />, message: 'Guardamos tus datos.' });
          }}
        />
      </Stack>
    );
  }

  const fullName = `${profile.first_name} ${profile.private.last_name}`;

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Mi perfil
      </Title>

      <Card withBorder radius="md" padding="lg">
        <Stack align="center" gap="xs">
          <Avatar src={avatarUrl ?? null} size={112} radius={999} color="pasto" alt="">
            {`${profile.first_name.charAt(0)}${profile.last_initial}`}
          </Avatar>
          <Text fw={700} size="xl" ta="center">
            {fullName}
          </Text>
          <Text c="dimmed" size="sm" ta="center">
            Los demás te ven como «{profile.first_name} {profile.last_initial}.» hasta que acuerdan un trabajo.
          </Text>
          <Group gap="xs" justify="center">
            {profile.is_client && <Badge size="lg" color="blue" variant="light">Pido cortes</Badge>}
            {profile.is_cutter && <Badge size="lg" color="pasto" variant="light">Corto pasto</Badge>}
          </Group>
        </Stack>

        <Divider my="md" />

        <Stack gap="sm">
          <Field label="WhatsApp" value={formatPhone(profile.private.phone_e164)} />
          <Field label="Email" value={session?.user.email ?? '—'} />
        </Stack>
      </Card>

      <Button leftSection={<IconPencil size={20} aria-hidden />} onClick={() => setEditing(true)}>
        Editar mis datos
      </Button>
      <Text size="sm" c="dimmed">
        Desde «Editar mis datos» también podés cambiar si pedís cortes, cortás pasto o las dos cosas.
      </Text>
      <Button
        component={Link}
        to={`/persona/${profile.id}`}
        variant="default"
        leftSection={<IconUserCircle size={20} aria-hidden />}
      >
        Ver mi perfil público
      </Button>

      {profile.is_cutter && <BaseLocationCard profile={profile} />}

      <DeviceSettings />

      <Divider label="Cuenta" labelPosition="left" mt="md" />
      <Button
        variant="default"
        leftSection={<IconLogout size={20} aria-hidden />}
        onClick={() => void signOut()}
      >
        Cerrar sesión
      </Button>

      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
        <Button component={Link} to="/terminos" variant="subtle" color="gray" leftSection={<IconFileText size={20} aria-hidden />}>
          Términos
        </Button>
        <Button component={Link} to="/privacidad" variant="subtle" color="gray" leftSection={<IconShieldLock size={20} aria-hidden />}>
          Privacidad
        </Button>
      </SimpleGrid>

      {/* Acción peligrosa: separada de lo demás, al final y en rojo. */}
      <Card withBorder radius="md" padding="lg" mt="xl" style={{ borderColor: 'var(--mantine-color-red-4)' }}>
        <Stack gap="sm">
          <Title order={2} size="h4" c="red.8">
            Borrar mi cuenta
          </Title>
          <Text size="sm">
            Se borran tus datos y no se puede deshacer. Antes vas a tener que cancelar lo que tengas pendiente.
          </Text>
          <Button
            component={Link}
            to="/cuenta/borrar"
            variant="outline"
            color="red"
            leftSection={<IconTrash size={20} aria-hidden />}
          >
            Borrar mi cuenta
          </Button>
        </Stack>
      </Card>

      <Text size="xs" c="dimmed" ta="center" data-app-version={__APP_VERSION__}>
        PastoControl · versión {__APP_VERSION__}
      </Text>
    </Stack>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="lg">{value}</Text>
    </div>
  );
}
