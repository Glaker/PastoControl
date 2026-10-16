import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import type { Tables } from '../lib/database.types';
import { supabase } from '../lib/supabase';

export type Locality = Tables<'localities'>;
export type MyProfile = Tables<'profiles'> & {
  /** Datos privados (solo los lee el dueño): apellido, WhatsApp, la ubicación base del cortador y la
   * distancia hasta la que busca trabajos. */
  private: Pick<Tables<'profile_private'>, 'last_name' | 'phone_e164' | 'base_lat' | 'base_lng' | 'search_radius_km'>;
  /** Solo para la zona horaria y el centro del mapa por defecto (ya no se elige ni filtra). */
  locality: Locality;
};

export const myProfileKey = (userId: string | undefined) => ['my-profile', userId] as const;

async function fetchMyProfile(userId: string): Promise<MyProfile | null> {
  const [profile, priv] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter, created_at, updated_at, locality:localities(*)')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('profile_private').select('last_name, phone_e164, base_lat, base_lng, search_radius_km').eq('user_id', userId).maybeSingle(),
  ]);
  if (profile.error) throw profile.error;
  if (priv.error) throw priv.error;
  if (!profile.data || !priv.data) return null;
  const { locality, ...rest } = profile.data;
  if (!locality) return null;
  return { ...rest, locality, private: priv.data };
}

/** Perfil completo del usuario logueado (incluye sus propios datos privados). null = sin perfil todavía. */
export function useMyProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: myProfileKey(userId),
    queryFn: () => fetchMyProfile(userId!),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}

const SIGNED_URL_SECONDS = 60 * 60;

/** URL firmada de una foto de perfil (el bucket es privado). */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar-url', path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path!, SIGNED_URL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!path,
    staleTime: (SIGNED_URL_SECONDS - 10 * 60) * 1000,
    gcTime: (SIGNED_URL_SECONDS - 5 * 60) * 1000,
  });
}

/** Cómo se muestra a alguien que borró su cuenta. */
export const DELETED_USER = 'Usuario eliminado';

/** "Ana Á." (o «Usuario eliminado» si la persona borró su cuenta). */
export function displayName(p: { first_name: string | null; last_initial: string | null } | null | undefined) {
  return p?.first_name ? `${p.first_name} ${p.last_initial}.` : DELETED_USER;
}
