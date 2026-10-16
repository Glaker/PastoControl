import { Button, SimpleGrid, Stack } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowLeft, IconFileText, IconShieldLock } from '@tabler/icons-react';
import { PrivacidadPage } from './PrivacidadPage';
import { TerminosPage } from './TerminosPage';

/**
 * "Leer los términos" / "Leer la privacidad" junto a la casilla de aceptación: se abren en un modal (pantalla
 * completa en el celular) para no perder lo que ya se escribió en el formulario.
 */
export function LegalLinks() {
  const open = (kind: 'terminos' | 'privacidad') => {
    const id = modals.open({
      fullScreen: window.matchMedia('(max-width: 36em)').matches,
      size: 'lg',
      withCloseButton: false,
      children: (
        <Stack gap="lg">
          {kind === 'terminos' ? <TerminosPage embedded /> : <PrivacidadPage embedded />}
          <Button leftSection={<IconArrowLeft size={20} aria-hidden />} onClick={() => modals.close(id)}>
            Volver
          </Button>
        </Stack>
      ),
    });
  };
  return (
    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs">
      <Button variant="default" leftSection={<IconFileText size={20} aria-hidden />} onClick={() => open('terminos')}>
        Leer los términos
      </Button>
      <Button variant="default" leftSection={<IconShieldLock size={20} aria-hidden />} onClick={() => open('privacidad')}>
        Leer la privacidad
      </Button>
    </SimpleGrid>
  );
}
