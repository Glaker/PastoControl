// Prepara una prueba a mano del mapa en el navegador: un cliente con 4 pedidos publicados en distintos
// puntos de 25 de Mayo y un cortador con su casa cargada. Imprime los mails y la contraseña para entrar.
//
// Uso: node scripts/preparar-prueba-mapa.mjs
// Lee VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY de .env (solo la clave pública).
// Crea usuarios pastocontrol.prueba.mapa-* (se borran con sql/tests/limpiar_usuarios_prueba.sql).

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

const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

const stamp = Date.now();
const password = `Prueba-${randomUUID().slice(0, 8)}`;
const tinyJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

async function signUp(role, phone, cutter) {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `pastocontrol.prueba.mapa-${role}-${stamp}@gmail.com`;
  const data = must(await sb.auth.signUp({ email, password }), `registro ${role}`);
  const uid = data.user.id;
  const { data: loc } = await sb.from('localities').select('id').eq('slug', '25-de-mayo-bsas').single();
  if (cutter) must(await sb.storage.from('avatars').upload(`${uid}/a.jpg`, tinyJpeg, { contentType: 'image/jpeg' }), 'avatar');
  must(await sb.rpc('upsert_my_profile', {
    p_first_name: role === 'cliente' ? 'Clara' : 'Cosme', p_last_name: role === 'cliente' ? 'Pruebas' : 'Cortes',
    p_phone_e164: phone, p_locality_id: loc.id, p_is_client: !cutter, p_is_cutter: cutter,
    p_avatar_path: cutter ? `${uid}/a.jpg` : undefined,
  }), `perfil ${role}`);
  return { sb, uid, email };
}

const cliente = await signUp('cliente', '+5492345911111', false);
const cortador = await signUp('cortador', '+5492345922222', true);

// Casa del cortador: al sur del centro (cerca de la avenida). Los pedidos quedan a distintas distancias.
must(await cortador.sb.rpc('set_my_base_location', { p_lat: -35.4405, p_lng: -60.1735 }), 'casa');

const jobs = [
  { street: 'Calle 9', number: '1150', between: 'entre 24 y 25', lat: -35.4300, lng: -60.1700, price: 15000, days: 1 },
  { street: 'Calle 28', number: '640', between: null, lat: -35.4410, lng: -60.1760, price: 22000, days: 2 },
  { street: 'Avenida 30', number: 's/n', between: 'entre 1 y 3', lat: -35.4200, lng: -60.1550, price: 30000, days: 3 },
  { street: 'Calle 15', number: '2200', between: null, lat: -35.4500, lng: -60.1950, price: 18000, days: 4 },
];
for (const j of jobs) {
  must(await cliente.sb.rpc('create_job', {
    p_id: randomUUID(), p_location_lat: j.lat, p_location_lng: j.lng, p_address_street: j.street,
    p_address_number: j.number, p_address_between: j.between ?? undefined, p_price_ars: j.price,
    p_desired_at: new Date(Date.now() + j.days * 86400e3).toISOString(),
  }), `pedido ${j.street}`);
}

console.log(`Cliente:  ${cliente.email}`);
console.log(`Cortador: ${cortador.email}`);
console.log(`Contraseña (los dos): ${password}`);
