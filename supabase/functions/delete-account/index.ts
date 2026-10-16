// delete-account · Fase 8 (borrar la cuenta).
// La llama la app con la sesión del usuario (Authorization: Bearer <JWT>) y { password }.
//   1. El id sale del JWT, verificado contra Auth (auth.getUser): nunca del cuerpo. Cada uno solo se borra a sí mismo.
//   2. La contraseña se verifica de nuevo (signInWithPassword con el email de ese usuario, en un cliente aparte;
//      la sesión que abre se cierra enseguida).
//   3. public.delete_account(uid) con la clave de servicio: rechaza si hay algo pendiente (409), anonimiza lo de la
//      otra parte, borra los datos y devuelve los archivos de sus carpetas.
//   4. Borra esos archivos por la API de Storage (Supabase no deja borrarlos por SQL).
//   5. Borra el usuario de Auth.
//
// No necesita secretos propios: SUPABASE_URL, la clave de servicio y la pública las pone Supabase. La clave de
// servicio solo vive acá (nunca en el front).

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

/** Clave nueva (SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS) o la clásica. */
function envKey(json: string, classic: string): string {
  const keys = Deno.env.get(json);
  if (keys) {
    try {
      const key = (JSON.parse(keys) as Record<string, string>).default;
      if (key) return key;
    } catch {
      // formato inesperado: se usa la clave clásica
    }
  }
  return Deno.env.get(classic)!;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, envKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY'), noSession);
const publishableKey = envKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SESSION_EXPIRED = 'Tu sesión venció. Volvé a entrar.';
const CONTACT = 'Escribinos a pastocontrol@gmail.com y la borramos nosotros.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Método no permitido.' });

  // 1. Quién llama: el JWT, verificado por Auth.
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json(401, { error: SESSION_EXPIRED, code: 'session' });
  const { data: who, error: whoError } = await admin.auth.getUser(token);
  const user = who?.user;
  if (whoError || !user) return json(401, { error: SESSION_EXPIRED, code: 'session' });
  if (!user.email) return json(400, { error: `No pudimos verificar tu cuenta. ${CONTACT}` });

  let password: unknown;
  try {
    password = ((await req.json()) as { password?: unknown }).password;
  } catch {
    return json(400, { error: 'Escribí tu contraseña.' });
  }
  if (typeof password !== 'string' || !password || password.length > 200) {
    return json(400, { error: 'Escribí tu contraseña.' });
  }

  // 2. La contraseña, de nuevo.
  const check = createClient(SUPABASE_URL, publishableKey, noSession);
  const signIn = await check.auth.signInWithPassword({ email: user.email, password });
  if (signIn.error || signIn.data.user?.id !== user.id) {
    if (signIn.error?.status === 429) {
      return json(429, { error: 'Hiciste varios intentos seguidos. Esperá unos minutos y probá de nuevo.' });
    }
    return json(403, { error: 'La contraseña no es correcta.', code: 'password' });
  }
  await check.auth.signOut({ scope: 'local' }).catch(() => undefined);

  // 3. La base: pendientes, anonimizar y borrar.
  const { data, error: rpcError } = await admin.rpc('delete_account', { p_user_id: user.id });
  if (rpcError) {
    if (rpcError.hint === 'pendientes') return json(409, { error: rpcError.message, code: 'pending' });
    console.error('delete_account falló', user.id, rpcError.message);
    return json(500, { error: 'No pudimos borrar tu cuenta. Probá de nuevo en un rato.' });
  }

  // 4. Sus archivos.
  const files = (data ?? {}) as { avatars?: string[]; job_photos?: string[] };
  await removeFiles('avatars', files.avatars ?? [], user.id);
  await removeFiles('job-photos', files.job_photos ?? [], user.id);

  // 5. El usuario de Auth (arrastra sus sesiones, identidades y metadatos).
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('No se pudo borrar el usuario de Auth', user.id, deleteError.message);
    return json(500, { error: `Borramos tus datos, pero no pudimos terminar. ${CONTACT}` });
  }

  return json(200, { ok: true });
});

/** Borra de a 100, con hasta 3 intentos. Si no se puede, queda en el log (solo el id) para borrarlo a mano. */
async function removeFiles(bucket: string, paths: string[], userId: string) {
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (!error) break;
      if (attempt === 3) console.error('Quedaron archivos sin borrar', bucket, userId, error.message);
    }
  }
}
