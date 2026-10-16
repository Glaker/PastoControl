// Verificación de red · Fase 4 (postulantes, aceptación, contacto, cancelación de asignados).
// Usuarios reales: cliente, cortador elegido, cortador NO elegido, tercero (cortador sin postularse)
// y anon. Todos hacen los pedidos de la app y otros "maliciosos" (pedir el contacto, la lista de
// postulantes, leer tablas privadas) antes de asignar, asignado y después de cancelar. Además todos
// escuchan sus avisos por Realtime. Se guardan TODAS las respuestas y eventos y se verifica:
//   * la dirección, el apellido y el WhatsApp de cada uno solo los recibe su contraparte, y solo
//     mientras el trabajo está asignado;
//   * el no elegido, el tercero y anon no reciben nunca ningún dato privado ajeno.
//
// Uso: node scripts/verificar-red-fase4.mjs
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY de .env (solo la clave pública).
// Crea usuarios pastocontrol.prueba.f4red-* (se borran con sql/tests/limpiar_usuarios_prueba.sql).

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

const ADDRESS = 'Callejón Confidencial 1357';
const PHONES = { cliente: '+5492345987501', elegido: '+5492345987502', noElegido: '+5492345987503', tercero: '+5492345987504' };
const LAST_NAMES = { cliente: 'Zabaleta', elegido: 'Yrurtia', noElegido: 'Wilde', tercero: 'Villegas' };
const stamp = Date.now();
const log = []; // { who, phase, kind, what, body }
let phase = 'antes';

