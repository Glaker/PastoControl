import { Avatar, Button, Loader, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { PhotoSourceButtons } from '../components/PhotoSourceButtons';
import { useEffect, useState } from 'react';
import { ImageReadError, resizeImage } from '../lib/images';
import { useAvatarUrl } from './queries';

const AVATAR_MAX_SIDE = 512;

type Props = {
  currentPath: string | null;
  newAvatar: Blob | null;
  removed: boolean;
  required: boolean;
  initials: string;
  error?: string | null;
  onChange: (value: { newAvatar: Blob | null; removed: boolean }) => void;
};

export function AvatarPicker({ currentPath, newAvatar, removed, required, initials, error, onChange }: Props) {
  const { data: currentUrl } = useAvatarUrl(removed ? null : currentPath);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    if (!newAvatar) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(newAvatar);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [newAvatar]);

  const onPick = async ([file]: File[]) => {
    if (!file) return;
    setReadError(null);
    setProcessing(true);
    try {
      const blob = await resizeImage(file, AVATAR_MAX_SIDE);
      onChange({ newAvatar: blob, removed: false });
    } catch (e) {
      setReadError(e instanceof ImageReadError ? e.message : 'No pudimos leer esa foto. Probá con otra.');
    } finally {
      setProcessing(false);
    }
  };

  const shown = previewUrl ?? (removed ? null : currentUrl ?? null);
  const hasPhoto = !!newAvatar || (!!currentPath && !removed);
  const message = readError ?? error;

  return (
    <Stack align="center" gap="xs">
      <Avatar src={shown} size={112} radius={999} color="pasto" alt="Tu foto de perfil">
        {processing ? <Loader size="sm" /> : initials}
      </Avatar>
      <Text size="sm" fw={600}>
        Foto de perfil {required ? '(obligatoria)' : '(opcional)'}
      </Text>
      <Stack gap="xs" w="100%" maw={360}>
        <PhotoSourceButtons
          camera="user"
          loading={processing}
          desktopLabel={hasPhoto ? 'Cambiar foto' : 'Elegir foto'}
          onPick={(files) => void onPick(files)}
        />
        {hasPhoto && !required && (
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={20} aria-hidden />}
            onClick={() => onChange({ newAvatar: null, removed: true })}
          >
            Quitar foto
          </Button>
        )}
      </Stack>
      <Text size="sm" ta="center" c={message ? 'red.8' : 'dimmed'} role={message ? 'alert' : undefined}>
        {message ??
          (required
            ? 'Para cortar pasto, que se te vea bien la cara: genera confianza.'
            : 'Si querés, sumá una foto tuya.')}
      </Text>
    </Stack>
  );
}
