// Verificación de red · Fase 5 (trabajo realizado, calificaciones y estadísticas públicas).
// Usuarios reales: cliente, cortador elegido, cortador NO elegido, tercero y anon. Se asigna un
// trabajo para dentro de 20 minutos (hoy, así se puede marcar como realizado), el cortador lo marca,
// los dos se califican y todos hacen los pedidos de la app y otros "maliciosos" (leer ratings,
// contacto, acuerdo, estadísticas, has_rated ajeno). Se guardan TODAS las respuestas y eventos y se
// verifica:
//   * con el trabajo realizado, el apellido y el WhatsApp siguen llegando solo a la contraparte; el no
//     elegido, el tercero y anon no reciben nada privado ni el acuerdo. Desde la Fase 7 la dirección es
//     visible para quien ve el pedido (el no elegido, que se postuló); el tercero (no ve el pedido
//     asignado) y anon siguen sin recibirla;
//   * nadie (ni las partes) puede leer las calificaciones: ni quién calificó ni qué respondió;
//   * las estadísticas públicas no traen la cantidad de calificaciones.
//
// Uso: node scripts/verificar-red-fase5.mjs
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY de .env (solo la clave pública).
// Crea usuarios pastocontrol.prueba.f5red-* (se borran con sql/tests/limpiar_usuarios_prueba.sql).

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

const ADDRESS = 'Pasaje Reservado 2468';
const PHONES = { cliente: '+5492345987511', elegido: '+5492345987512', noElegido: '+5492345987513', tercero: '+5492345987514' };
const LAST_NAMES = { cliente: 'Urquiza', elegido: 'Tejedor', noElegido: 'Sarratea', tercero: 'Rondeau' };
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
  const email = `pastocontrol.prueba.f5red-${role}-${stamp}@gmail.com`;
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
          .channel(`f5-${u.role}`)
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
  p_id: jobId, p_location_lat: -35.43, p_location_lng: -60.17, p_address_street: ADDRESS, p_address_number: '1', p_zone: 'Barrio Fase Cinco', p_price_ars: 15000,
  // Hoy (hora local): se puede marcar como realizado desde el día acordado.
  p_desired_at: new Date(Date.now() + 20 * 60e3).toISOString(),
}), 'create_job');
must(await elegido.sb.rpc('apply_to_job', { p_job_id: jobId, p_proposed_price_ars: 17000 }), 'apply elegido');
must(await noElegido.sb.rpc('apply_to_job', { p_job_id: jobId }), 'apply no elegido');
const applicants = must(await cliente.sb.rpc('get_job_applicants', { p_job_id: jobId }), 'postulantes');
const target = applicants.find((a) => a.cutter_id === elegido.uid);
must(await cliente.sb.rpc('accept_application', { p_application_id: target.application_id, p_expected_updated_at: target.updated_at }), 'aceptar');

async function probe(sb, who) {
  return {
    contacto: await sb.rpc('get_job_contact', { p_job_id: jobId }),
    pedido: await sb.from('jobs').select('*, applications!applications_job_id_fkey(*), agreement:job_agreements!job_agreements_job_id_fkey(*)').eq('id', jobId).maybeSingle(),
    acuerdos: await sb.from('job_agreements').select('*'),
    privados: await sb.from('profile_private').select('*'),
    ratings: await sb.from('ratings').select('*'),
    ratingsEmbed: await sb.from('jobs').select('id, ratings(*)').eq('id', jobId),
    yaCalifique: await sb.rpc('has_rated_job', { p_job_id: jobId }),
    statsElegido: await sb.rpc('get_profile_stats', { p_user_id: elegido.uid }),
    statsCliente: await sb.rpc('get_profile_stats', { p_user_id: cliente.uid }),
    perfilElegido: await sb.from('profiles').select('*').eq('id', elegido.uid).maybeSingle(),
    marcarAjeno: who === 'noElegido' || who === 'tercero' || who === 'anon' ? await sb.rpc('mark_job_done', { p_job_id: jobId }) : null,
    calificarAjeno: who === 'noElegido' || who === 'tercero' || who === 'anon' ? await sb.rpc('rate_job', { p_job_id: jobId, p_would_work_again: false }) : null,
  };
}
const everyone = { cliente: cliente.sb, elegido: elegido.sb, noElegido: noElegido.sb, tercero: tercero.sb, anon };
const probeAll = async () => Object.fromEntries(await Promise.all(Object.entries(everyone).map(async ([w, sb]) => [w, await probe(sb, w)])));

