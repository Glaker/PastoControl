-- 0005 · Trabajos.
-- jobs: lo que ve un cortador (zona, precio, fecha, nota, fotos). Nada privado.
-- job_private: la dirección. Solo la lee el dueño; al cortador aceptado se le entrega por
-- get_job_contact (Fase 4), nunca por esta tabla.
-- Las escrituras van solo por las RPCs create_job, update_job y cancel_job (0007).
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 2.

-- Las fotos de un trabajo viven en job-photos/<client_id>/<job_id>/. Hasta 5, sin repetir.
create or replace function private.job_photo_paths_ok(p_paths text[], p_client_id uuid, p_job_id uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p_paths), 0) <= 5
    and array_position(p_paths, null) is null
    and (select count(distinct x) from unnest(p_paths) x) = coalesce(cardinality(p_paths), 0)
    and not exists (
      select 1 from unnest(p_paths) x
      where x not like p_client_id::text || '/' || p_job_id::text || '/%'
         or x like '%/../%'
    );
$$;

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  locality_id smallint not null references public.localities (id),
  -- Zona aproximada en texto libre (barrio, referencia). Nunca la dirección.
  zone text not null,
  price_ars integer not null,
  desired_at timestamptz not null,
  notes text,
  photo_paths text[] not null default '{}',
  status text not null default 'publicado',
  republished_from uuid references public.jobs (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_status_check check (status in ('publicado', 'asignado', 'realizado', 'cancelado')),
  constraint jobs_zone_check check (char_length(zone) between 2 and 80 and zone = btrim(zone)),
  constraint jobs_price_check check (price_ars between 1000 and 5000000),
  constraint jobs_notes_check check (notes is null or (char_length(notes) between 1 and 500 and notes = btrim(notes))),
  constraint jobs_photo_paths_check check (private.job_photo_paths_ok(photo_paths, client_id, id)),
  constraint jobs_cancelled_check check ((status = 'cancelado') = (cancelled_at is not null)),
  constraint jobs_republished_not_self_check check (republished_from is distinct from id)
);

create index jobs_client_id_created_at_idx on public.jobs (client_id, created_at desc);
create index jobs_available_idx on public.jobs (locality_id, desired_at) where status = 'publicado';
create index jobs_republished_from_idx on public.jobs (republished_from) where republished_from is not null;
create index jobs_cancelled_by_idx on public.jobs (cancelled_by) where cancelled_by is not null;

create trigger jobs_touch_updated_at
  before update on public.jobs
  for each row execute function private.touch_updated_at();

create table public.job_private (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  address text not null,
  updated_at timestamptz not null default now(),
  constraint job_private_address_check
    check (char_length(address) between 3 and 200 and address = btrim(address))
);

create trigger job_private_touch_updated_at
  before update on public.job_private
  for each row execute function private.touch_updated_at();

-- "Vencido" no se guarda: publicado y con la fecha deseada pasada, con el reloj del servidor.
create or replace function private.job_is_expired(p_status text, p_desired_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'publicado' and p_desired_at <= now();
$$;

-- Computed field para la API: select=*,is_expired
create or replace function public.is_expired(public.jobs)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.job_is_expired($1.status, $1.desired_at);
$$;

-- Localidad del usuario que llama si es cortador (null si no lo es). Para las políticas RLS.
create or replace function private.my_cutter_locality_id()
returns smallint
language sql
stable
set search_path = ''
as $$
  select p.locality_id from public.profiles p where p.id = (select auth.uid()) and p.is_cutter;
$$;

revoke all on function private.job_photo_paths_ok(text[], uuid, uuid) from public;
revoke all on function private.job_is_expired(text, timestamptz) from public;
revoke all on function private.my_cutter_locality_id() from public;
revoke all on function public.is_expired(public.jobs) from public, anon;
grant execute on function private.job_is_expired(text, timestamptz) to authenticated;
grant execute on function private.my_cutter_locality_id() to authenticated;
grant execute on function public.is_expired(public.jobs) to authenticated;

alter table public.jobs enable row level security;
alter table public.job_private enable row level security;

-- Solo lectura por la API; sin insert/update/delete directos.
grant select on public.jobs to authenticated;
grant select on public.job_private to authenticated;

create policy "Trabajos: el dueño ve los suyos"
  on public.jobs for select
  to authenticated
  using (client_id = (select auth.uid()));

-- Los cortadores ven los trabajos publicados y no vencidos de su localidad.
-- (Fase 3: además, los trabajos en los que se postularon, en cualquier estado.)
create policy "Trabajos: los cortadores ven los disponibles de su localidad"
  on public.jobs for select
  to authenticated
  using (
    status = 'publicado'
    and desired_at > now()
    and locality_id = (select private.my_cutter_locality_id())
  );

create policy "Dirección: solo el dueño del trabajo"
  on public.job_private for select
  to authenticated
  using (
    exists (select 1 from public.jobs j where j.id = job_id and j.client_id = (select auth.uid()))
  );
