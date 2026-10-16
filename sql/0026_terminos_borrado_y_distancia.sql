-- 0026 · Fase 8, paso 1: términos y privacidad, borrar la cuenta, cualquier ciudad.
-- NO rompe el front deployado (Fase 7): solo agrega o afloja. Lo que el front viejo no soportaría
-- (exigir los términos y la ubicación base del cortador) queda apagado con dos interruptores
-- (private.terms_enforced / private.cutter_base_required) que se prenden en 0027, después del deploy.
-- Las FK y la PK de ratings se rehacen con DROP CONSTRAINT (aprobado por el dueño el 16/10/2026):
-- no se borra ningún dato y las FK conservan el nombre (los embeds de PostgREST lo usan).
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 8.

begin;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Localidad: deja de filtrar. Queda solo para la zona horaria y el centro del mapa por defecto.
-- ════════════════════════════════════════════════════════════════════════════════════════════

alter table public.localities add column is_default boolean not null default false;
create unique index localities_one_default_idx on public.localities (is_default) where is_default;
update public.localities set is_default = true where slug = '25-de-mayo-bsas';

-- Localidad de los perfiles nuevos (ya no se elige).
create or replace function private.default_locality_id()
returns smallint
language sql
stable
set search_path = ''
as $$
  select l.id from public.localities l where l.is_default;
$$;
revoke all on function private.default_locality_id() from public;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 2. Ubicación: cualquier lugar de Argentina (rango aproximado de coordenadas del país).
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Argentina continental + Tierra del Fuego: latitud -55,1 a -21,7; longitud -73,6 a -53,6.
-- Es una caja: incluye un poco de Chile, Uruguay, Paraguay y Brasil (alcanza para frenar errores
-- groseros: un pin en el mar, en otro país lejano o con las coordenadas al revés).
create or replace function private.check_in_argentina(p_lat double precision, p_lng double precision)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_lat is null or p_lng is null then
    raise exception 'Marcá la ubicación en el mapa.';
  end if;
  -- NaN e infinito no pasan el between.
  if not (p_lat between -90 and 90 and p_lng between -180 and 180) then
    raise exception 'La ubicación marcada no es válida. Marcala de nuevo en el mapa.';
  end if;
  if not (p_lat between -55.1 and -21.7 and p_lng between -73.6 and -53.6) then
    raise exception 'La ubicación marcada está fuera de Argentina. Revisá el pin en el mapa.';
  end if;
end;
$$;
revoke all on function private.check_in_argentina(double precision, double precision) from public;

-- Misma firma (la usa check_job_input): la localidad ya no limita.
create or replace function private.check_location(p_locality_id smallint, p_lat double precision, p_lng double precision)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.check_in_argentina(p_lat, p_lng);
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Términos y política de privacidad.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Versión vigente = la más alta. Para publicar una versión nueva: primero deployar el front con el
-- texto nuevo y TERMS_VERSION actualizado (src/legal/terms.ts), después insertar la fila acá.
create table public.terms_versions (
  version smallint primary key constraint terms_versions_version_check check (version >= 1),
  published_at timestamptz not null default now()
);
alter table public.terms_versions enable row level security;
grant select on public.terms_versions to authenticated;
create policy "Términos: lectura para usuarios logueados" on public.terms_versions
  for select to authenticated using (true);
insert into public.terms_versions (version) values (1);

-- Qué versión aceptó cada persona y cuándo (una fila por versión). Privada: solo la lee el dueño.
-- Va aparte de profile_private porque se acepta al registrarse, antes de que exista el perfil.
-- Se borra con la cuenta (cascada desde auth.users y, antes, en el borrado del perfil).
create table public.terms_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  version smallint not null references public.terms_versions (version),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
create index terms_acceptances_version_idx on public.terms_acceptances (version);
alter table public.terms_acceptances enable row level security;
grant select on public.terms_acceptances to authenticated;
create policy "Aceptación de términos: solo el dueño" on public.terms_acceptances
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function private.current_terms_version()
returns smallint
language sql
stable
set search_path = ''
as $$
  select max(v.version) from public.terms_versions v;
$$;
revoke all on function private.current_terms_version() from public;

