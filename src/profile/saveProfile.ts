import { supabase } from '../lib/supabase';

export type ProfileInput = {
  firstName: string;
  lastName: string;
  phoneE164: string;
  localityId: number;
  isClient: boolean;
  isCutter: boolean;
  currentAvatarPath: string | null;
  /** Foto nueva ya achicada (JPEG). */
  newAvatar: Blob | null;
  removeAvatar: boolean;
};

const bucket = () => supabase.storage.from('avatars');

/**
 * Sube la foto nueva (si hay) a avatars/<uid>/..., guarda el perfil con la RPC y recién
 * entonces borra la foto anterior. Si la RPC falla, borra la foto recién subida.
 */
export async function saveProfile(userId: string, input: ProfileInput): Promise<void> {
  let uploadedPath: string | null = null;
  if (input.newAvatar) {
    uploadedPath = `${userId}/${Date.now()}.jpg`;
    const { error } = await bucket().upload(uploadedPath, input.newAvatar, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
  }

  const avatarPath = uploadedPath ?? (input.removeAvatar ? null : input.currentAvatarPath);

  const { error } = await supabase.rpc('upsert_my_profile', {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone_e164: input.phoneE164,
    p_locality_id: input.localityId,
    p_is_client: input.isClient,
    p_is_cutter: input.isCutter,
    p_avatar_path: avatarPath ?? undefined,
  });

  if (error) {
    if (uploadedPath) await bucket().remove([uploadedPath]).catch(() => undefined);
    throw error;
  }

  const previous = input.currentAvatarPath;
  if (previous && previous !== avatarPath) {
    // Limpieza: si falla no pasa nada grave (queda un archivo huérfano en la carpeta del usuario).
    await bucket().remove([previous]).catch(() => undefined);
  }
}
