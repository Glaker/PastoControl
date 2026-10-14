// Prueba de carrera real · Fase 4.
// Sesiones reales en paralelo contra la API (cada una con su propio cliente y su propio token):
// un cliente (abierto en 5 sesiones a la vez, como si tuviera la app en varios dispositivos) y 6
// cortadores. En cada ronda se publica un pedido, se postulan los cortadores y se disparan a la vez
// operaciones que compiten. Después de cada ronda se verifican las invariantes:
//   * nunca más de una postulación aceptada por pedido;
//   * pedido asignado ⇔ exactamente una aceptada, y el acuerdo coincide con la versión que vio el cliente;
//   * ninguna postulación pendiente en un pedido que no está publicado;
//   * exactamente una de las operaciones en conflicto gana.
//
// Uso: node scripts/prueba-carrera-fase4.mjs [rondas por escenario, por defecto 10]
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY de .env (solo la clave pública).
// Crea usuarios pastocontrol.prueba.f4carrera-* (se borran con sql/tests/limpiar_usuarios_prueba.sql).

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

const ROUNDS = Number(process.argv[2] ?? 10);
const stamp = Date.now();
const password = `Prueba-${randomUUID()}`;
const newClient = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

// ---- Usuarios
async function register(role) {
  const sb = newClient();
  const email = `pastocontrol.prueba.f4carrera-${role}-${stamp}@gmail.com`;
  const data = must(await sb.auth.signUp({ email, password }), `registro ${role}`);
  return { sb, uid: data.user.id, email };
}
async function extraSession(email) {
  const sb = newClient();
  must(await sb.auth.signInWithPassword({ email, password }), 'sesión extra');
  return sb;
}

const client = await register('cliente');
const clientSessions = [client.sb];
for (let i = 0; i < 4; i++) clientSessions.push(await extraSession(client.email));
const cutters = [];
for (let i = 1; i <= 6; i++) cutters.push(await register(`cortador${i}`));

const { data: loc } = await client.sb.from('localities').select('id').eq('slug', '25-de-mayo-bsas').single();
const tinyJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
must(await client.sb.rpc('upsert_my_profile', {
  p_first_name: 'Clienta', p_last_name: 'Carrera', p_phone_e164: '+5492345987400',
  p_locality_id: loc.id, p_is_client: true, p_is_cutter: false,
}), 'perfil cliente');
for (const [i, c] of cutters.entries()) {
  const avatar = `${c.uid}/a.jpg`;
  must(await c.sb.storage.from('avatars').upload(avatar, tinyJpeg, { contentType: 'image/jpeg' }), 'avatar');
  c.avatar = avatar;
  must(await c.sb.rpc('upsert_my_profile', {
    p_first_name: `Cortador${i + 1}`, p_last_name: 'Carrera', p_phone_e164: `+549234598741${i}`,
    p_locality_id: loc.id, p_is_client: false, p_is_cutter: true, p_avatar_path: avatar,
  }), 'perfil cortador');
}

// ---- Helpers
async function newJob() {
  const id = randomUUID();
  must(await client.sb.rpc('create_job', {
    p_id: id, p_zone: 'Carrera', p_address: 'Pasaje Carrera 1', p_price_ars: 15000,
    p_desired_at: new Date(Date.now() + 2 * 86400e3).toISOString(),
  }), 'create_job');
  return id;
}
async function applyAll(jobId, who, proposals = {}) {
  await Promise.all(who.map((c, i) => c.sb.rpc('apply_to_job', { p_job_id: jobId, ...(proposals[i] ?? {}) })));
  const apps = must(await client.sb.rpc('get_job_applicants', { p_job_id: jobId }), 'applicants');
  // Mapa cortador → postulación (con el updated_at que "ve" el cliente).
  return Object.fromEntries(apps.map((a) => [a.cutter_id, a]));
}
const ok = (r) => r.status === 'fulfilled' && !r.value.error;
const errMsg = (r) => (r.status === 'rejected' ? String(r.reason) : r.value.error?.message ?? '');
async function state(jobId) {
  const job = must(await client.sb.from('jobs').select('status, desired_at, price_ars, agreement:job_agreements!job_agreements_job_id_fkey(application_id, cutter_id, price_ars, agreed_at)').eq('id', jobId).single(), 'job');
  const apps = must(await client.sb.from('applications').select('id, cutter_id, status, proposed_price_ars, proposed_at').eq('job_id', jobId), 'apps');
  return { job, apps };
}
async function cleanup(jobId) {
  const { job } = await state(jobId);
  if (job.status === 'publicado' || job.status === 'asignado') await client.sb.rpc('cancel_job', { p_job_id: jobId });
}

