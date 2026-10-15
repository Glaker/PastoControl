// Verificación de red · Fase 7 (dirección visible, ubicación en el mapa, ubicación base del cortador).
// Usuarios reales: cliente, cortador (el elegido), cortador2 (se postula y no lo eligen), tercero (cliente
// sin rol de cortador) y anon. Los dos cortadores cargan su ubicación base. El cliente publica un pedido
// con pin; todos hacen los pedidos de la app y otros "maliciosos" (select *, embeds de profile_private,
// job_private, contacto ajeno), antes y después de asignar. Se guardan TODAS las respuestas y se verifica:
//   * la dirección y el pin del pedido los reciben los cortadores que ven el pedido; el tercero y anon no;
//   * el teléfono y el apellido siguen llegando solo a la contraparte y solo con el trabajo asignado;
//   * la ubicación base de cada cortador no aparece en ninguna respuesta de otra persona;
//   * un pin o una ubicación base fuera del radio de la localidad se rechazan con un mensaje claro.
//
// Uso: node scripts/verificar-red-fase7.mjs
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY de .env (solo la clave pública).
// Crea usuarios pastocontrol.prueba.f7red-* (se borran con sql/tests/limpiar_usuarios_prueba.sql).

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

const STREET = 'Calle Visiblísima';
const NUMBER = '4321';
const PIN = { lat: -35.432109, lng: -60.170987 };
// Ubicaciones base: valores con 6 decimales que no aparecen en ningún otro lado.
const BASES = { cortador: { lat: -35.441234, lng: -60.175678 }, cortador2: { lat: -35.428765, lng: -60.165432 } };
const PHONES = { cliente: '+5492345987701', cortador: '+5492345987702', cortador2: '+5492345987703', tercero: '+5492345987704' };
const LAST_NAMES = { cliente: 'Anchorena', cortador: 'Balcarce', cortador2: 'Castelli', tercero: 'Dorrego' };
const stamp = Date.now();
const log = []; // { who, phase, what, body }
let phase = 'publicado';

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

async function signUp(role) {
  const sb = makeClient(role);
  const email = `pastocontrol.prueba.f7red-${role}-${stamp}@gmail.com`;
  const data = must(await sb.auth.signUp({ email, password: `Prueba-${randomUUID()}` }), `registro ${role}`);
  return { sb, uid: data.user.id, role };
}

const users = {};
for (const role of Object.keys(PHONES)) users[role] = await signUp(role);
const anon = makeClient('anon');
const { cliente, cortador, cortador2, tercero } = users;

const { data: loc } = await cliente.sb.from('localities').select('id').eq('slug', '25-de-mayo-bsas').single();
const tinyJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const avatars = [];
for (const u of [cortador, cortador2]) {
  const path = `${u.uid}/a.jpg`;
  must(await u.sb.storage.from('avatars').upload(path, tinyJpeg, { contentType: 'image/jpeg' }), 'avatar');
  avatars.push([u, path]);
}
for (const u of Object.values(users)) {
  const isCutter = u.role.startsWith('cortador');
  must(await u.sb.rpc('upsert_my_profile', {
    p_first_name: u.role, p_last_name: LAST_NAMES[u.role], p_phone_e164: PHONES[u.role], p_locality_id: loc.id,
    p_is_client: !isCutter, p_is_cutter: isCutter, p_avatar_path: isCutter ? `${u.uid}/a.jpg` : undefined,
  }), `perfil ${u.role}`);
}
for (const role of ['cortador', 'cortador2']) {
  must(await users[role].sb.rpc('set_my_base_location', { p_lat: BASES[role].lat, p_lng: BASES[role].lng }), `casa ${role}`);
}

// Fuera del radio: se rechaza con un mensaje claro (pin del pedido y ubicación base).
const fueraPedido = await cliente.sb.rpc('create_job', {
  p_id: randomUUID(), p_location_lat: -34.6037, p_location_lng: -58.3816, p_address_street: 'Florida', p_address_number: '100',
  p_price_ars: 15000, p_desired_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
});
const fueraCasa = await cortador.sb.rpc('set_my_base_location', { p_lat: -34.6037, p_lng: -58.3816 });

const jobId = randomUUID();
must(await cliente.sb.rpc('create_job', {
  p_id: jobId, p_location_lat: PIN.lat, p_location_lng: PIN.lng, p_address_street: STREET, p_address_number: NUMBER,
  p_address_between: 'entre Uno y Dos', p_price_ars: 15000, p_desired_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
}), 'create_job');

