import { Button, FileButton, Stack } from '@mantine/core';
import { IconCamera, IconPhoto } from '@tabler/icons-react';

type Props = {
  /** Cámara que abre "Sacar foto": la frontal para el perfil, la trasera para el terreno. */
  camera: 'user' | 'environment';
  multiple?: boolean;
  loading?: boolean;
  disabled?: boolean;
  /** Texto del botón de galería en computadoras, donde no se ofrece "Sacar foto". */
  desktopLabel?: string;
  onPick: (files: File[]) => void;
};

// En pantallas táctiles (celulares, tablets) `capture` abre la cámara directamente. En una computadora el
// navegador lo ignora y abre el selector de archivos, así que ahí se muestra un solo botón.
const isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** Dos opciones claras para cargar una foto: "Sacar foto" (cámara) y "Elegir de la galería". */
export function PhotoSourceButtons({ camera, multiple, loading, disabled, desktopLabel = 'Elegir foto', onPick }: Props) {
  const gallery = (
    <FileButton onChange={(f) => onPick(toArray(f))} accept="image/*" multiple={multiple}>
      {(props) => (
        <Button
          {...props}
          variant="light"
          loading={loading}
          disabled={disabled}
          leftSection={<IconPhoto size={20} aria-hidden />}
        >
          {isTouch ? 'Elegir de la galería' : desktopLabel}
        </Button>
      )}
    </FileButton>
  );

  if (!isTouch) return gallery;

  return (
    <Stack gap="xs" w="100%">
      <FileButton onChange={(f: File | null) => onPick(toArray(f))} accept="image/*" capture={camera}>
        {(props) => (
          <Button
            {...props}
            variant="light"
            loading={loading}
            disabled={disabled}
            leftSection={<IconCamera size={20} aria-hidden />}
          >
            Sacar foto
          </Button>
        )}
      </FileButton>
      {gallery}
    </Stack>
  );
}

function toArray(f: File | File[] | null): File[] {
  if (!f) return [];
  return Array.isArray(f) ? f : [f];
}
