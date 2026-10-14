-- 0004 · Storage: fotos de perfil.
-- Bucket privado (se accede con URLs firmadas). Lectura: cualquier usuario logueado.
-- Escritura: cada uno solo en su carpeta, avatars/<su uid>/...
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 1.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Avatars: lectura para usuarios logueados"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

create policy "Avatars: subir solo a la carpeta propia"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Avatars: modificar solo en la carpeta propia"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Avatars: borrar solo en la carpeta propia"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
