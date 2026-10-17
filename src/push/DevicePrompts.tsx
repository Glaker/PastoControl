import { Button, Card, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconBell, IconBellOff, IconDeviceMobile, IconX } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useIsDesktop } from '../app/useIsDesktop';
import { readLocal, writeLocal } from '../lib/storage';
import { useInstallState } from './installStore';
import { IosInstallSteps } from './IosInstallSteps';
import { BlockedPushHelp, EnablePushButton, InstallButton } from './PushParts';
import { usePushState } from './pushStore';

// Cerrados una vez, no vuelven a aparecer en este dispositivo (desde el perfil se puede todo igual).
const HIDE_PUSH_KEY = 'pastocontrol:hide-push-card';
const HIDE_INSTALL_KEY = 'pastocontrol:hide-install-card';

/**
 * Avisos de dispositivo en las pantallas principales (Mis pedidos, Trabajos, Avisos), de a uno:
 * 1. iPhone sin instalar: pasos para instalar (ahí el push solo funciona con la app instalada).
 * 2. Avisos sin activar: "Activar avisos"; bloqueados: cómo habilitarlos.
 * 3. Android/Chrome con la app sin instalar: "Instalar PastoControl".
 */
export function DevicePrompts() {
  const push = usePushState();
  const install = useInstallState();
  const [hidePush, setHidePush] = useState(() => readLocal(HIDE_PUSH_KEY) === '1');
  const [hideInstall, setHideInstall] = useState(() => readLocal(HIDE_INSTALL_KEY) === '1');

  const closePush = () => {
    writeLocal(HIDE_PUSH_KEY, '1');
    setHidePush(true);
  };
  const closeInstall = () => {
    writeLocal(HIDE_INSTALL_KEY, '1');
    setHideInstall(true);
  };

  if (push.support === 'ios-needs-install' && !hideInstall) {
    return (
      <PromptCard
        icon={<IconDeviceMobile size={24} aria-hidden />}
        color="blue"
        title="Instalá PastoControl en tu iPhone"
        onClose={closeInstall}
      >
        <Text>
          En el iPhone, los avisos («alguien se postuló», «te eligieron») solo llegan con la app en tu pantalla de inicio.
          Son tres pasos:
        </Text>
        <IosInstallSteps />
        <Text>
          Después abrí PastoControl desde el ícono nuevo y tocá <b>«Activar avisos»</b>.
        </Text>
      </PromptCard>
    );
  }

  const pushPending = push.support === 'supported' && push.ready && !push.subscribed && !push.disabledByUser && !hidePush;
  if (pushPending && push.permission === 'default') {
    return (
      <PromptCard icon={<IconBell size={24} aria-hidden />} color="pasto" title="Activá los avisos" onClose={closePush} action={<EnablePushButton />}>
        <Text>Enterate cuando alguien se postula o te eligen, aunque tengas la app cerrada.</Text>
      </PromptCard>
    );
  }
  if (pushPending && push.permission === 'granted' && push.failed) {
    return (
      <PromptCard
        icon={<IconBell size={24} aria-hidden />}
        color="orange"
        title="Faltan activar los avisos"
        onClose={closePush}
        action={<EnablePushButton />}
      >
        <Text>Diste el permiso, pero no pudimos terminar de activar los avisos en este dispositivo.</Text>
      </PromptCard>
    );
  }
  if (pushPending && push.permission === 'denied') {
    return (
      <PromptCard icon={<IconBellOff size={24} aria-hidden />} color="orange" title="Los avisos están bloqueados" onClose={closePush}>
        <BlockedPushHelp />
      </PromptCard>
    );
  }

  if (install.canPrompt && !install.installed && !hideInstall) {
    return (
      <PromptCard
        icon={<IconDeviceMobile size={24} aria-hidden />}
        color="blue"
        title="Instalá PastoControl"
        onClose={closeInstall}
        action={<InstallButton />}
      >
        <Text>Tenela en tu pantalla de inicio y abrila con un toque, como cualquier app.</Text>
      </PromptCard>
    );
  }

  return null;
}

function PromptCard({
  icon,
  color,
  title,
  onClose,
  action,
  children,
}: {
  icon: ReactNode;
  color: string;
  title: string;
  onClose: () => void;
  /** El botón principal. En escritorio, con acción, el aviso es una franja: texto a la izquierda y botones a la derecha. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const desktop = useIsDesktop();
  const close = (
    <Button variant="subtle" color="gray" leftSection={<IconX size={18} aria-hidden />} onClick={onClose}>
      Ahora no
    </Button>
  );

  if (desktop && action) {
    return (
      <Card withBorder radius="lg" padding="md" mb="lg" style={{ borderColor: `var(--mantine-color-${color}-4)` }}>
        <Group gap="md" wrap="nowrap">
          <ThemeIcon size={44} radius="xl" variant="light" color={color}>
            {icon}
          </ThemeIcon>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Title order={2} size="h5">
              {title}
            </Title>
            {children}
          </div>
          <Group gap="xs" wrap="nowrap" title="Lo vas a encontrar en tu perfil cuando quieras.">
            {close}
            {action}
          </Group>
        </Group>
      </Card>
    );
  }

  // Celular con un botón: compacto (título y «Ahora no» en una fila, el texto y el botón a todo el ancho).
  if (action) {
    return (
      <Card withBorder radius="lg" padding="md" mb="lg" style={{ borderColor: `var(--mantine-color-${color}-4)` }}>
        <Stack gap="xs">
          <Group justify="space-between" gap="xs" wrap="nowrap">
            {/* Sin el ícono: el título y «Ahora no» entran en una fila a 360 px. */}
            <Title order={2} size="h5" c={`${color}.8`} style={{ minWidth: 0 }}>
              {title}
            </Title>
            <Button
              variant="subtle"
              color="gray"
              size="compact-md"
              mih={44}
              style={{ flex: 'none' }}
              leftSection={<IconX size={16} aria-hidden />}
              onClick={onClose}
            >
              Ahora no
            </Button>
          </Group>
          {children}
          {action}
        </Stack>
      </Card>
    );
  }

  return (
    <Card withBorder radius="md" padding="lg" mb="lg" style={{ borderColor: `var(--mantine-color-${color}-4)` }}>
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={44} radius="xl" variant="light" color={color}>
            {icon}
          </ThemeIcon>
          <Title order={2} size="h4" style={{ flex: 1 }}>
            {title}
          </Title>
        </Group>
        {children}
        {close}
        <Text size="xs" c="dimmed" ta="center" mt={-8}>
          Lo vas a encontrar en tu perfil cuando quieras.
        </Text>
      </Stack>
    </Card>
  );
}
