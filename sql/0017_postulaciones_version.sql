-- 0017 · applications.updated_at como versión confiable.
-- accept_application compara el updated_at que vio el cliente con el actual. touch_updated_at usa
-- now(), que es la hora de INICIO de la transacción: dos cambios dentro de una misma transacción (o
-- un cambio en una transacción que empezó en el mismo microsegundo) dejarían el mismo valor y la
-- versión vieja pasaría como actual. Para applications se usa clock_timestamp(): la hora real de
-- cada cambio. (Lo encontró la prueba de la Fase 4, que corre todo en una transacción.)
-- Sin DROP: create or replace trigger.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 4.

create or replace function private.touch_updated_at_clock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Siempre distinto del anterior, aunque el reloj no haya avanzado (misma transacción rápida).
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

create or replace trigger applications_touch_updated_at
  before update on public.applications
  for each row execute function private.touch_updated_at_clock();
