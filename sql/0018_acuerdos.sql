-- 0018 · job_agreements: el acuerdo de un pedido, privado para las dos partes.
-- Reemplaza las columnas de acuerdo que la Fase 4 había puesto en jobs (0014): los cortadores no
-- elegidos siguen viendo el pedido (se postularon), y con las columnas en jobs la API les devolvía
-- el precio y el horario acordados con otro. Mismo patrón que job_private: tabla aparte con RLS.
-- Lectura: solo el cliente y el cortador del acuerdo. Escritura: solo por RPCs.
-- Un acuerdo por pedido (job_id es la clave primaria, unique) y por postulación.
-- done_at / done_by: "marcar realizado" (Fase 5).
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 5.

create table public.job_agreements (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  client_id uuid not null references public.profiles (id) on delete cascade,
  cutter_id uuid not null references public.profiles (id) on delete cascade,
  price_ars integer not null,
  agreed_at timestamptz not null,
  assigned_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  constraint job_agreements_application_key unique (application_id),
  constraint job_agreements_parties_check check (client_id <> cutter_id),
  constraint job_agreements_price_check check (price_ars between 1000 and 5000000),
  constraint job_agreements_done_check check (done_by is null or done_at is not null)
);

create index job_agreements_client_id_idx on public.job_agreements (client_id);
create index job_agreements_cutter_id_idx on public.job_agreements (cutter_id);
create index job_agreements_done_by_idx on public.job_agreements (done_by) where done_by is not null;

alter table public.job_agreements enable row level security;
grant select on public.job_agreements to authenticated;

create policy "Acuerdos: solo las dos partes"
  on public.job_agreements for select
  to authenticated
  using (client_id = (select auth.uid()) or cutter_id = (select auth.uid()));

-- Acuerdos que ya existan en jobs (al momento de escribir esto no hay pedidos).
insert into public.job_agreements (job_id, application_id, client_id, cutter_id, price_ars, agreed_at, assigned_at)
select j.id, j.assigned_application_id, j.client_id, j.assigned_cutter_id, j.agreed_price_ars, j.agreed_at, j.assigned_at
from public.jobs j
where j.assigned_application_id is not null;
