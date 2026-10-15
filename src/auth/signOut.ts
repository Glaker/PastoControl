import { supabase } from '../lib/supabase';
import { forgetPushOnThisDevice } from '../push/pushStore';

/** Cierra la sesión. Antes saca este dispositivo de los avisos push de la cuenta. */
export async function signOut(): Promise<void> {
  await forgetPushOnThisDevice();
  await supabase.auth.signOut();
}
