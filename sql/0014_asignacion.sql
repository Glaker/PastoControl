-- 0014 · Asignación: datos del acuerdo en jobs.
-- Al aceptar una postulación (accept_application, 0015) el trabajo pasa a 'asignado' y guarda la
-- postulación aceptada, el cortador, el precio y el horario acordados (los propuestos o los publicados).
-- Si después se cancela, estos datos quedan como historial.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 4.

alter table public.jobs
  add column assigned_application_id uuid references public.applications (id) on delete set null,
  add column assigned_cutter_id uuid references public.profiles (id) on delete set null,
  add column agreed_price_ars integer,
  add column agreed_at timestamptz,
  add column assigned_at timestamptz;

alter table public.jobs
  add constraint jobs_agreed_price_check
    check (agreed_price_ars is null or agreed_price_ars between 1000 and 5000000),
  add constraint jobs_assigned_check
    check (
      status not in ('asignado', 'realizado')
      or (assigned_application_id is not null and assigned_cutter_id is not null
          and agreed_price_ars is not null and agreed_at is not null and assigned_at is not null)
    );

create index jobs_assigned_cutter_id_idx on public.jobs (assigned_cutter_id) where assigned_cutter_id is not null;
create index jobs_assigned_application_id_idx on public.jobs (assigned_application_id) where assigned_application_id is not null;
