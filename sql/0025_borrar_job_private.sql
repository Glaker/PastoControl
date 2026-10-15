-- 0025 · Dirección visible + ubicación en el mapa (parte 2, DESTRUCTIVA: requiere aprobación del dueño).
-- Borra lo que quedó obsoleto con 0024: job_private, las firmas viejas de create_job / update_job /
-- check_job_input y la dirección en get_job_contact (la dirección ahora está en jobs y la ven todos los
-- que ven el pedido; get_job_contact sigue dando apellido y WhatsApp solo a las partes).
-- Antes de borrar vuelve a copiar la dirección de los pedidos viejos (por si el front anterior editó o
-- publicó alguno después de 0024) y aborta todo si quedara un pedido sin dirección.
-- Todo en una transacción: si algo falla no se borra nada.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), fase «Dirección visible + mapa».

begin;

-- 1. Copia de nuevo la dirección de job_private a jobs en los pedidos con el formato viejo (sin número
--    aparte: los publicados o editados con las RPCs viejas). Los del formato nuevo no tienen fila en
--    job_private o ya tienen número, así que no se tocan.
update public.jobs j
set address_street = jp.address
from public.job_private jp
where jp.job_id = j.id
  and j.address_number is null
  and j.address_street is distinct from jp.address;

-- 2. Ningún pedido puede quedar sin dirección, ni ninguna dirección de job_private sin copiar.
do $$
begin
  if exists (select 1 from public.jobs j where j.address_street is null) then
    raise exception 'Hay pedidos sin dirección en jobs: no se borra nada.';
  end if;
  if exists (
    select 1 from public.job_private jp join public.jobs j on j.id = jp.job_id
    where j.address_number is null and j.address_street is distinct from jp.address
  ) then
    raise exception 'Hay direcciones de job_private sin copiar: no se borra nada.';
  end if;
end;
$$;

alter table public.jobs alter column address_street set not null;

-- 3. Firmas viejas (zona y dirección en un solo texto, que escribían en job_private).
drop function public.create_job(uuid, text, text, integer, timestamptz, text, text[], uuid);
drop function public.update_job(uuid, text, text, integer, timestamptz, text, text[]);
drop function private.check_job_input(uuid, uuid, text, text, integer, timestamptz, text, text[]);

-- 4. get_job_contact sin la dirección (cambia el tipo de resultado: hay que borrarla y crearla de nuevo).
--    Contacto de la contraparte: solo a las dos partes y solo con el trabajo asignado o realizado.
--    Nombre completo y WhatsApp de la otra parte, más el acuerdo (precio y horario).
drop function public.get_job_contact(uuid);

create function public.get_job_contact(p_job_id uuid)
returns table (
  counterpart_role text,
  first_name text,
  last_name text,
  phone_e164 text,
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
         v_agr.price_ars, v_agr.agreed_at
  from public.profiles p
  join public.profile_private pp on pp.user_id = p.id
  where p.id = v_other;
end;
$$;

revoke all on function public.get_job_contact(uuid) from public, anon;
grant execute on function public.get_job_contact(uuid) to authenticated;

-- 5. La tabla (con su política, su trigger y su check).
drop table public.job_private;

commit;
