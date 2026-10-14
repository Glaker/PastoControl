-- 0019 · El acuerdo sale de jobs (DESTRUCTIVO, aprobado por el dueño el 14/10/2026).
-- Saca de jobs el check y las 5 columnas de acuerdo de 0014 (ya copiadas a job_agreements en 0018;
-- en ese momento no había pedidos) y reemplaza las 3 funciones que las usaban para que lean y
-- escriban job_agreements. Ninguna política RLS usaba esas columnas (el cortador elegido ve el
-- pedido por haberse postulado: private.my_applied_job_ids).
-- Todo en una transacción: la base nunca queda con funciones que apunten a columnas que no existen.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 5.

begin;

alter table public.jobs
  drop constraint jobs_assigned_check,
  drop column assigned_application_id,
  drop column assigned_cutter_id,
  drop column agreed_price_ars,
  drop column agreed_at,
  drop column assigned_at;

-- Aceptación atómica. El cliente elige una postulación pendiente:
--   * FOR UPDATE sobre el trabajo: choca con el FOR SHARE de apply/update/withdraw_application y
--     con cancel_job, así que nada cambia el trabajo ni sus postulaciones en el medio.
--   * p_expected_updated_at: el updated_at de la postulación que vio el cliente. Si el cortador la
--     cambió (o la retiró y volvió) después, falla y la pantalla muestra la versión nueva.
--   * Rechaza las demás pendientes y avisa a todos, en la misma transacción.
--   * Redes de seguridad: índice único applications_one_accepted_per_job (0010) y
--     job_agreements.job_id único (0018).
--   * El acuerdo (precio y horario) se guarda en job_agreements, que solo leen las dos partes.
-- Con el pedido vencido se puede aceptar si el horario propuesto es futuro.
create or replace function public.accept_application(p_application_id uuid, p_expected_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job_id uuid;
  v_job public.jobs%rowtype;
  v_app public.applications%rowtype;
  v_other public.applications%rowtype;
  v_price integer;
  v_at timestamptz;
  v_tz text;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  select a.job_id into v_job_id from public.applications a where a.id = p_application_id;
  if v_job_id is null then
    raise exception 'No encontramos esa postulación.';
  end if;
  select * into v_job from public.jobs j where j.id = v_job_id for update;
  if v_job.client_id <> v_uid then
    raise exception 'No encontramos esa postulación.';
  end if;
  if v_job.status = 'asignado' then
    raise exception 'Ya elegiste a alguien para este pedido.';
  end if;
  if v_job.status <> 'publicado' then
    raise exception 'Este pedido ya no está publicado.';
  end if;

  select * into v_app from public.applications a where a.id = p_application_id for update;
  if v_app.status <> 'pendiente' then
    raise exception 'Esta postulación ya no está disponible (se retiró o cambió).';
  end if;
  if p_expected_updated_at is null or v_app.updated_at <> p_expected_updated_at then
    raise exception 'La postulación cambió mientras la mirabas. Revisá la propuesta nueva antes de elegir.';
  end if;

  v_price := coalesce(v_app.proposed_price_ars, v_job.price_ars);
  v_at := coalesce(v_app.proposed_at, v_job.desired_at);
  if v_at <= now() then
    raise exception 'El horario de esta postulación ya pasó.';
  end if;

  update public.applications a set status = 'aceptada' where a.id = v_app.id;
  update public.jobs j set status = 'asignado' where j.id = v_job.id;
  -- El acuerdo es privado de las dos partes (job_agreements, 0018). job_id es único: un solo
  -- acuerdo por pedido, otra red de seguridad además del índice de una sola aceptada.
  insert into public.job_agreements (job_id, application_id, client_id, cutter_id, price_ars, agreed_at)
  values (v_job.id, v_app.id, v_job.client_id, v_app.cutter_id, v_price, v_at);

  select l.timezone into v_tz from public.localities l where l.id = v_job.locality_id;

  perform private.notify(
    v_app.cutter_id, 'postulacion_aceptada', v_job.id, v_app.id,
    jsonb_build_object('zone', v_job.zone, 'actor_name', private.display_name(v_uid),
                       'price_ars', v_price, 'desired_at', v_at, 'tz', v_tz),
    format('postulacion_aceptada:%s', v_app.id)
  );

  for v_other in
    update public.applications a set status = 'rechazada'
    where a.job_id = v_job.id and a.status = 'pendiente'
    returning *
  loop
    perform private.notify(
      v_other.cutter_id, 'postulacion_rechazada', v_job.id, v_other.id,
      jsonb_build_object('zone', v_job.zone, 'desired_at', v_job.desired_at, 'tz', v_tz),
      format('postulacion_rechazada:%s', v_other.id)
    );
  end loop;
end;
$$;

-- Contacto de la contraparte: solo a las dos partes y solo con el trabajo asignado o realizado.
-- Al cliente: nombre completo y WhatsApp del cortador. Al cortador: dirección, nombre completo y
-- WhatsApp del cliente. Más el acuerdo (precio y horario).
create or replace function public.get_job_contact(p_job_id uuid)
returns table (
  counterpart_role text,
  first_name text,
  last_name text,
  phone_e164 text,
  address text,
  agreed_price_ars integer,
  agreed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_agr public.job_agreements%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id;
  select * into v_agr from public.job_agreements g where g.job_id = p_job_id;
  if v_job.id is null
     or v_agr.job_id is null
     or v_job.status not in ('asignado', 'realizado')
     or v_uid not in (v_agr.client_id, v_agr.cutter_id) then
    raise exception 'No encontramos los datos de contacto de ese trabajo.';
  end if;

  v_other := case when v_uid = v_agr.client_id then v_agr.cutter_id else v_agr.client_id end;

  return query
  select case when v_other = v_agr.client_id then 'cliente' else 'cortador' end,
         p.first_name, pp.last_name, pp.phone_e164,
         (select jp.address from public.job_private jp where jp.job_id = v_job.id),
         v_agr.price_ars, v_agr.agreed_at
  from public.profiles p
  join public.profile_private pp on pp.user_id = p.id
  where p.id = v_other;
end;
$$;

-- Cancela un pedido:
--   * publicado (vencido o no): solo el cliente. Las postulaciones pendientes pasan a 'cancelada' y
--     cada cortador recibe un aviso.
--   * asignado: el cliente o el cortador aceptado. La postulación aceptada pasa a 'cancelada' y la
--     otra parte recibe un aviso. El pedido queda cancelado (el cliente puede volver a publicarlo).
-- Todo en la misma transacción, con el trabajo FOR UPDATE.
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
    cancelled_by = v_uid
  where id = p_job_id;

  select l.timezone into v_tz from public.localities l where l.id = v_job.locality_id;

  if v_job.status = 'asignado' then
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

commit;