// Lo mismo que pide la app (src/jobs/queries.ts) y más.
const JOB_SELECT =
  'id, client_id, locality_id, zone, address_street, address_number, address_between, location_lat, location_lng, ' +
  'price_ars, desired_at, notes, photo_paths, status, is_expired, ' +
  'agreement:job_agreements!job_agreements_job_id_fkey(application_id, cutter_id, price_ars, agreed_at), ' +
  'locality:localities(name, timezone, center_lat, center_lng, radius_m), client:profiles!jobs_client_id_fkey(id, first_name, last_initial, avatar_path), ' +
  'applications!applications_job_id_fkey(id, status, cutter_id)';

async function probe(sb) {
  return {
    lista: await sb.from('jobs').select(JOB_SELECT).eq('status', 'publicado').eq('is_expired', false),
    detalle: await sb.from('jobs').select(JOB_SELECT).eq('id', jobId).maybeSingle(),
    selectTodo: await sb.from('jobs').select('*'),
    privados: await sb.from('profile_private').select('*'),
    embedPrivados: await sb.from('profiles').select('*, profile_private(*)'),
    postulaciones: await sb.from('applications').select('*, cutter:profiles(*)'),
    jobPrivate: await sb.from('job_private').select('*'),
    contacto: await sb.rpc('get_job_contact', { p_job_id: jobId }),
    postulantes: await sb.rpc('get_job_applicants', { p_job_id: jobId }),
    avisos: await sb.from('notifications').select('*'),
  };
}
const everyone = { cliente: cliente.sb, cortador: cortador.sb, cortador2: cortador2.sb, tercero: tercero.sb, anon };
const probeAll = async () => Object.fromEntries(await Promise.all(Object.entries(everyone).map(async ([w, sb]) => [w, await probe(sb)])));

phase = 'publicado';
must(await cortador.sb.rpc('apply_to_job', { p_job_id: jobId }), 'apply cortador');
must(await cortador2.sb.rpc('apply_to_job', { p_job_id: jobId, p_proposed_price_ars: 17000 }), 'apply cortador2');
const publicado = await probeAll();

phase = 'asignado';
const applicants = must(await cliente.sb.rpc('get_job_applicants', { p_job_id: jobId }), 'postulantes');
const target = applicants.find((a) => a.cutter_id === cortador.uid);
must(await cliente.sb.rpc('accept_application', { p_application_id: target.application_id, p_expected_updated_at: target.updated_at }), 'aceptar');
const asignado = await probeAll();

// Chequeos
const checks = [];
const check = (label, ok, extra = '') => checks.push({ label, ok: !!ok, extra });
const found = (who, needles, onlyPhase) =>
  log.filter((e) => e.who === who && (!onlyPhase || e.phase === onlyPhase) && needles.some((n) => e.body.includes(n))).map((e) => `${e.phase} ${e.what}`);
const secrets = (role) => [PHONES[role], PHONES[role].slice(4), LAST_NAMES[role]];
const baseOf = (role) => [String(BASES[role].lat), String(BASES[role].lng)];

check('Pin fuera del radio: create_job lo rechaza con un mensaje claro',
  fueraPedido.error?.message?.startsWith('La ubicación marcada está fuera de 25 de Mayo'), fueraPedido.error?.message);
check('Ubicación base fuera del radio: se rechaza con un mensaje claro',
  fueraCasa.error?.message?.startsWith('La ubicación marcada está fuera de 25 de Mayo'), fueraCasa.error?.message);

// Dirección visible
for (const who of ['cortador', 'cortador2']) {
  const d = publicado[who].detalle.data;
  check(`${who} (cortador de la localidad) recibe la dirección y el pin del pedido`,
    d?.address_street === STREET && d?.address_number === NUMBER && d?.address_between === 'entre Uno y Dos' &&
    d?.location_lat === PIN.lat && d?.location_lng === PIN.lng);
  check(`${who} ve el pedido con dirección en la lista de disponibles`, publicado[who].lista.data?.some((j) => j.id === jobId && j.address_street === STREET));
}
check('cortador2 (postulado, no elegido) sigue viendo la dirección con el trabajo asignado', asignado.cortador2.detalle.data?.address_street === STREET);
check('El tercero (sin rol de cortador) no recibe la dirección en ninguna respuesta', found('tercero', [STREET, String(PIN.lat)]).length === 0, found('tercero', [STREET]).join(', '));
check('Anon no recibe la dirección ni el pin en ninguna respuesta', found('anon', [STREET, String(PIN.lat)]).length === 0);
check('Anon no lee pedidos', !!publicado.anon.lista.error && !!publicado.anon.selectTodo.error);

