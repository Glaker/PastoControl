-- 0011 · Avisos (notifications).
-- Se insertan en la misma transacción que el cambio de estado, solo desde las RPCs, con
-- private.notify: dedupe_key única por destinatario + on conflict do nothing (un reintento no duplica).
-- El payload solo admite campos públicos (lista blanca en private.notify): nunca dirección, teléfono
-- ni apellido.
-- Lectura: cada uno los suyos. Marcar como leído: RPC mark_notifications_read.
-- Realtime: la tabla está en la publicación supabase_realtime (respeta el RLS).
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 3.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  job_id uuid references public.jobs (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  payload jsonb not null default '{}',
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_kind_check check (kind ~ '^[a-z][a-z_]{2,40}$'),
  constraint notifications_payload_check check (jsonb_typeof(payload) = 'object'),
  constraint notifications_dedupe_key_check check (char_length(dedupe_key) between 1 and 200),
  constraint notifications_user_dedupe_key unique (user_id, dedupe_key)
);

create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_job_id_idx on public.notifications (job_id) where job_id is not null;
create index notifications_application_id_idx on public.notifications (application_id) where application_id is not null;

-- Inserta un aviso. Solo la llaman las RPCs (corren como su dueño): sin grant para authenticated.
-- Lista blanca de campos del payload: si alguien agrega un campo que no está acá, falla en vez de
-- filtrar datos. Para sumar campos (fases siguientes) se reemplaza esta función.
create or replace function private.notify(
  p_user_id uuid,
  p_kind text,
  p_job_id uuid,
  p_application_id uuid,
  p_payload jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}');
  v_extra text[];
begin
  select array_agg(k) into v_extra
  from jsonb_object_keys(v_payload) k
  where k <> all (array['zone', 'actor_name', 'price_ars', 'desired_at', 'proposed_price_ars', 'proposed_at', 'tz']);
  if v_extra is not null then
    raise exception 'Campo de aviso no permitido: %', array_to_string(v_extra, ', ');
  end if;

  insert into public.notifications (user_id, kind, job_id, application_id, payload, dedupe_key)
  values (p_user_id, p_kind, p_job_id, p_application_id, jsonb_strip_nulls(v_payload), p_dedupe_key)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

revoke all on function private.notify(uuid, text, uuid, uuid, jsonb, text) from public;

alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;

create policy "Avisos: cada uno los suyos"
  on public.notifications for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Marca como leídos avisos propios: los indicados, o todos si p_ids es null. Devuelve cuántos.
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  update public.notifications n
  set read_at = now()
  where n.user_id = v_uid
    and n.read_at is null
    and (p_ids is null or n.id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

alter publication supabase_realtime add table public.notifications;
