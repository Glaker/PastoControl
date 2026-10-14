-- 0009 · jobs: una sola política de lectura en vez de dos (advisor "multiple permissive policies":
-- con dos, Postgres evalúa ambas en cada fila). Mismas reglas que en 0005.
-- Ejecutado desde el SQL Editor del panel (el MCP no pudo correr DROP: falla su confirmación), Fase 2.

begin;

drop policy "Trabajos: el dueño ve los suyos" on public.jobs;
drop policy "Trabajos: los cortadores ven los disponibles de su localidad" on public.jobs;

-- El dueño ve todos los suyos. Los cortadores ven los publicados y no vencidos de su localidad.
-- (Fase 3: además, los trabajos en los que se postularon, en cualquier estado.)
create policy "Trabajos: el dueño y los cortadores de la localidad"
  on public.jobs for select
  to authenticated
  using (
    client_id = (select auth.uid())
    or (
      status = 'publicado'
      and desired_at > now()
      and locality_id = (select private.my_cutter_locality_id())
    )
  );

commit;
