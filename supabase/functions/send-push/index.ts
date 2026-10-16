// send-push · Fase 6 (Web Push).
// La llama el trigger notifications_queue_push (pg_net) con { notification_id } cuando se inserta un aviso
// para alguien con dispositivos.
// Autenticación (verify_jwt = false, el trigger no tiene un JWT de usuario):
//   1. Header x-push-secret = secreto PUSH_WEBHOOK_SECRET (el trigger lo lee de Vault, push_webhook_secret).
//      Sin él: 401 antes de leer el cuerpo o tocar la base.
//   2. Además la función solo "reclama" avisos recientes que todavía no salieron (pushed_at): con el mismo
//      id, o con uno viejo, no manda nada; y el texto sale siempre de la base, nunca del pedido.
//
// Secretos de la función (Supabase → Edge Functions → Secrets): VAPID_PRIVATE_KEY y PUSH_WEBHOOK_SECRET.
// La clave pública VAPID no es secreta y está acá y en src/push/vapid.ts. SUPABASE_URL y la clave de
// servicio las pone Supabase.
//
// El texto replica src/notifications/describe.tsx (mismo payload, solo campos públicos): si cambia uno,
// cambiar el otro.

import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC_KEY = 'BA7K-udBFC60rHCIAuhwUtVk8UL-SrZPbEXZ6yPLYOY-WBSxo2ta456BlfpRW5clyeIA3X2BQZi1EFIc3qCV0OM';
const VAPID_SUBJECT = 'https://pastocontrol.vercel.app';
// Solo avisos de los últimos minutos (los anteriores a la Fase 6 o reintentos tardíos no salen).
const MAX_AGE_MS = 10 * 60 * 1000;
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
// Misma lista que private.is_push_endpoint (sql/0022_web_push.sql).
const PUSH_ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serviceKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const key = (JSON.parse(keys) as Record<string, string>).default;
      if (key) return key;
    } catch {
      // formato inesperado: se usa la clave de servicio clásica
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Payload = {
  zone?: string;
  address?: string;
  actor_name?: string;
  price_ars?: number;
  desired_at?: string;
  proposed_price_ars?: number;
  proposed_at?: string;
  tz?: string;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const encoder = new TextEncoder();

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
function sameSecret(given: string | null, expected: string): boolean {
  const a = encoder.encode(given ?? '');
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method' });

  // Antes que nada: sin el secreto compartido no se lee el cuerpo ni se toca la base.
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('Falta el secreto PUSH_WEBHOOK_SECRET');
    return json(500, { error: 'config' });
  }
  if (!sameSecret(req.headers.get('x-push-secret'), webhookSecret)) return json(401, { error: 'unauthorized' });

  let id: unknown;
  try {
    id = ((await req.json()) as { notification_id?: unknown }).notification_id;
  } catch {
    return json(400, { error: 'body' });
  }
  if (typeof id !== 'string' || !UUID.test(id)) return json(400, { error: 'notification_id' });

  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!privateKey) {
    console.error('Falta el secreto VAPID_PRIVATE_KEY');
    return json(500, { error: 'config' });
  }

  // Reclamo atómico: solo una llamada por aviso llega a mandarlo.
  const { data: n, error } = await supabase
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', id)
    .is('pushed_at', null)
    .gt('created_at', new Date(Date.now() - MAX_AGE_MS).toISOString())
    .select('user_id, kind, job_id, payload')
    .maybeSingle();
  if (error) {
    console.error('No se pudo leer el aviso', error.message);
    return json(500, { error: 'db' });
  }
  if (!n) return json(200, { sent: 0, skipped: true });

  const { data: subs, error: subsError } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', n.user_id);
  if (subsError) {
    console.error('No se pudieron leer los dispositivos', subsError.message);
    return json(500, { error: 'db' });
  }

  const message = describe(n.kind, n.job_id, (n.payload ?? {}) as Payload);
  const body = JSON.stringify({ ...message, tag: id });
  let sent = 0;
  let removed = 0;
  let failed = 0;

  await Promise.all(
    (subs ?? []).map(async (s) => {
      if (!PUSH_ENDPOINT.test(s.endpoint)) return;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey },
          TTL: 24 * 60 * 60,
          urgency: 'high',
        });
        sent++;
      } catch (e) {
        const { statusCode: status, body: reason } = e as { statusCode?: number; body?: string };
        // 404/410: el navegador dio de baja la suscripción (desinstaló, borró datos, revocó el permiso).
        // Apple contesta 400 BadWebPushToken (o BadDeviceToken) cuando el token ya no sirve.
        if (status === 404 || status === 410 || (status === 400 && /Bad(WebPush|Device)Token/.test(reason ?? ''))) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
          removed++;
          console.log('Dispositivo dado de baja', new URL(s.endpoint).host, status, reason ?? '');
        } else {
          failed++;
          console.error('Falló un push', new URL(s.endpoint).host, status ?? '', (e as Error).message, reason ?? '');
        }
      }
    }),
  );

  return json(200, { sent, removed, failed });
});

