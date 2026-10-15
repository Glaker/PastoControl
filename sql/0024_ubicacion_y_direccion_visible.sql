-- 0024 · Dirección visible + ubicación en el mapa (parte 1, NO destructiva).
-- Decisión del dueño (15/10/2026): la dirección y la ubicación del pedido las ve cualquier usuario
-- logueado que pueda ver el pedido (mismo RLS de jobs). Teléfono y apellido siguen privados hasta la
-- aceptación (get_job_contact). La zona pasa a ser opcional.
--
-- Esta parte solo agrega: columnas nuevas en localities, jobs y profile_private, copia la dirección de
-- job_private a jobs y crea las RPCs nuevas (create_job / update_job con otra firma, al lado de las
-- viejas). El front deployado sigue funcionando con las viejas hasta que se borren en 0025 (destructivo,
-- con aprobación del dueño), que vuelve a copiar lo que haya cambiado mientras tanto.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), fase «Dirección visible + mapa».

begin;

-- ——— Localidades: centro y radio ———
-- Un pin a más de radius_m del centro se rechaza (GPS impreciso o un toque sin querer).
alter table public.localities
  add column center_lat double precision,
  add column center_lng double precision,
  add column radius_m integer;

-- 25 de Mayo: centro del límite de la localidad en OpenStreetMap. El límite llega a 9,4 km del centro
-- (hacia el este y el sudeste), así que 10 km cubre toda la localidad y las quintas de alrededor.
update public.localities
set center_lat = -35.4324152, center_lng = -60.171624, radius_m = 10000
where slug = '25-de-mayo-bsas';

alter table public.localities
  alter column center_lat set not null,
  alter column center_lng set not null,
  alter column radius_m set not null,
  add constraint localities_center_check check (center_lat between -90 and 90 and center_lng between -180 and 180),
  add constraint localities_radius_check check (radius_m between 1000 and 50000);

-- ——— Distancia y validación de la ubicación ———

-- Distancia en metros (haversine, en línea recta). La misma fórmula que src/lib/geo.ts.
create or replace function private.distance_m(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )));
$$;

-- Valida un pin: presente, con valores posibles (NaN e infinito no pasan el between) y dentro del
-- radio de la localidad. Solo la llaman las RPCs (corren como su dueño).
create or replace function private.check_location(p_locality_id smallint, p_lat double precision, p_lng double precision)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_loc public.localities%rowtype;
begin
  if p_lat is null or p_lng is null then
    raise exception 'Marcá la ubicación en el mapa.';
  end if;
  if not (p_lat between -90 and 90 and p_lng between -180 and 180) then
    raise exception 'La ubicación marcada no es válida. Marcala de nuevo en el mapa.';
  end if;
  select * into v_loc from public.localities l where l.id = p_locality_id;
  if private.distance_m(v_loc.center_lat, v_loc.center_lng, p_lat, p_lng) > v_loc.radius_m then
    raise exception 'La ubicación marcada está fuera de %. Revisá el pin en el mapa.', v_loc.name;
  end if;
end;
$$;

revoke all on function private.distance_m(double precision, double precision, double precision, double precision) from public;
revoke all on function private.check_location(smallint, double precision, double precision) from public;

-- ——— Pedidos: dirección y ubicación en jobs ———
-- Visibles con el mismo RLS que el resto del pedido (dueño, cortadores de la localidad mientras está
-- publicado y cortadores que se postularon). Anon no lee nada.
-- address_street queda null solo hasta 0025 (que la pone not null). address_number y la ubicación
-- pueden ser null en los pedidos anteriores a este cambio (no tenían número aparte ni pin); las RPCs
-- nuevas los exigen.
alter table public.jobs
  alter column zone drop not null,
  add column address_street text,
  add column address_number text,
  add column address_between text,
  add column location_lat double precision,
  add column location_lng double precision,
  -- 200 como el viejo job_private.address (la copia entra entera); las RPCs piden hasta 120.
  add constraint jobs_address_street_check
    check (address_street is null or (char_length(address_street) between 2 and 200 and address_street = btrim(address_street))),
  add constraint jobs_address_number_check
    check (address_number is null or (char_length(address_number) between 1 and 10 and address_number = btrim(address_number))),
  add constraint jobs_address_between_check
    check (address_between is null or (char_length(address_between) between 3 and 120 and address_between = btrim(address_between))),
  add constraint jobs_location_check
    check ((location_lat is null) = (location_lng is null)
           and (location_lat is null or (location_lat between -90 and 90 and location_lng between -180 and 180)));

