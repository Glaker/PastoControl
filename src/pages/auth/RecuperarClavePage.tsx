import { Alert, Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconArrowLeft, IconMailCheck, IconSend } from '@tabler/icons-react';
import { AuthError } from '@supabase/supabase-js';
import { useState } from 'react';
import { Link } from 'react-router';
import { friendlyError } from '../../lib/errors';
import { supabase } from '../../lib/supabase';

export function RecuperarClavePage() {
  const [error, setError] = useState<{ message: string; detail: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const form = useForm({
    initialValues: { email: '' },
    validate: { email: (v) => (/^\S+@\S+\.\S+$/.test(v.trim()) ? null : 'Escribí un email válido.') },
  });

  const onSubmit = form.onSubmit(async ({ email }) => {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nueva-clave`,
    });
    setLoading(false);
    if (error) {
      const invalidAddress = error instanceof AuthError && error.code === 'email_address_invalid';
      setError({
        message: invalidAddress
          ? 'No pudimos enviar el mail a esa dirección. Revisá que esté bien escrita.'
          : friendlyError(
              error,
              'No pudimos enviar el mail para recuperar la contraseña. Probá de nuevo más tarde; si sigue fallando, avisanos.',
            ),
        detail: error instanceof AuthError ? [error.status, error.code].filter(Boolean).join(' · ') || null : null,
      });
      return;
    }
    setSent(true);
  });

  if (sent) {
    return (
      <Stack gap="lg">
        <Title order={1} size="h2">
          Revisá tu correo
        </Title>
        <Alert color="pasto" icon={<IconMailCheck aria-hidden />}>
          Si hay una cuenta con {form.values.email.trim()}, te llega un mail con un link para crear una contraseña nueva.
          Puede tardar unos minutos; fijate también en la carpeta de no deseado.
        </Alert>
        <Button component={Link} to="/ingresar" variant="default" leftSection={<IconArrowLeft size={20} aria-hidden />}>
          Volver a entrar
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Title order={1} size="h2">
        Recuperar la contraseña
      </Title>
      <Text>Escribí el email de tu cuenta y te mandamos un link para crear una contraseña nueva.</Text>
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
          {error && (
            <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="No se envió el mail" role="alert">
              {error.message}
              {error.detail && (
                <Text size="xs" c="dimmed" mt={6}>
                  Detalle: {error.detail}
                </Text>
              )}
            </Alert>
          )}
          <Button type="submit" loading={loading} leftSection={<IconSend size={20} aria-hidden />}>
            Enviar link
          </Button>
          <Button component={Link} to="/ingresar" variant="default" leftSection={<IconArrowLeft size={20} aria-hidden />}>
            Volver
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}