function makeClient(who) {
  const recordingFetch = async (input, init) => {
    const res = await fetch(input, init);
    const body = await res.clone().text().catch(() => '');
    log.push({ who, phase, kind: 'http', what: `${res.status} ${String(input).replace(URL_, '')}`, body });
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
  const email = `pastocontrol.prueba.f4red-${role}-${stamp}@gmail.com`;
  const data = must(await sb.auth.signUp({ email, password: `Prueba-${randomUUID()}`, options: { data: { terms_version: 1 } } }), `registro ${role}`);
  await sb.realtime.setAuth(data.session.access_token);
  return { sb, uid: data.user.id, role };
}

const users = {};
for (const role of Object.keys(PHONES)) users[role] = await signUp(role);
const anon = makeClient('anon');
const { cliente, elegido, noElegido, tercero } = users;
const tinyJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const avatars = [];
for (const u of [elegido, noElegido, tercero]) {
  const path = `${u.uid}/a.jpg`;
  must(await u.sb.storage.from('avatars').upload(path, tinyJpeg, { contentType: 'image/jpeg' }), 'avatar');
  avatars.push([u, path]);
}
for (const u of Object.values(users)) {
  must(await u.sb.rpc('upsert_my_profile', {
    p_first_name: u.role, p_last_name: LAST_NAMES[u.role], p_phone_e164: PHONES[u.role],     p_is_client: u.role === 'cliente', p_is_cutter: u.role !== 'cliente',
    p_avatar_path: u.role === 'cliente' ? undefined : `${u.uid}/a.jpg`,
  }), `perfil ${u.role}`);
  // Fase 8: la casa es obligatoria para cortar.
  if (u.role !== 'cliente') must(await u.sb.rpc('set_my_base_location', { p_lat: -35.44, p_lng: -60.18 }), `casa ${u.role}`);
}

// Realtime: cada uno escucha sus avisos.
const events = { cliente: [], elegido: [], noElegido: [], tercero: [] };
await Promise.all(
  Object.values(users).map(
    (u) =>
      new Promise((resolve, reject) => {
        u.sb
          .channel(`f4-${u.role}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${u.uid}` }, (e) => {
            events[u.role].push(e.new);
            log.push({ who: u.role, phase, kind: 'realtime', what: `aviso ${e.new.kind}`, body: JSON.stringify(e) });
          })
          .subscribe((s, err) => (s === 'SUBSCRIBED' ? resolve() : s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' ? reject(err ?? new Error(s)) : null));
      }),
  ),
);
await sleep(1000);

const jobId = randomUUID();
must(await cliente.sb.rpc('create_job', {
  p_id: jobId, p_location_lat: -35.43, p_location_lng: -60.17, p_address_street: ADDRESS, p_address_number: '1', p_zone: 'Barrio Fase Cuatro', p_price_ars: 15000,
  p_desired_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
}), 'create_job');
must(await elegido.sb.rpc('apply_to_job', { p_job_id: jobId, p_proposed_price_ars: 18000 }), 'apply elegido');
must(await noElegido.sb.rpc('apply_to_job', { p_job_id: jobId }), 'apply no elegido');

async function probe(sb) {
  return {
    contacto: await sb.rpc('get_job_contact', { p_job_id: jobId }),
    postulantes: await sb.rpc('get_job_applicants', { p_job_id: jobId }),
    pedido: await sb.from('jobs').select('*, applications!applications_job_id_fkey(*), agreement:job_agreements!job_agreements_job_id_fkey(*)').eq('id', jobId).maybeSingle(),
    acuerdos: await sb.from('job_agreements').select('*'),
    privados: await sb.from('profile_private').select('*'),
    perfilesConPrivados: await sb.from('profiles').select('*, profile_private(*)'),
    postulaciones: await sb.from('applications').select('*, cutter:profiles(*), job:jobs!applications_job_id_fkey(*)'),
  };
}
const everyone = { cliente: cliente.sb, elegido: elegido.sb, noElegido: noElegido.sb, tercero: tercero.sb, anon };
const probeAll = async () => Object.fromEntries(await Promise.all(Object.entries(everyone).map(async ([w, sb]) => [w, await probe(sb)])));

// 1) Antes de asignar
const antes = await probeAll();

// 2) Asignado: el cliente elige con la versión que ve
phase = 'asignado';
const applicants = must(await cliente.sb.rpc('get_job_applicants', { p_job_id: jobId }), 'postulantes');
const target = applicants.find((a) => a.cutter_id === elegido.uid);
must(await cliente.sb.rpc('accept_application', { p_application_id: target.application_id, p_expected_updated_at: target.updated_at }), 'aceptar');
await sleep(2500);
const asignado = await probeAll();

// 3) Cancelado por el cortador elegido
phase = 'cancelado';
must(await elegido.sb.rpc('cancel_job', { p_job_id: jobId }), 'cancelar');
await sleep(2500);
const cancelado = await probeAll();

// ---- Chequeos
const checks = [];
const check = (label, ok, extra = '') => checks.push({ label, ok: !!ok, extra });
const secrets = (role) => [PHONES[role], PHONES[role].slice(4), LAST_NAMES[role]];
const found = (who, needles, onlyPhase) =>
  log.filter((e) => e.who === who && (!onlyPhase || e.phase === onlyPhase) && needles.some((n) => e.body.includes(n))).map((e) => `${e.phase} ${e.kind}: ${e.what}`);

// Quienes nunca deben ver nada ajeno. Desde la Fase 7 la dirección es visible para los cortadores que
// ven el pedido (scripts/verificar-red-fase7.mjs la controla); acá, apellidos y WhatsApp.
for (const who of ['noElegido', 'tercero']) {
  const leaks = found(who, Object.keys(PHONES).filter((r) => r !== who).flatMap(secrets));
  check(`${who}: nunca recibe apellidos ni WhatsApp ajenos (antes, asignado y cancelado)`, leaks.length === 0, leaks.join(', '));
}
const anonLeaks = found('anon', [ADDRESS, ...Object.keys(PHONES).flatMap(secrets)]);
check('anon: nunca recibe ningún dato privado', anonLeaks.length === 0, anonLeaks.join(', '));

// Contraparte: solo mientras está asignado
const elegidoAntes = found('elegido', secrets('cliente'), 'antes');
const elegidoDespues = found('elegido', secrets('cliente'), 'cancelado');
check('Elegido: antes de asignar no recibe el apellido ni el WhatsApp del cliente', elegidoAntes.length === 0, elegidoAntes.join(', '));
check('Elegido: asignado, recibe nombre completo y WhatsApp del cliente (y ya no la dirección: está en el pedido)',
  asignado.elegido.contacto.data?.[0]?.phone_e164 === PHONES.cliente && asignado.elegido.contacto.data?.[0]?.last_name === LAST_NAMES.cliente &&
  !('address' in (asignado.elegido.contacto.data?.[0] ?? {})));
check('Elegido: cancelado, ya no recibe los datos del cliente', elegidoDespues.length === 0, elegidoDespues.join(', '));
check('Elegido: nunca recibe datos del no elegido ni del tercero', found('elegido', [...secrets('noElegido'), ...secrets('tercero')]).length === 0);

const clienteAntes = found('cliente', secrets('elegido'), 'antes');
const clienteDespues = found('cliente', secrets('elegido'), 'cancelado');
check('Cliente: antes de asignar no recibe el apellido ni el WhatsApp de nadie', found('cliente', [...secrets('elegido'), ...secrets('noElegido'), ...secrets('tercero')], 'antes').length === 0, clienteAntes.join(', '));
check('Cliente: asignado, recibe nombre completo y WhatsApp del elegido',
  asignado.cliente.contacto.data?.[0]?.phone_e164 === PHONES.elegido && asignado.cliente.contacto.data?.[0]?.last_name === LAST_NAMES.elegido);
check('Cliente: cancelado, ya no recibe los datos del elegido', clienteDespues.length === 0, clienteDespues.join(', '));
check('Cliente: nunca recibe datos del no elegido ni del tercero', found('cliente', [...secrets('noElegido'), ...secrets('tercero')]).length === 0);

// RPCs
check('Antes de asignar, nadie recibe contacto', Object.values(antes).every((r) => !!r.contacto.error));
check('Asignado, el no elegido / tercero / anon no reciben contacto', ['noElegido', 'tercero', 'anon'].every((w) => !!asignado[w].contacto.error));
check('Cancelado, nadie recibe contacto', Object.values(cancelado).every((r) => !!r.contacto.error));
check('Solo el cliente recibe la lista de postulantes', !antes.cliente.postulantes.error && ['elegido', 'noElegido', 'tercero', 'anon'].every((w) => !!antes[w].postulantes.error));
check('La lista de postulantes no trae apellidos ni WhatsApp', !JSON.stringify(antes.cliente.postulantes.data).includes(LAST_NAMES.elegido) && !JSON.stringify(antes.cliente.postulantes.data).includes(PHONES.elegido));
check('El acuerdo usa la contraoferta del elegido ($ 18.000)', asignado.cliente.pedido.data?.agreement?.price_ars === 18000);
check('El elegido también recibe el acuerdo', asignado.elegido.pedido.data?.agreement?.price_ars === 18000);
check('El no elegido ve el pedido asignado pero sin acuerdo (ni precio, ni horario, ni quién)',
  asignado.noElegido.pedido.data?.status === 'asignado' && asignado.noElegido.pedido.data?.agreement === null && (asignado.noElegido.acuerdos.data ?? []).length === 0);
check('El tercero y anon no reciben ningún acuerdo',
  !asignado.tercero.pedido.data && (asignado.tercero.acuerdos.data ?? []).length === 0 && (!!asignado.anon.acuerdos.error || (asignado.anon.acuerdos.data ?? []).length === 0));
// Quién es el elegido: no tiene que aparecer en pedidos, postulaciones, acuerdos ni avisos del no
// elegido (los perfiles públicos sí listan a todos, por eso se excluyen).
const whoLeaks = found('noElegido', [elegido.uid]).filter((x) => !x.includes('/rest/v1/profiles'));
check('Ninguna respuesta del no elegido revela quién es el elegido (antes, asignado y cancelado)', whoLeaks.length === 0, whoLeaks.join(', '));

// Avisos en vivo
const kinds = (who) => events[who].map((n) => n.kind);
check('Realtime: el elegido recibió "postulacion_aceptada"', kinds('elegido').includes('postulacion_aceptada'));
check('Realtime: el no elegido recibió "postulacion_rechazada"', kinds('noElegido').includes('postulacion_rechazada'));
check('Realtime: el cliente recibió "trabajo_cancelado_por_cortador"', kinds('cliente').includes('trabajo_cancelado_por_cortador'));
check('Realtime: el tercero no recibió nada', events.tercero.length === 0);
check('Los avisos no llevan datos privados', !Object.values(events).flat().some((n) => Object.keys(PHONES).flatMap(secrets).some((s) => JSON.stringify(n).includes(s))));

// Control del detector: el elegido sí recibió el WhatsApp del cliente mientras estaba asignado.
check('Control: el detector encuentra el WhatsApp del cliente en lo que recibió el elegido asignado', found('elegido', [PHONES.cliente], 'asignado').length > 0);

for (const [u, path] of avatars) await u.sb.storage.from('avatars').remove([path]);
for (const u of Object.values(users)) await u.sb.removeAllChannels();

const fails = checks.filter((x) => !x.ok);
for (const x of checks) console.log(`${x.ok ? 'OK   ' : 'FALLA'} ${x.label}${x.ok || !x.extra ? '' : ` → ${x.extra}`}`);
console.log(`\n${checks.length - fails.length} de ${checks.length} OK · ${log.filter((e) => e.kind === 'http').length} respuestas HTTP y ${log.filter((e) => e.kind === 'realtime').length} eventos de Realtime revisados`);
process.exit(fails.length ? 1 : 0);
