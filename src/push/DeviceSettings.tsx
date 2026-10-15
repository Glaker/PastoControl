import { Alert, Button, Card, Divider, Stack, Text, Title } from '@mantine/core';
import { IconBellOff, IconCircleCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { friendlyError } from '../lib/errors';
import { isIos } from './device';
import { useInstallState } from './installStore';
import { IosInstallSteps } from './IosInstallSteps';
import { BlockedPushHelp, EnablePushButton, InstallButton, ManualInstallHint } from './PushParts';
import { disablePush, usePushState } from './pushStore';

/** Sección del perfil: avisos e instalación en este dispositivo (siempre disponible, aunque se cerraron los carteles). */
export function DeviceSettings() {
  const push = usePushState();
  const install = useInstallState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDisable = async () => {
    setError(null);
    setBusy(true);
    try {
      await disablePush();
    } catch (e) {
      setError(friendlyError(e, 'No pudimos desactivar los avisos. Probá de nuevo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Title order={2} size="h4">
          Avisos en este dispositivo
        </Title>
        {push.support === 'ios-needs-install' && (
          <Text>En el iPhone, los avisos funcionan con la app instalada: seguí los pasos de abajo.</Text>
        )}
        {push.support === 'unsupported' && (
          <Text>Este navegador no puede recibir avisos. En Android usá Chrome; en el iPhone, instalá la app.</Text>
        )}
        {push.support === 'supported' && push.ready && (
          <>
            {push.subscribed ? (
              <>
                <Alert color="pasto" icon={<IconCircleCheck aria-hidden />}>
                  Activados: te avisamos cuando alguien se postula o te eligen.
                </Alert>
                <Button
                  variant="default"
                  loading={busy}
                  leftSection={<IconBellOff size={20} aria-hidden />}
                  onClick={() => void onDisable()}
                >
                  Desactivar avisos
                </Button>
              </>
            ) : push.permission === 'denied' ? (
              <BlockedPushHelp />
            ) : (
              <>
                <Text>Enterate cuando alguien se postula o te eligen, aunque tengas la app cerrada.</Text>
                <EnablePushButton />
              </>
            )}
            {error && (
              <Text size="sm" c="red.8" role="alert">
                {error}
              </Text>
            )}
          </>
        )}

        <Divider />
        <Title order={2} size="h4">
          Instalar la app
        </Title>
        {install.installed ? (
          <Text>Ya estás usando PastoControl instalada.</Text>
        ) : install.canPrompt ? (
          <InstallButton />
        ) : isIos() ? (
          <IosInstallSteps />
        ) : (
          <ManualInstallHint />
        )}
      </Stack>
    </Card>
  );
}
