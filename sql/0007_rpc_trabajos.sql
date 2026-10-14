-- 0007 · RPCs de trabajos: create_job, update_job, cancel_job.
-- Todas SECURITY DEFINER, search_path vacío, auth.uid() validado primero, execute solo para authenticated.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 2.

-- Validaciones comunes de create_job y update_job. Recibe los valores ya recortados.
-- Solo la llaman las RPCs (corren como su dueño), por eso no tiene grant para authenticated.
create or replace function private.check_job_input(
  p_uid uuid,
  p_job_id uuid,
  p_zone text,
  p_address text,
  p_price_ars integer,
  p_desired_at timestamptz,
  p_notes text,
  p_photo_paths text[]
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if char_length(p_zone) not between 2 and 80 then
    raise exception 'Escribí la zona o el barrio (entre 2 y 80 letras).';
  end if;
  if char_length(p_address) not between 3 and 200 then
    raise exception 'Escribí la dirección (entre 3 y 200 letras).';
  end if;
  if p_price_ars is null or p_price_ars not between 1000 and 5000000 then
    raise exception 'El precio tiene que estar entre $ 1.000 y $ 5.000.000.';
  end if;
  if p_desired_at is null or p_desired_at <= now() then
    raise exception 'Elegí una fecha y hora que no hayan pasado.';
  end if;
  if p_desired_at > now() + interval '60 days' then
    raise exception 'La fecha puede ser hasta 60 días adelante.';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception 'La nota puede tener hasta 500 letras.';
  end if;

  if coalesce(cardinality(p_photo_paths), 0) > 5 then
    raise exception 'Podés subir hasta 5 fotos.';
  end if;
  if not private.job_photo_paths_ok(p_photo_paths, p_uid, p_job_id) then
    raise exception 'Alguna foto no es de este pedido.';
  end if;
  if exists (
    select 1 from unnest(p_photo_paths) x
    where not exists (select 1 from storage.objects o where o.bucket_id = 'job-photos' and o.name = x)
  ) then
    raise exception 'No encontramos alguna de las fotos. Subilas de nuevo.';
  end if;
end;
$$;

revoke all on function private.check_job_input(uuid, uuid, text, text, integer, timestamptz, text, text[]) from public;

-- Publica un pedido. El id lo genera el navegador para subir antes las fotos a <uid>/<id>/.
create or replace function public.create_job(
  p_id uuid,
  p_zone text,
  p_address text,
  p_price_ars integer,
  p_desired_at timestamptz,
  p_notes text default null,
  p_photo_paths text[] default '{}',
  p_republished_from uuid default null
)
returns uuid
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
  v_profile public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  -- Bloquea el perfil: serializa las publicaciones de un mismo cliente (límite de 5) y
  -- choca con un cambio de roles simultáneo.
  select * into v_profile from public.profiles p where p.id = v_uid for update;
  if not found or not v_profile.is_client then
    raise exception 'Para publicar pedidos activá «Quiero que me corten el pasto» en tu perfil.';
  end if;

  if p_id is null then
    raise exception 'Falta el identificador del pedido.';
  end if;
  if exists (select 1 from public.jobs j where j.id = p_id) then
    raise exception 'Ese pedido ya existe.';
  end if;

  perform private.check_job_input(v_uid, p_id, v_zone, v_address, p_price_ars, p_desired_at, v_notes, v_photos);

  if (
    select count(*) from public.jobs j
    where j.client_id = v_uid and j.status = 'publicado' and j.desired_at > now()
  ) >= 5 then
    raise exception 'Ya tenés 5 pedidos publicados. Cancelá alguno para publicar otro.';
  end if;

  if p_republished_from is not null and not exists (
    select 1 from public.jobs j
    where j.id = p_republished_from and j.client_id = v_uid and j.status in ('cancelado', 'realizado')
  ) then
    raise exception 'No encontramos el pedido que querés volver a publicar.';
  end if;

  insert into public.jobs (id, client_id, locality_id, zone, price_ars, desired_at, notes, photo_paths, republished_from)
  values (p_id, v_uid, v_profile.locality_id, v_zone, p_price_ars, p_desired_at, v_notes, v_photos, p_republished_from);

  insert into public.job_private (job_id, address) values (p_id, v_address);

  return p_id;
end;
$$;

-- Edita un pedido publicado propio (también vencido: así se renueva con otra fecha).
-- Fase 3: además falla si tiene postulaciones pendientes.
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

-- Cancela un pedido publicado propio (vencido o no).
-- Fase 3: cancela las postulaciones y avisa. Fase 4: también asignado, por cualquiera de las partes.
create or replace function public.cancel_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
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
end;
$$;

revoke all on function public.create_job(uuid, text, text, integer, timestamptz, text, text[], uuid) from public, anon;
revoke all on function public.update_job(uuid, text, text, integer, timestamptz, text, text[]) from public, anon;
revoke all on function public.cancel_job(uuid) from public, anon;
grant execute on function public.create_job(uuid, text, text, integer, timestamptz, text, text[], uuid) to authenticated;
grant execute on function public.update_job(uuid, text, text, integer, timestamptz, text, text[]) to authenticated;
grant execute on function public.cancel_job(uuid) to authenticated;
