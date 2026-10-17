-- 0028 · Tarea programada (pg_cron): recordatorio «¿Ya cortaron?». No destructivo.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), 16/10/2026. Probado en una transacción deshecha:
-- un aviso por parte y sin duplicar al correr de nuevo.

create extension if not exists pg_cron;

-- Performance advisor: FK sin índice.
create index if not exists jobs_locality_id_idx on public.jobs (locality_id);

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Recordatorio «¿Ya cortaron?»
-- Desde el día siguiente al acordado (en la zona horaria de la localidad), si el trabajo sigue asignado,
-- un aviso a cada parte para que lo marque realizado. Uno solo por trabajo y persona (dedupe_key), y solo
-- dentro de los 7 días después de la fecha (los más viejos no se recuerdan, ni al prender esto).
-- ════════════════════════════════════════════════════════════════════════════════════════════
create or replace function private.remind_unfinished_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select j.id as job_id, j.zone, g.application_id, g.client_id, g.cutter_id, g.agreed_at, l.timezone as tz
    from public.jobs j
    join public.job_agreements g on g.job_id = j.id
    join public.localities l on l.id = j.locality_id
    where j.status = 'asignado'
      and g.agreed_at > now() - interval '8 days'
      and (now() at time zone l.timezone)::date > (g.agreed_at at time zone l.timezone)::date
  loop
    -- notify ignora a quien borró su cuenta (id null) y la dedupe_key evita repetir.
    perform private.notify(
      v_row.client_id, 'recordatorio_realizado', v_row.job_id, v_row.application_id,
      jsonb_build_object('zone', v_row.zone, 'actor_name', private.display_name(v_row.cutter_id),
                         'desired_at', v_row.agreed_at, 'tz', v_row.tz),
      format('recordatorio_realizado:%s', v_row.job_id)
    );
    perform private.notify(
      v_row.cutter_id, 'recordatorio_realizado', v_row.job_id, v_row.application_id,
      jsonb_build_object('zone', v_row.zone, 'actor_name', private.display_name(v_row.client_id),
                         'desired_at', v_row.agreed_at, 'tz', v_row.tz),
      format('recordatorio_realizado:%s', v_row.job_id)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.remind_unfinished_jobs() from public;

-- 13:00 UTC = 10:00 en Argentina: el recordatorio llega a media mañana. Con el mismo nombre, reemplaza la tarea.
select cron.schedule('recordatorio-realizado', '0 13 * * *', 'select private.remind_unfinished_jobs()');
