// Verificación de red · Fase 8 (borrar la cuenta con la Edge Function, términos, trabajos por distancia).
// Usuarios reales: «borra» (cliente y cortador, es el que borra su cuenta), «otro» (cortador que le hizo un
// trabajo), «tercero» (cliente que intenta borrar a borra) y «sinTerminos» (se registra sin la casilla).
// Se guardan TODAS las respuestas y se verifica:
//   * la Edge Function responde el preflight CORS y rechaza: sin sesión, con un token inventado, con la
//     contraseña de otra cuenta, con la contraseña equivocada y con cosas pendientes (409, sin borrar nada);
//   * con todo cancelado borra SOLO a quien llama (aunque el cuerpo traiga el id de otro);
//   * después: no puede volver a entrar, sus fotos ya no existen, el trabajo realizado sigue para «otro» sin
//     datos de borra, las estadísticas de «otro» no cambian y ninguna respuesta posterior trae sus datos;
//   * el registro con la casilla guarda la aceptación; sin la casilla, accept_terms la guarda;
//   * get_available_jobs filtra por radio y ordena por distancia con sesiones reales.
//
// Uso: node scripts/verificar-red-fase8.mjs  (antes de las 23:40, hora de Argentina: el trabajo se acuerda
// para dentro de 20 minutos y se marca realizado el mismo día).
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY de .env (solo la clave pública).
// Crea usuarios pastocontrol.prueba.f8red-* (se borran con sql/tests/limpiar_usuarios_prueba.sql; borra se borra solo).

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY || KEY.startsWith('sb_secret_')) throw new Error('Falta la configuración pública en .env');
const FN = `${URL_}/functions/v1/delete-account`;

// Datos de borra que no pueden aparecer en ninguna respuesta después del borrado.
const SECRET = { last: 'Zarzalejo', first: 'Zoilo', phone: '+5492345987801', street: 'Calle Zetaborrada', number: '7421' };
const PHONES = { borra: SECRET.phone, otro: '+5492345987802', tercero: '+5492345987803', sinTerminos: '+5492345987804' };
const stamp = Date.now();
const log = []; // { who, phase, what, body }
let phase = 'antes';

function makeClient(who) {
  const recordingFetch = async (input, init) => {
    const res = await fetch(input, init);
    const body = await res.clone().text().catch(() => '');
    log.push({ who, phase, what: `${res.status} ${String(input).replace(URL_, '')}`, body });
    return res;
  };
  return createClient(URL_, KEY, { global: { fetch: recordingFetch }, auth: { persistSession: false, autoRefreshToken: false } });
}
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};
const results = [];
const check = (label, ok, detail = '') => results.push({ label, ok: !!ok, detail });

async function signUp(role, withTerms = true) {
  const sb = makeClient(role);
  const email = `pastocontrol.prueba.f8red-${role}-${stamp}@gmail.com`;
  const password = `Prueba-${randomUUID()}`;
  const data = must(await sb.auth.signUp({ email, password, options: withTerms ? { data: { terms_version: 1 } } : {} }), `registro ${role}`);
  if (!data.session) throw new Error('El registro no devolvió sesión (¿"Confirm email" activado?)');
  return { sb, uid: data.user.id, email, password, token: data.session.access_token, role };
}

const borra = await signUp('borra');
const otro = await signUp('otro');
const tercero = await signUp('tercero');
const sinTerminos = await signUp('sinTerminos', false);

// Términos: con la casilla queda aceptado; sin ella, no (y accept_terms lo guarda).
const st1 = must(await borra.sb.rpc('get_my_terms_status'), 'estado términos');
check('Registro con la casilla: la aceptación quedó guardada', st1[0]?.accepted === true && st1[0]?.current_version === 1, JSON.stringify(st1));
const st2 = must(await sinTerminos.sb.rpc('get_my_terms_status'), 'estado términos 2');
check('Registro sin la casilla: no figura aceptado', st2[0]?.accepted === false, JSON.stringify(st2));
must(await sinTerminos.sb.rpc('accept_terms', { p_version: 1 }), 'accept_terms');
const st3 = must(await sinTerminos.sb.rpc('get_my_terms_status'), 'estado términos 3');
check('accept_terms guarda la aceptación', st3[0]?.accepted === true, JSON.stringify(st3));

