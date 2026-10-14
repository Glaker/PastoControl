import { Alert, Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconLogin, IconMailCheck, IconUserPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PasswordField } from '../../components/PasswordField';
import { friendlyError } from '../../lib/errors';
import { supabase } from '../../lib/supabase';

export function RegistrarsePage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const form = useForm({
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Escribí un email válido.'),
      password: (v) => (v.length >= 8 ? null : 'La contraseña tiene que tener al menos 8 caracteres.'),
    },
  });

  // Con "Confirm email" desactivado, signUp ya inicia sesión y PublicOnly lleva al onboarding.
  const onSubmit = form.onSubmit(async ({ email, password }) => {
    setError(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(friendlyError(error, 'No pudimos crear la cuenta. Probá de nuevo.'));
      return;
    }
    if (!data.session) setNeedsConfirmation(true);
  });

  if (needsConfirmation) {
    return (
      <Stack gap="lg">
        <Title order={1} size="h2">
          Revisá tu correo
        </Title>
        <Alert color="pasto" icon={<IconMailCheck aria-hidden />}>
          Te mandamos un mail a {form.values.email.trim()} para confirmar tu cuenta. Abrilo y tocá el link; después
          volvé y entrá.
        </Alert>
        <Button component={Link} to="/ingresar" leftSection={<IconLogin size={20} aria-hidden />}>
          Ir a entrar
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Crear una cuenta
      </Title>
      <Text>Es gratis. Después te pedimos tu nombre y tu WhatsApp.</Text>
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
          <PasswordField
            label="Contraseña"
            description="Al menos 8 caracteres."
            autoComplete="new-password"
            {...form.getInputProps('password')}
          />
          {error && (
            <Alert color="red" icon={<IconAlertTriangle aria-hidden />} role="alert">
              {error}
            </Alert>
          )}
          <Button type="submit" loading={loading} leftSection={<IconUserPlus size={20} aria-hidden />}>
            Crear cuenta
          </Button>
        </Stack>
      </form>
      <Stack gap="xs">
        <Text ta="center">¿Ya tenés cuenta?</Text>
        <Button component={Link} to="/ingresar" variant="default" leftSection={<IconLogin size={20} aria-hidden />}>
          Entrar
        </Button>
      </Stack>
    </Stack>
  );
}
