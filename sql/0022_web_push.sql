-- 0022 · Web Push (Fase 6).
-- push_subscriptions: una fila por dispositivo (endpoint) con avisos activados. Nadie la lee por la API:
-- se escribe solo con save_push_subscription / delete_push_subscription y la lee la Edge Function
-- send-push con la clave de servicio.
-- Al insertar un aviso, si el destinatario tiene algún dispositivo, un trigger encola (pg_net, asíncrono:
-- solo sale si la transacción se confirma) un POST a send-push con el id del aviso, nada más. La función
-- "reclama" el aviso (pushed_at, una sola vez y solo los recientes), arma el texto y lo manda.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 6.

create extension if not exists pg_net with schema extensions;

-- Servicios de push de los navegadores (Chrome/Android, Firefox, Safari/iOS, Edge). Solo a estos se les
-- manda algo: un endpoint inventado no convierte a send-push en un cliente HTTP para cualquier URL.
-- La misma lista está en supabase/functions/send-push/index.ts.
create or replace function private.is_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
     and char_length(p_endpoint) <= 1000;
$$;

revoke all on function private.is_push_endpoint(text) from public;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_check check (private.is_push_endpoint(endpoint)),
  -- Clave pública P-256 (65 bytes) y secreto (16 bytes), en base64url.
  constraint push_subscriptions_p256dh_check check (p256dh ~ '^[A-Za-z0-9_-]{86,88}={0,2}$'),
  constraint push_subscriptions_auth_check check (auth ~ '^[A-Za-z0-9_-]{21,24}={0,2}$')
);

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- RLS sin políticas y sin grants: ni el dueño la lee por la API.
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Guarda (o actualiza) el dispositivo del que llama. Si el endpoint era de otra cuenta (cerró sesión sin
-- poder avisar y entró otra persona en el mismo navegador), pasa a la cuenta actual: el endpoint es del
-- dispositivo. Hasta 10 dispositivos por persona: se descartan los más viejos.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Completá tu perfil antes de activar los avisos.';
  end if;
  if p_endpoint is null or not private.is_push_endpoint(p_endpoint) then
    raise exception 'Este navegador no es compatible con los avisos de PastoControl.';
  end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{86,88}={0,2}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{21,24}={0,2}$' then
    raise exception 'No pudimos activar los avisos en este dispositivo. Probá de nuevo.';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        updated_at = now();

  delete from public.push_subscriptions
  where id in (
    select id from public.push_subscriptions
    where user_id = v_uid
    order by updated_at desc
    offset 10
  );
end;
$$;

-- Saca un dispositivo propio (desactivar avisos o cerrar sesión). Devuelve si había algo para sacar.
create or replace function public.delete_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = v_uid;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Cuándo send-push mandó (o intentó mandar) el aviso. Sirve para que cada aviso salga una sola vez
-- aunque alguien llame a la función de nuevo con el mismo id.
alter table public.notifications add column pushed_at timestamptz;

-- URL de la Edge Function, guardada en Vault (no es secreta, pero así el SQL del repo no depende del
-- proyecto). Se cargó una vez con:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_function_url',
--                              'Edge Function send-push (Fase 6)');

create or replace function private.queue_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  -- Sin dispositivos no hay nada que mandar (y no se llama a la función).
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';
  if v_url is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  -- El push es un extra: nunca hace fallar la RPC que generó el aviso.
  raise warning 'No se pudo encolar el push del aviso %: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke all on function private.queue_push() from public;

create trigger notifications_queue_push
  after insert on public.notifications
  for each row execute function private.queue_push();
