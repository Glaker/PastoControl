-- 0003 · Perfiles.
-- profiles: datos públicos para usuarios logueados (nombre, inicial del apellido, foto, roles).
-- profile_private: apellido completo y teléfono. Solo los lee el dueño; a la contraparte de un
-- trabajo aceptado se le entregan por una RPC dedicada (Fase 4), nunca por esta tabla.
-- Las escrituras van solo por la RPC upsert_my_profile.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 1.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  locality_id smallint not null references public.localities (id),
  first_name text not null,
  last_initial text not null,
  avatar_path text,
  is_client boolean not null default false,
  is_cutter boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_first_name_check
    check (char_length(first_name) between 1 and 40 and first_name = btrim(first_name)),
  constraint profiles_last_initial_check check (char_length(last_initial) = 1),
  constraint profiles_some_role_check check (is_client or is_cutter),
  constraint profiles_cutter_photo_check check (not is_cutter or avatar_path is not null),
  constraint profiles_avatar_own_folder_check
    check (avatar_path is null or avatar_path like id::text || '/%')
);

create index profiles_locality_id_idx on public.profiles (locality_id);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

create table public.profile_private (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_name text not null,
  -- Celular en formato WhatsApp: +549 + característica (empieza con 1, 2 o 3) + número = 10 dígitos.
  phone_e164 text not null,
  updated_at timestamptz not null default now(),
  constraint profile_private_last_name_check
    check (char_length(last_name) between 1 and 60 and last_name = btrim(last_name)),
  constraint profile_private_phone_check check (phone_e164 ~ '^\+549[1-3][0-9]{9}$')
);

create trigger profile_private_touch_updated_at
  before update on public.profile_private
  for each row execute function private.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;

-- Solo lectura por la API; sin insert/update/delete directos.
grant select on public.profiles to authenticated;
grant select on public.profile_private to authenticated;

create policy "Perfiles: lectura para usuarios logueados"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Datos privados: solo el dueño"
  on public.profile_private for select
  to authenticated
  using (user_id = (select auth.uid()));

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