// Perfiles (firma nueva, sin localidad) y fotos.
const tinyJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
for (const u of [borra, otro]) {
  must(await u.sb.storage.from('avatars').upload(`${u.uid}/a.jpg`, tinyJpeg, { contentType: 'image/jpeg' }), `avatar ${u.role}`);
}
must(await borra.sb.rpc('upsert_my_profile', {
  p_first_name: SECRET.first, p_last_name: SECRET.last, p_phone_e164: PHONES.borra, p_is_client: true, p_is_cutter: true,
  p_avatar_path: `${borra.uid}/a.jpg`,
}), 'perfil borra');
must(await otro.sb.rpc('upsert_my_profile', {
  p_first_name: 'Otro', p_last_name: 'Ortiz', p_phone_e164: PHONES.otro, p_is_client: false, p_is_cutter: true, p_avatar_path: `${otro.uid}/a.jpg`,
}), 'perfil otro');
must(await tercero.sb.rpc('upsert_my_profile', {
  p_first_name: 'Tercero', p_last_name: 'Torres', p_phone_e164: PHONES.tercero, p_is_client: true, p_is_cutter: false,
}), 'perfil tercero');
must(await borra.sb.rpc('set_my_base_location', { p_lat: -35.45, p_lng: -60.19 }), 'casa borra');
must(await otro.sb.rpc('set_my_base_location', { p_lat: -34.90, p_lng: -58.00 }), 'casa otro');

// Un trabajo de borra (en otra ciudad: Brandsen) hecho por otro: realizado y calificado de los dos lados.
const job1 = randomUUID();
const photo1 = `${borra.uid}/${job1}/1.jpg`;
must(await borra.sb.storage.from('job-photos').upload(photo1, tinyJpeg, { contentType: 'image/jpeg' }), 'foto pedido');
must(await borra.sb.rpc('create_job', {
  p_id: job1, p_location_lat: -35.1680, p_location_lng: -58.2340, p_address_street: SECRET.street, p_address_number: SECRET.number,
  p_price_ars: 15000, p_desired_at: new Date(Date.now() + 20 * 60e3).toISOString(), p_photo_paths: [photo1],
}), 'create_job 1');
const appId = must(await otro.sb.rpc('apply_to_job', { p_job_id: job1 }), 'postulación');
const app = must(await borra.sb.from('applications').select('id, updated_at').eq('id', appId).single(), 'versión');
must(await borra.sb.rpc('accept_application', { p_application_id: app.id, p_expected_updated_at: app.updated_at }), 'aceptar');
must(await borra.sb.rpc('mark_job_done', { p_job_id: job1 }), 'realizado');
must(await borra.sb.rpc('rate_job', { p_job_id: job1, p_would_work_again: true }), 'calificar 1');
must(await otro.sb.rpc('rate_job', { p_job_id: job1, p_would_work_again: true }), 'calificar 2');
const statsBefore = must(await otro.sb.rpc('get_profile_stats', { p_user_id: otro.uid }), 'stats antes')[0];
const photoBefore = await otro.sb.storage.from('job-photos').createSignedUrl(photo1, 60);
check('Antes: otro ve la foto del trabajo que hizo (control)', !photoBefore.error, photoBefore.error?.message);

// Un pedido publicado: algo pendiente.
const job2 = randomUUID();
must(await borra.sb.rpc('create_job', {
  p_id: job2, p_location_lat: -35.43, p_location_lng: -60.17, p_address_street: SECRET.street, p_address_number: SECRET.number,
  p_price_ars: 15000, p_desired_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
}), 'create_job 2');

