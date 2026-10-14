-- 0013 · Fase 3 en RPCs existentes (reemplazos con create or replace; mismas firmas):
--   update_job: no se edita con postulaciones pendientes.
--   cancel_job: cancela las postulaciones pendientes y avisa a cada cortador.
--   upsert_my_profile: no deja sacar el rol de cortador con postulaciones activas.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 3.

-- Edita un pedido publicado propio (también vencido: así se renueva con otra fecha).
-- Con postulaciones pendientes no se edita: se cancela y se vuelve a publicar. El FOR UPDATE choca
-- con el FOR SHARE de apply_to_job, así que no se puede colar una postulación mientras se edita.
create or replace function public.update_job(
  p_job_id uuid,
  p_zone text,
  p_address text,
  p_price_ars integer,
  p_desired_at timestamptz,
  p_notes text default null,
  p_photo_paths text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_zone text := btrim(coalesce(p_zone, ''));
  v_address text := btrim(coalesce(p_address, ''));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_photos text[] := coalesce(p_photo_paths, '{}');
  v_job public.jobs%rowtype;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id for update;
  if not found or v_job.client_id <> v_uid then
    raise exception 'No encontramos ese pedido.';
  end if;
  if v_job.status <> 'publicado' then
    raise exception 'Este pedido ya no se puede editar.';
  end if;
  if exists (select 1 from public.applications a where a.job_id = p_job_id and a.status = 'pendiente') then
    raise exception 'Este pedido ya tiene postulaciones y no se puede editar. Si querés cambiarlo, cancelalo y publicalo de nuevo.';
  end if;

  perform private.check_job_input(v_uid, p_job_id, v_zone, v_address, p_price_ars, p_desired_at, v_notes, v_photos);

  update public.jobs set
    zone = v_zone,
    price_ars = p_price_ars,
    desired_at = p_desired_at,
    notes = v_notes,
    photo_paths = v_photos
  where id = p_job_id;

  update public.job_private set address = v_address where job_id = p_job_id;
end;
$$;

-- Cancela un pedido publicado propio (vencido o no). Las postulaciones pendientes pasan a
-- 'cancelada' y cada cortador recibe un aviso, en la misma transacción.
-- Fase 4: también asignado, por cualquiera de las partes.
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
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id for update;
  if not found or v_job.client_id <> v_uid then
    raise exception 'No encontramos ese pedido.';
  end if;
  if v_job.status = 'cancelado' then
    raise exception 'Este pedido ya estaba cancelado.';
  end if;
  if v_job.status = 'realizado' then
    raise exception 'Un pedido realizado no se puede cancelar.';
  end if;
  if v_job.status <> 'publicado' then
    raise exception 'Por ahora no se puede cancelar un pedido asignado.';
  end if;

  update public.jobs set
    status = 'cancelado',
    cancelled_at = now(),
    cancelled_by = v_uid
  where id = p_job_id;

  select l.timezone into v_tz from public.localities l where l.id = v_job.locality_id;
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
  select p.is_client, p.is_cutter into v_was_client, v_was_cutter from public.profiles p where p.id = v_uid for update;
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
