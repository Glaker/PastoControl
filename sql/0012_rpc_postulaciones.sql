-- 0012 · RPCs de postulaciones: apply_to_job, update_application, withdraw_application.
-- SECURITY DEFINER, search_path vacío, auth.uid() validado primero, execute solo para authenticated.
-- Orden de bloqueos (siempre el mismo, para no trabarse con otras transacciones):
--   perfil (FOR SHARE) → trabajo (FOR SHARE) → postulación (FOR UPDATE).
-- La aceptación (Fase 4), update_job y cancel_job toman el trabajo FOR UPDATE: con FOR SHARE acá,
-- una postulación nunca se cruza con un cambio del trabajo.
-- Cada cambio inserta su aviso en la misma transacción (private.notify).
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 3.

-- "Beto B.": el nombre visible antes de la aceptación.
create or replace function private.display_name(p_user_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select p.first_name || ' ' || p.last_initial || '.' from public.profiles p where p.id = p_user_id;
$$;

-- Normaliza y valida una propuesta. Proponer lo mismo que lo publicado se guarda como null
-- ("acepto lo publicado"). Aceptar el horario publicado solo vale si todavía no pasó.
create or replace function private.normalize_proposal(
  p_job_price integer,
  p_job_desired_at timestamptz,
  p_price integer,
  p_at timestamptz,
  out o_price integer,
  out o_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
begin
  o_price := case when p_price = p_job_price then null else p_price end;
  o_at := case when p_at = p_job_desired_at then null else p_at end;

  if o_price is not null and o_price not between 1000 and 5000000 then
    raise exception 'El precio que proponés tiene que estar entre $ 1.000 y $ 5.000.000.';
  end if;
  if o_at is not null then
    if o_at <= now() then
      raise exception 'El horario que proponés ya pasó. Elegí uno más adelante.';
    end if;
    if o_at > now() + interval '60 days' then
      raise exception 'El horario que proponés puede ser hasta 60 días adelante.';
    end if;
  elsif p_job_desired_at <= now() then
    raise exception 'El horario publicado ya pasó: proponé otro.';
  end if;
end;
$$;

revoke all on function private.display_name(uuid) from public;
revoke all on function private.normalize_proposal(integer, timestamptz, integer, timestamptz) from public;

-- Postularse (o volver a postularse después de retirarse: se reusa la fila).
create or replace function public.apply_to_job(
  p_job_id uuid,
  p_proposed_price_ars integer default null,
  p_proposed_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_job public.jobs%rowtype;
  v_app public.applications%rowtype;
  v_exists boolean;
  v_price integer;
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  -- FOR SHARE: choca con upsert_my_profile (FOR UPDATE) si a la vez se saca el rol de cortador.
  select * into v_profile from public.profiles p where p.id = v_uid for share;
  if not found or not v_profile.is_cutter then
    raise exception 'Para postularte activá «Corto pasto» en tu perfil.';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id for share;
  if not found or v_job.locality_id <> v_profile.locality_id then
    raise exception 'No encontramos ese trabajo.';
  end if;
  if v_job.client_id = v_uid then
    raise exception 'No te podés postular a tu propio pedido.';
  end if;
  if v_job.status <> 'publicado' or private.job_is_expired(v_job.status, v_job.desired_at) then
    raise exception 'Este trabajo ya no recibe postulaciones.';
  end if;

  select n.o_price, n.o_at into v_price, v_at
  from private.normalize_proposal(v_job.price_ars, v_job.desired_at, p_proposed_price_ars, p_proposed_at) n;

  select * into v_app from public.applications a
  where a.job_id = p_job_id and a.cutter_id = v_uid
  for update;
  v_exists := found;
  if v_exists and v_app.status = 'pendiente' then
    raise exception 'Ya te postulaste a este trabajo. Si querés, editá tu postulación.';
  end if;
  if v_exists and v_app.status <> 'retirada' then
    raise exception 'Ya no te podés postular a este trabajo.';
  end if;

  if (select count(*) from public.applications a where a.cutter_id = v_uid and a.status = 'pendiente') >= 20 then
    raise exception 'Tenés 20 postulaciones pendientes. Retirá alguna para postularte a otra.';
  end if;

  if v_exists then
    update public.applications a set
      status = 'pendiente',
      proposed_price_ars = v_price,
      proposed_at = v_at,
      attempt = a.attempt + 1,
      edits = 0
    where a.id = v_app.id
    returning * into v_app;
  else
    begin
      insert into public.applications (job_id, cutter_id, proposed_price_ars, proposed_at)
      values (p_job_id, v_uid, v_price, v_at)
      returning * into v_app;
    exception when unique_violation then
      -- Dos pedidos simultáneos del mismo cortador: el segundo choca con unique(job_id, cutter_id).
      raise exception 'Ya te postulaste a este trabajo. Si querés, editá tu postulación.';
    end;
  end if;

  perform private.notify(
    v_job.client_id, 'postulacion_nueva', v_job.id, v_app.id,
    jsonb_build_object(
      'zone', v_job.zone,
      'actor_name', private.display_name(v_uid),
      'proposed_price_ars', v_app.proposed_price_ars,
      'proposed_at', v_app.proposed_at,
      'tz', (select l.timezone from public.localities l where l.id = v_job.locality_id)
    ),
    format('postulacion_nueva:%s:%s', v_app.id, v_app.attempt)
  );

  return v_app.id;
end;
$$;

-- Cambia la propuesta de una postulación pendiente propia. Nulls = acepta lo publicado.
-- Se puede editar aunque el trabajo esté vencido, proponiendo un horario futuro.
create or replace function public.update_application(
  p_application_id uuid,
  p_proposed_price_ars integer default null,
  p_proposed_at timestamptz default null
)
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
  v_price integer;
  v_at timestamptz;
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

  if v_app.status <> 'pendiente' then
    raise exception 'Esta postulación ya no se puede editar.';
  end if;
  if v_job.status <> 'publicado' then
    raise exception 'Este trabajo ya no recibe cambios.';
  end if;

  select n.o_price, n.o_at into v_price, v_at
  from private.normalize_proposal(v_job.price_ars, v_job.desired_at, p_proposed_price_ars, p_proposed_at) n;

  if v_price is not distinct from v_app.proposed_price_ars and v_at is not distinct from v_app.proposed_at then
    return; -- Sin cambios: ni actualización ni aviso.
  end if;

  update public.applications a set
    proposed_price_ars = v_price,
    proposed_at = v_at,
    edits = a.edits + 1
  where a.id = v_app.id
  returning * into v_app;

  perform private.notify(
    v_job.client_id, 'postulacion_editada', v_job.id, v_app.id,
    jsonb_build_object(
      'zone', v_job.zone,
      'actor_name', private.display_name(v_uid),
      'proposed_price_ars', v_app.proposed_price_ars,
      'proposed_at', v_app.proposed_at,
      'tz', (select l.timezone from public.localities l where l.id = v_job.locality_id)
    ),
    format('postulacion_editada:%s:%s:%s', v_app.id, v_app.attempt, v_app.edits)
  );
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
    raise exception 'Tu postulación ya fue aceptada: no se puede retirar.';
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

revoke all on function public.apply_to_job(uuid, integer, timestamptz) from public, anon;
revoke all on function public.update_application(uuid, integer, timestamptz) from public, anon;
revoke all on function public.withdraw_application(uuid) from public, anon;
grant execute on function public.apply_to_job(uuid, integer, timestamptz) to authenticated;
grant execute on function public.update_application(uuid, integer, timestamptz) to authenticated;
grant execute on function public.withdraw_application(uuid) to authenticated;
