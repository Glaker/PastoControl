import { Button, Paper, Stack, Text } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconRefresh, IconX } from '@tabler/icons-react';
import { confirmAction } from '../../lib/confirm';
import { applyUpdate, dismissUpdateBanner, useUpdateState } from './updateState';
import classes from './UpdateBanner.module.css';

export function UpdateBanner() {
  const { updateReady, dismissed, unsaved } = useUpdateState();
  if (!updateReady || dismissed) return null;
  return <VisibleBanner unsaved={unsaved} />;
}

// Componente aparte: useElementSize se engancha al montar, y el aviso recién existe cuando se muestra.
function VisibleBanner({ unsaved }: { unsaved: boolean }) {
  const { ref, height } = useElementSize();

  const onUpdate = async () => {
    if (unsaved) {
      const ok = await confirmAction({
        title: 'Actualizar ahora',
        message: 'Tenés cambios sin guardar en esta pantalla. Si actualizás ahora, se pierden.',
        confirmLabel: 'Actualizar igual',
        cancelLabel: 'Seguir cargando',
        danger: true,
      });
      if (!ok) return;
    }
    applyUpdate();
  };

  return (
    <>
      {/* Espacio al final de la página: el aviso nunca tapa los últimos botones. */}
      <div aria-hidden style={{ height: height + 32 }} />
      <Paper ref={ref} className={classes.banner} shadow="lg" radius="md" p="md" withBorder role="status">
        <Text fw={700}>Hay una versión nueva de PastoControl.</Text>
        {unsaved && (
          <Text size="sm" c="dimmed" mt={4}>
            Guardá lo que estás cargando y después actualizá.
          </Text>
        )}
        {/* Botones a lo ancho, uno abajo del otro: a 360px, lado a lado se cortaba el texto. */}
        <Stack mt="sm" gap="xs">
          <Button fullWidth leftSection={<IconRefresh size={20} aria-hidden />} onClick={onUpdate}>
            Actualizar
          </Button>
          <Button fullWidth variant="default" leftSection={<IconX size={20} aria-hidden />} onClick={dismissUpdateBanner}>
            Más tarde
          </Button>
        </Stack>
      </Paper>
    </>
  );
}
