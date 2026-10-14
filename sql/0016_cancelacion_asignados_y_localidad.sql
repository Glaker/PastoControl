-- 0016 · Fase 4 en RPCs existentes (reemplazos con create or replace; mismas firmas):
--   cancel_job: también un trabajo asignado, por el cliente o por el cortador aceptado.
--   withdraw_application: mensaje que orienta a cancelar el trabajo si ya fue aceptada.
--   upsert_my_profile: no deja cambiar de localidad con pedidos o postulaciones activas.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 4.

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
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id for update;
  if not found or not (
    v_job.client_id = v_uid or (v_job.status = 'asignado' and v_job.assigned_cutter_id = v_uid)
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
    update public.applications a set status = 'cancelada' where a.id = v_job.assigned_application_id;
    perform private.notify(
      case when v_by_cutter then v_job.client_id else v_job.assigned_cutter_id end,
      case when v_by_cutter then 'trabajo_cancelado_por_cortador' else 'trabajo_cancelado_por_cliente' end,
      p_job_id, v_job.assigned_application_id,
      jsonb_build_object('zone', v_job.zone, 'actor_name', private.display_name(v_uid),
                         'desired_at', v_job.agreed_at, 'tz', v_tz),
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

-- Retira una postulación pendiente propia (también si el trabajo está vencido).
create or replace function public.withdraw_application(p_application_id uuid)
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
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  select a.job_id into v_job_id from public.applications a where a.id = p_application_id and a.cutter_id = v_uid;
  if v_job_id is null then
    raise exception 'No encontramos esa postulación.';
  end if;
  select * into v_job from public.jobs j where j.id = v_job_id for share;
  select * into v_app from public.applications a where a.id = p_application_id for update;

  if v_app.status = 'retirada' then
    raise exception 'Ya habías retirado esta postulación.';
  end if;
  if v_app.status = 'aceptada' then
    raise exception 'Tu postulación ya fue aceptada: si no podés ir, cancelá el trabajo desde su detalle.';
  end if;
  if v_app.status <> 'pendiente' then
    raise exception 'Esta postulación ya no está pendiente.';
  end if;

  update public.applications a set status = 'retirada' where a.id = v_app.id;

  perform private.notify(
    v_job.client_id, 'postulacion_retirada', v_job.id, v_app.id,
    jsonb_build_object(
      'zone', v_job.zone,
      'actor_name', private.display_name(v_uid),
      'tz', (select l.timezone from public.localities l where l.id = v_job.locality_id)
    ),
    format('postulacion_retirada:%s:%s', v_app.id, v_app.attempt)
  );
end;
$$;

-- Crea o actualiza el perfil del usuario que llama. No recibe id: siempre es auth.uid().
create or replace function public.upsert_my_profile(
  p_first_name text,
  p_last_name text,
  p_phone_e164 text,
  p_locality_id smallint,
  p_is_client boolean,
  p_is_cutter boolean,
  p_avatar_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
  v_phone text := btrim(coalesce(p_phone_e164, ''));
  v_avatar text := nullif(btrim(coalesce(p_avatar_path, '')), '');
  v_is_client boolean := coalesce(p_is_client, false);
  v_is_cutter boolean := coalesce(p_is_cutter, false);
  v_was_client boolean;
  v_was_cutter boolean;
  v_old_locality smallint;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  if char_length(v_first) not between 1 and 40 then
    raise exception 'Escribí tu nombre (hasta 40 letras).';
  end if;
  if char_length(v_last) not between 1 and 60 then
    raise exception 'Escribí tu apellido (hasta 60 letras).';
  end if;
  if v_phone !~ '^\+549[1-3][0-9]{9}$' then
    raise exception 'El número de WhatsApp no es válido.';
  end if;
  if not exists (select 1 from public.localities l where l.id = p_locality_id and l.is_active) then
    raise exception 'Elegí una localidad disponible.';
  end if;
  if not (v_is_client or v_is_cutter) then
    raise exception 'Elegí al menos una opción: pedir cortes o cortar pasto.';
  end if;

  if v_avatar is not null then
    if v_avatar not like v_uid::text || '/%' then
      raise exception 'La foto no es tuya.';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = v_avatar) then
      raise exception 'No encontramos la foto. Subila de nuevo.';
    end if;
  end if;
  if v_is_cutter and v_avatar is null then
    raise exception 'Para cortar pasto necesitás una foto de perfil.';
  end if;

  -- Bloquea el perfil (si ya existe): create_job también lo bloquea, así que un pedido nuevo
  -- y el cambio de roles no se pueden cruzar.
  select p.is_client, p.is_cutter, p.locality_id into v_was_client, v_was_cutter, v_old_locality
  from public.profiles p where p.id = v_uid for update;
  if coalesce(v_was_client, false) and not v_is_client and exists (
    select 1 from public.jobs j where j.client_id = v_uid and j.status in ('publicado', 'asignado')
  ) then
    raise exception 'Tenés pedidos publicados o asignados. Cancelalos desde «Mis pedidos» antes de dejar de pedir cortes.';
  end if;
  -- Postulaciones activas: pendientes, o aceptadas de un trabajo asignado (Fase 4).
  -- apply_to_job bloquea el perfil FOR SHARE, así que no se puede postular mientras se saca el rol.
  if coalesce(v_was_cutter, false) and not v_is_cutter and exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
    where a.cutter_id = v_uid and (a.status = 'pendiente' or (a.status = 'aceptada' and j.status = 'asignado'))
  ) then
    raise exception 'Tenés postulaciones activas. Retiralas desde «Mis postulaciones» antes de dejar de cortar pasto.';
  end if;
  -- Localidad: no se cambia con pedidos publicados o asignados, ni con postulaciones pendientes o
  -- aceptadas de un trabajo asignado (los pedidos y las postulaciones son de la localidad anterior).
  if v_old_locality is not null and v_old_locality <> p_locality_id and (
    exists (select 1 from public.jobs j where j.client_id = v_uid and j.status in ('publicado', 'asignado'))
    or exists (
      select 1 from public.applications a join public.jobs j on j.id = a.job_id
      where a.cutter_id = v_uid and (a.status = 'pendiente' or (a.status = 'aceptada' and j.status = 'asignado'))
    )
  ) then
    raise exception 'No podés cambiar de localidad mientras tengas pedidos publicados o asignados, o postulaciones pendientes o aceptadas. Cancelalos o retiralas primero.';
  end if;

  insert into public.profiles (id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter)
  values (v_uid, p_locality_id, v_first, upper(left(v_last, 1)), v_avatar, v_is_client, v_is_cutter)
  on conflict (id) do update set
    locality_id = excluded.locality_id,
    first_name = excluded.first_name,
    last_initial = excluded.last_initial,
    avatar_path = excluded.avatar_path,
    is_client = excluded.is_client,
    is_cutter = excluded.is_cutter;

  insert into public.profile_private (user_id, last_name, phone_e164)
  values (v_uid, v_last, v_phone)
  on conflict (user_id) do update set
    last_name = excluded.last_name,
    phone_e164 = excluded.phone_e164;
end;
$$;

revoke all on function public.upsert_my_profile(text, text, text, smallint, boolean, boolean, text) from public, anon;
grant execute on function public.upsert_my_profile(text, text, text, smallint, boolean, boolean, text) to authenticated;
