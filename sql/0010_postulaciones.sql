-- 0010 · Postulaciones.
-- applications: una por cortador y por trabajo. Si se retira y se vuelve a postular, se reusa la fila
-- (attempt + 1). proposed_price_ars / proposed_at en null = acepta lo publicado.
-- Lectura: el cortador las suyas y el cliente las de sus pedidos (no tienen datos privados).
-- Escritura: solo por RPCs (0012).
-- Además: los cortadores ven los pedidos en los que se postularon, en cualquier estado (y sus fotos,
-- porque la política del bucket consulta jobs con el RLS del que llama).
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 3.

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  cutter_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pendiente',
  proposed_price_ars integer,
  proposed_at timestamptz,
  -- Veces que se postuló (sube al volver a postularse después de retirarse) y ediciones en este intento.
  -- Arman la dedupe_key de los avisos: cada evento real genera un aviso, un reintento no.
  attempt integer not null default 1,
  edits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_status_check
    check (status in ('pendiente', 'aceptada', 'rechazada', 'retirada', 'cancelada')),
  constraint applications_price_check
    check (proposed_price_ars is null or proposed_price_ars between 1000 and 5000000),
  constraint applications_counts_check check (attempt >= 1 and edits >= 0),
  constraint applications_job_cutter_key unique (job_id, cutter_id)
);

-- Red de seguridad de la aceptación atómica (Fase 4): una sola aceptada por trabajo.
create unique index applications_one_accepted_per_job on public.applications (job_id) where status = 'aceptada';
create index applications_cutter_id_updated_at_idx on public.applications (cutter_id, updated_at desc);

create trigger applications_touch_updated_at
  before update on public.applications
  for each row execute function private.touch_updated_at();

-- Funciones para las políticas. SECURITY DEFINER a propósito: la política de jobs consulta
-- applications y la de applications consulta jobs; si se consultaran con RLS habría recursión.
-- Solo devuelven ids del usuario que llama.
create or replace function private.my_job_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select j.id from public.jobs j where j.client_id = (select auth.uid());
$$;

create or replace function private.my_applied_job_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.job_id from public.applications a where a.cutter_id = (select auth.uid());
$$;

revoke all on function private.my_job_ids() from public;
revoke all on function private.my_applied_job_ids() from public;
grant execute on function private.my_job_ids() to authenticated;
grant execute on function private.my_applied_job_ids() to authenticated;

alter table public.applications enable row level security;
grant select on public.applications to authenticated;

create policy "Postulaciones: el cortador las suyas y el cliente las de sus pedidos"
  on public.applications for select
  to authenticated
  using (
    cutter_id = (select auth.uid())
    or job_id in (select private.my_job_ids())
  );

-- jobs: se suma "los pedidos en los que me postulé" a la única política de lectura (0009).
alter policy "Trabajos: el dueño y los cortadores de la localidad" on public.jobs
  rename to "Trabajos: el dueño, los cortadores de la localidad y los postulantes";

alter policy "Trabajos: el dueño, los cortadores de la localidad y los postulantes" on public.jobs
  using (
    client_id = (select auth.uid())
    or (
      status = 'publicado'
      and desired_at > now()
      and locality_id = (select private.my_cutter_locality_id())
    )
    or id in (select private.my_applied_job_ids())
  );
