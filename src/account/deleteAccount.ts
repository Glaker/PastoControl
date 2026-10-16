import { useQuery } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { forgetPushOnThisDevice } from '../push/pushStore';

/** Lo que impide borrar la cuenta (lo mismo que valida el servidor): hay que cancelarlo o retirarlo a mano. */
export type PendingItem = {
  kind: 'pedido_publicado' | 'pedido_asignado' | 'postulacion_pendiente' | 'postulacion_aceptada';
  job_id: string;
  application_id: string | null;
  address: string;
  at: string;
  is_expired: boolean;
};

export const pendingItemsKey = (userId: string | undefined) => ['pending-items', userId] as const;

export function usePendingItems() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: pendingItemsKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_pending_items');
      if (error) throw error;
      return data as PendingItem[];
    },
    enabled: !!userId,
    // Se vuelve a mirar al volver de cancelar algo.
    staleTime: 0,
  });
}

export class DeleteAccountError extends Error {
  constructor(
    message: string,
    readonly code: 'password' | 'pending' | 'session' | 'other',
  ) {
    super(message);
  }
}

/**
 * Borra la cuenta con la Edge Function delete-account: verifica la sesión y la contraseña, y borra solo a quien
 * llama. Los errores traen el texto para mostrar (DeleteAccountError) o son de red.
 */
export async function deleteMyAccount(password: string): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { body: { password } });
  if (error) {
    // Sin conexión o tiempo agotado: friendlyError lo explica.
    if (!(error instanceof FunctionsHttpError)) throw error;
    const body: { error?: string; code?: string } = await error.context.json().catch(() => ({}));
    const code = body.code === 'password' || body.code === 'pending' || body.code === 'session' ? body.code : 'other';
    throw new DeleteAccountError(body.error ?? 'No pudimos borrar tu cuenta. Probá de nuevo en un rato.', code);
  }
}

/** Después de borrar la cuenta: este dispositivo queda limpio. */
export async function forgetThisDevice(): Promise<void> {
  await forgetPushOnThisDevice();
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('pastocontrol')) localStorage.removeItem(key);
  } catch {
    // Sin localStorage: no hay nada guardado.
  }
  // La sesión ya no existe en el servidor: se borra solo la local.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
