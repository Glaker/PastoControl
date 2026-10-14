import { Button, Stack, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowLeft, IconCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';

type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  confirmIcon?: ReactNode;
};

/**
 * Confirmación para acciones importantes (aceptar, cancelar). Resuelve true si se confirmó.
 * Los botones van a lo ancho y uno abajo del otro, para que a 360px nunca se corte el texto.
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Volver',
  danger,
  confirmIcon = <IconCheck size={20} aria-hidden />,
}: ConfirmOptions) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      modals.close(id);
      resolve(value);
    };
    const id = modals.open({
      title: <Text fw={700} size="lg">{title}</Text>,
      centered: true,
      // Sin la cruz de solo ícono: para salir está "Volver" (o tocar afuera).
      withCloseButton: false,
      onClose: () => finish(false),
      children: (
        <Stack gap="lg">
          {typeof message === 'string' ? <Text>{message}</Text> : message}
          <Stack gap="xs">
            <Button fullWidth color={danger ? 'red' : undefined} leftSection={confirmIcon} onClick={() => finish(true)}>
              {confirmLabel}
            </Button>
            <Button fullWidth variant="default" leftSection={<IconArrowLeft size={20} aria-hidden />} onClick={() => finish(false)}>
              {cancelLabel}
            </Button>
          </Stack>
        </Stack>
      ),
    });
  });
}