// Teléfono y apellido: solo la contraparte, solo asignado
for (const who of ['cortador2', 'tercero']) {
  const leaks = found(who, Object.keys(PHONES).filter((r) => r !== who).flatMap(secrets));
  check(`${who}: nunca recibe apellidos ni WhatsApp ajenos`, leaks.length === 0, leaks.join(', '));
}
const anonLeaks = found('anon', Object.keys(PHONES).flatMap(secrets));
check('anon: nunca recibe apellidos ni WhatsApp', anonLeaks.length === 0, anonLeaks.join(', '));
const elegidoAntes = found('cortador', secrets('cliente'), 'publicado');
check('El cortador, antes de que lo elijan, no recibe el apellido ni el WhatsApp del cliente', elegidoAntes.length === 0, elegidoAntes.join(', '));
const clienteAntes = found('cliente', [...secrets('cortador'), ...secrets('cortador2')], 'publicado');
check('El cliente, antes de elegir, no recibe apellidos ni WhatsApp de los postulantes', clienteAntes.length === 0, clienteAntes.join(', '));
const contacto = asignado.cortador.contacto.data?.[0];
check('Asignado: el elegido recibe apellido y WhatsApp del cliente por get_job_contact',
  contacto?.last_name === LAST_NAMES.cliente && contacto?.phone_e164 === PHONES.cliente);
check('get_job_contact ya no trae la dirección (está en el pedido)', contacto && !('address' in contacto));
check('Asignado: el cliente recibe apellido y WhatsApp del elegido', asignado.cliente.contacto.data?.[0]?.phone_e164 === PHONES.cortador);
check('Asignado: cortador2, el tercero y anon no reciben contacto', ['cortador2', 'tercero', 'anon'].every((w) => !!asignado[w].contacto.error));
check('Nadie lee el apellido ni el WhatsApp ajenos por profile_private ni por embed',
  Object.entries(asignado).every(([w, r]) => (r.privados.data ?? []).every((p) => p.user_id === users[w]?.uid) &&
    (r.embedPrivados.data ?? []).every((p) => !p.profile_private || p.id === users[w]?.uid || (Array.isArray(p.profile_private) && p.profile_private.length === 0))));

// Ubicación base: solo la ve el dueño
for (const role of ['cortador', 'cortador2']) {
  const others = Object.keys(everyone).filter((w) => w !== role);
  const leaks = others.flatMap((w) => found(w, baseOf(role)).map((x) => `${w} ${x}`));
  check(`La ubicación base de ${role} no aparece en ninguna respuesta de otra persona`, leaks.length === 0, leaks.join(', '));
}
check('Control: el dueño sí recibe su propia ubicación base (el detector funciona)', found('cortador', baseOf('cortador')).length > 0);
check('Control: el detector encuentra el WhatsApp del cliente en lo que recibió el elegido asignado', found('cortador', [PHONES.cliente], 'asignado').length > 0);

// Avisos: llevan la dirección, nunca teléfonos, apellidos ni ubicaciones base
const avisosCliente = asignado.cliente.avisos.data ?? [];
check('El aviso de postulación al cliente lleva la dirección del pedido',
  avisosCliente.some((n) => n.kind === 'postulacion_nueva' && n.payload?.address === `${STREET} ${NUMBER}`));
const avisoLeaks = Object.values(asignado).flatMap((r) => r.avisos.data ?? [])
  .filter((n) => [...Object.keys(PHONES).flatMap(secrets), ...baseOf('cortador'), ...baseOf('cortador2')].some((s) => JSON.stringify(n).includes(s)));
check('Ningún aviso lleva teléfonos, apellidos ni ubicaciones base', avisoLeaks.length === 0);
check('job_private ya no existe (la API responde error)', Object.values(publicado).every((r) => !!r.jobPrivate.error));

// Limpieza: el pedido queda cancelado; los avatares, borrados.
await cliente.sb.rpc('cancel_job', { p_job_id: jobId });
for (const [u, path] of avatars) await u.sb.storage.from('avatars').remove([path]);

const fails = checks.filter((x) => !x.ok);
for (const x of checks) console.log(`${x.ok ? 'OK   ' : 'FALLA'} ${x.label}${x.ok || !x.extra ? '' : ` → ${x.extra}`}`);
console.log(`\n${checks.length - fails.length} de ${checks.length} OK · ${log.length} respuestas HTTP revisadas`);
process.exit(fails.length ? 1 : 0);
