// Verificación de red · Fase 2.
// Registra tres usuarios reales (cliente, cortador y tercero), publica un pedido con foto y hace,
// con la sesión de cada uno y como anon, los mismos pedidos HTTP que la app y algunos más
// "maliciosos" (embed de profile_private, select *, etc.). Guarda TODAS las respuestas y verifica que los
// teléfonos y apellidos ajenos no aparezcan en ninguna. Desde la Fase 7 la dirección es visible para
// quien ve el pedido (el cortador sí la recibe); el tercero sin rol de cortador y anon siguen sin verla.
//
// Uso: node scripts/verificar-red-fase2.mjs <ruta a una foto .jpg>
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY de .env (solo la clave pública).
// Al final borra las fotos subidas y cancela el pedido. Los usuarios quedan: se borran con
// sql/tests/limpiar_usuarios_prueba.sql (patrón pastocontrol.prueba.%@gmail.com).

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

const photoPath = process.argv[2];
if (!photoPath) throw new Error('Pasá la ruta de una foto .jpg');
const photo = readFileSync(photoPath);

const ADDRESS = 'Calle Secretísima 4321';
const PHONES = { cliente: '+5492345987001', cortador: '+5492345987002', tercero: '+5492345987003' };
const LAST_NAMES = { cliente: 'Zapiola', cortador: 'Yrigoyen', tercero: 'Xirau' };
const stamp = Date.now();