comment on column public.jobs.zone is 'Zona o barrio, opcional (texto libre).';
comment on column public.jobs.address_street is 'Calle (o la dirección completa en los pedidos anteriores a la ubicación en el mapa).';
comment on column public.jobs.address_number is 'Número («s/n» si no tiene). Null en los pedidos anteriores a la ubicación en el mapa.';
comment on column public.jobs.location_lat is 'Pin del pedido (obligatorio desde la ubicación en el mapa; null en los anteriores).';

-- Copia la dirección de los pedidos existentes (entera en la calle: no se adivina el número).
update public.jobs j
set address_street = jp.address
from public.job_private jp
where jp.job_id = j.id and j.address_street is null;

-- ——— Ubicación base del cortador (privada: va en profile_private, que solo lee el dueño) ———
alter table public.profile_private
  add column base_lat double precision,
  add column base_lng double precision,
  add constraint profile_private_base_check
    check ((base_lat is null) = (base_lng is null)
           and (base_lat is null or (base_lat between -90 and 90 and base_lng between -180 and 180)));

-- ——— Validaciones de create_job y update_job (firma nueva; la vieja se borra en 0025) ———
create or replace function private.check_job_input(
  p_uid uuid,
  p_job_id uuid,
  p_locality_id smallint,
  p_lat double precision,
  p_lng double precision,
  p_street text,
  p_number text,
  p_between text,
  p_zone text,
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
  perform private.check_location(p_locality_id, p_lat, p_lng);
  if char_length(p_street) not between 2 and 120 then
    raise exception 'Escribí la calle (entre 2 y 120 letras).';
  end if;
  if char_length(p_number) not between 1 and 10 then
    raise exception 'Escribí el número de la casa (hasta 10 letras; si no tiene, poné «s/n»).';
  end if;
  if p_between is not null and char_length(p_between) not between 3 and 120 then
    raise exception 'Las entre calles pueden tener entre 3 y 120 letras.';
  end if;
  if p_zone is not null and char_length(p_zone) not between 2 and 80 then
    raise exception 'La zona o el barrio puede tener entre 2 y 80 letras.';
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

revoke all on function private.check_job_input(uuid, uuid, smallint, double precision, double precision, text, text, text, text, integer, timestamptz, text, text[]) from public;

-- Publica un pedido (firma nueva: pin y dirección en jobs). El id lo genera el navegador para subir
-- antes las fotos a <uid>/<id>/.
create or replace function public.create_job(
  p_id uuid,
  p_location_lat double precision,
  p_location_lng double precision,
  p_address_street text,
  p_address_number text,
  p_price_ars integer,
  p_desired_at timestamptz,
  p_address_between text default null,
  p_zone text default null,
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
  v_street text := btrim(coalesce(p_address_street, ''));
  v_number text := btrim(coalesce(p_address_number, ''));
  v_between text := nullif(btrim(coalesce(p_address_between, '')), '');
  v_zone text := nullif(btrim(coalesce(p_zone, '')), '');
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

  perform private.check_job_input(
    v_uid, p_id, v_profile.locality_id, p_location_lat, p_location_lng, v_street, v_number, v_between,
    v_zone, p_price_ars, p_desired_at, v_notes, v_photos
  );

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

  insert into public.jobs (
    id, client_id, locality_id, zone, address_street, address_number, address_between,
    location_lat, location_lng, price_ars, desired_at, notes, photo_paths, republished_from
  )
  values (
    p_id, v_uid, v_profile.locality_id, v_zone, v_street, v_number, v_between,
    p_location_lat, p_location_lng, p_price_ars, p_desired_at, v_notes, v_photos, p_republished_from
  );

  return p_id;
end;
$$;

-- Edita un pedido publicado propio (también vencido: así se renueva con otra fecha). Con postulaciones
-- pendientes no se edita. El FOR UPDATE choca con el FOR SHARE de apply_to_job.
create or replace function public.update_job(
  p_job_id uuid,
  p_location_lat double precision,
  p_location_lng double precision,
  p_address_street text,
  p_address_number text,
  p_price_ars integer,
  p_desired_at timestamptz,
  p_address_between text default null,
  p_zone text default null,
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
  v_street text := btrim(coalesce(p_address_street, ''));
  v_number text := btrim(coalesce(p_address_number, ''));
  v_between text := nullif(btrim(coalesce(p_address_between, '')), '');
  v_zone text := nullif(btrim(coalesce(p_zone, '')), '');
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

  perform private.check_job_input(
    v_uid, p_job_id, v_job.locality_id, p_location_lat, p_location_lng, v_street, v_number, v_between,
    v_zone, p_price_ars, p_desired_at, v_notes, v_photos
  );

  update public.jobs set
    zone = v_zone,
    address_street = v_street,
    address_number = v_number,
    address_between = v_between,
    location_lat = p_location_lat,
    location_lng = p_location_lng,
    price_ars = p_price_ars,
    desired_at = p_desired_at,
    notes = v_notes,
    photo_paths = v_photos
  where id = p_job_id;
end;
$$;

revoke all on function public.create_job(uuid, double precision, double precision, text, text, integer, timestamptz, text, text, text, text[], uuid) from public, anon;
revoke all on function public.update_job(uuid, double precision, double precision, text, text, integer, timestamptz, text, text, text, text[]) from public, anon;
grant execute on function public.create_job(uuid, double precision, double precision, text, text, integer, timestamptz, text, text, text, text[], uuid) to authenticated;
grant execute on function public.update_job(uuid, double precision, double precision, text, text, integer, timestamptz, text, text, text, text[]) to authenticated;

-- ——— Ubicación base del cortador ———
-- Guarda (o borra, con los dos en null) la ubicación base del que llama. Dentro del radio de su localidad.
create or replace function public.set_my_base_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_locality smallint;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;

  -- FOR SHARE: choca con upsert_my_profile (FOR UPDATE), que la borra si cambia la localidad.
  select p.locality_id into v_locality from public.profiles p where p.id = v_uid for share;
  if v_locality is null then
    raise exception 'Primero completá tu perfil.';
  end if;

  if p_lat is null and p_lng is null then
    update public.profile_private set base_lat = null, base_lng = null where user_id = v_uid;
    return;
  end if;
  perform private.check_location(v_locality, p_lat, p_lng);

  update public.profile_private set base_lat = p_lat, base_lng = p_lng where user_id = v_uid;
end;
$$;

revoke all on function public.set_my_base_location(double precision, double precision) from public, anon;
grant execute on function public.set_my_base_location(double precision, double precision) to authenticated;

-- ——— Avisos: la dirección reemplaza a la zona en el texto ———
-- Lista blanca con 'address' (calle y número: ya no es un dato privado). Si el aviso es de un pedido, la
-- agrega sola, así las RPCs que avisan no cambian. La zona puede venir null (jsonb_strip_nulls la saca).
create or replace function private.notify(
  p_user_id uuid,
  p_kind text,
  p_job_id uuid,
  p_application_id uuid,
  p_payload jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}');
  v_extra text[];
  v_address text;
begin
  select array_agg(k) into v_extra
  from jsonb_object_keys(v_payload) k
  where k <> all (array['zone', 'address', 'actor_name', 'price_ars', 'desired_at', 'proposed_price_ars', 'proposed_at', 'tz']);
  if v_extra is not null then
    raise exception 'Campo de aviso no permitido: %', array_to_string(v_extra, ', ');
  end if;

  if p_job_id is not null and not v_payload ? 'address' then
    select concat_ws(' ', j.address_street, j.address_number) into v_address
    from public.jobs j where j.id = p_job_id;
    v_payload := v_payload || jsonb_build_object('address', nullif(v_address, ''));
  end if;

  insert into public.notifications (user_id, kind, job_id, application_id, payload, dedupe_key)
  values (p_user_id, p_kind, p_job_id, p_application_id, jsonb_strip_nulls(v_payload), p_dedupe_key)
  on conflict (user_id, dedupe_key) do nothing;
end;
$$;

-- ——— Perfil: si cambia la localidad, se borra la ubicación base (quedaría fuera del radio) ———
-- Mismo cuerpo que 0016 más el borrado de base_lat/base_lng al final.
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

  -- La ubicación base es de la localidad anterior: con otra localidad quedaría fuera del radio.
  if v_old_locality is not null and v_old_locality <> p_locality_id then
    update public.profile_private set base_lat = null, base_lng = null where user_id = v_uid;
  end if;
end;
$$;

revoke all on function public.upsert_my_profile(text, text, text, smallint, boolean, boolean, text) from public, anon;
grant execute on function public.upsert_my_profile(text, text, text, smallint, boolean, boolean, text) to authenticated;

commit;
