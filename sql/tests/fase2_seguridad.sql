-- Pruebas de seguridad · Fase 2 (jobs, job-photos, create/update/cancel_job, bloqueo del rol de cliente).
-- Actualizada con la dirección visible (Fase 7): la dirección y el pin están en jobs y los ve quien ve
-- el pedido; job_private ya no existe. El teléfono y el apellido siguen privados.
--
-- Cómo funciona: igual que fase1_seguridad.sql. Crea usuarios y perfiles de prueba, ejecuta cada
-- caso con el rol y el JWT de ese usuario (o como anon) y compara con lo esperado. Al final hace
-- RAISE EXCEPTION con el informe: eso deshace TODA la transacción, así que no queda nada en la base.
-- El informe aparece como mensaje de error; buscá "FALLA" en él.
--
-- Usuarios:
--   A = cliente (dueño de los pedidos); tiene foto, así que puede pasar a ser solo cortador
--   B = cortador de la misma localidad
--   C = tercero: cliente de la misma localidad, sin rol de cortador
--   D = cortador de OTRA localidad (desde la Fase 8 la localidad no filtra: ve los publicados igual que B)
--   E = registrado sin perfil
--
-- Fase 8: firma nueva de upsert_my_profile y estado final de 0027 simulado dentro de la prueba
-- (términos y ubicación base obligatorios; se deshace con el resto). Todos aceptaron los términos.
--
-- Esperado: 'ok' | 'err:<fragmento>' | 'count:<n>' | 'affected:<n>' | 'noeffect' (error o 0 filas)

do $test$
declare
  a uuid := '00000000-0000-4000-a000-00000000000a';
  b uuid := '00000000-0000-4000-a000-00000000000b';
  c uuid := '00000000-0000-4000-a000-00000000000c';
  d uuid := '00000000-0000-4000-a000-00000000000d';
  e uuid := '00000000-0000-4000-a000-00000000000e';
  j1 uuid := '00000000-0000-4000-b000-000000000001';
  j2 uuid := '00000000-0000-4000-b000-000000000002';
  j3 uuid := '00000000-0000-4000-b000-000000000003';
  j9 uuid := '00000000-0000-4000-b000-000000000009';
  p1 text;
  p2 text;
  orphan text;
  loc smallint;
  loc2 smallint;
  t record;
  v_count bigint;
  v_err text;
  v_ok boolean;
  v_report text := '';
  v_fails int := 0;
  v_total int := 0;
  -- Llamadas armadas una vez para no repetirlas en cada caso.
  create_ok text;
  upd text;
