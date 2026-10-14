-- 0001 · Base: esquema privado, permisos por defecto y utilidades.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 1.

-- Esquema para funciones auxiliares. PostgREST solo expone "public", así que nada de acá
-- se puede llamar por la API. authenticated necesita USAGE porque las políticas RLS
-- pueden usar estas funciones.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Supabase da por defecto todos los permisos a anon y authenticated sobre lo que se crea en
-- public. Los sacamos: cada tabla y cada función concede explícitamente solo lo que necesita.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

-- Trigger genérico para updated_at.
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