// ——— La Edge Function ———
async function callFn(who, { token, body, method = 'POST', headers = {} }) {
  const res = await fetch(FN, {
    method,
    headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await res.text();
  log.push({ who, phase, what: `${res.status} ${method} /functions/v1/delete-account`, body: text });
  let json = null;
  try { json = JSON.parse(text); } catch { /* no es JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

const pre = await callFn('navegador', { method: 'OPTIONS', headers: { Origin: 'https://pastocontrol.vercel.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type, apikey, x-client-info' } });
check('Preflight CORS: responde y permite el origen y los headers de la app',
  pre.status < 300 && pre.headers.get('access-control-allow-origin') === '*' && /authorization/i.test(pre.headers.get('access-control-allow-headers') ?? ''),
  `${pre.status} ${pre.headers.get('access-control-allow-origin')} ${pre.headers.get('access-control-allow-headers')}`);

const sinSesion = await callFn('anon', { body: { password: borra.password } });
check('Sin sesión: 401', sinSesion.status === 401, `${sinSesion.status} ${sinSesion.text}`);
const inventado = await callFn('anon', { token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.inventado', body: { password: borra.password } });
check('Con un token inventado: 401', inventado.status === 401, `${inventado.status} ${inventado.text}`);
const ajena = await callFn('tercero', { token: tercero.token, body: { password: borra.password, user_id: borra.uid, p_user_id: borra.uid } });
check('Tercero con la contraseña de borra (y su id en el cuerpo): 403, la contraseña se compara con la cuenta del token',
  ajena.status === 403 && ajena.json?.code === 'password', `${ajena.status} ${ajena.text}`);
const equivocada = await callFn('borra', { token: borra.token, body: { password: 'no-es-esta' } });
check('Borra con la contraseña equivocada: 403', equivocada.status === 403 && equivocada.json?.code === 'password', `${equivocada.status} ${equivocada.text}`);
const pendiente = await callFn('borra', { token: borra.token, body: { password: borra.password } });
check('Borra con un pedido publicado: 409 con el motivo', pendiente.status === 409 && pendiente.json?.code === 'pending', `${pendiente.status} ${pendiente.text}`);
const sigue = await otro.sb.from('profiles').select('id').eq('id', borra.uid);
check('Después de los rechazos, borra sigue existiendo', sigue.data?.length === 1, JSON.stringify(sigue.data));
const sigueTercero = must(await tercero.sb.rpc('get_my_terms_status'), 'tercero sigue');
check('Y tercero también', sigueTercero[0]?.accepted === true);
const pend = must(await borra.sb.rpc('get_my_pending_items'), 'pendientes');
check('get_my_pending_items muestra el pedido publicado', pend.length === 1 && pend[0].job_id === job2 && pend[0].kind === 'pedido_publicado', JSON.stringify(pend));

must(await borra.sb.rpc('cancel_job', { p_job_id: job2 }), 'cancelar pedido 2');
phase = 'borrado';
const ok = await callFn('borra', { token: borra.token, body: { password: borra.password, user_id: tercero.uid, p_user_id: tercero.uid } });
check('Con todo cancelado: 200 (el id de tercero en el cuerpo se ignora)', ok.status === 200 && ok.json?.ok === true, `${ok.status} ${ok.text}`);

// ——— Después ———
phase = 'despues';
const terceroVive = await tercero.sb.rpc('get_my_terms_status');
check('Tercero sigue existiendo y con su sesión', !terceroVive.error && terceroVive.data?.[0]?.accepted === true, terceroVive.error?.message);
const reLogin = await makeClient('borra-de-nuevo').auth.signInWithPassword({ email: borra.email, password: borra.password });
check('Borra ya no puede entrar', !!reLogin.error, reLogin.error?.message ?? 'entró');
const perfil = await otro.sb.from('profiles').select('id').eq('id', borra.uid);
check('El perfil de borra ya no existe', perfil.data?.length === 0, JSON.stringify(perfil.data));
const avatar = await otro.sb.storage.from('avatars').createSignedUrl(`${borra.uid}/a.jpg`, 60);
check('Su foto de perfil ya no existe', !!avatar.error, avatar.error?.message ?? 'existe');
const foto = await otro.sb.storage.from('job-photos').createSignedUrl(photo1, 60);
check('La foto de su pedido ya no existe', !!foto.error, foto.error?.message ?? 'existe');
const trabajo = await otro.sb.from('jobs').select('id, client_id, status, address_street, address_number, location_lat, photo_paths, client:profiles!jobs_client_id_fkey(id, first_name)').eq('id', job1).maybeSingle();
check('El trabajo realizado sigue para otro, sin dueño, dirección, pin ni fotos',
  trabajo.data?.status === 'realizado' && trabajo.data.client_id === null && trabajo.data.client === null &&
  trabajo.data.address_street === null && trabajo.data.location_lat === null && trabajo.data.photo_paths.length === 0,
  JSON.stringify(trabajo.data ?? trabajo.error));
const contacto = await otro.sb.rpc('get_job_contact', { p_job_id: job1 });
check('El contacto de borra ya no llega (sin error, sin filas)', !contacto.error && contacto.data.length === 0, JSON.stringify(contacto));
const statsAfter = must(await otro.sb.rpc('get_profile_stats', { p_user_id: otro.uid }), 'stats después')[0];
check('Las estadísticas de otro no cambiaron', JSON.stringify(statsAfter) === JSON.stringify(statsBefore),
  `${JSON.stringify(statsBefore)} → ${JSON.stringify(statsAfter)}`);
check('(control) otro tenía 1 trabajo realizado', statsBefore.done_as_cutter === 1, JSON.stringify(statsBefore));
const avisos = must(await otro.sb.from('notifications').select('kind, payload').order('created_at'), 'avisos otro');
check('Los avisos de otro siguen, sin el nombre ni la dirección de borra',
  avisos.length >= 2 && avisos.every((n) => !('actor_name' in n.payload) && !('address' in n.payload)), JSON.stringify(avisos));
const rated = must(await otro.sb.rpc('has_rated_job', { p_job_id: job1 }), 'has_rated');
check('Otro sigue sabiendo que ya calificó', rated === true);

// ——— Radio (con sesiones reales) ———
phase = 'radio';
const near = randomUUID();
const far = randomUUID();
must(await tercero.sb.rpc('create_job', {
  p_id: near, p_location_lat: -34.90 + 3 / 111.195, p_location_lng: -58.00, p_address_street: 'Cerca', p_address_number: '1',
  p_price_ars: 15000, p_desired_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
}), 'pedido cerca');
must(await tercero.sb.rpc('create_job', {
  p_id: far, p_location_lat: -34.90 + 12 / 111.195, p_location_lng: -58.00, p_address_street: 'Lejos', p_address_number: '1',
  p_price_ars: 15000, p_desired_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
}), 'pedido lejos');
const r5 = must(await otro.sb.rpc('get_available_jobs', { p_lat: -34.90, p_lng: -58.00, p_radius_km: 5 }), 'radio 5');
const r20 = must(await otro.sb.rpc('get_available_jobs', { p_lat: -34.90, p_lng: -58.00, p_radius_km: 20 }), 'radio 20');
const mine = (rows) => rows.filter((r) => r.job_id === near || r.job_id === far).map((r) => r.job_id);
check('5 km: solo el de 3 km', JSON.stringify(mine(r5)) === JSON.stringify([near]), JSON.stringify(r5));
check('20 km: los dos, el más cerca primero', JSON.stringify(mine(r20)) === JSON.stringify([near, far]), JSON.stringify(r20));
check('La distancia viene del servidor (≈ 3 km)', Math.abs((r5.find((r) => r.job_id === near)?.distance_m ?? 0) - 3000) < 5, JSON.stringify(r5));
must(await otro.sb.rpc('set_my_search_radius', { p_km: 50 }), 'guardar radio');
const priv = must(await otro.sb.from('profile_private').select('search_radius_km').eq('user_id', otro.uid).single(), 'radio guardado');
check('El radio elegido queda en los datos privados', priv.search_radius_km === 50, JSON.stringify(priv));
const ajenoRadio = await tercero.sb.from('profile_private').select('search_radius_km').eq('user_id', otro.uid);
check('Otro usuario no lo ve', ajenoRadio.data?.length === 0, JSON.stringify(ajenoRadio.data));
for (const id of [near, far]) must(await tercero.sb.rpc('cancel_job', { p_job_id: id }), 'cancelar');

// ——— Ninguna respuesta posterior al borrado trae datos de borra ———
const leaks = log.filter((l) => l.phase === 'despues' || l.phase === 'radio').filter((l) =>
  [SECRET.last, SECRET.first, SECRET.phone, SECRET.street, borra.email, `${borra.uid}/`].some((s) => l.body.includes(s)),
);
check(`Ninguna respuesta después del borrado trae datos de borra (${log.filter((l) => l.phase !== 'antes').length} respuestas revisadas)`,
  leaks.length === 0, leaks.map((l) => `${l.who} ${l.what}`).join(' | '));

// Limpieza de archivos que quedan (los de otro).
await otro.sb.storage.from('avatars').remove([`${otro.uid}/a.jpg`]);

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.label}${r.ok ? '' : ` → ${r.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} chequeos OK · ${log.length} respuestas HTTP guardadas`);
process.exit(failed.length ? 1 : 0);
