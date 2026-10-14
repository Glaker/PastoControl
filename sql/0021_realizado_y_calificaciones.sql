-- 0021 · Fase 5: marcar realizado, calificaciones y estadísticas públicas.
--   ratings: "¿Volverías a trabajar con esta persona? Sí/No", una por lado y por trabajo.
--     NADIE la lee: RLS activo sin políticas y sin grants (ni el que calificó ni el calificado).
--   mark_job_done: cualquiera de las dos partes, recién desde el día acordado (zona de la localidad).
--   rate_job: cada parte califica a la otra una sola vez, con el trabajo realizado.
--   has_rated_job: si el que llama ya calificó ese trabajo (sin decir qué puso).
--   get_profile_stats: trabajos realizados (como cortador y como cliente) y % de "sí":
--     * solo con 5 calificaciones o más;
--     * en lotes semanales: cuentan las hechas antes del lunes 00:00 (zona de la localidad del
--       perfil), calculado al leer;
--     * redondeado a la decena;
--     * nunca devuelve la cantidad de calificaciones.
--   get_job_applicants: completa done_jobs (realizados como cortador) y yes_pct.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 5.

create table public.ratings (
  job_id uuid not null references public.jobs (id) on delete cascade,
  rater_id uuid not null references public.profiles (id) on delete cascade,
  ratee_id uuid not null references public.profiles (id) on delete cascade,
  would_work_again boolean not null,
  created_at timestamptz not null default now(),
  constraint ratings_pkey primary key (job_id, rater_id),
  constraint ratings_not_self_check check (rater_id <> ratee_id)
);

create index ratings_ratee_id_created_at_idx on public.ratings (ratee_id, created_at);
create index ratings_rater_id_idx on public.ratings (rater_id);

alter table public.ratings enable row level security;
revoke all on public.ratings from public, anon, authenticated;

-- Estadísticas públicas de un perfil (para get_profile_stats y get_job_applicants).
create or replace function private.profile_stats(
  p_user_id uuid,
  out done_as_cutter integer,
  out done_as_client integer,
  out yes_pct integer
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tz text;
  v_cutoff timestamptz;
  v_total integer;
  v_yes integer;
begin
  select count(*) into done_as_cutter
  from public.job_agreements g join public.jobs j on j.id = g.job_id
  where g.cutter_id = p_user_id and j.status = 'realizado';

  select count(*) into done_as_client
  from public.jobs j where j.client_id = p_user_id and j.status = 'realizado';

  -- Lote semanal: lunes 00:00 de esta semana en la zona de la localidad del perfil.
  select l.timezone into v_tz
  from public.profiles p join public.localities l on l.id = p.locality_id
  where p.id = p_user_id;
  v_cutoff := date_trunc('week', now() at time zone coalesce(v_tz, 'UTC')) at time zone coalesce(v_tz, 'UTC');

  select count(*), count(*) filter (where r.would_work_again) into v_total, v_yes
  from public.ratings r
  where r.ratee_id = p_user_id and r.created_at < v_cutoff;

  yes_pct := case
    when v_total >= 5 then (round(100.0 * v_yes / v_total / 10) * 10)::integer
    else null
  end;
end;
$$;

revoke all on function private.profile_stats(uuid) from public;

create or replace function public.get_profile_stats(p_user_id uuid)
returns table (done_as_cutter integer, done_as_client integer, yes_pct integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then
    raise exception 'No encontramos ese perfil.';
  end if;
  return query select s.done_as_cutter, s.done_as_client, s.yes_pct from private.profile_stats(p_user_id) s;
end;
$$;

-- Marcar realizado: cualquiera de las dos partes, desde el día acordado (en la zona de la localidad).
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

  select * into v_job from public.jobs j where j.id = p_job_id for update;
  select * into v_agr from public.job_agreements g where g.job_id = p_job_id;
  if v_job.id is null or v_agr.job_id is null or v_uid not in (v_agr.client_id, v_agr.cutter_id) then
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
    case when v_uid = v_agr.client_id then v_agr.cutter_id else v_agr.client_id end,
    'trabajo_realizado', p_job_id, v_agr.application_id,
    jsonb_build_object('zone', v_job.zone, 'actor_name', private.display_name(v_uid),
                       'desired_at', v_agr.agreed_at, 'tz', v_tz),
    format('trabajo_realizado:%s', p_job_id)
  );
end;
$$;

-- Calificar a la otra parte de un trabajo realizado. Una sola vez; no se cambia.
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
begin
  if v_uid is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '28000';
  end if;
  if p_would_work_again is null then
    raise exception 'Elegí sí o no.';
  end if;

  select * into v_job from public.jobs j where j.id = p_job_id for share;
  select * into v_agr from public.job_agreements g where g.job_id = p_job_id;
  if v_job.id is null or v_agr.job_id is null or v_uid not in (v_agr.client_id, v_agr.cutter_id) then
    raise exception 'No encontramos ese trabajo.';
  end if;
  if v_job.status <> 'realizado' then
    raise exception 'Se puede calificar cuando el trabajo está marcado como realizado.';
  end if;

  begin
    insert into public.ratings (job_id, rater_id, ratee_id, would_work_again)
    values (p_job_id, v_uid,
            case when v_uid = v_agr.client_id then v_agr.cutter_id else v_agr.client_id end,
            p_would_work_again);
  exception when unique_violation then
    raise exception 'Ya calificaste este trabajo.';
  end;
end;
$$;

-- ¿Ya califiqué este trabajo? (Para mostrar u ocultar la pregunta; no devuelve la respuesta.)
create or replace function public.has_rated_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ratings r where r.job_id = p_job_id and r.rater_id = (select auth.uid()));
$$;

-- Postulantes: ahora con las estadísticas públicas de cada cortador (misma firma que en 0015).
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
         s.done_as_cutter, s.yes_pct
  from public.applications a
  join public.profiles p on p.id = a.cutter_id
  cross join lateral private.profile_stats(a.cutter_id) s
  where a.job_id = p_job_id and a.status <> 'retirada'
  order by (a.status = 'aceptada') desc, (a.status = 'pendiente') desc, a.created_at;
end;
$$;

revoke all on function public.get_profile_stats(uuid) from public, anon;
revoke all on function public.mark_job_done(uuid) from public, anon;
revoke all on function public.rate_job(uuid, boolean) from public, anon;
revoke all on function public.has_rated_job(uuid) from public, anon;
grant execute on function public.get_profile_stats(uuid) to authenticated;
grant execute on function public.mark_job_done(uuid) to authenticated;
grant execute on function public.rate_job(uuid, boolean) to authenticated;
grant execute on function public.has_rated_job(uuid) to authenticated;