const failures = [];
const tally = {};
function invariant(scenario, round, cond, msg) {
  if (!cond) failures.push(`[${scenario} #${round}] ${msg}`);
}
function count(scenario, outcome) {
  tally[scenario] ??= {};
  tally[scenario][outcome] = (tally[scenario][outcome] ?? 0) + 1;
}
function checkCommon(scenario, round, { job, apps }) {
  const accepted = apps.filter((a) => a.status === 'aceptada');
  invariant(scenario, round, accepted.length <= 1, `hay ${accepted.length} aceptadas`);
  if (job.status === 'asignado') {
    invariant(scenario, round, accepted.length === 1 && accepted[0].id === job.agreement?.application_id, 'asignado sin su aceptada o sin acuerdo');
  } else {
    invariant(scenario, round, accepted.length === 0, `pedido ${job.status} con una aceptada`);
  }
  if (job.status !== 'publicado') {
    invariant(scenario, round, apps.every((a) => a.status !== 'pendiente'), `pendientes en un pedido ${job.status}`);
  }
}

// ---- Escenarios
const [c1, c2, c3, c4, c5, c6] = cutters;
const scenarios = {
  // 5 sesiones del cliente eligen a la vez a 5 postulantes distintos.
  'A · cinco aceptaciones simultáneas': async (round) => {
    const jobId = await newJob();
    const apps = await applyAll(jobId, [c1, c2, c3, c4, c5]);
    const targets = [c1, c2, c3, c4, c5].map((c) => apps[c.uid]);
    const res = await Promise.allSettled(targets.map((a, i) => clientSessions[i].rpc('accept_application', { p_application_id: a.application_id, p_expected_updated_at: a.updated_at })));
    const wins = res.filter(ok).length;
    invariant('A', round, wins === 1, `ganaron ${wins} aceptaciones`);
    const st = await state(jobId);
    checkCommon('A', round, st);
    invariant('A', round, st.job.status === 'asignado', `quedó ${st.job.status}`);
    invariant('A', round, st.apps.filter((a) => a.status === 'rechazada').length === 4, 'no quedaron 4 rechazadas');
    count('A', `ganó la sesión ${res.findIndex(ok) + 1}`);
    await cleanup(jobId);
  },

  // El cliente acepta la versión que vio mientras el cortador cambia su precio.
  'B · aceptar vs. cambiar la propuesta': async (round) => {
    const jobId = await newJob();
    const apps = await applyAll(jobId, [c1, c2], { 0: { p_proposed_price_ars: 20000 } });
    const seen = apps[c1.uid];
    const [acc, upd] = await Promise.allSettled([
      clientSessions[0].rpc('accept_application', { p_application_id: seen.application_id, p_expected_updated_at: seen.updated_at }),
      c1.sb.rpc('update_application', { p_application_id: seen.application_id, p_proposed_price_ars: 30000 }),
    ]);
    const st = await state(jobId);
    checkCommon('B', round, st);
    invariant('B', round, ok(acc) !== ok(upd), `aceptar=${ok(acc)} cambiar=${ok(upd)} (tiene que ganar exactamente uno)`);
    if (ok(acc)) {
      invariant('B', round, st.job.agreement?.price_ars === 20000, `se acordó ${st.job.agreement?.price_ars} y el cliente vio 20000`);
      invariant('B', round, /ya no se puede editar/.test(errMsg(upd)), `cambiar falló con: ${errMsg(upd)}`);
      count('B', 'ganó aceptar (con el precio que vio el cliente)');
    } else {
      invariant('B', round, /cambió/.test(errMsg(acc)), `aceptar falló con: ${errMsg(acc)}`);
      invariant('B', round, st.job.status === 'publicado', 'el pedido no siguió publicado');
      count('B', 'ganó cambiar (aceptar rechazado por versión vieja)');
    }
    await cleanup(jobId);
  },

  // El cliente acepta mientras el cortador se retira.
  'C · aceptar vs. retirarse': async (round) => {
    const jobId = await newJob();
    const apps = await applyAll(jobId, [c1, c2]);
    const seen = apps[c1.uid];
    const [acc, wd] = await Promise.allSettled([
      clientSessions[0].rpc('accept_application', { p_application_id: seen.application_id, p_expected_updated_at: seen.updated_at }),
      c1.sb.rpc('withdraw_application', { p_application_id: seen.application_id }),
    ]);
    const st = await state(jobId);
    checkCommon('C', round, st);
    invariant('C', round, ok(acc) !== ok(wd), `aceptar=${ok(acc)} retirar=${ok(wd)}`);
    const mine = st.apps.find((a) => a.id === seen.application_id);
    if (ok(acc)) {
      invariant('C', round, mine.status === 'aceptada', `quedó ${mine.status}`);
      count('C', 'ganó aceptar');
    } else {
      invariant('C', round, mine.status === 'retirada' && st.job.status === 'publicado', `quedó ${mine.status} / ${st.job.status}`);
      count('C', 'ganó retirarse');
    }
    await cleanup(jobId);
  },

  // Una sesión del cliente acepta y otra cancela el pedido.
  'D · aceptar vs. cancelar el pedido': async (round) => {
    const jobId = await newJob();
    const apps = await applyAll(jobId, [c1, c2, c3]);
    const seen = apps[c2.uid];
    const [acc, can] = await Promise.allSettled([
      clientSessions[0].rpc('accept_application', { p_application_id: seen.application_id, p_expected_updated_at: seen.updated_at }),
      clientSessions[1].rpc('cancel_job', { p_job_id: jobId }),
    ]);
    const st = await state(jobId);
    checkCommon('D', round, st);
    invariant('D', round, st.job.status === 'cancelado', `quedó ${st.job.status}`);
    if (ok(acc)) {
      // Primero se asignó y después se canceló el asignado: la aceptada pasa a cancelada.
      invariant('D', round, ok(can), 'aceptar ganó pero cancelar falló');
      invariant('D', round, st.apps.find((a) => a.id === seen.application_id).status === 'cancelada', 'la aceptada no quedó cancelada');
      count('D', 'primero aceptar, después cancelar (asignado)');
    } else {
      invariant('D', round, /ya no está publicado|Ya elegiste/.test(errMsg(acc)), `aceptar falló con: ${errMsg(acc)}`);
      invariant('D', round, st.apps.every((a) => a.status === 'cancelada'), 'no quedaron todas canceladas');
      count('D', 'primero cancelar (aceptar rechazado)');
    }
    await cleanup(jobId);
  },

  // Un cortador nuevo se postula justo mientras el cliente elige a otro.
  'E · postularse tarde vs. aceptar': async (round) => {
    const jobId = await newJob();
    const apps = await applyAll(jobId, [c1, c2]);
    const seen = apps[c1.uid];
    const [acc, ap] = await Promise.allSettled([
      clientSessions[0].rpc('accept_application', { p_application_id: seen.application_id, p_expected_updated_at: seen.updated_at }),
      c6.sb.rpc('apply_to_job', { p_job_id: jobId }),
    ]);
    const st = await state(jobId);
    checkCommon('E', round, st);
    invariant('E', round, ok(acc), `aceptar falló: ${errMsg(acc)}`);
    const late = st.apps.find((a) => a.cutter_id === c6.uid);
    if (ok(ap)) {
      invariant('E', round, late?.status === 'rechazada', `la postulación tardía quedó ${late?.status}`);
      count('E', 'la postulación llegó antes (quedó rechazada)');
    } else {
      invariant('E', round, !late && /ya no recibe/.test(errMsg(ap)), `postularse falló con: ${errMsg(ap)}`);
      count('E', 'la postulación llegó tarde (rechazada por la RPC)');
    }
    await cleanup(jobId);
  },

  // Trabajo asignado: el cliente y el cortador cancelan a la vez.
  'F · doble cancelación de un asignado': async (round) => {
    const jobId = await newJob();
    const apps = await applyAll(jobId, [c1]);
    const seen = apps[c1.uid];
    must(await clientSessions[0].rpc('accept_application', { p_application_id: seen.application_id, p_expected_updated_at: seen.updated_at }), 'aceptar');
    const [byClient, byCutter] = await Promise.allSettled([
      clientSessions[1].rpc('cancel_job', { p_job_id: jobId }),
      c1.sb.rpc('cancel_job', { p_job_id: jobId }),
    ]);
    const st = await state(jobId);
    checkCommon('F', round, st);
    invariant('F', round, ok(byClient) !== ok(byCutter), `cliente=${ok(byClient)} cortador=${ok(byCutter)}`);
    invariant('F', round, st.job.status === 'cancelado', `quedó ${st.job.status}`);
    const kinds = must(await client.sb.from('notifications').select('kind').eq('job_id', jobId).eq('kind', 'trabajo_cancelado_por_cortador'), 'avisos');
    invariant('F', round, kinds.length === (ok(byCutter) ? 1 : 0), 'aviso de cancelación incorrecto');
    count('F', ok(byClient) ? 'ganó el cliente' : 'ganó el cortador');
  },
};

const t0 = Date.now();
for (const [name, run] of Object.entries(scenarios)) {
  for (let r = 1; r <= ROUNDS; r++) {
    try {
      await run(r);
    } catch (e) {
      failures.push(`[${name} #${r}] excepción: ${e.message}`);
    }
  }
  const outcomes = Object.entries(tally[name.slice(0, 1)] ?? {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
  console.log(`${name} — ${ROUNDS} rondas — ${outcomes}`);
}

// Limpieza de archivos (los usuarios se borran por SQL).
for (const c of cutters) await c.sb.storage.from('avatars').remove([c.avatar]);

console.log(`\n${failures.length === 0 ? 'OK' : 'FALLAS'}: ${failures.length} invariantes rotas en ${Object.keys(scenarios).length * ROUNDS} rondas (${Math.round((Date.now() - t0) / 1000)} s)`);
for (const f of failures) console.log('  ' + f);
process.exit(failures.length ? 1 : 0);