// 1) Asignado: los que no son parte intentan marcarlo como realizado y calificar.
phase = 'asignado';
const asignado = await probeAll();

// 2) Realizado (lo marca el cortador elegido)
phase = 'realizado';
const marcar = await elegido.sb.rpc('mark_job_done', { p_job_id: jobId });
await sleep(2500);
const realizado = await probeAll();

// 3) Calificados: el cliente responde que sí, el cortador que no. Se repite para ver el error.
phase = 'calificado';
const rateCliente = await cliente.sb.rpc('rate_job', { p_job_id: jobId, p_would_work_again: true });
const rateElegido = await elegido.sb.rpc('rate_job', { p_job_id: jobId, p_would_work_again: false });
const rateDoble = await cliente.sb.rpc('rate_job', { p_job_id: jobId, p_would_work_again: false });
await sleep(1000);
const calificado = await probeAll();

// ---- Chequeos
const checks = [];
const check = (label, ok, extra = '') => checks.push({ label, ok: !!ok, extra });
const secrets = (role) => [PHONES[role], PHONES[role].slice(4), LAST_NAMES[role]];
const found = (who, needles, onlyPhase) =>
  log.filter((e) => e.who === who && (!onlyPhase || e.phase === onlyPhase) && needles.some((n) => e.body.includes(n))).map((e) => `${e.phase} ${e.kind}: ${e.what}`);
const rows = (r) => (r?.error ? [] : Array.isArray(r?.data) ? r.data : r?.data ? [r.data] : []);

check('El cortador elegido pudo marcar el trabajo como realizado', !marcar.error, marcar.error?.message);
check('Los dos pudieron calificar', !rateCliente.error && !rateElegido.error, `${rateCliente.error?.message ?? ''} ${rateElegido.error?.message ?? ''}`);
check('Calificar dos veces da error claro', rateDoble.error?.message === 'Ya calificaste este trabajo.', rateDoble.error?.message);
check('No elegido, tercero y anon no pueden marcarlo como realizado',
  ['noElegido', 'tercero', 'anon'].every((w) => !!asignado[w].marcarAjeno.error && !!realizado[w].marcarAjeno.error));
check('No elegido, tercero y anon no pueden calificar', ['noElegido', 'tercero', 'anon'].every((w) => !!realizado[w].calificarAjeno.error));
check('El trabajo queda realizado (lo ven el cliente y el elegido)',
  realizado.cliente.pedido.data?.status === 'realizado' && realizado.elegido.pedido.data?.agreement?.done_by === elegido.uid);

// Datos privados
for (const who of ['noElegido', 'tercero']) {
  const leaks = found(who, [...(who === 'tercero' ? [ADDRESS] : []), ...Object.keys(PHONES).filter((r) => r !== who).flatMap(secrets)]);
  check(`${who}: nunca recibe apellidos ni WhatsApp ajenos${who === 'tercero' ? ' (ni la dirección: no ve el pedido)' : ''} (asignado, realizado y calificado)`, leaks.length === 0, leaks.join(', '));
}
const anonLeaks = found('anon', [ADDRESS, ...Object.keys(PHONES).flatMap(secrets)]);
check('anon: nunca recibe ningún dato privado', anonLeaks.length === 0, anonLeaks.join(', '));
check('Realizado: el elegido sigue recibiendo el WhatsApp del cliente, y la dirección en el pedido',
  realizado.elegido.contacto.data?.[0]?.phone_e164 === PHONES.cliente && realizado.elegido.pedido.data?.address_street === ADDRESS);
check('Realizado: el cliente sigue recibiendo el WhatsApp del elegido', realizado.cliente.contacto.data?.[0]?.phone_e164 === PHONES.elegido);
check('Realizado: el no elegido, el tercero y anon no reciben contacto', ['noElegido', 'tercero', 'anon'].every((w) => !!realizado[w].contacto.error && !!calificado[w].contacto.error));
check('Realizado: el no elegido ve el pedido realizado pero sin acuerdo',
  realizado.noElegido.pedido.data?.status === 'realizado' && realizado.noElegido.pedido.data?.agreement === null && rows(realizado.noElegido.acuerdos).length === 0);
check('Realizado: el tercero y anon no reciben ni el pedido ni el acuerdo',
  !realizado.tercero.pedido.data && rows(realizado.tercero.acuerdos).length === 0 && rows(realizado.anon.acuerdos).length === 0);
