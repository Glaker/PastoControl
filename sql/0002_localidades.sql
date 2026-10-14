-- 0002 · Localidades. La localidad es un dato del modelo, nunca un valor fijo en el código.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 1.

create table public.localities (
  id smallint generated always as identity primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 80),
  province text not null check (char_length(province) between 1 and 80),
  -- Zona horaria para mostrar e ingresar fechas y horas.
  timezone text not null default 'America/Argentina/Buenos_Aires',
  -- Característica telefónica: completa los números que se cargan sin ella.
  phone_area_code text not null check (phone_area_code ~ '^[1-3][0-9]{1,3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.localities enable row level security;

grant select on public.localities to authenticated;

create policy "Localidades: lectura para usuarios logueados"
  on public.localities for select
  to authenticated
  using (true);

insert into public.localities (slug, name, province, phone_area_code)
values ('25-de-mayo-bsas', '25 de Mayo', 'Buenos Aires', '2345');
