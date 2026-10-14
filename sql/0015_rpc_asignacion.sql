-- 0015 · RPCs de asignación: accept_application, get_job_applicants, get_job_contact.
-- SECURITY DEFINER, search_path vacío, auth.uid() validado primero, execute solo para authenticated.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 4.

-- Aceptación atómica. El cliente elige una postulación pendiente:
--   * FOR UPDATE sobre el trabajo: choca con el FOR SHARE de apply/update/withdraw_application y
--     con cancel_job, así que nada cambia el trabajo ni sus postulaciones en el medio.
--   * p_expected_updated_at: el updated_at de la postulación que vio el cliente. Si el cortador la
--     cambió (o la retiró y volvió) después, falla y la pantalla muestra la versión nueva.
--   * Rechaza las demás pendientes y avisa a todos, en la misma transacción.
--   * Red de seguridad: índice único applications_one_accepted_per_job (0010).
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
  update public.jobs j set
    status = 'asignado',
    assigned_application_id = v_app.id,
    assigned_cutter_id = v_app.cutter_id,
    agreed_price_ars = v_price,
    agreed_at = v_at,
    assigned_at = now()
  where j.id = v_job.id;

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

-- Postulantes de un pedido propio, con el nombre visible y la foto (nunca apellido ni teléfono).
-- Sin las retiradas. done_jobs / yes_pct: estadísticas públicas, se completan en la Fase 5
-- (ya están en la firma para no tener que recrear la función).
create or replace function public.get_job_applicants(p_job_id uuid)
returns table (
  application_id uuid,
  cutter_id uuid,
  first_name text,
  last_initial text,
  avatar_path text,
  status text,
  proposed_price_ars integer,
  proposed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  done_jobs integer,
  yes_pct integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.jobs j where j.id = p_job_id and j.client_id = v_uid) then
    raise exception 'No encontramos ese pedido.';
  end if;

  return query
  select a.id, a.cutter_id, p.first_name, p.last_initial, p.avatar_path, a.status,
         a.proposed_price_ars, a.proposed_at, a.created_at, a.updated_at,
         null::integer, null::integer
  from public.applications a
  join public.profiles p on p.id = a.cutter_id
  where a.job_id = p_job_id and a.status <> 'retirada'
  order by (a.status = 'aceptada') desc, (a.status = 'pendiente') desc, a.created_at;
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
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id;
  if not found
     or v_job.status not in ('asignado', 'realizado')
     or v_uid not in (v_job.client_id, v_job.assigned_cutter_id) then
    raise exception 'No encontramos los datos de contacto de ese trabajo.';
  end if;

  v_other := case when v_uid = v_job.client_id then v_job.assigned_cutter_id else v_job.client_id end;

  return query
  select case when v_other = v_job.client_id then 'cliente' else 'cortador' end,
         p.first_name, pp.last_name, pp.phone_e164,
         (select jp.address from public.job_private jp where jp.job_id = v_job.id),
         v_job.agreed_price_ars, v_job.agreed_at
  from public.profiles p
  join public.profile_private pp on pp.user_id = p.id
  where p.id = v_other;
end;
$$;

revoke all on function public.accept_application(uuid, timestamptz) from public, anon;
revoke all on function public.get_job_applicants(uuid) from public, anon;
revoke all on function public.get_job_contact(uuid) from public, anon;
grant execute on function public.accept_application(uuid, timestamptz) to authenticated;
grant execute on function public.get_job_applicants(uuid) to authenticated;
grant execute on function public.get_job_contact(uuid) to authenticated;