const whoLeaks = found('noElegido', [elegido.uid]).filter((x) => !x.includes('/rest/v1/profiles') && !x.includes('get_profile_stats'));
check('Ninguna respuesta del no elegido revela quién es el elegido', whoLeaks.length === 0, whoLeaks.join(', '));

// Calificaciones: nadie las lee, ni las partes
check('Nadie puede leer la tabla ratings (ni las partes, ni anon)',
  Object.values(calificado).every((r) => rows(r.ratings).length === 0 && rows(r.ratingsEmbed).every((j) => !j.ratings?.length)));
const ratingLeaks = Object.keys(everyone).flatMap((w) =>
  found(w, ['would_work_again', 'rater_id', 'ratee_id']).map((x) => `${w} ${x}`));
check('Ninguna respuesta trae would_work_again, rater_id ni ratee_id', ratingLeaks.length === 0, ratingLeaks.join(', '));
check('has_rated_job: cada parte ve solo si calificó ella (true después, false antes)',
  realizado.cliente.yaCalifique.data === false && realizado.elegido.yaCalifique.data === false &&
  calificado.cliente.yaCalifique.data === true && calificado.elegido.yaCalifique.data === true);
check('has_rated_job: el no elegido y el tercero reciben false (no saben si otros calificaron); anon no puede',
  calificado.noElegido.yaCalifique.data === false && calificado.tercero.yaCalifique.data === false && !!calificado.anon.yaCalifique.error);

// Estadísticas públicas
const statKeys = (r) => Object.keys(r.data?.[0] ?? {}).sort().join(',');
check('Las estadísticas solo traen done_as_cutter, done_as_client y yes_pct (nunca la cantidad)',
  ['cliente', 'elegido', 'noElegido', 'tercero'].every((w) => statKeys(calificado[w].statsElegido) === 'done_as_client,done_as_cutter,yes_pct'));
check('Estadísticas: 1 trabajo realizado como cortador / como cliente, y sin porcentaje (menos de 5)',
  calificado.tercero.statsElegido.data?.[0]?.done_as_cutter === 1 && calificado.tercero.statsCliente.data?.[0]?.done_as_client === 1 &&
  calificado.tercero.statsElegido.data?.[0]?.yes_pct === null && calificado.tercero.statsCliente.data?.[0]?.yes_pct === null);
check('Anon no recibe estadísticas', !!calificado.anon.statsElegido.error);
check('El perfil público no trae datos de calificaciones', !JSON.stringify(calificado.tercero.perfilElegido.data ?? {}).match(/rating|yes_|would/));

// Avisos en vivo
const kinds = (who) => events[who].map((n) => n.kind);
check('Realtime: el cliente recibió "trabajo_realizado"', kinds('cliente').includes('trabajo_realizado'));
check('Realtime: el elegido no recibe su propio "trabajo_realizado"', !kinds('elegido').includes('trabajo_realizado'));
check('Realtime: el no elegido y el tercero no reciben "trabajo_realizado"', !kinds('noElegido').includes('trabajo_realizado') && events.tercero.length === 0);
check('Ningún aviso revela una calificación', !Object.values(events).flat().some((n) => /rating|would_work|calific/i.test(JSON.stringify(n))));
check('Los avisos no llevan datos privados', !Object.values(events).flat().some((n) => Object.keys(PHONES).flatMap(secrets).some((s) => JSON.stringify(n).includes(s))));

// Control del detector: el elegido sí recibió el WhatsApp del cliente con el trabajo realizado.
check('Control: el detector encuentra el WhatsApp del cliente en lo que recibió el elegido (realizado)', found('elegido', [PHONES.cliente], 'realizado').length > 0);

for (const [u, path] of avatars) await u.sb.storage.from('avatars').remove([path]);
for (const u of Object.values(users)) await u.sb.removeAllChannels();

const fails = checks.filter((x) => !x.ok);
for (const x of checks) console.log(`${x.ok ? 'OK   ' : 'FALLA'} ${x.label}${x.ok || !x.extra ? '' : ` → ${x.extra}`}`);
console.log(`\n${checks.length - fails.length} de ${checks.length} OK · ${log.filter((e) => e.kind === 'http').length} respuestas HTTP y ${log.filter((e) => e.kind === 'realtime').length} eventos de Realtime revisados`);
process.exit(fails.length ? 1 : 0);
