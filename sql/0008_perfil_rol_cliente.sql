-- 0008 · upsert_my_profile: no deja sacar el rol de cliente con pedidos publicados (vencidos
-- incluidos) o asignados. Además bloquea la fila del perfil para no cruzarse con un create_job
-- simultáneo. Reemplaza la función de 0003; el resto queda igual.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 2.

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
  select p.is_client into v_was_client from public.profiles p where p.id = v_uid for update;
  if coalesce(v_was_client, false) and not v_is_client and exists (
    select 1 from public.jobs j where j.client_id = v_uid and j.status in ('publicado', 'asignado')
  ) then
    raise exception 'Tenés pedidos publicados o asignados. Cancelalos desde «Mis pedidos» antes de dejar de pedir cortes.';
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
