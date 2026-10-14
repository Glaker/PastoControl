import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { readSupabaseConfig } from './env';

const result = readSupabaseConfig();

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * fetch con límite de tiempo: con señal mala un pedido puede quedar colgado y el botón
 * girando para siempre. A los 30 s se corta y se muestra "La conexión está muy lenta".
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const own = init?.signal;
  const signal = own && 'any' in AbortSignal ? AbortSignal.any([own, timeout]) : (own ?? timeout);
  return fetch(input, { ...init, signal });
};

export const configProblem = result.ok ? null : result.problem;

// Si la configuración es inválida, main.tsx muestra el problema y nunca usa este cliente.
export const supabase = createClient<Database>(
  result.ok ? result.config.url : 'http://localhost',
  result.ok ? result.config.publishableKey : 'missing',
  {
    global: { fetch: fetchWithTimeout },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Flujo implícito: el link para recuperar la clave funciona aunque se abra en otro navegador
      // (en iOS el mail se abre en Safari, no en la PWA instalada).
      flowType: 'implicit',
    },
  },
);
