import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

/**
 * Versión de los términos y la política de privacidad que muestra ESTA versión de la app
 * (src/pages/legal/). La vigente está en la base (terms_versions). Para publicar una nueva: cambiar los
 * textos y este número, deployar, y recién después insertar la versión en terms_versions.
 */
export const TERMS_VERSION = 1;
export const TERMS_DATE = '16 de octubre de 2026';
export const CONTACT_EMAIL = 'pastocontrol@gmail.com';

export type TermsStatus = { currentVersion: number; accepted: boolean };

export const termsStatusKey = (userId: string | undefined) => ['terms-status', userId] as const;

/** Si el usuario logueado aceptó la versión vigente. */
export function useTermsStatus() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: termsStatusKey(userId),
    queryFn: async (): Promise<TermsStatus> => {
      const { data, error } = await supabase.rpc('get_my_terms_status');
      if (error) throw error;
      const row = data[0];
      return { currentVersion: row?.current_version ?? TERMS_VERSION, accepted: !!row?.accepted };
    },
    enabled: !!userId,
    staleTime: 5 * 60_000,
  });
}

export async function acceptTerms(): Promise<void> {
  const { error } = await supabase.rpc('accept_terms', { p_version: TERMS_VERSION });
  if (error) throw error;
}
