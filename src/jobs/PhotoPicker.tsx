import { Button, FileButton, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core';
import { IconCamera, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { ImageReadError, resizeImage } from '../lib/images';
import { useJobPhotoUrls } from './queries';
import { MAX_JOB_PHOTOS, type PhotoItem } from './saveJob';
import classes from './jobs.module.css';

const PHOTO_MAX_SIDE = 1600;

type Props = {
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
  disabled?: boolean;
};

/** Hasta 5 fotos del terreno. Se achican en el navegador antes de subir. */
export function PhotoPicker({ photos, onChange, disabled }: Props) {
  const existingPaths = photos.flatMap((p) => (p.kind === 'new' ? [] : [p.path]));
  const { data: urls } = useJobPhotoUrls(existingPaths);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = MAX_JOB_PHOTOS - photos.length;

  const onPick = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setProcessing(true);
    const added: PhotoItem[] = [];
    try {
      for (const file of files.slice(0, remaining)) {
        added.push({ kind: 'new', key: crypto.randomUUID(), blob: await resizeImage(file, PHOTO_MAX_SIDE, 0.8) });
      }
      if (files.length > remaining) setError(`Podés subir hasta ${MAX_JOB_PHOTOS} fotos: agregamos las primeras.`);
    } catch (e) {
      setError(e instanceof ImageReadError ? e.message : 'No pudimos leer alguna foto. Probá con otra.');
    } finally {
      setProcessing(false);
      if (added.length) onChange([...photos, ...added]);
    }
  };

  return (
    <Stack gap="xs">
      <div>
        <Text size="lg" fw={500}>
          Fotos del terreno (opcional)
        </Text>
        <Text size="sm" c="dimmed">
          Hasta {MAX_JOB_PHOTOS}. Ayudan a que el cortador sepa qué lo espera.
        </Text>
      </div>

      {photos.length > 0 && (
        <SimpleGrid cols={2} spacing="sm">
          {photos.map((photo, i) => (
            <Stack key={photo.key} gap={6}>
              <div className={classes.thumb}>
                {photo.kind === 'new' ? (
                  <BlobImage blob={photo.blob} />
                ) : urls?.[photo.path] ? (
                  <img src={urls[photo.path]} alt="" className={classes.thumbImg} />
                ) : (
                  <Skeleton h="100%" />
                )}
              </div>
              <Button
                variant="light"
                color="red"
                fullWidth
                disabled={disabled}
                leftSection={<IconTrash size={20} aria-hidden />}
                onClick={() => onChange(photos.filter((p) => p.key !== photo.key))}
                aria-label={`Quitar la foto ${i + 1}`}
              >
                Quitar
              </Button>
            </Stack>
          ))}
        </SimpleGrid>
      )}

      {remaining > 0 && (
        <FileButton onChange={(files) => void onPick(files)} accept="image/*" multiple>
          {(props) => (
            <Button
              {...props}
              variant="light"
              loading={processing}
              disabled={disabled}
              leftSection={<IconCamera size={20} aria-hidden />}
            >
              {photos.length ? `Agregar fotos (${photos.length} de ${MAX_JOB_PHOTOS})` : 'Agregar fotos'}
            </Button>
          )}
        </FileButton>
      )}
      {error && (
        <Text size="sm" c="red.8" role="alert">
          {error}
        </Text>
      )}
    </Stack>
  );
}

function BlobImage({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url ? <img src={url} alt="" className={classes.thumbImg} /> : <Skeleton h="100%" />;
}
