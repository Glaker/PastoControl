// Verificación de red · Fase 3 (postulaciones y avisos).
// Registra cuatro usuarios reales (cliente, dos cortadores y un tercero sin rol de cortador), publica
// un pedido y hace, con la sesión de cada uno y como anon, los pedidos HTTP de la app y otros
// "maliciosos". También se suscriben por Realtime: el cliente a sus avisos y los demás intentan
// escuchar los avisos del cliente. Guarda TODAS las respuestas HTTP y los eventos de Realtime y
// verifica que la dirección, los teléfonos y los apellidos ajenos no aparezcan en ninguno.
//
// Uso: node scripts/verificar-red-fase3.mjs
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY de .env (solo la clave pública).
// Al final cancela el pedido. Los usuarios quedan: se borran con
// sql/tests/limpiar_usuarios_prueba.sql (patrón pastocontrol.prueba.%@gmail.com).

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

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

const ADDRESS = 'Pasaje Reservadísimo 2468';
const PHONES = { cliente: '+5492345987201', cortador1: '+5492345987202', cortador2: '+5492345987203', tercero: '+5492345987204' };
const LAST_NAMES = { cliente: 'Zubizarreta', cortador1: 'Yupanqui', cortador2: 'Wernicke', tercero: 'Villafañe' };
const stamp = Date.now();
const log = []; // { who, kind: 'http' | 'realtime', what, body }

