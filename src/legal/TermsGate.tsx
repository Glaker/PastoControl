import { Alert, Button, Checkbox, Container, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconLogout, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, matchPath, Outlet, useLocation } from 'react-router';
import { LoadError } from '../auth/guards';
import { signOut } from '../auth/signOut';
import { useAuth } from '../auth/AuthProvider';
import { FullPageLoader } from '../components/FullPageLoader';
import { LegalLinks } from '../pages/legal/LegalLinks';
import { friendlyError } from '../lib/errors';
import { acceptTerms, TERMS_VERSION, termsStatusKey, useTermsStatus } from './terms';

// Lo que se puede usar sin aceptar una versión nueva: lo necesario para irse (borrar la cuenta y, antes,
// cancelar o retirar lo pendiente desde el detalle). Las RPCs de escritura rechazan todo lo demás.
const EXEMPT = ['/cuenta/borrar', '/pedir/pedido/:jobId', '/cortar/trabajo/:jobId'];

/** Con sesión iniciada: si no aceptó la versión vigente de los términos, se le pide antes de usar la app. */
export function RequireTerms() {
  const { pathname } = useLocation();
  const { data: status, isPending, error, refetch } = useTermsStatus();
  if (EXEMPT.some((pattern) => matchPath(pattern, pathname))) return <Outlet />;
  if (isPending) return <FullPageLoader />;
  if (error) return <LoadError message={friendlyError(error)} onRetry={() => void refetch()} />;
  if (status.accepted) return <Outlet />;
  return <AcceptTerms outdatedApp={status.currentVersion !== TERMS_VERSION} />;
}

function AcceptTerms({ outdatedApp }: { outdatedApp: boolean }) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!checked) {
      setError('Marcá la casilla para aceptar.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await acceptTerms();
      await queryClient.invalidateQueries({ queryKey: termsStatusKey(session?.user.id) });
    } catch (e) {
      setError(friendlyError(e, 'No pudimos guardar tu aceptación. Probá de nuevo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container size="xs" px="md" py="lg">
      <Stack gap="lg">
        <img src="/logo.svg" alt="" width={48} height={48} />
        <div>
          <Title order={1} size="h2">
            Términos y privacidad
          </Title>
          <Text mt="xs">
            Para seguir usando PastoControl, leé los términos y la política de privacidad y aceptalos. Si ya los habías
            aceptado, es porque los actualizamos.
          </Text>
        </div>

        {outdatedApp ? (
          <Alert color="orange" icon={<IconAlertTriangle aria-hidden />} title="Hay una versión nueva de la app">
            <Stack gap="sm">
              <Text>Para ver los términos actualizados, recargá la app.</Text>
              <Button variant="white" leftSection={<IconRefresh size={20} aria-hidden />} onClick={() => window.location.reload()}>
                Recargar
              </Button>
            </Stack>
          </Alert>
        ) : (
          <>
            <LegalLinks />
            <Checkbox
              size="md"
              label="Acepto los términos y la política de privacidad"
              checked={checked}
              onChange={(e) => {
                setChecked(e.currentTarget.checked);
                setError(null);
              }}
              styles={{ body: { alignItems: 'center', minHeight: 44 } }}
            />
            {error && (
              <Alert color="red" icon={<IconAlertTriangle aria-hidden />} role="alert">
                {error}
              </Alert>
            )}
            <Button loading={saving} leftSection={<IconCheck size={20} aria-hidden />} onClick={() => void accept()}>
              Aceptar y seguir
            </Button>
          </>
        )}

        <Stack gap="xs" mt="lg">
          <Text size="sm" c="dimmed">
            Si no estás de acuerdo, podés borrar tu cuenta. Antes vas a tener que cancelar o retirar lo que tengas
            pendiente.
          </Text>
          <Button component={Link} to="/cuenta/borrar" variant="outline" color="red" leftSection={<IconTrash size={20} aria-hidden />}>
            Quiero borrar mi cuenta
          </Button>
          <Button variant="subtle" color="gray" leftSection={<IconLogout size={20} aria-hidden />} onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}
