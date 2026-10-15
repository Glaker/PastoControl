import { Alert, Button, List, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBellRinging, IconCheck, IconDownload, IconRefresh } from '@tabler/icons-react';
import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { isAndroid, isIos, isStandalone } from './device';
import { promptInstall } from './installStore';
import { enablePush, refreshPush } from './pushStore';

/** Botón grande "Activar avisos": recién acá se pide el permiso del navegador. */
export function EnablePushButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await enablePush();
      if (result === 'granted') {
        notifications.show({
          color: 'pasto',
          icon: <IconCheck size={18} />,
          message: '¡Listo! Te vamos a avisar en este dispositivo.',
        });
      }
    } catch (e) {
      setError(pushErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="xs">
      <Button size="lg" fullWidth loading={busy} leftSection={<IconBellRinging size={22} aria-hidden />} onClick={() => void onClick()}>
        Activar avisos
      </Button>
      {error && (
        <Text size="sm" c="red.8" role="alert">
          {error}
        </Text>
      )}
    </Stack>
  );
}

function pushErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message === 'sw-timeout') {
    return 'La app todavía se está preparando. Esperá unos segundos y probá de nuevo.';
  }
  // El servicio de avisos del navegador rechazó el registro (pasa en algunos navegadores de computadora).
  if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
    return 'Este navegador no pudo registrarse para recibir avisos. Probá de nuevo más tarde, o desde el celular con Chrome o la app instalada.';
  }
  return friendlyError(e, 'No pudimos activar los avisos. Probá de nuevo.');
}

/** Cómo habilitar los avisos después de haberlos bloqueado, según el dispositivo. */
export function BlockedPushHelp() {
  const steps = isIos()
    ? ['Abrí la app Ajustes del iPhone.', 'Entrá en Notificaciones → PastoControl.', 'Activá «Permitir notificaciones».']
    : isAndroid() && isStandalone()
      ? [
          'Mantené apretado el ícono de PastoControl en tu pantalla de inicio.',
          'Tocá «Información de la app» (o la «i»).',
          'Entrá en Notificaciones y activalas.',
        ]
      : isAndroid()
        ? [
            'Tocá el ícono que está a la izquierda de la dirección, arriba de todo.',
            'Entrá en «Permisos» o «Notificaciones».',
            'Elegí «Permitir».',
          ]
        : [
            'Hacé clic en el ícono que está a la izquierda de la dirección.',
            'Buscá «Notificaciones».',
            'Elegí «Permitir».',
          ];

  return (
    <Stack gap="sm">
      <Text>Bloqueaste los avisos para PastoControl en este navegador. Para activarlos:</Text>
      <List type="ordered" spacing="xs">
        {steps.map((s) => (
          <List.Item key={s}>{s}</List.Item>
        ))}
      </List>
      <Text size="sm" c="dimmed">
        Después volvé a la app: los avisos se activan solos.
      </Text>
      <Button variant="default" leftSection={<IconRefresh size={20} aria-hidden />} onClick={() => void refreshPush()}>
        Ya los habilité
      </Button>
    </Stack>
  );
}

/** Botón "Instalar PastoControl" con el diálogo del navegador (Chrome/Android). */
export function InstallButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      fullWidth
      loading={busy}
      leftSection={<IconDownload size={22} aria-hidden />}
      onClick={() => {
        setBusy(true);
        void promptInstall()
          .then((ok) => {
            if (ok) notifications.show({ color: 'pasto', icon: <IconCheck size={18} />, message: 'Instalamos PastoControl.' });
          })
          .finally(() => setBusy(false));
      }}
    >
      Instalar PastoControl
    </Button>
  );
}

/** Para el perfil cuando no hay botón de instalación ni pasos de iPhone (otros navegadores). */
export function ManualInstallHint() {
  return (
    <Alert color="gray" variant="light">
      Para instalarla, abrí el menú del navegador (⋮ o ⋯) y elegí «Instalar app» o «Agregar a la pantalla principal».
    </Alert>
  );
}
