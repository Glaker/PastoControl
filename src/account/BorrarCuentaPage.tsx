import { Alert, Button, Card, Group, List, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBriefcase,
  IconChevronRight,
  IconClipboardList,
  IconRefresh,
  IconSend,
  IconTrash,
  type Icon,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { FullPageLoader } from '../components/FullPageLoader';
import { PasswordField } from '../components/PasswordField';
import { confirmAction } from '../lib/confirm';
import { friendlyError } from '../lib/errors';
import { formatDateTime } from '../lib/format';
import { useMyProfile } from '../profile/queries';
import { DeleteAccountError, deleteMyAccount, forgetThisDevice, usePendingItems, type PendingItem } from './deleteAccount';

const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';

/**
 * Borrar la cuenta: primero hay que cancelar o retirar a mano todo lo pendiente (se muestra la lista, con un link a
 * cada cosa; el servidor lo vuelve a validar). Después, la contraseña y un último modal.
 */
export function BorrarCuentaPage() {
  const navigate = useNavigate();
  const { data: profile } = useMyProfile();
  const { data: pending, isPending, error, refetch, isRefetching } = usePendingItems();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const tz = profile?.locality.timezone ?? DEFAULT_TZ;

  const onDelete = async () => {
    if (!password) {
      setPasswordError('Escribí tu contraseña.');
      return;
    }
    const ok = await confirmAction({
      title: '¿Borrar tu cuenta para siempre?',
      danger: true,
      confirmLabel: 'Sí, borrar mi cuenta',
      cancelLabel: 'No, volver',
      confirmIcon: <IconTrash size={20} aria-hidden />,
      message: (
        <Stack gap="xs">
          <Text>
            Se borran tu cuenta, tu nombre, apellido, WhatsApp, foto y casa, las fotos de tus pedidos, tus avisos y los
            pedidos en los que no participó nadie más.
          </Text>
          <Text>
            Los trabajos y las calificaciones que compartís con otra persona quedan sin tus datos, como «Usuario
            eliminado».
          </Text>
          <Text fw={700}>No se puede deshacer.</Text>
        </Stack>
      ),
    });
    if (!ok) return;

    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteMyAccount(password);
    } catch (e) {
      setDeleting(false);
      if (e instanceof DeleteAccountError) {
        if (e.code === 'password') setPasswordError(e.message);
        else setDeleteError(e.message);
        if (e.code === 'pending') void refetch();
      } else {
        setDeleteError(friendlyError(e, 'No pudimos borrar tu cuenta. Probá de nuevo en un rato.'));
      }
      return;
    }
    // La cuenta ya no existe: se muestra la confirmación (pública) y se limpia este dispositivo.
    navigate('/cuenta-borrada', { replace: true });
    await forgetThisDevice();
  };

  if (isPending) return <FullPageLoader label="Revisando tu cuenta…" />;

  return (
    <Stack gap="lg">
      <Button
        variant="subtle"
        color="gray"
        px="xs"
        style={{ alignSelf: 'flex-start' }}
        leftSection={<IconArrowLeft size={20} aria-hidden />}
        onClick={() => navigate(profile ? '/perfil' : '/')}
      >
        Volver
      </Button>
      <Title order={1} size="h2">
        Borrar mi cuenta
      </Title>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="xs">
          <Title order={2} size="h4">
            Qué se borra
          </Title>
          <List spacing={4} withPadding>
            <List.Item>Tu cuenta: email y contraseña.</List.Item>
            <List.Item>Tu nombre, apellido, WhatsApp, foto de perfil y tu casa.</List.Item>
            <List.Item>Las fotos de tus pedidos y los pedidos en los que no participó nadie más.</List.Item>
            <List.Item>Tus avisos y los dispositivos donde los recibís.</List.Item>
          </List>
          <Title order={2} size="h4" mt="sm">
            Qué queda, sin tus datos
          </Title>
          <Text>
            Los trabajos que hiciste o te hicieron y sus calificaciones, para que la otra persona no pierda su historial.
            Quedan sin tu nombre, tu dirección ni tus fotos: donde aparecías va a decir «Usuario eliminado».
          </Text>
        </Stack>
      </Card>

      {error && (
        <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="No pudimos revisar tu cuenta">
          <Stack gap="sm">
            <Text>{friendlyError(error)}</Text>
            <Button variant="white" leftSection={<IconRefresh size={20} aria-hidden />} onClick={() => void refetch()}>
              Probar de nuevo
            </Button>
          </Stack>
        </Alert>
      )}

      {pending && pending.length > 0 && (
        <Stack gap="sm">
          <Alert color="orange" icon={<IconAlertTriangle aria-hidden />} title="Antes tenés que cerrar esto">
            {pending.length === 1
              ? 'Tenés 1 cosa pendiente. Cancelala o retirala y volvé acá.'
              : `Tenés ${pending.length} cosas pendientes. Cancelalas o retiralas y volvé acá.`}{' '}
            No las cancelamos nosotros: si hay otra persona, le llega el aviso.
          </Alert>
          {pending.map((item) => (
            <PendingCard key={`${item.kind}-${item.job_id}`} item={item} tz={tz} />
          ))}
          <Button
            variant="default"
            loading={isRefetching}
            leftSection={<IconRefresh size={20} aria-hidden />}
            onClick={() => void refetch()}
          >
            Revisar de nuevo
          </Button>
        </Stack>
      )}

      {pending && pending.length === 0 && (
        <Card withBorder radius="md" padding="lg" style={{ borderColor: 'var(--mantine-color-red-4)' }}>
          <Stack gap="md">
            <Text>No tenés nada pendiente. Para confirmar que sos vos, escribí tu contraseña.</Text>
            <PasswordField
              label="Tu contraseña"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.currentTarget.value);
                setPasswordError(null);
              }}
              error={passwordError}
            />
            {deleteError && (
              <Alert color="red" icon={<IconAlertTriangle aria-hidden />} role="alert">
                {deleteError}
              </Alert>
            )}
            <Button color="red" loading={deleting} leftSection={<IconTrash size={20} aria-hidden />} onClick={() => void onDelete()}>
              Borrar mi cuenta
            </Button>
            <Text size="sm" c="dimmed">
              ¿Olvidaste la contraseña? Cerrá sesión y usá «Me olvidé la contraseña».
            </Text>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

const KINDS: Record<PendingItem['kind'], { icon: Icon; title: string; todo: string; to: (jobId: string) => string }> = {
  pedido_publicado: {
    icon: IconClipboardList,
    title: 'Pedido publicado',
    todo: 'Cancelalo desde el pedido.',
    to: (id) => `/pedir/pedido/${id}`,
  },
  pedido_asignado: {
    icon: IconClipboardList,
    title: 'Pedido asignado',
    todo: 'Cancelalo desde el pedido (le avisamos a quien lo iba a cortar).',
    to: (id) => `/pedir/pedido/${id}`,
  },
  postulacion_pendiente: {
    icon: IconSend,
    title: 'Postulación pendiente',
    todo: 'Retirala desde el trabajo.',
    to: (id) => `/cortar/trabajo/${id}`,
  },
  postulacion_aceptada: {
    icon: IconBriefcase,
    title: 'Trabajo que te asignaron',
    todo: 'Cancelalo desde el trabajo (le avisamos al cliente).',
    to: (id) => `/cortar/trabajo/${id}`,
  },
};

function PendingCard({ item, tz }: { item: PendingItem; tz: string }) {
  const kind = KINDS[item.kind];
  const Icon = kind.icon;
  const title = item.kind === 'pedido_publicado' && item.is_expired ? 'Pedido vencido (sigue publicado)' : kind.title;
  return (
    <Card component={Link} to={kind.to(item.job_id)} withBorder radius="md" padding="md">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon variant="light" color="orange" size={40} radius="md" aria-hidden>
          <Icon size={22} />
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={700}>{title}</Text>
          <Text>{item.address}</Text>
          <Text size="sm" c="dimmed">
            {formatDateTime(item.at, tz)}
          </Text>
          <Text size="sm">{kind.todo}</Text>
        </Stack>
        <Group gap={2} c="pasto.8" style={{ flex: 'none', alignSelf: 'center' }}>
          <Text fw={700} c="inherit">
            Ir
          </Text>
          <IconChevronRight size={20} aria-hidden />
        </Group>
      </Group>
    </Card>
  );
}