// ——— Texto (igual que src/notifications/describe.tsx) ———

const priceFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const formatPrice = (ars: number) => priceFormatter.format(ars);

/** "sáb. 18/10 · 16:00 h" (como dayjs en la app), en la zona horaria de la localidad. */
function formatDateTime(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('es-AR', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday.replace('.', '')}. ${parts.day}/${parts.month} · ${parts.hour}:${parts.minute} h`;
}

function describe(kind: string, jobId: string | null, p: Payload): { title: string; body: string; url: string } {
  const tz = p.tz ?? DEFAULT_TZ;
  // Lugar del pedido: la dirección (la zona en los avisos anteriores a que fuera visible). Puede faltar si
  // el dueño del pedido borró su cuenta; el nombre, si la persona que actuó la borró (Fase 8).
  const place = p.address ?? p.zone;
  const en = place ? ` en ${place}` : '';
  const actor = p.actor_name ?? 'Usuario eliminado';
  const when = p.desired_at ? ` del ${formatDateTime(p.desired_at, tz)}` : '';
  const pedido = jobId ? `/pedir/pedido/${jobId}` : '/avisos';
  const trabajo = jobId ? `/cortar/trabajo/${jobId}` : '/avisos';

  const proposal = () => {
    const price = p.proposed_price_ars ? `propone ${formatPrice(p.proposed_price_ars)}` : null;
    const at = p.proposed_at ? `para el ${formatDateTime(p.proposed_at, tz)}` : null;
    if (price && at) return `${price} ${at}`;
    if (price) return `${price} (horario publicado)`;
    if (at) return `propone otro horario: ${formatDateTime(p.proposed_at!, tz)} (precio publicado)`;
    return 'acepta el precio y el horario publicados';
  };

  switch (kind) {
    case 'postulacion_nueva':
      return { title: 'Nueva postulación', body: `${actor} se postuló a tu pedido${en} y ${proposal()}.`, url: pedido };
    case 'postulacion_editada':
      return {
        title: 'Cambió una postulación',
        body: `${actor} cambió su postulación a tu pedido${en}: ahora ${proposal()}.`,
        url: pedido,
      };
    case 'postulacion_retirada':
      return { title: 'Postulación retirada', body: `${actor} retiró su postulación a tu pedido${en}.`, url: pedido };
    case 'pedido_cancelado':
      return {
        title: 'Pedido cancelado',
        body: `El cliente canceló el pedido${en}${when}. Tu postulación quedó sin efecto.`,
        url: trabajo,
      };
    case 'postulacion_aceptada':
      return {
        title: '¡Te eligieron!',
        body: `${actor} aceptó tu postulación${place ? ` para ${place}` : ''}${p.price_ars ? `: ${formatPrice(p.price_ars)}` : ''}${
          p.desired_at ? `, ${formatDateTime(p.desired_at, tz)}` : ''
        }. Ya podés escribirle por WhatsApp.`,
        url: trabajo,
      };
    case 'postulacion_rechazada':
      return {
        title: 'Eligieron a otra persona',
        body: `El cliente eligió a otra persona para el trabajo${en}. ¡Suerte con el próximo!`,
        url: trabajo,
      };
    case 'trabajo_cancelado_por_cliente':
      return { title: 'Trabajo cancelado', body: `${actor} canceló el trabajo${en}${when}.`, url: trabajo };
    case 'trabajo_cancelado_por_cortador':
      return {
        title: 'Trabajo cancelado',
        body: `${actor} canceló el trabajo${en}${when}. Si querés, publicalo de nuevo.`,
        url: pedido,
      };
    case 'trabajo_realizado':
      return {
        title: 'Trabajo realizado',
        body: `${actor} marcó como realizado el trabajo${en}${when}. Contanos si volverías a trabajar con esa persona.`,
        url: jobId ? `/trabajo/${jobId}` : '/avisos',
      };
    default:
      return { title: 'PastoControl', body: 'Tenés un aviso nuevo.', url: '/avisos' };
  }
}
