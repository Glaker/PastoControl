// cleanup-photos · Borra las fotos huérfanas de job-photos (archivos de más de 24 h que no figuran en ningún
// pedido: create_job que nunca llegó, o fotos reemplazadas que el front no pudo borrar).
// La llama una vez por día pg_cron (private.queue_photo_cleanup, con pg_net).
// Autenticación (verify_jwt = false, pg_cron no tiene un JWT de usuario): header x-push-secret = el mismo
// secreto que usa send-push (PUSH_WEBHOOK_SECRET; en Vault, push_webhook_secret). Sin él: 401 antes de tocar
// la base. La lista sale siempre de la base (get_orphan_job_photos, solo service_role), nunca del pedido.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const key = (JSON.parse(keys) as Record<string, string>).default;
      if (key) return key;
    } catch {
      // formato inesperado: se usa la clave de servicio clásica
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const encoder = new TextEncoder();

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
function sameSecret(given: string | null, expected: string): boolean {
  const a = encoder.encode(given ?? '');
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret) {
    console.error('Falta el secreto PUSH_WEBHOOK_SECRET');
    return json(500, { error: 'config' });
  }
  if (!sameSecret(req.headers.get('x-push-secret'), secret)) return json(401, { error: 'unauthorized' });

  const { data, error } = await supabase.rpc('get_orphan_job_photos', { p_limit: 500 });
  if (error) {
    console.error('No se pudo leer la lista de fotos huérfanas', error.message);
    return json(500, { error: 'db' });
  }
  const paths = (data ?? []) as string[];

  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error: removeError } = await supabase.storage.from('job-photos').remove(chunk);
    if (removeError) console.error('Quedaron fotos sin borrar', removeError.message);
    else removed += chunk.length;
  }

  console.log('Fotos huérfanas borradas', removed, 'de', paths.length);
  return json(200, { found: paths.length, removed });
});
