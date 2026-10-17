-- 0029 · Tareas programadas de limpieza: retención de avisos y fotos huérfanas de job-photos.
-- **Borra datos (con aprobación del dueño):** avisos leídos de más de 90 días o cualquiera de más de 365, y
-- archivos de job-photos de más de 24 h que no están en ningún pedido (los borra la Edge Function
-- cleanup-photos, que tiene que estar deployada antes de que corra la tarea).
-- Ejecutar con el MCP de Supabase (execute_sql).

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Retención de avisos: los leídos de más de 90 días y cualquiera de más de 365.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.prune_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.notifications n
  where (n.read_at is not null and n.created_at < now() - interval '90 days')
     or n.created_at < now() - interval '365 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.prune_notifications() from public;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Fotos huérfanas de job-photos: archivos de más de 24 h que no figuran en el photo_paths de ningún
-- pedido (create_job que nunca llegó, o fotos reemplazadas que el front no pudo borrar). Solo devuelve la
-- lista: los borra la Edge Function cleanup-photos por la API de Storage (borrar la fila de
-- storage.objects dejaría el archivo). Solo service_role.
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.get_orphan_job_photos(p_limit integer default 500)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'job-photos'
    and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.jobs j where o.name = any (j.photo_paths))
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke all on function public.get_orphan_job_photos(integer) from public, anon, authenticated;
grant execute on function public.get_orphan_job_photos(integer) to service_role;

-- Llama a cleanup-photos con el mismo secreto que usa el push (Vault: push_webhook_secret; en la función,
-- PUSH_WEBHOOK_SECRET). La URL sale de la del push (misma base, otra función).
create or replace function private.queue_photo_cleanup()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    raise warning 'Falta la URL o el secreto en Vault: no se limpian las fotos.';
    return;
  end if;
  perform net.http_post(
    url := regexp_replace(v_url, '/send-push$', '/cleanup-photos'),
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function private.queue_photo_cleanup() from public;

-- Programación (UTC, de madrugada en Argentina). Con el mismo nombre, reemplaza la tarea.
select cron.schedule('limpiar-avisos', '30 7 * * *', 'select private.prune_notifications()');
select cron.schedule('limpiar-fotos', '45 7 * * *', 'select private.queue_photo_cleanup()');
