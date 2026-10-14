-- 0006 · Storage: fotos de los trabajos.
-- Bucket privado (URLs firmadas), job-photos/<uid del cliente>/<job_id>/<archivo>.
-- Lectura: el dueño (toda su carpeta) y quien puede ver el trabajo por RLS, solo las fotos
-- que el trabajo lista en photo_paths. Escritura: cada uno solo en su carpeta.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 2.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- SECURITY INVOKER a propósito: consulta public.jobs con el RLS del que llama, así que solo da
-- acceso a las fotos de los trabajos que esa persona ya puede ver.
create or replace function private.can_see_job_photo(p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.jobs j
    where j.id = case
        when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        then split_part(p_name, '/', 2)::uuid
      end
      and p_name = any (j.photo_paths)
  );
$$;

revoke all on function private.can_see_job_photo(text) from public;
grant execute on function private.can_see_job_photo(text) to authenticated;

create policy "Fotos de trabajos: lectura para el dueño y quien ve el trabajo"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'job-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.can_see_job_photo(name)
    )
  );

create policy "Fotos de trabajos: subir solo a la carpeta propia"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'job-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Fotos de trabajos: modificar solo en la carpeta propia"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'job-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Fotos de trabajos: borrar solo en la carpeta propia"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'job-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