begin
  select id into loc from public.localities where slug = '25-de-mayo-bsas';
  insert into public.localities (slug, name, province, phone_area_code, center_lat, center_lng, radius_m)
  values ('otra-localidad-prueba', 'Otra', 'Buenos Aires', '2346', -35.0, -60.0, 5000)
  returning id into loc2;
  execute $f$create or replace function private.terms_enforced() returns boolean language sql immutable set search_path = '' as 'select true'$f$;
  execute $f$create or replace function private.cutter_base_required() returns boolean language sql immutable set search_path = '' as 'select true'$f$;

  p1 := a || '/' || j1 || '/1.jpg';
  p2 := a || '/' || j1 || '/2.jpg';
  orphan := a || '/' || j1 || '/huerfana.jpg';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', m, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
  from (values
    (a, 'prueba-a@pastocontrol.test'), (b, 'prueba-b@pastocontrol.test'), (c, 'prueba-c@pastocontrol.test'),
    (d, 'prueba-d@pastocontrol.test'), (e, 'prueba-e@pastocontrol.test')
  ) as v(u, m);
  insert into public.terms_acceptances (user_id, version) select u, private.current_terms_version() from unnest(array[a, b, c, d, e]) u;

  insert into storage.objects (bucket_id, name, owner_id)
  values ('avatars', a || '/foto.jpg', a), ('avatars', b || '/yo.jpg', b), ('avatars', d || '/yo.jpg', d);

  insert into public.profiles (id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter) values
    (a, loc, 'Ana', 'Á', a || '/foto.jpg', true, false),
    (b, loc, 'Beto', 'B', b || '/yo.jpg', false, true),
    (c, loc, 'Carla', 'C', null, true, false),
    (d, loc2, 'Dani', 'D', d || '/yo.jpg', false, true);
  insert into public.profile_private (user_id, last_name, phone_e164) values
    (a, 'Álvarez', '+5492345111111'), (b, 'Benítez', '+5492345222222'),
    (c, 'Castro', '+5492345333333'), (d, 'Díaz', '+5492346444444');

  create_ok := format(
    'select public.create_job(%L, -35.4324, -60.1716, ''Calle Falsa'', ''123'', 15000, now() + interval ''2 days'', null, ''Barrio Centro'', ''Terreno de 10x30'', array[%L, %L])',
    j1, p1, p2);
  -- update_job(j, lat, lng, calle, número, precio, fecha, entre calles, zona, nota, fotos) con la fecha y
  -- las fotos como parámetros.
  upd := 'select public.update_job(%L, -35.4324, -60.1716, ''Calle Falsa'', ''123'', %s, %s, null, ''Barrio Centro'', null, %s)';

  for t in
    select * from (values
      -- anon
      (1,  'anon', 'anon no puede leer trabajos', 'select * from public.jobs', 'err:permission denied'),
      (2,  'anon', 'anon no puede leer direcciones', 'select address_street, location_lat from public.jobs', 'err:permission denied'),
      (3,  'anon', 'anon no puede llamar a create_job', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'')', j9), 'err:permission denied'),
      (4,  'anon', 'anon no puede llamar a update_job', format(upd, j1, 15000, 'now() + interval ''1 day''', '''{}''::text[]'), 'err:permission denied'),
      (5,  'anon', 'anon no puede llamar a cancel_job', format('select public.cancel_job(%L)', j1), 'err:permission denied'),
      (6,  'anon', 'anon no puede usar funciones de private', 'select private.i_am_cutter()', 'err:permission denied'),

      -- A publica
      (10, 'A', 'A sube la foto 1 a su carpeta del pedido', format('insert into storage.objects (bucket_id, name, owner_id) values (''job-photos'', %L, %L)', p1, a), 'ok'),
      (11, 'A', 'A sube la foto 2', format('insert into storage.objects (bucket_id, name, owner_id) values (''job-photos'', %L, %L)', p2, a), 'ok'),
      (12, 'A', 'A sube una foto que no va a usar en el pedido', format('insert into storage.objects (bucket_id, name, owner_id) values (''job-photos'', %L, %L)', orphan, a), 'ok'),
      (13, 'A', 'A no puede subir fotos a la carpeta de B', format('insert into storage.objects (bucket_id, name, owner_id) values (''job-photos'', %L, %L)', b || '/' || j1 || '/x.jpg', a), 'err:row-level security'),
      (14, 'A', 'A publica el pedido 1 con 2 fotos', create_ok, 'ok'),
      (15, 'A', 'A no puede reusar el id de un pedido', create_ok, 'err:ya existe'),
      (16, 'A', 'A no puede usar una foto de la carpeta de B', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'', null, array[%L])', j2, b || '/' || j2 || '/x.jpg'), 'err:no es de este pedido'),
      (17, 'A', 'A no puede usar una foto de otro pedido suyo', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'', null, array[%L])', j2, p1), 'err:no es de este pedido'),
      (18, 'A', 'A no puede apuntar a una foto que no existe', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'', null, array[%L])', j2, a || '/' || j2 || '/no.jpg'), 'err:No encontramos alguna'),
      (19, 'A', 'A no puede poner más de 5 fotos', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'', null, array(select %L || g || ''.jpg'' from generate_series(1, 6) g))', j2, a || '/' || j2 || '/'), 'err:hasta 5 fotos'),
      (20, 'A', 'A no puede publicar con fecha pasada', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() - interval ''1 hour'', null, ''Centro'')', j2), 'err:no hayan pasado'),
      (21, 'A', 'A no puede publicar a más de 60 días', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''61 days'', null, ''Centro'')', j2), 'err:60 días'),
      (22, 'A', 'A no puede publicar con precio menor a $ 1.000', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 500, now() + interval ''1 day'', null, ''Centro'')', j2), 'err:precio'),
      (23, 'A', 'A no puede publicar una zona de 1 letra (la zona es opcional)', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''X'')', j2), 'err:zona'),
      (24, 'A', 'A no puede publicar sin calle', format('select public.create_job(%L, -35.4324, -60.1716, '' '', ''1'', 15000, now() + interval ''1 day'')', j2), 'err:calle'),
      (25, 'A', 'A no puede publicar una nota de más de 500 letras', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'', repeat(''x'', 501))', j2), 'err:500'),
      (26, 'A', 'A no puede "volver a publicar" un pedido que sigue publicado', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'', null, ''{}'', %L)', j2, j1), 'err:volver a publicar'),
      (27, 'A', 'A publica el pedido 2 sin fotos', format('select public.create_job(%L, -35.4324, -60.1716, ''Mitre 450'', ''1'', 20000, now() + interval ''3 days'', null, ''Villa Sanz'', ''  '')', j2), 'ok'),
      (28, 'A', 'La nota vacía se guarda como null y la zona recortada', format('select 1 from public.jobs where id = %L and notes is null and zone = ''Villa Sanz''', j2), 'count:1'),
      (29, 'A', 'A ve sus 2 pedidos', 'select * from public.jobs', 'count:2'),
      (30, 'A', 'A ve sus 2 direcciones con su pin', 'select * from public.jobs where address_street is not null and location_lat is not null', 'count:2'),
      (31, 'A', 'El pedido toma la localidad del perfil y queda publicado', format('select 1 from public.jobs where id = %L and locality_id = %s and status = ''publicado'' and client_id = %L', j1, loc, a), 'count:1'),
      (32, 'A', 'A no puede insertar pedidos directo', format('insert into public.jobs (id, client_id, locality_id, zone, price_ars, desired_at) values (%L, %L, %s, ''Centro'', 15000, now() + interval ''1 day'')', j9, a, loc), 'err:permission denied'),
      (33, 'A', 'A no puede modificar su pedido directo (solo por RPC)', format('update public.jobs set status = ''realizado'' where id = %L', j1), 'err:permission denied'),
      (34, 'A', 'A no puede modificar la dirección directo', format('update public.jobs set address_street = ''Otra'' where id = %L', j1), 'err:permission denied'),
      (35, 'A', 'A no puede borrar su pedido directo', format('delete from public.jobs where id = %L', j1), 'err:permission denied'),

      -- B, cortador de la misma localidad
      (40, 'B', 'B ve los 2 pedidos disponibles de A', format('select * from public.jobs where client_id = %L', a), 'count:2'),
      (41, 'B', 'B ve el nombre visible del cliente por embed', format('select 1 from public.jobs j join public.profiles p on p.id = j.client_id where j.id = %L and p.first_name = ''Ana'' and p.last_initial = ''Á''', j1), 'count:1'),
      (42, 'B', 'B ve la dirección y el pin del pedido 1 (dirección visible)', format('select 1 from public.jobs where id = %L and address_street = ''Calle Falsa'' and address_number = ''123'' and location_lat = -35.4324 and location_lng = -60.1716', j1), 'count:1'),
      (43, 'B', 'B no ve los datos privados de nadie más (teléfono, apellido, ubicación base)', format('select * from public.profile_private where user_id <> %L', b), 'count:0'),
      (44, 'B', 'B no ve el teléfono ni el apellido de A', format('select * from public.profile_private where user_id = %L', a), 'count:0'),
      (45, 'B', 'B ve las 2 fotos listadas del pedido 1', format('select 1 from storage.objects where bucket_id = ''job-photos'' and name in (%L, %L)', p1, p2), 'count:2'),
      (46, 'B', 'B no ve la foto de A que no está en el pedido', format('select 1 from storage.objects where bucket_id = ''job-photos'' and name = %L', orphan), 'count:0'),
      (47, 'B', 'B ve el pedido como no vencido (computed field)', format('select 1 from public.jobs j where j.id = %L and not j.is_expired', j1), 'count:1'),
      (48, 'B', 'B (sin rol de cliente) no puede publicar', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'')', j9), 'err:Para publicar pedidos'),
      (49, 'B', 'B no puede editar el pedido de A', format(upd, j1, 99000, 'now() + interval ''1 day''', '''{}''::text[]'), 'err:No encontramos ese pedido'),
      (50, 'B', 'B no puede cancelar el pedido de A', format('select public.cancel_job(%L)', j1), 'err:No encontramos ese pedido'),
      (51, 'B', 'B no puede modificar el pedido de A directo', format('update public.jobs set price_ars = 1 where id = %L', j1), 'err:permission denied'),
      (52, 'B', 'B no puede subir fotos a la carpeta de A', format('insert into storage.objects (bucket_id, name, owner_id) values (''job-photos'', %L, %L)', a || '/' || j1 || '/intrusa.jpg', b), 'err:row-level security'),
      (53, 'B', 'B no puede renombrar fotos de A', format('update storage.objects set name = %L where bucket_id = ''job-photos'' and name = %L', b || '/robada.jpg', p1), 'affected:0'),
      (54, 'B', 'B no puede borrar fotos de A', format('delete from storage.objects where bucket_id = ''job-photos'' and name = %L', p1), 'noeffect'),
      (55, 'B', 'B no puede usar funciones internas de validación', format('select private.check_job_input(%L, %L, %s::smallint, -35.4324, -60.1716, ''Calle'', ''1'', null, null, 15000, now() + interval ''1 day'', null, ''{}'')', b, j9, loc), 'err:permission denied'),

      -- C, tercero sin rol de cortador
      (60, 'C', 'C (sin rol de cortador) no ve pedidos ajenos', 'select * from public.jobs', 'count:0'),
      (61, 'C', 'C no ve fotos de pedidos ajenos', 'select * from storage.objects where bucket_id = ''job-photos''', 'count:0'),
      (62, 'C', 'C no ve direcciones de pedidos ajenos', 'select address_street from public.jobs', 'count:0'),
      (63, 'C', 'C no puede cancelar el pedido de A', format('select public.cancel_job(%L)', j1), 'err:No encontramos ese pedido'),
      (64, 'C', 'C publica 5 pedidos', 'select public.create_job(gen_random_uuid(), -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'') from generate_series(1, 5)', 'ok'),
      (65, 'C', 'C no puede tener más de 5 publicados a la vez', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'')', j9), 'err:5 pedidos publicados'),

      -- D, cortador de otra localidad; E, sin perfil
      (70, 'D', 'D (otra localidad) ve los 7 publicados de A y C: la localidad ya no filtra (Fase 8)', format('select * from public.jobs where client_id in (%L, %L)', a, c), 'count:7'),
      (71, 'D', 'D ve solo las 2 fotos listadas del pedido 1 (no la que no está en el pedido)', 'select * from storage.objects where bucket_id = ''job-photos''', 'count:2'),
      (74, 'D', 'D no ve datos privados de nadie (teléfono, apellido, ubicación base)', format('select * from public.profile_private where user_id <> %L', d), 'count:0'),
      (72, 'E', 'E (sin perfil) no puede publicar', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'')', j9), 'err:Para publicar pedidos'),
      (73, 'E', 'E no ve pedidos', 'select * from public.jobs', 'count:0'),

      -- Vencido
      (80, 'admin', '(preparación) el pedido 2 pasa a tener fecha vencida', format('update public.jobs set desired_at = now() - interval ''1 hour'' where id = %L', j2), 'affected:1'),
      (81, 'B', 'B ya no ve el pedido vencido', format('select * from public.jobs where client_id = %L', a), 'count:1'),
      (82, 'A', 'A ve su pedido 2 como vencido', format('select 1 from public.jobs j where j.id = %L and j.status = ''publicado'' and j.is_expired', j2), 'count:1'),
      (83, 'A', 'A no puede renovarlo con la misma fecha pasada', format(upd, j2, 20000, 'now() - interval ''1 hour''', '''{}''::text[]'), 'err:no hayan pasado'),
      (84, 'A', 'A renueva el vencido con fecha nueva', format(upd, j2, 20000, 'now() + interval ''5 days''', '''{}''::text[]'), 'ok'),
      (85, 'B', 'B vuelve a ver el pedido 2', format('select * from public.jobs where client_id = %L', a), 'count:2'),

      -- Rol de cliente
      (90, 'A', 'A no puede dejar de ser cliente con pedidos publicados', format('select public.upsert_my_profile(''Ana'', ''Álvarez'', ''+5492345111111'', false, true, %L)', a || '/foto.jpg'), 'err:Tenés pedidos publicados'),
      (91, 'A', 'A sí puede sumar el rol de cortador manteniendo el de cliente', format('select public.upsert_my_profile(''Ana'', ''Álvarez'', ''+5492345111111'', true, true, %L)', a || '/foto.jpg'), 'ok'),

      -- Editar
      (100, 'A', 'A edita el pedido 1: sube el precio y saca la foto 2', format(upd, j1, 18000, 'now() + interval ''2 days''', format('array[%L]', p1)), 'ok'),
      (101, 'A', 'La dirección se actualizó', format('select 1 from public.jobs where id = %L and address_street = ''Calle Falsa'' and address_number = ''123'' and zone = ''Barrio Centro''', j1), 'count:1'),
      (102, 'B', 'B ve el precio nuevo', format('select 1 from public.jobs where id = %L and price_ars = 18000', j1), 'count:1'),
      (103, 'B', 'B ya no ve la foto 2 (sacada del pedido)', format('select 1 from storage.objects where bucket_id = ''job-photos'' and name = %L', p2), 'count:0'),
      (104, 'A', 'A no puede editar poniendo una foto de B', format(upd, j1, 18000, 'now() + interval ''2 days''', format('array[%L]', b || '/' || j1 || '/x.jpg')), 'err:no es de este pedido'),
      (105, 'A', 'A no puede editar con fotos repetidas', format(upd, j1, 18000, 'now() + interval ''2 days''', format('array[%L, %L]', p1, p1)), 'err:no es de este pedido'),

      -- Cancelar
      (110, 'A', 'A cancela el pedido 1', format('select public.cancel_job(%L)', j1), 'ok'),
      (111, 'A', 'El pedido 1 queda cancelado con fecha y autor', format('select 1 from public.jobs where id = %L and status = ''cancelado'' and cancelled_at is not null and cancelled_by = %L', j1, a), 'count:1'),
      (112, 'A', 'A no puede cancelarlo de nuevo', format('select public.cancel_job(%L)', j1), 'err:ya estaba cancelado'),
      (113, 'A', 'A no puede editar un pedido cancelado', format(upd, j1, 18000, 'now() + interval ''2 days''', '''{}''::text[]'), 'err:ya no se puede editar'),
      (114, 'B', 'B ya no ve el pedido cancelado', format('select * from public.jobs where id = %L', j1), 'count:0'),
      (115, 'B', 'B ya no ve las fotos del pedido cancelado', format('select 1 from storage.objects where bucket_id = ''job-photos'' and name = %L', p1), 'count:0'),
      (116, 'A', 'A sigue viendo las fotos de su carpeta', format('select 1 from storage.objects where bucket_id = ''job-photos'' and name in (%L, %L, %L)', p1, p2, orphan), 'count:3'),
      (117, 'A', 'A vuelve a publicar el pedido cancelado (republished_from)', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle Falsa 123'', ''1'', 18000, now() + interval ''4 days'', null, ''Barrio Centro'', null, ''{}'', %L)', j3, j1), 'ok'),
      (118, 'admin', '(preparación) vencen los 5 pedidos de C', format('update public.jobs set desired_at = now() - interval ''1 hour'' where client_id = %L', c), 'affected:5'),
      (119, 'C', 'C no puede volver a publicar un pedido ajeno', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'', null, ''{}'', %L)', j9, j1), 'err:volver a publicar'),
      (120, 'C', 'Los vencidos no cuentan para el límite: C publica otro', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'')', j9), 'ok'),
      (121, 'A', 'A cancela el pedido 2', format('select public.cancel_job(%L)', j2), 'ok'),
      (122, 'A', 'A cancela el pedido 3', format('select public.cancel_job(%L)', j3), 'ok'),
      (123, 'A', 'Sin pedidos activos, A ya puede dejar de ser cliente', format('select public.upsert_my_profile(''Ana'', ''Álvarez'', ''+5492345111111'', false, true, %L)', a || '/foto.jpg'), 'ok'),
      (124, 'A', 'A sin rol de cliente no puede publicar', format('select public.create_job(gen_random_uuid(), -35.4324, -60.1716, ''Calle 1'', ''1'', 15000, now() + interval ''1 day'', null, ''Centro'')'), 'err:Para publicar pedidos'),
      (125, 'A', 'A sigue viendo su historial', format('select * from public.jobs where client_id = %L', a), 'count:3'),
      (126, 'B', 'B ve el pedido vigente de C pero no los vencidos', format('select * from public.jobs where client_id = %L', c), 'count:1'),
      (127, 'C', 'C cancela su único pedido vigente', format('select public.cancel_job(%L)', j9), 'ok'),
      (128, 'admin', '(preparación) C sube una foto de perfil', format('insert into storage.objects (bucket_id, name, owner_id) values (''avatars'', %L, %L)', c || '/yo.jpg', c), 'ok'),
      (129, 'C', 'Con pedidos vencidos (siguen publicados), C no puede dejar de ser cliente', format('select public.upsert_my_profile(''Carla'', ''Castro'', ''+5492345333333'', false, true, %L)', c || '/yo.jpg'), 'err:Tenés pedidos publicados'),

      -- Estructura
      (130, 'admin', 'jobs no tiene columnas de teléfono ni apellido', 'select 1 from information_schema.columns where table_schema = ''public'' and table_name = ''jobs'' and column_name ilike any (array[''%phone%'', ''%telef%'', ''%last_name%'', ''%apellido%''])', 'count:0'),
      (131, 'admin', 'jobs no tiene políticas de escritura', 'select 1 from pg_policies where schemaname = ''public'' and tablename = ''jobs'' and cmd <> ''SELECT''', 'count:0'),
      (132, 'admin', 'anon no tiene permisos y authenticated solo select', 'select 1 from information_schema.role_table_grants where table_schema = ''public'' and table_name = ''jobs'' and (grantee = ''anon'' or (grantee = ''authenticated'' and privilege_type <> ''SELECT''))', 'count:0'),
      (133, 'admin', 'Las RPCs nuevas son SECURITY DEFINER con search_path vacío', 'select 1 from pg_proc where pronamespace = ''public''::regnamespace and proname in (''create_job'', ''update_job'', ''cancel_job'') and prosecdef and proconfig @> array[''search_path=""'']', 'count:3'),
      (134, 'admin', 'Ni anon ni public pueden ejecutar las RPCs nuevas', 'select 1 from pg_proc p where p.pronamespace = ''public''::regnamespace and p.proname in (''create_job'', ''update_job'', ''cancel_job'', ''is_expired'') and (has_function_privilege(''anon'', p.oid, ''execute''))', 'count:0')
    ) as x(n, who, label, sql, expected)
    order by n
  loop
    v_total := v_total + 1;
    v_err := null;
    v_count := null;

    begin
      if t.who = 'anon' then
        perform set_config('role', 'anon', true);
        perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      elsif t.who <> 'admin' then
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims',
          json_build_object('sub', case t.who when 'A' then a when 'B' then b when 'C' then c when 'D' then d else e end,
                            'role', 'authenticated')::text, true);
      end if;

      if t.expected like 'count:%' then
        execute format('select count(*) from (%s) q', t.sql) into v_count;
      else
        execute t.sql;
        get diagnostics v_count = row_count;
      end if;

      perform set_config('role', 'postgres', true);
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      v_err := sqlerrm;
      perform set_config('role', 'postgres', true);
      perform set_config('request.jwt.claims', '', true);
    end;

    v_ok := case
      when t.expected = 'ok' then v_err is null
      when t.expected = 'noeffect' then v_err is not null or v_count = 0
      when t.expected like 'err:%' then v_err ilike '%' || substr(t.expected, 5) || '%'
      when t.expected like 'count:%' then v_err is null and v_count = substr(t.expected, 7)::bigint
      when t.expected like 'affected:%' then v_err is null and v_count = substr(t.expected, 10)::bigint
    end;
    if not coalesce(v_ok, false) then v_fails := v_fails + 1; end if;

    v_report := v_report || E'\n' || case when coalesce(v_ok, false) then 'OK    ' else 'FALLA ' end
      || lpad(t.n::text, 3) || ' [' || t.who || '] ' || t.label
      || case when coalesce(v_ok, false) then '' else ' (esperado ' || t.expected || '; obtuvo '
           || coalesce('error: ' || v_err, 'filas: ' || v_count) || ')' end;
  end loop;

  raise exception 'INFORME FASE 2 · % de % casos OK%', v_total - v_fails, v_total, v_report;
end
$test$;
