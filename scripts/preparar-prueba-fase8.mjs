// Prepara usuarios para probar la Fase 8 en el navegador (no verifica nada: imprime los mails y la contraseña).
//   * viejo: cuenta existente que nunca aceptó los términos (se registra sin la casilla) → aceptación forzada.
//   * borra: cliente y cortador con un pedido publicado y una postulación pendiente → borrar la cuenta.
//   * cortador: casa en Rosario (-32.9468, -60.6393), para probar el radio de 5 y 50 km.
//   * cliente: pedidos a 3, 8 y 30 km de la casa del cortador (y uno de borra para la postulación).
//
// Uso: node scripts/preparar-prueba-fase8.mjs
// Crea usuarios pastocontrol.prueba.f8ui-* (se borran con sql/tests/limpiar_usuarios_prueba.sql).

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
const ORIGIN = { lat: -32.9468, lng: -60.6393 }; // Rosario
const north = (km) => ({ lat: ORIGIN.lat + km / 111.195, lng: ORIGIN.lng });

async function user(role, { terms = true, first, last, phone, client, cutter, base }) {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `pastocontrol.prueba.f8ui-${role}-${stamp}@gmail.com`;
  const data = must(await sb.auth.signUp({ email, password, options: terms ? { data: { terms_version: 1 } } : {} }), `registro ${role}`);
  const uid = data.user.id;
  if (cutter) must(await sb.storage.from('avatars').upload(`${uid}/a.jpg`, tinyJpeg, { contentType: 'image/jpeg' }), 'avatar');
  must(await sb.rpc('upsert_my_profile', {
    p_first_name: first, p_last_name: last, p_phone_e164: phone, p_is_client: client, p_is_cutter: cutter,
    p_avatar_path: cutter ? `${uid}/a.jpg` : undefined,
  }), `perfil ${role}`);
  if (base) must(await sb.rpc('set_my_base_location', { p_lat: base.lat, p_lng: base.lng }), `casa ${role}`);
  return { sb, uid, email };
}

async function job(u, point, street, number, days = 2) {
  const id = randomUUID();
  must(await u.sb.rpc('create_job', {
    p_id: id, p_location_lat: point.lat, p_location_lng: point.lng, p_address_street: street, p_address_number: number,
    p_price_ars: 20000, p_desired_at: new Date(Date.now() + days * 86400e3).toISOString(),
  }), `pedido ${street}`);
  return id;
}

const viejo = await user('viejo', { terms: false, first: 'Valeria', last: 'Vieja', phone: '+5492345900001', client: true, cutter: false });
const cliente = await user('cliente', { first: 'Clara', last: 'Rosario', phone: '+5493414900002', client: true, cutter: false });
const cortador = await user('cortador', { first: 'Cosme', last: 'Cortes', phone: '+5493414900003', client: false, cutter: true, base: ORIGIN });
const borra = await user('borra', { first: 'Bruno', last: 'Borrador', phone: '+5492345900004', client: true, cutter: true, base: { lat: -35.44, lng: -60.18 } });

await job(cliente, north(3), 'Bv. Oroño', '1500');
await job(cliente, north(8), 'Av. Alberdi', '800');
await job(cliente, north(30), 'Ruta 11', 's/n');
const delCliente = await job(cliente, { lat: -35.43, lng: -60.17 }, 'Calle 9', '100', 3);
// Lo pendiente de borra: un pedido propio publicado y una postulación pendiente.
await job(borra, { lat: -35.435, lng: -60.175 }, 'Calle Borrable', '42', 4);
must(await borra.sb.rpc('apply_to_job', { p_job_id: delCliente }), 'postulación de borra');

console.log(`Contraseña (todos): ${password}`);
console.log(`Viejo (sin aceptar los términos): ${viejo.email}`);
console.log(`Borra (pedido publicado + postulación pendiente): ${borra.email}`);
console.log(`Cortador (casa en Rosario): ${cortador.email}`);
console.log(`Cliente (pedidos a 3, 8 y 30 km): ${cliente.email}`);