-- Interruptor: apagado hasta que esté deployado el front con la pantalla de aceptación (0027 lo prende).
create or replace function private.terms_enforced()
returns boolean
language sql
immutable
set search_path = ''
as $$
  select false;
$$;
revoke all on function private.terms_enforced() from public;

-- La llaman las RPCs de escritura. No la llaman las que sirven para irse (cancelar, retirar,
-- desactivar avisos, marcar avisos leídos, borrar la cuenta): quien no acepta una versión nueva
-- tiene que poder dejar la app sin aceptarla.
create or replace function private.require_terms(p_uid uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if private.terms_enforced() and not exists (
    select 1 from public.terms_acceptances t
    where t.user_id = p_uid and t.version = private.current_terms_version()
  ) then
    raise exception 'Para seguir tenés que aceptar los términos y la política de privacidad. Recargá la app para verlos.'
      using hint = 'terminos';
  end if;
end;
$$;
revoke all on function private.require_terms(uuid) from public;

create or replace function public.accept_terms(p_version smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  if p_version is distinct from private.current_terms_version() then
    raise exception 'Los términos cambiaron mientras los leías. Recargá la app para ver la versión nueva.';
  end if;
  insert into public.terms_acceptances (user_id, version) values (v_uid, p_version)
  on conflict (user_id, version) do nothing;
end;
$$;
revoke all on function public.accept_terms(smallint) from public, anon;
grant execute on function public.accept_terms(smallint) to authenticated;

create or replace function public.get_my_terms_status()
returns table (current_version smallint, accepted boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select v.cur, exists (
    select 1 from public.terms_acceptances t where t.user_id = (select auth.uid()) and t.version = v.cur
  )
  from (select private.current_terms_version() as cur) v
  where (select auth.uid()) is not null;
$$;
revoke all on function public.get_my_terms_status() from public, anon;
grant execute on function public.get_my_terms_status() to authenticated;

-- Al registrarse: la casilla viaja en los metadatos del signUp (terms_version). Se guarda solo si es la
-- versión vigente. Nunca hace fallar el registro (si algo sale mal, se le pide aceptar al entrar).
create or replace function private.accept_terms_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw text := new.raw_user_meta_data ->> 'terms_version';
begin
  if v_raw ~ '^[0-9]{1,4}$' and v_raw::smallint = private.current_terms_version() then
    insert into public.terms_acceptances (user_id, version) values (new.id, v_raw::smallint)
    on conflict (user_id, version) do nothing;
  end if;
  return null;
exception when others then
  raise warning 'No se pudo guardar la aceptación de términos de %: %', new.id, sqlerrm;
  return null;
end;
$$;
revoke all on function private.accept_terms_on_signup() from public;

create trigger accept_terms_on_signup
after insert on auth.users
for each row execute function private.accept_terms_on_signup();

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 4. Ubicación base obligatoria para cortar + radio de búsqueda + trabajos por distancia.
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Interruptor: apagado hasta el deploy del front que la pide (0027 lo prende).
create or replace function private.cutter_base_required()
returns boolean
language sql
immutable
set search_path = ''
as $$
  select false;
$$;
revoke all on function private.cutter_base_required() from public;

-- Radio de búsqueda del cortador (privado, con sus datos).
alter table public.profile_private
  add column search_radius_km smallint not null default 20
    constraint profile_private_search_radius_check check (search_radius_km in (5, 10, 20, 50));

create or replace function public.set_my_search_radius(p_km smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  perform private.require_terms(v_uid);
  if p_km is null or p_km not in (5, 10, 20, 50) then
    raise exception 'Elegí una distancia de 5, 10, 20 o 50 km.';
  end if;
  update public.profile_private set search_radius_km = p_km where user_id = v_uid;
  if not found then
    raise exception 'Primero completá tu perfil.';
  end if;
end;
$$;
revoke all on function public.set_my_search_radius(smallint) from public, anon;
grant execute on function public.set_my_search_radius(smallint) to authenticated;

-- Ubicación base: en cualquier lugar de Argentina. Con los dos en null se borra (salvo que sea
-- obligatoria: cortador con el interruptor prendido).
create or replace function public.set_my_base_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_cutter boolean;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  perform private.require_terms(v_uid);

  select p.is_cutter into v_is_cutter from public.profiles p where p.id = v_uid for share;
  if v_is_cutter is null then
    raise exception 'Primero completá tu perfil.';
  end if;

  if p_lat is null and p_lng is null then
    if v_is_cutter and private.cutter_base_required() then
      raise exception 'Para cortar pasto necesitamos saber desde dónde salís. Podés cambiar la ubicación, pero no borrarla.';
    end if;
    update public.profile_private set base_lat = null, base_lng = null where user_id = v_uid;
    return;
  end if;
  perform private.check_in_argentina(p_lat, p_lng);

  update public.profile_private set base_lat = p_lat, base_lng = p_lng where user_id = v_uid;
end;
$$;

-- Todos los cortadores ven los publicados no vencidos, de cualquier lugar: el radio es un filtro de
-- relevancia (la dirección ya es visible), no de privacidad.
create or replace function private.i_am_cutter()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_cutter);
$$;
revoke all on function private.i_am_cutter() from public;
grant execute on function private.i_am_cutter() to authenticated;

alter policy "Trabajos: el dueño, los cortadores de la localidad y los postu" on public.jobs
  using (
    client_id = (select auth.uid())
    or (status = 'publicado' and desired_at > now() and (select private.i_am_cutter()))
    or id in (select private.my_applied_job_ids())
  );
alter policy "Trabajos: el dueño, los cortadores de la localidad y los postu" on public.jobs
  rename to "Trabajos: el dueño, los cortadores y los postulados";

-- Filtro por radio y orden por distancia, en el servidor.
-- Técnica: haversine en SQL (private.distance_m, la misma fórmula que el front) con un prefiltro por
-- una caja lat/lng que contiene el círculo, que usa un índice btree parcial de los publicados. Los
-- publicados son pocos (hasta 5 por cliente y vencen en 60 días): el índice es chico y la caja lo
-- vuelve un range scan; el haversine exacto se calcula solo para los de la caja. PostGIS no hace falta
-- (sin polígonos ni grandes volúmenes) y sumaría una extensión y un tipo de columna nuevo.
create index jobs_published_location_idx on public.jobs (location_lat, location_lng) where status = 'publicado';

grant execute on function private.distance_m(double precision, double precision, double precision, double precision) to authenticated;

-- SECURITY INVOKER: devuelve solo lo que el RLS de jobs ya deja ver al que llama.
create or replace function public.get_available_jobs(p_lat double precision, p_lng double precision, p_radius_km smallint)
returns table (job_id uuid, distance_m double precision)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_radius_m double precision;
  v_dlat double precision;
  v_dlng double precision;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  if not private.i_am_cutter() then
    raise exception 'Para ver trabajos activá «Corto pasto» en tu perfil.';
  end if;
  if p_radius_km is null or p_radius_km not in (5, 10, 20, 50) then
    raise exception 'Elegí una distancia de 5, 10, 20 o 50 km.';
  end if;
  if p_lat is null or p_lng is null or not (p_lat between -90 and 90 and p_lng between -180 and 180) then
    raise exception 'No sabemos desde dónde buscar. Probá de nuevo.';
  end if;

  v_radius_m := p_radius_km * 1000;
  -- Caja con margen: 1° de latitud son ~111,2 km (se usa 111 para que sobre); en longitud, eso por el
  -- coseno de la latitud más alejada del ecuador que toca la caja.
  v_dlat := v_radius_m / 111000.0;
  v_dlng := v_radius_m / (111000.0 * greatest(cos(radians(least(abs(p_lat) + v_dlat, 89))), 0.01));

  return query
  select j.id, private.distance_m(p_lat, p_lng, j.location_lat, j.location_lng) as d
  from public.jobs j
  where j.status = 'publicado'
    and j.desired_at > now()
    and j.client_id <> v_uid
    and j.location_lat between p_lat - v_dlat and p_lat + v_dlat
    and j.location_lng between p_lng - v_dlng and p_lng + v_dlng
    and private.distance_m(p_lat, p_lng, j.location_lat, j.location_lng) <= v_radius_m
  order by d, j.desired_at, j.id
  limit 200;
end;
$$;
revoke all on function public.get_available_jobs(double precision, double precision, smallint) from public, anon;
grant execute on function public.get_available_jobs(double precision, double precision, smallint) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Perfil sin localidad (firma nueva, al lado de la vieja hasta 0027).
-- ════════════════════════════════════════════════════════════════════════════════════════════

-- Sin la regla de no cambiar de localidad (ya no se elige). La localidad queda la que tenía o, en un
-- perfil nuevo, la de por defecto (solo zona horaria y centro del mapa).
create or replace function public.upsert_my_profile(
  p_first_name text,
  p_last_name text,
  p_phone_e164 text,
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
  v_locality smallint;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  perform private.require_terms(v_uid);

  if char_length(v_first) not between 1 and 40 then
    raise exception 'Escribí tu nombre (hasta 40 letras).';
  end if;
  if char_length(v_last) not between 1 and 60 then
    raise exception 'Escribí tu apellido (hasta 60 letras).';
  end if;
  if v_phone !~ '^\+549[1-3][0-9]{9}$' then
    raise exception 'El número de WhatsApp no es válido.';
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

  select p.is_client, p.is_cutter, p.locality_id into v_was_client, v_was_cutter, v_locality
  from public.profiles p where p.id = v_uid for update;
  if coalesce(v_was_client, false) and not v_is_client and exists (
    select 1 from public.jobs j where j.client_id = v_uid and j.status in ('publicado', 'asignado')
  ) then
    raise exception 'Tenés pedidos publicados o asignados. Cancelalos desde «Mis pedidos» antes de dejar de pedir cortes.';
  end if;
  if coalesce(v_was_cutter, false) and not v_is_cutter and exists (
    select 1 from public.applications a join public.jobs j on j.id = a.job_id
    where a.cutter_id = v_uid and (a.status = 'pendiente' or (a.status = 'aceptada' and j.status = 'asignado'))
  ) then
    raise exception 'Tenés postulaciones activas. Retiralas desde «Mis postulaciones» antes de dejar de cortar pasto.';
  end if;

  insert into public.profiles (id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter)
  values (v_uid, coalesce(v_locality, private.default_locality_id()), v_first, upper(left(v_last, 1)), v_avatar, v_is_client, v_is_cutter)
  on conflict (id) do update set
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
revoke all on function public.upsert_my_profile(text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.upsert_my_profile(text, text, text, boolean, boolean, text) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Borrar la cuenta: claves foráneas sin cascada y columnas que pueden quedar en null.
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Se conservan anónimos los trabajos y las calificaciones de la otra parte (su historial y sus
-- estadísticas no cambian). Si se borra un perfil, sus referencias quedan en null (no se borra nada
-- de nadie más). Los checks garantizan que un null nunca quede en algo activo.

alter table public.jobs
  alter column client_id drop not null,
  alter column address_street drop not null,
  drop constraint jobs_client_id_fkey,
  add constraint jobs_client_id_fkey foreign key (client_id) references public.profiles (id) on delete set null,
  add constraint jobs_deleted_client_check check (client_id is not null or status in ('realizado', 'cancelado')),
  add constraint jobs_address_street_required_check check (address_street is not null or client_id is null);

alter table public.applications
  alter column cutter_id drop not null,
  drop constraint applications_cutter_id_fkey,
  add constraint applications_cutter_id_fkey foreign key (cutter_id) references public.profiles (id) on delete set null,
  add constraint applications_deleted_cutter_check check (cutter_id is not null or status <> 'pendiente');

alter table public.job_agreements
  alter column client_id drop not null,
  alter column cutter_id drop not null,
  drop constraint job_agreements_client_id_fkey,
  add constraint job_agreements_client_id_fkey foreign key (client_id) references public.profiles (id) on delete set null,
  drop constraint job_agreements_cutter_id_fkey,
  add constraint job_agreements_cutter_id_fkey foreign key (cutter_id) references public.profiles (id) on delete set null;

-- La PK (job_id, rater_id) no admite null: pasa a un id propio y el par queda como único.
alter table public.ratings add column id bigint generated always as identity;
alter table public.ratings drop constraint ratings_pkey;
alter table public.ratings
  add constraint ratings_pkey primary key (id),
  add constraint ratings_job_rater_key unique (job_id, rater_id);
alter table public.ratings
  alter column rater_id drop not null,
  alter column ratee_id drop not null;
alter table public.ratings
  drop constraint ratings_rater_id_fkey,
  add constraint ratings_rater_id_fkey foreign key (rater_id) references public.profiles (id) on delete set null,
  drop constraint ratings_ratee_id_fkey,
  add constraint ratings_ratee_id_fkey foreign key (ratee_id) references public.profiles (id) on delete set null;

-- Lo pendiente que impide borrar la cuenta. No se cancela nada solo: la persona lo cancela o lo retira.
create or replace function private.pending_items(p_uid uuid)
returns table (kind text, job_id uuid, application_id uuid, address text, at timestamptz, is_expired boolean)
language sql
stable
set search_path = ''
as $$
  select 'pedido_' || j.status, j.id, null::uuid,
         concat_ws(' ', j.address_street, j.address_number),
         coalesce(g.agreed_at, j.desired_at),
         private.job_is_expired(j.status, j.desired_at)
  from public.jobs j
  left join public.job_agreements g on g.job_id = j.id
  where j.client_id = p_uid and j.status in ('publicado', 'asignado')
  union all
  select 'postulacion_' || a.status, j.id, a.id,
         concat_ws(' ', j.address_street, j.address_number),
         coalesce(g.agreed_at, a.proposed_at, j.desired_at),
         private.job_is_expired(j.status, j.desired_at)
  from public.applications a
  join public.jobs j on j.id = a.job_id
  left join public.job_agreements g on g.job_id = j.id and g.application_id = a.id
  where a.cutter_id = p_uid
    and (a.status = 'pendiente' or (a.status = 'aceptada' and j.status = 'asignado'))
  order by 5;
$$;
revoke all on function private.pending_items(uuid) from public;

create or replace function public.get_my_pending_items()
returns table (kind text, job_id uuid, application_id uuid, address text, at timestamptz, is_expired boolean)
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
  return query select * from private.pending_items(v_uid);
end;
$$;
revoke all on function public.get_my_pending_items() from public, anon;
grant execute on function public.get_my_pending_items() to authenticated;

-- Antes de borrar un perfil (por la app o desde el panel): sin pendientes; lo de la otra parte queda
-- anónimo; lo que no es historial de nadie más se borra. SECURITY DEFINER porque también corre en la
-- cascada del borrado de auth.users (rol de Auth).
create or replace function private.before_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := old.id;
  v_jobs uuid[];
begin
  if exists (select 1 from private.pending_items(v_uid)) then
    raise exception 'Antes de borrar la cuenta hay que cancelar los pedidos publicados (también los vencidos) o asignados y retirar las postulaciones pendientes o aceptadas.'
      using hint = 'pendientes';
  end if;

  -- Pedidos que tocan a esta persona (como cliente o como cortador).
  v_jobs := array(
    select j.id from public.jobs j where j.client_id = v_uid
    union
    select a.job_id from public.applications a where a.cutter_id = v_uid
  );

  -- Avisos de los demás: sin el nombre de quien se va; si el pedido era suyo, tampoco su dirección ni
  -- su zona. (En un aviso ligado a un pedido o a una postulación suya, el que actuó es siempre él.)
  update public.notifications n
  set payload = case
      when exists (select 1 from public.jobs j where j.id = n.job_id and j.client_id = v_uid)
        then n.payload - array['actor_name', 'address', 'zone']
      else n.payload - 'actor_name'
    end
  where n.user_id <> v_uid
    and (
      n.job_id in (select j.id from public.jobs j where j.client_id = v_uid)
      or n.application_id in (select a.id from public.applications a where a.cutter_id = v_uid)
    );

  -- Sus pedidos sin postulaciones no son historial de nadie: se borran.
  delete from public.jobs j
  where j.client_id = v_uid
    and not exists (select 1 from public.applications a where a.job_id = j.id);

  -- Sus pedidos con postulaciones (cancelados o realizados): quedan sin ningún dato suyo.
  update public.jobs j set
    client_id = null,
    zone = null,
    address_street = null,
    address_number = null,
    address_between = null,
    location_lat = null,
    location_lng = null,
    notes = null,
    photo_paths = '{}',
    republished_from = null
  where j.client_id = v_uid;

  update public.applications a set cutter_id = null where a.cutter_id = v_uid;

  update public.job_agreements g set
    client_id = case when g.client_id = v_uid then null else g.client_id end,
    cutter_id = case when g.cutter_id = v_uid then null else g.cutter_id end,
    done_by = case when g.done_by = v_uid then null else g.done_by end,
    cancelled_by = case when g.cancelled_by = v_uid then null else g.cancelled_by end
  where v_uid in (g.client_id, g.cutter_id);

  update public.ratings r set
    rater_id = case when r.rater_id = v_uid then null else r.rater_id end,
    ratee_id = case when r.ratee_id = v_uid then null else r.ratee_id end
  where v_uid in (r.rater_id, r.ratee_id);

  -- Pedidos en los que ya no queda nadie (las dos partes borraron su cuenta): se borran del todo.
  delete from public.jobs j
  where j.id = any (v_jobs)
    and j.client_id is null
    and not exists (select 1 from public.applications a where a.job_id = j.id and a.cutter_id is not null);

  delete from public.terms_acceptances t where t.user_id = v_uid;

  -- profile_private, push_subscriptions y sus avisos se borran en cascada con el perfil.
  return old;
end;
$$;
revoke all on function private.before_profile_delete() from public;

create trigger profiles_before_delete
before delete on public.profiles
for each row execute function private.before_profile_delete();

-- La llama solo la Edge Function delete-account (con la clave de servicio), después de verificar el
-- JWT y la contraseña de quien llama: nunca borra a otro. Devuelve los archivos a borrar de Storage
-- (Supabase no deja borrarlos por SQL).
create or replace function public.delete_account(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avatars jsonb;
  v_photos jsonb;
begin
  if p_user_id is null then
    raise exception 'Falta el usuario.';
  end if;

  -- Bloquea el perfil: create_job (FOR UPDATE) y apply_to_job (FOR SHARE) esperan a que termine.
  perform 1 from public.profiles p where p.id = p_user_id for update;
  if exists (select 1 from private.pending_items(p_user_id)) then
    raise exception 'Antes de borrar tu cuenta cancelá o retirá lo pendiente.' using hint = 'pendientes';
  end if;

  select coalesce(jsonb_agg(o.name order by o.name), '[]') into v_avatars
  from storage.objects o where o.bucket_id = 'avatars' and o.name like p_user_id::text || '/%';
  select coalesce(jsonb_agg(o.name order by o.name), '[]') into v_photos
  from storage.objects o where o.bucket_id = 'job-photos' and o.name like p_user_id::text || '/%';

  delete from public.profiles p where p.id = p_user_id;
  delete from public.terms_acceptances t where t.user_id = p_user_id;

  return jsonb_build_object('avatars', v_avatars, 'job_photos', v_photos);
end;
$$;
revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- 7. RPCs: ids que pueden ser null (usuarios borrados), términos y localidad.
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- Las comparaciones con client_id / cutter_id usan "is distinct from": con un null, "<>" y "not in"
-- dan null y el if no corta (p. ej., cualquiera podía calificar un trabajo de alguien borrado).

-- Avisos: nunca a un destinatario borrado.
create or replace function private.notify(p_user_id uuid, p_kind text, p_job_id uuid, p_application_id uuid, p_payload jsonb, p_dedupe_key text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}');
  v_extra text[];
  v_address text;
begin
  if p_user_id is null then
    return;
  end if;

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

create or replace function public.create_job(p_id uuid, p_location_lat double precision, p_location_lng double precision, p_address_street text, p_address_number text, p_price_ars integer, p_desired_at timestamp with time zone, p_address_between text default null, p_zone text default null, p_notes text default null, p_photo_paths text[] default '{}'::text[], p_republished_from uuid default null)
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
  perform private.require_terms(v_uid);

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

create or replace function public.update_job(p_job_id uuid, p_location_lat double precision, p_location_lng double precision, p_address_street text, p_address_number text, p_price_ars integer, p_desired_at timestamp with time zone, p_address_between text default null, p_zone text default null, p_notes text default null, p_photo_paths text[] default '{}'::text[])
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
  perform private.require_terms(v_uid);

  select * into v_job from public.jobs j where j.id = p_job_id for update;
  if not found or v_job.client_id is distinct from v_uid then
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

-- Sin términos: cancelar sirve para irse.
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
  if v_job.id is null or not (
    v_job.client_id is not distinct from v_uid
    or (v_job.status = 'asignado' and v_agr.cutter_id is not distinct from v_uid)
  ) then
    raise exception 'No encontramos ese pedido.';
  end if;
  v_by_cutter := v_job.client_id is distinct from v_uid;
  if v_job.status = 'cancelado' then
    raise exception 'Este pedido ya estaba cancelado.';
  end if;
  if v_job.status = 'realizado' then
    raise exception 'Un pedido realizado no se puede cancelar.';
  end if;

  update public.jobs set
    status = 'cancelado',
    cancelled_at = now(),
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

-- Sin la localidad; con términos y (interruptor) la ubicación base.
create or replace function public.apply_to_job(p_job_id uuid, p_proposed_price_ars integer default null, p_proposed_at timestamp with time zone default null)
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
  perform private.require_terms(v_uid);

  -- FOR SHARE: choca con upsert_my_profile (FOR UPDATE) si a la vez se saca el rol de cortador, y con
  -- delete_account (FOR UPDATE) si a la vez se borra la cuenta.
  select * into v_profile from public.profiles p where p.id = v_uid for share;
  if not found or not v_profile.is_cutter then
    raise exception 'Para postularte activá «Corto pasto» en tu perfil.';
  end if;
  if private.cutter_base_required() and not exists (
    select 1 from public.profile_private pp where pp.user_id = v_uid and pp.base_lat is not null
  ) then
    raise exception 'Antes de postularte cargá desde dónde salís a cortar.';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id for share;
  if not found then
    raise exception 'No encontramos ese trabajo.';
  end if;
  if v_job.client_id is not distinct from v_uid then
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

create or replace function public.update_application(p_application_id uuid, p_proposed_price_ars integer default null, p_proposed_at timestamp with time zone default null)
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
  perform private.require_terms(v_uid);

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

create or replace function public.accept_application(p_application_id uuid, p_expected_updated_at timestamp with time zone)
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
  perform private.require_terms(v_uid);

  select a.job_id into v_job_id from public.applications a where a.id = p_application_id;
  if v_job_id is null then
    raise exception 'No encontramos esa postulación.';
  end if;
  select * into v_job from public.jobs j where j.id = v_job_id for update;
  if v_job.client_id is distinct from v_uid then
    raise exception 'No encontramos esa postulación.';
  end if;
  if v_job.status = 'asignado' then
    raise exception 'Ya elegiste a alguien para este pedido.';
  end if;
  if v_job.status <> 'publicado' then
    raise exception 'Este pedido ya no está publicado.';
  end if;

  select * into v_app from public.applications a where a.id = p_application_id for update;
  if v_app.status <> 'pendiente' or v_app.cutter_id is null then
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

-- Postulantes: los de cuentas borradas siguen en la lista (historial), sin nombre ni foto.
create or replace function public.get_job_applicants(p_job_id uuid)
returns table (application_id uuid, cutter_id uuid, first_name text, last_initial text, avatar_path text, status text, proposed_price_ars integer, proposed_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, done_jobs integer, yes_pct integer)
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
         case when a.cutter_id is null then null else s.done_as_cutter end,
         case when a.cutter_id is null then null else s.yes_pct end
  from public.applications a
  left join public.profiles p on p.id = a.cutter_id
  cross join lateral private.profile_stats(a.cutter_id) s
  where a.job_id = p_job_id and a.status <> 'retirada'
  order by (a.status = 'aceptada') desc, (a.status = 'pendiente') desc, a.created_at;
end;
$$;

-- Contacto: si la otra parte borró su cuenta, no devuelve filas.
create or replace function public.get_job_contact(p_job_id uuid)
returns table (counterpart_role text, first_name text, last_name text, phone_e164 text, agreed_price_ars integer, agreed_at timestamp with time zone)
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
     or not (v_agr.client_id is not distinct from v_uid or v_agr.cutter_id is not distinct from v_uid) then
    raise exception 'No encontramos los datos de contacto de ese trabajo.';
  end if;

  v_other := case when v_agr.client_id is not distinct from v_uid then v_agr.cutter_id else v_agr.client_id end;

  return query
  select case when v_agr.client_id is not distinct from v_uid then 'cortador' else 'cliente' end,
         p.first_name, pp.last_name, pp.phone_e164,
         v_agr.price_ars, v_agr.agreed_at
  from public.profiles p
  join public.profile_private pp on pp.user_id = p.id
  where p.id = v_other;
end;
$$;

create or replace function public.mark_job_done(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_agr public.job_agreements%rowtype;
  v_tz text;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  perform private.require_terms(v_uid);

  select * into v_job from public.jobs j where j.id = p_job_id for update;
  select * into v_agr from public.job_agreements g where g.job_id = p_job_id;
  if v_job.id is null or v_agr.job_id is null
     or not (v_agr.client_id is not distinct from v_uid or v_agr.cutter_id is not distinct from v_uid) then
    raise exception 'No encontramos ese trabajo.';
  end if;
  if v_job.status = 'realizado' then
    raise exception 'Este trabajo ya estaba marcado como realizado.';
  end if;
  if v_job.status <> 'asignado' then
    raise exception 'Solo se puede marcar como realizado un trabajo asignado.';
  end if;

  select l.timezone into v_tz from public.localities l where l.id = v_job.locality_id;
  if (now() at time zone v_tz)::date < (v_agr.agreed_at at time zone v_tz)::date then
    raise exception 'Se puede marcar como realizado desde el día acordado.';
  end if;

  update public.jobs j set status = 'realizado' where j.id = p_job_id;
  update public.job_agreements g set done_at = now(), done_by = v_uid where g.job_id = p_job_id;

  perform private.notify(
    case when v_agr.client_id is not distinct from v_uid then v_agr.cutter_id else v_agr.client_id end,
    'trabajo_realizado', p_job_id, v_agr.application_id,
    jsonb_build_object('zone', v_job.zone, 'actor_name', private.display_name(v_uid),
                       'desired_at', v_agr.agreed_at, 'tz', v_tz),
    format('trabajo_realizado:%s', p_job_id)
  );
end;
$$;

create or replace function public.rate_job(p_job_id uuid, p_would_work_again boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_agr public.job_agreements%rowtype;
  v_ratee uuid;
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  perform private.require_terms(v_uid);
  if p_would_work_again is null then
    raise exception 'Elegí sí o no.';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id for share;
  select * into v_agr from public.job_agreements g where g.job_id = p_job_id;
  if v_job.id is null or v_agr.job_id is null
     or not (v_agr.client_id is not distinct from v_uid or v_agr.cutter_id is not distinct from v_uid) then
    raise exception 'No encontramos ese trabajo.';
  end if;
  if v_job.status <> 'realizado' then
    raise exception 'Se puede calificar cuando el trabajo está marcado como realizado.';
  end if;
  v_ratee := case when v_agr.client_id is not distinct from v_uid then v_agr.cutter_id else v_agr.client_id end;
  if v_ratee is null then
    raise exception 'La otra persona borró su cuenta: ya no se puede calificar este trabajo.';
  end if;

  begin
    insert into public.ratings (job_id, rater_id, ratee_id, would_work_again)
    values (p_job_id, v_uid, v_ratee, p_would_work_again);
  exception when unique_violation then
    raise exception 'Ya calificaste este trabajo.';
  end;
end;
$$;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;
  perform private.require_terms(v_uid);
  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'Completá tu perfil antes de activar los avisos.';
  end if;
  if p_endpoint is null or not private.is_push_endpoint(p_endpoint) then
    raise exception 'Este navegador no es compatible con los avisos de PastoControl.';
  end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{86,88}={0,2}$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{21,24}={0,2}$' then
    raise exception 'No pudimos activar los avisos en este dispositivo. Probá de nuevo.';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        updated_at = now();

  delete from public.push_subscriptions
  where id in (
    select id from public.push_subscriptions
    where user_id = v_uid
    order by updated_at desc
    offset 10
  );
end;
$$;

commit;