function makeClient(who) {
  const recordingFetch = async (input, init) => {
    const res = await fetch(input, init);
    const body = await res.clone().text().catch(() => '');
    log.push({ who, kind: 'http', what: `${res.status} ${String(input).replace(URL_, '')}`, body });
    return res;
  };
  return createClient(URL_, KEY, {
    global: { fetch: recordingFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

async function signUp(role) {
  const sb = makeClient(role);
  const email = `pastocontrol.prueba.f3-${role}-${stamp}@gmail.com`;
  const data = must(await sb.auth.signUp({ email, password: `Prueba-${randomUUID()}`, options: { data: { terms_version: 1 } } }), `registro ${role}`);
  if (!data.session) throw new Error('El registro no devolvió sesión (¿"Confirm email" activado?)');
  await sb.realtime.setAuth(data.session.access_token);
  return { sb, uid: data.user.id };
}

const cliente = await signUp('cliente');
const cortador1 = await signUp('cortador1');
const cortador2 = await signUp('cortador2');
const tercero = await signUp('tercero');
const anon = makeClient('anon');
const profile = (u, role, first, client, cutter, avatar) =>
  u.sb.rpc('upsert_my_profile', {
    p_first_name: first, p_last_name: LAST_NAMES[role], p_phone_e164: PHONES[role],
    p_is_client: client, p_is_cutter: cutter, p_avatar_path: avatar,
  });

// Los cortadores necesitan foto: una imagen mínima alcanza para la prueba.
const tinyJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const avatars = [];
for (const [u, role, first] of [[cortador1, 'cortador1', 'Uno'], [cortador2, 'cortador2', 'Dos']]) {
  const path = `${u.uid}/a.jpg`;
  must(await u.sb.storage.from('avatars').upload(path, tinyJpeg, { contentType: 'image/jpeg' }), `avatar ${role}`);
  avatars.push([u, path]);
  must(await profile(u, role, first, false, true, path), `perfil ${role}`);
  // Fase 8: la casa es obligatoria para cortar.
  must(await u.sb.rpc('set_my_base_location', { p_lat: -35.44, p_lng: -60.18 }), `casa ${role}`);
}
must(await profile(cliente, 'cliente', 'Clienta', true, false), 'perfil cliente');
must(await profile(tercero, 'tercero', 'Tercero', true, false), 'perfil tercero');

const jobId = randomUUID();
const desiredAt = new Date(Date.now() + 2 * 86400e3).toISOString();
must(await cliente.sb.rpc('create_job', {
  p_id: jobId, p_location_lat: -35.43, p_location_lng: -60.17, p_address_street: ADDRESS, p_address_number: '1', p_zone: 'Barrio Fase Tres', p_price_ars: 15000, p_desired_at: desiredAt,
}), 'create_job');

// Realtime: el cliente escucha sus avisos; los demás intentan escuchar los del cliente y sin filtro.
const events = { cliente: [], cortador1: [], cortador2: [], tercero: [] };
const subscribe = (who, u, filter) =>
  new Promise((resolve, reject) => {
    const ch = u.sb
      .channel(`prueba-${who}-${filter ?? 'todo'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', ...(filter ? { filter } : {}) }, (e) => {
        events[who].push(e);
        log.push({ who, kind: 'realtime', what: `${e.eventType} notifications`, body: JSON.stringify(e) });
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') resolve(ch);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(err ?? new Error(`${who}: ${status}`));
      });
  });
await subscribe('cliente', cliente, `user_id=eq.${cliente.uid}`);
await subscribe('cortador1', cortador1, `user_id=eq.${cortador1.uid}`);
await subscribe('cortador2', cortador2, `user_id=eq.${cliente.uid}`); // espía: avisos del cliente
await subscribe('tercero', tercero); // espía: todos los avisos
await sleep(1000);

// Postulaciones
const in3days = new Date(Date.now() + 3 * 86400e3).toISOString();
must(await cortador1.sb.rpc('apply_to_job', { p_job_id: jobId, p_proposed_price_ars: 20000, p_proposed_at: in3days }), 'apply cortador1');
const app1 = must(await cortador1.sb.from('applications').select('id').eq('job_id', jobId).single(), 'app1');
must(await cortador1.sb.rpc('update_application', { p_application_id: app1.id, p_proposed_price_ars: 18000, p_proposed_at: in3days }), 'update cortador1');
must(await cortador2.sb.rpc('apply_to_job', { p_job_id: jobId }), 'apply cortador2');
const app2 = must(await cortador2.sb.from('applications').select('id').eq('job_id', jobId).single(), 'app2');
await sleep(3000);

const JOB_SELECT =
  'id, client_id, zone, address_street, location_lat, location_lng, price_ars, desired_at, status, is_expired, ' +
  'client:profiles!jobs_client_id_fkey(id, first_name, last_initial, avatar_path), applications!applications_job_id_fkey(id, status, cutter_id)';

/** foreignAppId: una postulación AJENA, para intentar retirarla o editarla. */
async function probe(who, sb, foreignAppId) {
  const r = {};
  r.disponibles = await sb.from('jobs').select(JOB_SELECT).eq('status', 'publicado').eq('is_expired', false);
  r.detalle = await sb.from('jobs').select(JOB_SELECT).eq('id', jobId).maybeSingle();
  r.postulaciones = await sb.from('applications').select('*');
  r.postulacionesEmbed = await sb.from('applications').select('*, job:jobs!applications_job_id_fkey(*), cutter:profiles(*)');
  r.avisos = await sb.from('notifications').select('*');
  r.avisosCliente = await sb.from('notifications').select('*').eq('user_id', cliente.uid);
  r.privados = await sb.from('profile_private').select('*');
  r.retirarAjena = await sb.rpc('withdraw_application', { p_application_id: foreignAppId });
  r.editarAjena = await sb.rpc('update_application', { p_application_id: foreignAppId, p_proposed_price_ars: 1000 });
  r.marcarAvisos = await sb.rpc('mark_notifications_read', {});
  return r;
}

const res = {
  cortador1: await probe('cortador1', cortador1.sb, app2.id),
  cortador2: await probe('cortador2', cortador2.sb, app1.id),
  tercero: await probe('tercero', tercero.sb, app1.id),
  anon: await probe('anon', anon, app1.id),
};
const propio = {
  detalle: await cliente.sb.from('jobs').select(JOB_SELECT).eq('id', jobId).maybeSingle(),
  avisos: await cliente.sb.from('notifications').select('*').eq('user_id', cliente.uid),
  noLeidos: await cliente.sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
};

// Cancelar: los dos cortadores reciben "pedido_cancelado" (cortador1 lo escucha por Realtime).
must(await cliente.sb.rpc('cancel_job', { p_job_id: jobId }), 'cancel_job');
await sleep(3000);
const despues = {
  avisosC1: await cortador1.sb.from('notifications').select('kind').eq('kind', 'pedido_cancelado'),
  avisosC2: await cortador2.sb.from('notifications').select('kind').eq('kind', 'pedido_cancelado'),
  c1VeCancelado: await cortador1.sb.from('jobs').select('id, status').eq('id', jobId).maybeSingle(),
  disponiblesC1: await cortador1.sb.from('jobs').select('id').eq('status', 'publicado').eq('is_expired', false).eq('id', jobId),
};

// Chequeos
const checks = [];
const check = (label, ok, extra = '') => checks.push({ label, ok: !!ok, extra });
const leaks = (who, needles) =>
  log.filter((e) => e.who === who && needles.some((n) => e.body.includes(n))).map((e) => `${e.kind}: ${e.what}`);
const secretsOf = (role) => [PHONES[role], PHONES[role].slice(4), LAST_NAMES[role]];
const others = (me) => Object.keys(PHONES).filter((r) => r !== me).flatMap(secretsOf);

// Desde la Fase 7 la dirección es visible para los cortadores que ven el pedido; el tercero (sin rol de
// cortador) no ve el pedido, así que tampoco la dirección.
for (const who of ['cortador1', 'cortador2', 'tercero']) {
  const found = leaks(who, [...(who === 'tercero' ? [ADDRESS] : []), ...others(who)]);
  check(`${who}: ninguna respuesta ni evento tiene teléfonos ni apellidos ajenos${who === 'tercero' ? ' (ni la dirección)' : ''}`, found.length === 0, found.join(', '));
}
const anonLeaks = leaks('anon', [ADDRESS, ...Object.keys(PHONES).flatMap(secretsOf)]);
check('anon: ninguna respuesta tiene la dirección ni datos privados', anonLeaks.length === 0, anonLeaks.join(', '));
const clientAvisos = propio.avisos.data ?? [];
const avisoLeak = clientAvisos.filter((n) => others('cliente').some((s) => JSON.stringify(n).includes(s)));
check('Los avisos del cliente no tienen datos privados de los cortadores', avisoLeak.length === 0);

const c1 = res.cortador1;
check('Filtrar por is_expired (computed field) funciona en la API', !c1.disponibles.error, c1.disponibles.error?.message);
const c1Job = c1.disponibles.data?.find((j) => j.id === jobId);
check('Cortador1 ve el pedido en disponibles', !!c1Job);
check('Cortador1 ve la dirección y el pin del pedido (dirección visible)', c1Job?.address_street === ADDRESS && c1Job?.location_lat != null);
check('Cortador1 solo ve SU postulación en el embed del pedido', c1Job?.applications.length === 1 && c1Job.applications[0].cutter_id === cortador1.uid);
check('Cortador1 ve solo su postulación', c1.postulaciones.data?.length === 1);
check('Cortador1: el embed de profiles en postulaciones no trae datos privados', !JSON.stringify(c1.postulacionesEmbed.data ?? []).includes(LAST_NAMES.cortador2));
check('Cortador1 no ve avisos del cliente', (c1.avisosCliente.data ?? []).length === 0);
check('Cortador1 no puede retirar ni editar la postulación de cortador2', !!c1.retirarAjena.error && !!c1.editarAjena.error);

const c2 = res.cortador2;
check('Cortador2 no ve la postulación de cortador1', c2.postulaciones.data?.every((a) => a.cutter_id === cortador2.uid));
check('Cortador2 no puede retirar ni editar la postulación de cortador1', !!c2.retirarAjena.error && !!c2.editarAjena.error);
check('Cortador2 no recibe por Realtime los avisos del cliente (filtro con su user_id)', events.cortador2.length === 0, `${events.cortador2.length} eventos`);

const t = res.tercero;
check('Tercero no ve el pedido, postulaciones ni avisos ajenos', !t.detalle.data && t.postulaciones.data?.length === 0 && (t.avisos.data ?? []).length === 0);
check('Tercero no recibe por Realtime ningún aviso ajeno (sin filtro)', events.tercero.length === 0, `${events.tercero.length} eventos`);

const a = res.anon;
check('Anon no lee postulaciones ni avisos', (!!a.postulaciones.error || a.postulaciones.data?.length === 0) && (!!a.avisos.error || a.avisos.data?.length === 0));
check('Anon no puede usar las RPCs', !!a.retirarAjena.error && !!a.marcarAvisos.error);

check('El cliente ve las 2 postulaciones de su pedido', propio.detalle.data?.applications.length === 2);
check('El cliente tiene 3 avisos (2 postulaciones + 1 edición)', clientAvisos.length === 3, `${clientAvisos.length}`);
check('El cliente tiene 3 sin leer', propio.noLeidos.count === 3, `${propio.noLeidos.count}`);
check('Realtime: el cliente recibió los 3 avisos en vivo', events.cliente.filter((e) => e.eventType === 'INSERT').length === 3, `${events.cliente.length}`);
check('Realtime: los eventos del cliente son solo suyos', events.cliente.every((e) => e.new.user_id === cliente.uid));
check('Cancelar avisa a los dos cortadores', despues.avisosC1.data?.length === 1 && despues.avisosC2.data?.length === 1);
check('Realtime: cortador1 recibió "pedido_cancelado" en vivo', events.cortador1.some((e) => e.new?.kind === 'pedido_cancelado'));
check('Cortador1 sigue viendo el pedido cancelado (se había postulado)', despues.c1VeCancelado.data?.status === 'cancelado');
check('El pedido cancelado ya no figura en disponibles', despues.disponiblesC1.data?.length === 0);
check('El dueño ve su dirección', propio.detalle.data?.address_street === ADDRESS);
check('Control: el detector encuentra la dirección en las respuestas del dueño', leaks('cliente', [ADDRESS]).length > 0);

// Limpieza: avatares (el pedido ya está cancelado).
for (const [u, path] of avatars) await u.sb.storage.from('avatars').remove([path]);
for (const u of [cliente, cortador1, cortador2, tercero]) await u.sb.removeAllChannels();

console.log('Eventos en vivo:', Object.entries(events).map(([w, es]) => `${w}=[${es.map((e) => e.new?.kind).join(', ')}]`).join(' '));
const fails = checks.filter((x) => !x.ok);
for (const x of checks) console.log(`${x.ok ? 'OK   ' : 'FALLA'} ${x.label}${x.ok || !x.extra ? '' : ` → ${x.extra}`}`);
const httpCount = log.filter((e) => e.kind === 'http').length;
const rtCount = log.filter((e) => e.kind === 'realtime').length;
console.log(`\n${checks.length - fails.length} de ${checks.length} OK · ${httpCount} respuestas HTTP y ${rtCount} eventos de Realtime revisados`);
process.exit(fails.length ? 1 : 0);
