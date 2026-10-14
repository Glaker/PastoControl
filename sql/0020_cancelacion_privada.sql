-- 0020 · Quién canceló un trabajo asignado: privado de las dos partes.
-- jobs.cancelled_by lo ve cualquiera que vea el pedido, incluidos los postulantes no elegidos. Si el
-- que cancela es el cortador elegido, ese uuid revelaba quién era (lo encontró la verificación de red
-- de la Fase 4). Ahora:
--   * jobs.cancelled_by: solo cuando cancela el cliente (que ya es público por client_id); null
--     cuando cancela el cortador.
--   * job_agreements.cancelled_by: quién canceló un trabajo asignado (solo lo leen las dos partes).
-- Sin DROP: se agrega una columna y se reemplaza cancel_job (misma firma).
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 5.

alter table public.job_agreements
  add column cancelled_by uuid references public.profiles (id) on delete set null;

create index job_agreements_cancelled_by_idx on public.job_agreements (cancelled_by) where cancelled_by is not null;

create or replace function public.cancel_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_app public.applications%rowtype;
  v_tz text;
  v_by_cutter boolean;
  v_agr public.job_agreements%rowtype;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id for update;
  select * into v_agr from public.job_agreements g where g.job_id = p_job_id;
  -- coalesce: sin acuerdo, la comparación daría null y "not (... or null)" no dispararía el error.
  if v_job.id is null or not (
    v_job.client_id = v_uid or (v_job.status = 'asignado' and coalesce(v_agr.cutter_id = v_uid, false))
  ) then
    raise exception 'No encontramos ese pedido.';
  end if;
  v_by_cutter := v_job.client_id <> v_uid;
  if v_job.status = 'cancelado' then
    raise exception 'Este pedido ya estaba cancelado.';
  end if;
  if v_job.status = 'realizado' then
    raise exception 'Un pedido realizado no se puede cancelar.';
  end if;

  update public.jobs set
    status = 'cancelado',
    cancelled_at = now(),
    -- El cortador no queda en jobs (lo verían los demás postulantes): va a job_agreements.
    cancelled_by = case when v_by_cutter then null else v_uid end
  where id = p_job_id;

  select l.timezone into v_tz from public.localities l where l.id = v_job.locality_id;

  if v_job.status = 'asignado' then
    update public.job_agreements g set cancelled_by = v_uid where g.job_id = p_job_id;
    update public.applications a set status = 'cancelada' where a.id = v_agr.application_id;
    perform private.notify(
      case when v_by_cutter then v_job.client_id else v_agr.cutter_id end,
      case when v_by_cutter then 'trabajo_cancelado_por_cortador' else 'trabajo_cancelado_por_cliente' end,
      p_job_id, v_agr.application_id,
      jsonb_build_object('zone', v_job.zone, 'actor_name', private.display_name(v_uid),
                         'desired_at', v_agr.agreed_at, 'tz', v_tz),
      format('trabajo_cancelado:%s', p_job_id)
    );
    return;
  end if;

  for v_app in
    update public.applications a set status = 'cancelada'
    where a.job_id = p_job_id and a.status = 'pendiente'
    returning *
  loop
    perform private.notify(
      v_app.cutter_id, 'pedido_cancelado', p_job_id, v_app.id,
      jsonb_build_object('zone', v_job.zone, 'desired_at', v_job.desired_at, 'tz', v_tz),
      format('pedido_cancelado:%s', p_job_id)
    );
  end loop;
end;
$$;
