-- Antes de limpiar_usuarios_prueba.sql, solo si hace falta (Fase 8): un perfil con cosas pendientes no se
-- puede borrar (ni desde el panel: lo frena private.before_profile_delete), así que el delete de la limpieza
-- falla con «Antes de borrar la cuenta…». Esto cierra lo pendiente de los usuarios de prueba, y nada más:
-- cancela sus pedidos publicados o asignados y sus postulaciones pendientes o aceptadas. No borra nada.
-- Lo normal es no necesitarlo: los scripts de prueba dejan todo cerrado.

begin;

with test_users as (
  select id from auth.users
  where email like 'prueba-%@pastocontrol.test'
     or email like 'prueba-recupero-%@example.com'
     or email like 'pastocontrol.prueba.%@gmail.com'
),
affected_jobs as (
  select j.id from public.jobs j
  where j.status in ('publicado', 'asignado')
    and (j.client_id in (select id from test_users)
         or exists (select 1 from public.applications a
                    where a.job_id = j.id and a.cutter_id in (select id from test_users)
                      and (a.status = 'pendiente' or (a.status = 'aceptada' and j.status = 'asignado'))))
),
apps as (
  update public.applications a set status = 'cancelada'
  where a.job_id in (select id from affected_jobs) and a.status in ('pendiente', 'aceptada')
  returning 1
)
update public.jobs j set status = 'cancelado', cancelled_at = now()
where j.id in (select id from affected_jobs)
returning j.id;

commit;
