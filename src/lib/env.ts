export type SupabaseConfig = { url: string; publishableKey: string };

export type ConfigResult = { ok: true; config: SupabaseConfig } | { ok: false; problem: string };

/**
 * Lee la configuración pública de Supabase. Se niega a arrancar si la clave
 * parece una clave secreta (service_role / sb_secret_): esas nunca van en el front.
 */
export function readSupabaseConfig(): ConfigResult {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    return {
      ok: false,
      problem: 'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copiá .env.example a .env y completalo.',
    };
  }
  if (publishableKey.startsWith('sb_secret_') || jwtRole(publishableKey) === 'service_role') {
    return {
      ok: false,
      problem: 'La clave configurada es una clave secreta. En el front solo va la publishable (o anon) key.',
    };
  }
  return { ok: true, config: { url, publishableKey } };
}

function jwtRole(key: string): string | null {
  const payload = key.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: unknown };
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}
