import { Alert, Button, Stack, Text, Title } from '@mantine/core';
import { IconInfoCircle, IconShieldLock, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router';
import { BackButton, Bullets, ContactEmail, LegalSection, MailButton } from './LegalParts';

/** Página pública: cómo borrar la cuenta desde la app o pedirlo por mail si no se puede entrar. */
export function BorrarCuentaInfoPage() {
  return (
    <Stack gap="lg">
      <BackButton />
      <Title order={1} size="h2">
        Cómo borrar tu cuenta
      </Title>

      <LegalSection title="Desde la app">
        <Bullets
          items={[
            'Entrá a PastoControl y andá a «Perfil».',
            'Abajo de todo, tocá «Borrar mi cuenta».',
            'Si tenés pedidos publicados o asignados, o postulaciones pendientes o aceptadas, te mostramos cuáles: cancelalos o retiralas primero.',
            'Escribí tu contraseña y confirmá.',
          ]}
        />
        <Button component={Link} to="/cuenta/borrar" color="red" variant="outline" leftSection={<IconTrash size={20} aria-hidden />}>
          Ir a borrar mi cuenta
        </Button>
        <Text size="sm" c="dimmed">
          Si no iniciaste sesión, primero te pedimos que entres.
        </Text>
      </LegalSection>

      <LegalSection title="Si no podés entrar">
        <Text>
          Primero probá «Me olvidé la contraseña» en la pantalla de ingreso. Si igual no podés, escribinos a{' '}
          <ContactEmail /> desde el email de la cuenta, con el asunto «Borrar mi cuenta». Te respondemos en 5 días
          hábiles.
        </Text>
        <MailButton subject="Borrar mi cuenta" />
      </LegalSection>

      <Alert color="blue" icon={<IconInfoCircle aria-hidden />} title="Qué se borra">
        Tu cuenta, tus datos, tus fotos, tus avisos y los pedidos en los que no participó nadie más. Los trabajos y las
        calificaciones que comparte otra persona quedan sin ningún dato tuyo, para que no pierda su historial: donde
        aparecías va a decir «Usuario eliminado».
      </Alert>
      <Button component={Link} to="/privacidad" variant="default" leftSection={<IconShieldLock size={20} aria-hidden />}>
        Leer la privacidad
      </Button>
    </Stack>
  );
}
