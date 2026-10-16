import { Button, Group, Radio, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconArrowRight, IconClipboardList, IconLogout, IconScissors, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { MODES } from '../app/modes';
import { FullPageLoader } from '../components/FullPageLoader';
import { signOut } from '../auth/signOut';
import { ProfileForm } from '../profile/ProfileForm';
import { BaseLocationStep } from '../profile/BaseLocationStep';
import { useMyProfile } from '../profile/queries';
import classes from './BienvenidaPage.module.css';

type Choice = 'pedir' | 'cortar' | 'ambos';

const CHOICES: Array<{ value: Choice; title: string; description: string; icon: typeof IconScissors }> = [
  {
    value: 'pedir',
    title: 'Quiero que me corten el pasto',
    description: 'Publicás tu terreno con el precio y el día, y elegís quién lo corta.',
    icon: IconClipboardList,
  },
  {
    value: 'cortar',
    title: 'Corto pasto',
    description: 'Ves los trabajos publicados y te postulás.',
    icon: IconScissors,
  },
  {
    value: 'ambos',
    title: 'Las dos cosas',
    description: 'Podés cambiar entre pedir y cortar desde arriba de la pantalla.',
    icon: IconUsers,
  },
];

/**
 * Onboarding: 1) qué quiere hacer, 2) sus datos, 3) si corta pasto, desde dónde sale (obligatorio).
 * Después se puede cambiar desde el perfil.
 */
export function BienvenidaPage() {
  const { data: profile, isPending } = useMyProfile();
  const navigate = useNavigate();
  const [step, setStep] = useState<'roles' | 'datos'>('roles');
  const [choice, setChoice] = useState<Choice | null>(null);

  if (isPending) return <FullPageLoader />;
  // Paso 3 (cortadores): el perfil ya está creado, falta la casa.
  if (profile && profile.is_cutter && profile.private.base_lat === null) {
    return (
      <BaseLocationStep
        profile={profile}
        title="Desde dónde salís a cortar"
        intro="Último paso. Con esto te mostramos los trabajos que te quedan cerca y a qué distancia está cada uno."
        onSaved={() => navigate(profile.is_client ? MODES.pedir.home : MODES.cortar.home, { replace: true })}
        extra={
          <Button variant="subtle" color="gray" leftSection={<IconLogout size={20} aria-hidden />} onClick={() => void signOut()}>
            Salir
          </Button>
        }
      />
    );
  }
  if (profile) return <Navigate to="/" replace />;

  if (step === 'roles' || !choice) {
    return (
      <Stack gap="lg">
        <div>
          <Title order={1} size="h2">
            ¡Bienvenido/a!
          </Title>
          <Text mt="xs">Contanos qué querés hacer. Después lo podés cambiar desde tu perfil.</Text>
        </div>
        <Radio.Group value={choice} onChange={(v) => setChoice(v as Choice)} aria-label="¿Qué querés hacer?">
          <Stack gap="sm">
            {CHOICES.map(({ value, title, description, icon: Icon }) => (
              <Radio.Card key={value} value={value} radius="md" className={classes.card}>
                <Group wrap="nowrap" align="flex-start" gap="md">
                  <Radio.Indicator mt={4} />
                  <div>
                    <Group gap={8} wrap="nowrap" align="center">
                      <Icon size={22} aria-hidden />
                      <Text fw={700} size="lg">
                        {title}
                      </Text>
                    </Group>
                    <Text c="dimmed" size="sm" mt={4}>
                      {description}
                    </Text>
                  </div>
                </Group>
              </Radio.Card>
            ))}
          </Stack>
        </Radio.Group>
        <Button disabled={!choice} onClick={() => setStep('datos')} rightSection={<IconArrowRight size={20} aria-hidden />}>
          Seguir
        </Button>
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconLogout size={20} aria-hidden />}
          onClick={() => void signOut()}
        >
          Salir
        </Button>
      </Stack>
    );
  }

  const roles = { isClient: choice !== 'cortar', isCutter: choice !== 'pedir' };

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} size="h2">
          Tus datos
        </Title>
        <Text mt="xs">Tu WhatsApp y tu apellido completo solo los ve la persona con la que acordás un trabajo.</Text>
      </div>
      <ProfileForm
        profile={null}
        initialRoles={roles}
        showRoles={false}
        submitLabel="Listo, crear mi perfil"
        // Si corta pasto, al guardarse el perfil esta misma pantalla pasa al paso de la casa.
        onSaved={() => {
          if (!roles.isCutter) navigate(MODES.pedir.home, { replace: true });
        }}
      />
      <Button variant="default" leftSection={<IconArrowLeft size={20} aria-hidden />} onClick={() => setStep('roles')}>
        Volver
      </Button>
    </Stack>
  );
}
