import { Button, Modal, SimpleGrid, Skeleton, Text, UnstyledButton } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { useJobPhotoUrls } from './queries';
import classes from './jobs.module.css';

/** Fotos de un trabajo: miniaturas que se abren a pantalla completa. */
export function JobPhotos({ paths }: { paths: string[] }) {
  const { data: urls, error } = useJobPhotoUrls(paths);
  const [open, setOpen] = useState<number | null>(null);

  if (!paths.length) return null;
  if (error) {
    return (
      <Text c="dimmed" size="sm">
        No pudimos cargar las fotos.
      </Text>
    );
  }

  const current = open !== null ? paths[open] : null;

  return (
    <>
      <SimpleGrid cols={3} spacing="xs">
        {paths.map((path, i) => (
          <UnstyledButton
            key={path}
            className={classes.thumb}
            onClick={() => setOpen(i)}
            aria-label={`Ver foto ${i + 1} de ${paths.length}`}
          >
            {urls?.[path] ? (
              <img src={urls[path]} alt="" className={classes.thumbImg} loading="lazy" />
            ) : (
              <Skeleton h="100%" />
            )}
          </UnstyledButton>
        ))}
      </SimpleGrid>

      <Modal
        opened={open !== null}
        onClose={() => setOpen(null)}
        fullScreen
        withCloseButton={false}
        title={open !== null ? `Foto ${open + 1} de ${paths.length}` : undefined}
        styles={{ body: { height: 'calc(100dvh - 4rem)' } }}
      >
        <div className={classes.viewer}>
          <div className={classes.viewerImage}>
            {current && urls?.[current] && <img src={urls[current]} alt={`Foto ${open! + 1} del terreno`} />}
          </div>
          {paths.length > 1 && (
            <SimpleGrid cols={2} spacing="xs">
              <Button
                variant="default"
                leftSection={<IconChevronLeft size={20} aria-hidden />}
                onClick={() => setOpen((i) => (i! + paths.length - 1) % paths.length)}
              >
                Anterior
              </Button>
              <Button
                variant="default"
                rightSection={<IconChevronRight size={20} aria-hidden />}
                onClick={() => setOpen((i) => (i! + 1) % paths.length)}
              >
                Siguiente
              </Button>
            </SimpleGrid>
          )}
          <Button fullWidth leftSection={<IconX size={20} aria-hidden />} onClick={() => setOpen(null)}>
            Cerrar
          </Button>
        </div>
      </Modal>
    </>
  );
}
