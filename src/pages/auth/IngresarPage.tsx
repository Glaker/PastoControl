import { Alert, Anchor, Button, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconFileText, IconLogin, IconShieldLock, IconTrash, IconUserPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PasswordField } from '../../components/PasswordField';
import { friendlyError } from '../../lib/errors';
import { supabase } from '../../lib/supabase';

export function IngresarPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Escribí un email válido.'),
      password: (v) => (v ? null : 'Escribí tu contraseña.'),
    },
  });

  // Al entrar, PublicOnly redirige solo (a la pantalla que se quería abrir, o al inicio).
  const onSubmit = form.onSubmit(async ({ email, password }) => {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setError(friendlyError(error, 'No pudimos entrar. Probá de nuevo.'));
  });

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Entrar
      </Title>
      <form onSubmit={onSubmit} noValidate>
        <Stack gap="md">
          <TextInput
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            {...form.getInputProps('email')}
          />
          <PasswordField label="Contraseña" autoComplete="current-password" {...form.getInputProps('password')} />
          {error && (
            <Alert color="red" icon={<IconAlertTriangle aria-hidden />} role="alert">
              {error}
            </Alert>
          )}
          <Button type="submit" loading={loading} leftSection={<IconLogin size={20} aria-hidden />}>
            Entrar
          </Button>
          <Anchor component={Link} to="/recuperar-clave" ta="center" py="sm" size="md">
            Me olvidé la contraseña
          </Anchor>
        </Stack>
      </form>
      <Stack gap="xs">
        <Text ta="center">¿Es tu primera vez?</Text>
        <Button component={Link} to="/registrarse" variant="default" leftSection={<IconUserPlus size={20} aria-hidden />}>
          Crear una cuenta
        </Button>
      </Stack>
      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
        <Button component={Link} to="/terminos" variant="subtle" color="gray" leftSection={<IconFileText size={20} aria-hidden />}>
          Términos
        </Button>
        <Button component={Link} to="/privacidad" variant="subtle" color="gray" leftSection={<IconShieldLock size={20} aria-hidden />}>
          Privacidad
        </Button>
        <Button component={Link} to="/borrar-cuenta" variant="subtle" color="gray" leftSection={<IconTrash size={20} aria-hidden />}>
          Borrar cuenta
        </Button>
      </SimpleGrid>
    </Stack>
  );
}