/** Cliente de supabase que registra cada respuesta (texto completo) con una etiqueta. */
function makeClient(who, log) {
  const recordingFetch = async (input, init) => {
    const res = await fetch(input, init);
    const body = await res.clone().text().catch(() => '');
    log.push({ who, url: String(input), status: res.status, body });
    return res;
  };
  return createClient(URL_, KEY, {
    global: { fetch: recordingFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const log = [];
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function signUp(role) {
  const sb = makeClient(role, log);
  const email = `pastocontrol.prueba.f2-${role}-${stamp}@gmail.com`;
  const data = must(await sb.auth.signUp({ email, password: `Prueba-${randomUUID()}` }), `registro ${role}`);
  if (!data.session) throw new Error('El registro no devolvió sesión (¿"Confirm email" activado?)');
  return { sb, uid: data.user.id };
}

const cliente = await signUp('cliente');
const cortador = await signUp('cortador');
const tercero = await signUp('tercero');
const anon = makeClient('anon', log);

const { data: loc } = await cliente.sb.from('localities').select('id').eq('slug', '25-de-mayo-bsas').single();

// Perfiles
must(await cliente.sb.rpc('upsert_my_profile', {
  p_first_name: 'Clienta', p_last_name: LAST_NAMES.cliente, p_phone_e164: PHONES.cliente,
  p_locality_id: loc.id, p_is_client: true, p_is_cutter: false,
}), 'perfil cliente');
const avatar = `${cortador.uid}/a.jpg`;
must(await cortador.sb.storage.from('avatars').upload(avatar, photo, { contentType: 'image/jpeg' }), 'avatar cortador');
must(await cortador.sb.rpc('upsert_my_profile', {
  p_first_name: 'Cortador', p_last_name: LAST_NAMES.cortador, p_phone_e164: PHONES.cortador,
  p_locality_id: loc.id, p_is_client: false, p_is_cutter: true, p_avatar_path: avatar,
}), 'perfil cortador');
must(await tercero.sb.rpc('upsert_my_profile', {
  p_first_name: 'Tercero', p_last_name: LAST_NAMES.tercero, p_phone_e164: PHONES.tercero,
  p_locality_id: loc.id, p_is_client: true, p_is_cutter: false,
}), 'perfil tercero');

// Pedido con foto, igual que la app
const jobId = randomUUID();
const jobPhoto = `${cliente.uid}/${jobId}/${stamp}-0.jpg`;
must(await cliente.sb.storage.from('job-photos').upload(jobPhoto, photo, { contentType: 'image/jpeg' }), 'foto pedido');
must(await cliente.sb.rpc('create_job', {
  p_id: jobId, p_location_lat: -35.43, p_location_lng: -60.17, p_address_street: ADDRESS, p_address_number: '1', p_zone: 'Barrio Prueba', p_price_ars: 15000,
  p_desired_at: new Date(Date.now() + 2 * 86400e3).toISOString(), p_notes: 'Nota de prueba', p_photo_paths: [jobPhoto],
}), 'create_job');

const JOB_SELECT =
  'id, client_id, locality_id, zone, address_street, address_number, address_between, location_lat, location_lng, price_ars, desired_at, notes, photo_paths, status, republished_from, cancelled_at, created_at, updated_at, is_expired, ' +
  'locality:localities(name, timezone), client:profiles!jobs_client_id_fkey(id, first_name, last_initial, avatar_path)';

/** Todo lo que un usuario sin permiso podría intentar para sacar la dirección o el teléfono. */
async function probe(who, sb) {
  const r = {};
  r.lista = await sb.from('jobs').select(JOB_SELECT).eq('status', 'publicado');
  r.detalle = await sb.from('jobs').select(JOB_SELECT).eq('id', jobId).maybeSingle();
  r.selectTodo = await sb.from('jobs').select('*');
  r.jobPrivate = await sb.from('job_private').select('*');
  r.embedPerfilPrivado = await sb.from('profiles').select('*, profile_private(*)');
  r.profilePrivate = await sb.from('profile_private').select('*');
  r.foto = await sb.storage.from('job-photos').createSignedUrl(jobPhoto, 60);
  r.listarCarpeta = await sb.storage.from('job-photos').list(`${cliente.uid}/${jobId}`);
  r.editar = await sb.rpc('update_job', {
    p_job_id: jobId, p_location_lat: -35.43, p_location_lng: -60.17, p_address_street: 'Robada', p_address_number: '1', p_price_ars: 1000,
    p_desired_at: new Date(Date.now() + 86400e3).toISOString(), p_photo_paths: [],
  });
  r.cancelar = await sb.rpc('cancel_job', { p_job_id: jobId });
  return r;
}

const results = {
  cortador: await probe('cortador', cortador.sb),
  tercero: await probe('tercero', tercero.sb),
  anon: await probe('anon', anon),
};
const propio = {
  detalle: await cliente.sb.from('jobs').select(JOB_SELECT).eq('id', jobId).maybeSingle(),
};

// Chequeos
const checks = [];
const check = (label, ok, extra = '') => checks.push({ label, ok, extra });

const leaks = (who, needles) =>
  log.filter((e) => e.who === who && needles.some((n) => e.body.includes(n))).map((e) => `${e.status} ${e.url}`);

const secretsOf = (role) => [PHONES[role], PHONES[role].slice(4), LAST_NAMES[role]];
// La dirección ya no es secreta para el cortador (ve el pedido); sí para el tercero y anon.
const forCortador = [...secretsOf('cliente'), ...secretsOf('tercero')];
const forTercero = [ADDRESS, ...secretsOf('cliente'), ...secretsOf('cortador')];
const forAnon = [ADDRESS, ...secretsOf('cliente'), ...secretsOf('cortador'), ...secretsOf('tercero')];

check('Cortador: ninguna respuesta tiene teléfonos ni apellidos ajenos', leaks('cortador', forCortador).length === 0, leaks('cortador', forCortador).join(', '));
check('Tercero: ninguna respuesta tiene la dirección ni datos privados ajenos', leaks('tercero', forTercero).length === 0, leaks('tercero', forTercero).join(', '));
check('Anon: ninguna respuesta tiene la dirección ni datos privados', leaks('anon', forAnon).length === 0, leaks('anon', forAnon).join(', '));

const c = results.cortador;
check('Cortador ve el pedido en la lista', c.lista.data?.some((j) => j.id === jobId));
check('Cortador ve el detalle con el nombre visible "Clienta Z."', c.detalle.data?.client?.first_name === 'Clienta' && c.detalle.data?.client?.last_initial === 'Z');
check('Cortador ve la dirección y el pin del pedido (dirección visible)', c.detalle.data?.address_street === ADDRESS && c.detalle.data?.location_lat != null);
check('job_private ya no existe (la API responde error)', !!c.jobPrivate.error);
check('Cortador: profile_private solo el suyo', c.profilePrivate.data?.length === 1);
check('Cortador puede ver la foto del pedido', !!c.foto.data?.signedUrl);
check('Cortador no puede editar el pedido', !!c.editar.error);
check('Cortador no puede cancelar el pedido', !!c.cancelar.error);

const t = results.tercero;
check('Tercero (sin rol de cortador) no ve el pedido', t.lista.data?.length === 0 && t.detalle.data === null);
check('Tercero no puede ver la foto', !t.foto.data?.signedUrl);
check('Tercero no puede editar ni cancelar', !!t.editar.error && !!t.cancelar.error);

const a = results.anon;
check('Anon no lee pedidos', !!a.lista.error || a.lista.data?.length === 0);
check('Anon no lee direcciones ni perfiles', (!!a.jobPrivate.error || a.jobPrivate.data?.length === 0) && (!!a.profilePrivate.error || a.profilePrivate.data?.length === 0));
check('Anon no puede ver la foto', !a.foto.data?.signedUrl);
check('Anon no puede editar ni cancelar', !!a.editar.error && !!a.cancelar.error);

check('El dueño ve su dirección', propio.detalle.data?.address_street === ADDRESS);
// Control del detector: en las respuestas del dueño la dirección tiene que aparecer.
check('Control: el detector encuentra la dirección en las respuestas del dueño', leaks('cliente', [ADDRESS]).length > 0);
check('El pedido sigue intacto después de los intentos', propio.detalle.data?.zone === 'Barrio Prueba' && propio.detalle.data?.status === 'publicado');

// Limpieza: fotos (cada uno las suyas) y pedido cancelado.
await cliente.sb.rpc('cancel_job', { p_job_id: jobId });
await cliente.sb.storage.from('job-photos').remove([jobPhoto]);
await cortador.sb.storage.from('avatars').remove([avatar]);

const fails = checks.filter((x) => !x.ok);
for (const x of checks) console.log(`${x.ok ? 'OK   ' : 'FALLA'} ${x.label}${x.ok || !x.extra ? '' : ` → ${x.extra}`}`);
console.log(`\n${checks.length - fails.length} de ${checks.length} OK · ${log.length} respuestas revisadas`);
process.exit(fails.length ? 1 : 0);
