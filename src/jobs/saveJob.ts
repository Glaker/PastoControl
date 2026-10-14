import { supabase } from '../lib/supabase';

/** Foto en el formulario: una que ya está en el pedido o una nueva, ya achicada (JPEG). */
export type PhotoItem = { kind: 'existing'; key: string; path: string } | { kind: 'new'; key: string; blob: Blob };

export type JobInput = {
  zone: string;
  address: string;
  priceArs: number;
  /** ISO, ya convertido desde la zona horaria de la localidad. */
  desiredAt: string;
  notes: string;
  photos: PhotoItem[];
};

export const MAX_JOB_PHOTOS = 5;

const bucket = () => supabase.storage.from('job-photos');

/**
 * Sube las fotos nuevas a job-photos/<uid>/<job_id>/ y devuelve las rutas finales en el orden del
 * formulario. Si alguna subida falla, borra las que sí subieron.
 */
async function uploadPhotos(userId: string, jobId: string, photos: PhotoItem[]) {
  const stamp = Date.now();
  const uploaded: string[] = [];
  try {
    const paths = await Promise.all(
      photos.map(async (photo, i) => {
        if (photo.kind === 'existing') return photo.path;
        const path = `${userId}/${jobId}/${stamp}-${i}.jpg`;
        const { error } = await bucket().upload(path, photo.blob, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
          upsert: false,
        });
        if (error) throw error;
        uploaded.push(path);
        return path;
      }),
    );
    return { paths, uploaded };
  } catch (e) {
    await removeQuietly(uploaded);
    throw e;
  }
}

async function removeQuietly(paths: string[]) {
  if (paths.length) await bucket().remove(paths).catch(() => undefined);
}

/**
 * Publica un pedido. El id se genera acá para subir las fotos antes a su carpeta;
 * si la RPC falla, se borran.
 */
export async function createJob(userId: string, input: JobInput, republishedFrom?: string): Promise<string> {
  const jobId = crypto.randomUUID();
  const { paths, uploaded } = await uploadPhotos(userId, jobId, input.photos);

  const { error } = await supabase.rpc('create_job', {
    p_id: jobId,
    p_zone: input.zone,
    p_address: input.address,
    p_price_ars: input.priceArs,
    p_desired_at: input.desiredAt,
    p_notes: input.notes,
    p_photo_paths: paths,
    p_republished_from: republishedFrom,
  });
  if (error) {
    await removeQuietly(uploaded);
    throw error;
  }
  return jobId;
}

/** Edita un pedido. Recién después de guardar se borran las fotos que se sacaron. */
export async function updateJob(userId: string, jobId: string, input: JobInput, previousPaths: string[]) {
  const { paths, uploaded } = await uploadPhotos(userId, jobId, input.photos);

  const { error } = await supabase.rpc('update_job', {
    p_job_id: jobId,
    p_zone: input.zone,
    p_address: input.address,
    p_price_ars: input.priceArs,
    p_desired_at: input.desiredAt,
    p_notes: input.notes,
    p_photo_paths: paths,
  });
  if (error) {
    await removeQuietly(uploaded);
    throw error;
  }

  // Limpieza: si falla no pasa nada grave (queda un archivo huérfano en la carpeta del usuario).
  await removeQuietly(previousPaths.filter((p) => !paths.includes(p)));
}

export async function cancelJob(jobId: string) {
  const { error } = await supabase.rpc('cancel_job', { p_job_id: jobId });
  if (error) throw error;
}
