import { Alert, Button, Stack, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconSend } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { FullPageLoader } from '../../components/FullPageLoader';
import { PasswordField } from '../../components/PasswordField';
import { friendlyError } from '../../lib/errors';
import { supabase } from '../../lib/supabase';

/** Destino del link del mail de recuperación: el link inicia sesión y acá se elige la clave nueva. */
export function NuevaClavePage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [linkError] = useState(() => readLinkError());
  const form = useForm({
    initialValues: { password: '' },
    validate: { password: (v) => (v.length >= 8 ? null : 'La contraseña tiene que tener al menos 8 caracteres.') },
  });

  if (loading) return <FullPageLoader />;

  if (!session) {
    return (
      <Stack gap="lg">
        <Title order={1} size="h2">
          El link no sirve
        </Title>
        <Alert color="red" icon={<IconAlertTriangle aria-hidden />}>
          {linkError ?? 'El link venció o ya se usó.'} Pedí uno nuevo.
        </Alert>
        <Button component={Link} to="/recuperar-clave" leftSection={<IconSend size={20} aria-hidden />}>
          Pedir un link nuevo
        </Button>
      </Stack>
    );
  }

  const onSubmit = form.onSubmit(async ({ password }) => {
    setError(null);
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(friendlyError(error, 'No pudimos cambiar la contraseña. Probá de nuevo.'));
      return;
    }
    notifications.show({ color: 'pasto', icon: <IconCheck size={18} />, message: 'Listo, ya cambiaste tu contraseña.' });
    navigate('/', { replace: true });
  });

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Elegí una contraseña nueva
      </Title>
      <Text>Para la cuenta {session.user.email}.</Text>
      <form onSubmit={onSubmit} noValidate>
        <Stack gap="md">
          <PasswordField
            label="Contraseña nueva"
            description="Al menos 8 caracteres."
            autoComplete="new-password"
            {...form.getInputProps('password')}
          />
          {error && (
            <Alert color="red" icon={<IconAlertTriangle aria-hidden />} role="alert">
              {error}
            </Alert>
          )}
          <Button type="submit" loading={saving} leftSection={<IconCheck size={20} aria-hidden />}>
            Guardar contraseña
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}

/** Supabase devuelve los errores del link en el hash (#error_code=otp_expired&...). */
function readLinkError(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get('error_code');
  if (!code) return null;
  return code === 'otp_expired' ? 'El link venció o ya se usó.' : 'El link no es válido.';
}
