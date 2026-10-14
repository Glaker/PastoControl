import { Alert, Button, Container, Stack } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageLoader } from '../components/FullPageLoader';
import { friendlyError } from '../lib/errors';
import { useMyProfile } from '../profile/queries';
import { useAuth } from './AuthProvider';

/** Solo con sesión iniciada; si no, a /ingresar (y después vuelve adonde iba). */
export function RequireSession() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!session) return <Navigate to="/ingresar" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Pantallas de ingreso: si ya hay sesión, a la pantalla que se quería abrir o al inicio. */
export function PublicOnly() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (session) {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={typeof from === 'string' && from.startsWith('/') ? from : '/'} replace />;
  }
  return <Outlet />;
}

/** Solo con el perfil completo; si falta, al onboarding. */
export function RequireProfile() {
  const { data: profile, isPending, error, refetch } = useMyProfile();
  if (isPending) return <FullPageLoader />;
  if (error) return <LoadError message={friendlyError(error)} onRetry={() => void refetch()} />;
  if (!profile) return <Navigate to="/bienvenida" replace />;
  return <Outlet />;
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Container size="xs" py="xl">
      <Stack>
        <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="No pudimos cargar tus datos">
          {message}
        </Alert>
        <Button leftSection={<IconRefresh size={20} aria-hidden />} onClick={onRetry}>
          Probar de nuevo
        </Button>
      </Stack>
    </Container>
  );
}
