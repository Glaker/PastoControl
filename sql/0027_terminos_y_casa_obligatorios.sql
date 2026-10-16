-- 0027 · Fase 8, paso 3 (DESTRUCTIVO: requiere la aprobación del dueño).
-- Correr DESPUÉS de deployar el front nuevo (el viejo no tiene pantalla de aceptación de términos ni pide la
-- casa del cortador, y usa la firma vieja de upsert_my_profile).
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 8.

begin;

-- 1. Términos obligatorios: las RPCs de escritura rechazan a quien no aceptó la versión vigente (salvo las que
--    sirven para irse: cancelar, retirar, desactivar avisos, marcar avisos leídos y borrar la cuenta).
create or replace function private.terms_enforced()
returns boolean
language sql
immutable
set search_path = ''
as $$
  select true;
$$;

-- 2. Casa obligatoria para cortar: sin ubicación base no se postula, y un cortador no la puede borrar.
create or replace function private.cutter_base_required()
returns boolean
language sql
immutable
set search_path = ''
as $$
  select true;
$$;

-- 3. Lo que solo usaba el front viejo.
-- Firma vieja (con la localidad y la regla de no cambiarla con cosas activas).
drop function public.upsert_my_profile(text, text, text, smallint, boolean, boolean, text);
-- Filtro por localidad de la política de jobs (reemplazado por private.i_am_cutter en 0026).
drop function private.my_cutter_locality_id();
-- Índice de la lista vieja de disponibles (por localidad y fecha); ahora se busca por ubicación
-- (jobs_published_location_idx).
drop index public.jobs_available_idx;

commit;
