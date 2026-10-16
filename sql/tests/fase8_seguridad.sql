-- Pruebas de seguridad · Fase 8 (borrar la cuenta, términos y privacidad, trabajos por distancia).
--
-- Cómo funciona: igual que las fases anteriores. Al final hace RAISE EXCEPTION con el informe: eso
-- deshace TODA la transacción. Buscá "FALLA" en el informe.
-- Simula el estado final de 0027 dentro de la prueba (términos y ubicación base obligatorios) y la parte
-- de la Edge Function delete-account: delete_account con la clave de servicio, borrar de Storage los
-- archivos que devuelve (la API de Storage, acá con storage.allow_delete_query) y borrar el usuario de Auth.
--
-- Usuarios:
--   A  = cliente; su pedido ja1 lo hizo D (realizado), en ja2 D está pendiente, ja3 está asignado a D
--   B  = cortador; hizo el pedido jd1 de D (realizado)
--   B2 = cortador; se postuló al pedido jd2 de D (cancelado). Después también borra su cuenta
--   C  = tercero (cliente)
--   D  = el que borra su cuenta: «Zoilo Zarzalejo», cliente y cortador
--   N  = cliente y cortador que no aceptó los términos
--   R  = cortador que busca trabajos por distancia (casa en -35.0, -60.0)
--   K  = cliente con pedidos a distancias conocidas de R
--   X  = cliente con un pedido publicado (borrado desde el panel: tiene que fallar)
--
-- Estadísticas antes del borrado (calificaciones de la semana pasada, cuentan):
--   B: 1 realizado como cortador; recibió 5 (A sí, sí, sí, no + D sí) = 80 %
--   A: 1 realizado como cliente; recibió 5 (B sí, sí, no, no + D sí) = 60 %
--
-- Esperado: 'ok' | 'err:<fragmento>' | 'count:<n>' | 'affected:<n>'

do $test$
declare
  a uuid := '00000000-0000-4000-a800-00000000000a';
  b uuid := '00000000-0000-4000-a800-00000000000b';
  b2 uuid := '00000000-0000-4000-a800-0000000000b2';
  c uuid := '00000000-0000-4000-a800-00000000000c';
  d uuid := '00000000-0000-4000-a800-00000000000d';
  n uuid := '00000000-0000-4000-a800-0000000000ee';
  r uuid := '00000000-0000-4000-a800-0000000000ff';
  k uuid := '00000000-0000-4000-a800-0000000000aa';
  x uuid := '00000000-0000-4000-a800-0000000000bb';
  jd1 uuid := '00000000-0000-4000-b800-0000000000d1';
  jd2 uuid := '00000000-0000-4000-b800-0000000000d2';
  jd3 uuid := '00000000-0000-4000-b800-0000000000d3';
  jd4 uuid := '00000000-0000-4000-b800-0000000000d4';
  jd5 uuid := '00000000-0000-4000-b800-0000000000d5';
  ja1 uuid := '00000000-0000-4000-b800-0000000000a1';
  ja2 uuid := '00000000-0000-4000-b800-0000000000a2';
  ja3 uuid := '00000000-0000-4000-b800-0000000000a3';
  jn1 uuid := '00000000-0000-4000-b800-0000000000e1';
  jn9 uuid := '00000000-0000-4000-b800-0000000000e9';
  jx1 uuid := '00000000-0000-4000-b800-0000000000b1';
  -- Pedidos de K a distancias conocidas del origen (-35.0, -60.0): hacia el norte (1° = 111,195 km)
  -- y uno hacia el este. Más los que no tienen que aparecer: propio de R, vencido y cancelado.
  k3 uuid := '00000000-0000-4000-b800-000000000003';
  k49 uuid := '00000000-0000-4000-b800-000000000049';
  k51 uuid := '00000000-0000-4000-b800-000000000051';
  k8 uuid := '00000000-0000-4000-b800-000000000008';
  k9e uuid := '00000000-0000-4000-b800-00000000009e';
  k15 uuid := '00000000-0000-4000-b800-000000000015';
  k30 uuid := '00000000-0000-4000-b800-000000000030';
  k60 uuid := '00000000-0000-4000-b800-000000000060';
  rown uuid := '00000000-0000-4000-b800-0000000000f1';
  kexp uuid := '00000000-0000-4000-b800-0000000000f2';
  kcan uuid := '00000000-0000-4000-b800-0000000000f3';
  app_b_jd1 uuid := '00000000-0000-4000-c800-000000000001';
  app_b2_jd2 uuid := '00000000-0000-4000-c800-000000000002';
  app_d_ja1 uuid := '00000000-0000-4000-c800-000000000003';
  app_d_ja2 uuid := '00000000-0000-4000-c800-000000000004';
  app_d_ja3 uuid := '00000000-0000-4000-c800-000000000005';
  app_n_ja2 uuid := '00000000-0000-4000-c800-000000000006';
  loc smallint;
  tz text;
  last_week timestamptz;
  pii text;
  near text;
  t record;
  v_count bigint;
  v_err text;
  v_ok boolean;
  v_report text := '';
  v_fails int := 0;
  v_total int := 0;
  cj text := 'select public.create_job(%L, -35.43, -60.17, ''Calle 1'', ''1'', 15000, now() + interval ''2 days'')';
begin
  select id, timezone into loc, tz from public.localities where is_default;
  last_week := (date_trunc('week', now() at time zone tz) at time zone tz) - interval '1 day';
  execute $f$create or replace function private.terms_enforced() returns boolean language sql immutable set search_path = '' as 'select true'$f$;
  execute $f$create or replace function private.cutter_base_required() returns boolean language sql immutable set search_path = '' as 'select true'$f$;

  -- Busca textos en TODAS las columnas de texto, json, uuid y arrays de las tablas de public, auth y storage.
  execute $f$
    create function pg_temp.pii_hits(p_patterns text[]) returns bigint language plpgsql as $g$
    declare
      col record;
      v bigint;
      total bigint := 0;
    begin
      for col in
        select c.table_schema s, c.table_name t, c.column_name cn
        from information_schema.columns c
        join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
        where tb.table_type = 'BASE TABLE'
          and c.table_schema in ('public', 'auth', 'storage')
          and c.data_type in ('text', 'character varying', 'character', 'jsonb', 'json', 'uuid', 'ARRAY')
      loop
        execute format('select count(*) from %I.%I where %I::text ilike any ($1)', col.s, col.t, col.cn) into v using p_patterns;
        total := total + v;
      end loop;
      return total;
    end;
    $g$
  $f$;
  -- «OP» se reemplaza por > (control positivo, antes del borrado) o = (después).
  pii := 'select 1 where pg_temp.pii_hits(array[' || quote_literal('%' || d || '%')
    || ', ''%prueba-d8@%'', ''%Zarzalejo%'', ''%Zoilo%'', ''%2345999888%'', ''%Calle Zeta%'', ''%Barrio Zeta%'', ''%Nota Zeta%'']) OP 0';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', m, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
  from (values
    (a, 'prueba-a8@pastocontrol.test'), (b, 'prueba-b8@pastocontrol.test'), (b2, 'prueba-b28@pastocontrol.test'),
    (c, 'prueba-c8@pastocontrol.test'), (d, 'prueba-d8@pastocontrol.test'), (n, 'prueba-n8@pastocontrol.test'),
    (r, 'prueba-r8@pastocontrol.test'), (k, 'prueba-k8@pastocontrol.test'), (x, 'prueba-x8@pastocontrol.test')
  ) as v(u, m);
  insert into public.terms_acceptances (user_id, version)
  select u, private.current_terms_version() from unnest(array[a, b, b2, c, d, r, k, x]) u;

  insert into storage.objects (bucket_id, name, owner_id) values
    ('avatars', b || '/yo.jpg', b), ('avatars', b2 || '/yo.jpg', b2), ('avatars', d || '/yo.jpg', d),
    ('avatars', n || '/yo.jpg', n), ('avatars', r || '/yo.jpg', r),
    ('job-photos', d || '/' || jd1 || '/1.jpg', d), ('job-photos', d || '/' || jn9 || '/huerfana.jpg', d);

  insert into public.profiles (id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter) values
    (a, loc, 'Ana', 'Á', null, true, false),
    (b, loc, 'Beto', 'B', b || '/yo.jpg', false, true),
    (b2, loc, 'Bruno', 'B', b2 || '/yo.jpg', false, true),
    (c, loc, 'Carla', 'C', null, true, false),
    (d, loc, 'Zoilo', 'Z', d || '/yo.jpg', true, true),
    (n, loc, 'Nora', 'N', n || '/yo.jpg', true, true),
    (r, loc, 'Rita', 'R', r || '/yo.jpg', true, true),
    (k, loc, 'Kevin', 'K', null, true, false),
    (x, loc, 'Ximena', 'X', null, true, false);
  insert into public.profile_private (user_id, last_name, phone_e164, base_lat, base_lng) values
    (a, 'Álvarez', '+5492345111111', null, null),
    (b, 'Benítez', '+5492345222222', -35.43, -60.17),
    (b2, 'Bustos', '+5492345222333', -35.43, -60.17),
    (c, 'Castro', '+5492345333333', null, null),
    (d, 'Zarzalejo', '+5492345999888', -35.5, -60.5),
    (n, 'Núñez', '+5492345444444', -35.43, -60.17),
    (r, 'Ríos', '+5492345555555', -35.0, -60.0),
    (k, 'Klein', '+5492345666666', null, null),
    (x, 'Xavier', '+5492345777777', null, null);

  -- Pedidos de D (cliente)
  insert into public.jobs (id, client_id, locality_id, zone, address_street, address_number, location_lat, location_lng, price_ars, desired_at, notes, photo_paths, status, cancelled_at, cancelled_by) values
    (jd1, d, loc, 'Barrio Zeta', 'Calle Zeta', '742', -35.5, -60.5, 15000, now() - interval '10 days', 'Nota Zeta', array[d || '/' || jd1 || '/1.jpg'], 'realizado', null, null),
    (jd2, d, loc, 'Barrio Zeta', 'Calle Zeta', '742', -35.5, -60.5, 15000, now() + interval '2 days', 'Nota Zeta', '{}', 'cancelado', now(), d),
    (jd3, d, loc, 'Barrio Zeta', 'Calle Zeta', '742', -35.5, -60.5, 15000, now() + interval '2 days', null, '{}', 'cancelado', now(), d),
    (jd4, d, loc, 'Barrio Zeta', 'Calle Zeta', '742', -35.5, -60.5, 15000, now() + interval '3 days', null, '{}', 'publicado', null, null),
    (jd5, d, loc, 'Barrio Zeta', 'Calle Zeta', '742', -35.5, -60.5, 15000, now() - interval '1 hour', null, '{}', 'publicado', null, null);
  -- Pedidos de A (D como cortador), de N y de X
  insert into public.jobs (id, client_id, locality_id, zone, address_street, address_number, location_lat, location_lng, price_ars, desired_at, status) values
    (ja1, a, loc, 'Centro', 'Mitre', '100', -35.43, -60.17, 15000, now() - interval '10 days', 'realizado'),
    (ja2, a, loc, 'Centro', 'Mitre', '200', -35.43, -60.17, 15000, now() + interval '2 days', 'publicado'),
    (ja3, a, loc, 'Centro', 'Mitre', '300', -35.43, -60.17, 15000, now() + interval '2 days', 'asignado'),
    (jn1, n, loc, null, 'Sarmiento', '1', -35.43, -60.17, 15000, now() + interval '2 days', 'publicado'),
    (jx1, x, loc, null, 'Moreno', '1', -35.43, -60.17, 15000, now() + interval '2 days', 'publicado');
  -- Pedidos para calificaciones de relleno (cancelados, de A)
  insert into public.jobs (id, client_id, locality_id, address_street, price_ars, desired_at, status, cancelled_at)
  select ('00000000-0000-4000-b800-0000000001' || lpad(g::text, 2, '0'))::uuid, a, loc, 'Relleno', 15000, now() + interval '1 day', 'cancelado', now()
  from generate_series(1, 8) g;

  insert into public.applications (id, job_id, cutter_id, status) values
    (app_b_jd1, jd1, b, 'aceptada'),
    (app_b2_jd2, jd2, b2, 'cancelada'),
    (app_d_ja1, ja1, d, 'aceptada'),
    (app_d_ja2, ja2, d, 'pendiente'),
    (app_d_ja3, ja3, d, 'aceptada'),
    (app_n_ja2, ja2, n, 'pendiente');
  insert into public.job_agreements (job_id, application_id, client_id, cutter_id, price_ars, agreed_at, done_at, done_by) values
    (jd1, app_b_jd1, d, b, 15000, now() - interval '10 days', now() - interval '9 days', b),
    (ja1, app_d_ja1, a, d, 15000, now() - interval '10 days', now() - interval '9 days', a),
    (ja3, app_d_ja3, a, d, 15000, now() + interval '2 days', null, null);

  insert into public.ratings (job_id, rater_id, ratee_id, would_work_again, created_at) values
    ('00000000-0000-4000-b800-000000000101', a, b, true, last_week),
    ('00000000-0000-4000-b800-000000000102', a, b, true, last_week),
    ('00000000-0000-4000-b800-000000000103', a, b, true, last_week),
    ('00000000-0000-4000-b800-000000000104', a, b, false, last_week),
    (jd1, d, b, true, last_week),
    (jd1, b, d, true, last_week),
    ('00000000-0000-4000-b800-000000000105', b, a, true, last_week),
    ('00000000-0000-4000-b800-000000000106', b, a, true, last_week),
    ('00000000-0000-4000-b800-000000000107', b, a, false, last_week),
    ('00000000-0000-4000-b800-000000000108', b, a, false, last_week),
    (ja1, d, a, true, last_week);

  -- Avisos con el nombre y la dirección de D
  perform private.notify(b, 'trabajo_realizado', jd1, app_b_jd1,
    jsonb_build_object('zone', 'Barrio Zeta', 'actor_name', 'Zoilo Z.', 'desired_at', now(), 'tz', tz), 'prueba-realizado-jd1');
  perform private.notify(a, 'postulacion_nueva', ja1, app_d_ja1,
    jsonb_build_object('zone', 'Centro', 'actor_name', 'Zoilo Z.', 'tz', tz), 'prueba-postulacion-ja1');
  perform private.notify(d, 'postulacion_aceptada', ja1, app_d_ja1,
    jsonb_build_object('zone', 'Centro', 'actor_name', 'Ana Á.', 'tz', tz), 'prueba-aceptada-ja1');
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (d, 'https://fcm.googleapis.com/fcm/send/prueba-d8', 'B' || repeat('a', 86), repeat('c', 22));

  -- Pedidos de K a distancias conocidas de R
  insert into public.jobs (id, client_id, locality_id, address_street, address_number, location_lat, location_lng, price_ars, desired_at, status, cancelled_at) values
    (k3,  k, loc, 'Norte', '3',   -35.0 + 3 / 111.195,   -60.0, 15000, now() + interval '2 days', 'publicado', null),
    (k49, k, loc, 'Norte', '4.9', -35.0 + 4.9 / 111.195, -60.0, 15000, now() + interval '2 days', 'publicado', null),
    (k51, k, loc, 'Norte', '5.1', -35.0 + 5.1 / 111.195, -60.0, 15000, now() + interval '2 days', 'publicado', null),
    (k8,  k, loc, 'Norte', '8',   -35.0 + 8 / 111.195,   -60.0, 15000, now() + interval '2 days', 'publicado', null),
    (k9e, k, loc, 'Este', '9',    -35.0, -60.0 + 9 / (111.195 * cos(radians(35.0))), 15000, now() + interval '2 days', 'publicado', null),
    (k15, k, loc, 'Norte', '15',  -35.0 + 15 / 111.195,  -60.0, 15000, now() + interval '2 days', 'publicado', null),
    (k30, k, loc, 'Norte', '30',  -35.0 + 30 / 111.195,  -60.0, 15000, now() + interval '2 days', 'publicado', null),
    (k60, k, loc, 'Norte', '60',  -35.0 + 60 / 111.195,  -60.0, 15000, now() + interval '2 days', 'publicado', null),
    (rown, r, loc, 'Propio', '1', -35.0 + 1 / 111.195,   -60.0, 15000, now() + interval '2 days', 'publicado', null),
    (kexp, k, loc, 'Vencido', '2', -35.0 + 2 / 111.195,  -60.0, 15000, now() - interval '1 hour', 'publicado', null),
    (kcan, k, loc, 'Cancelado', '2', -35.0 + 2.5 / 111.195, -60.0, 15000, now() + interval '2 days', 'cancelado', now());
  -- Los pedidos de la prueba que devuelve get_available_jobs, en el orden en que vienen, tienen que ser
  -- exactamente los esperados (los pedidos reales de la base no se cuentan).
  near := 'select 1 where (select array_agg(g.job_id order by g.o) from public.get_available_jobs(-35.0, -60.0, %s::smallint) with ordinality g(job_id, distance_m, o) where g.job_id = any (array[%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L]::uuid[])) = array[%s]::uuid[]';

  for t in
    select * from (values
      -- ——— Borrar la cuenta: lo pendiente bloquea ———
      (1, 'D', 'D ve sus 4 pendientes: publicado, publicado vencido, postulación pendiente y aceptada', 'select * from public.get_my_pending_items()', 'count:4'),
      (2, 'D', 'El vencido figura como vencido', format('select 1 from public.get_my_pending_items() where job_id = %L and kind = ''pedido_publicado'' and is_expired', jd5), 'count:1'),
      (3, 'D', 'La aceptada en un trabajo asignado figura', format('select 1 from public.get_my_pending_items() where application_id = %L and kind = ''postulacion_aceptada''', app_d_ja3), 'count:1'),
      (4, 'C', 'C no ve los pendientes de D (cada uno los suyos)', 'select * from public.get_my_pending_items()', 'count:0'),
      (5, 'service', 'Con pendientes, delete_account rechaza el borrado', format('select public.delete_account(%L)', d), 'err:cancelá o retirá lo pendiente'),
      (6, 'admin', 'Borrar el perfil directo (como desde el panel) también falla', format('delete from public.profiles where id = %L', d), 'err:Antes de borrar la cuenta'),
      (7, 'admin', 'Borrar el usuario de Auth de X (pedido publicado) desde el panel falla', format('delete from auth.users where id = %L', x), 'err:Antes de borrar la cuenta'),
      (8, 'admin', 'Nada de D se tocó con los intentos', format('select 1 from public.profiles p join public.jobs j on j.client_id = p.id where p.id = %L and j.id = %L and j.address_street = ''Calle Zeta''', d, jd1), 'count:1'),

      -- ——— Un usuario no puede borrar a otro (ni a sí mismo sin la Edge Function) ———
      (10, 'anon', 'anon no puede ejecutar delete_account', format('select public.delete_account(%L)', d), 'err:permission denied'),
      (11, 'C', 'C no puede ejecutar delete_account sobre D', format('select public.delete_account(%L)', d), 'err:permission denied'),
      (12, 'D', 'D tampoco puede llamarla directo (solo la Edge Function, con su contraseña)', format('select public.delete_account(%L)', d), 'err:permission denied'),
      (13, 'C', 'C no puede borrar el perfil de D', format('delete from public.profiles where id = %L', d), 'err:permission denied'),
      (14, 'C', 'C no puede borrar usuarios de Auth', format('delete from auth.users where id = %L', d), 'err:permission denied'),
      (15, 'service', 'delete_account sin usuario falla', 'select public.delete_account(null)', 'err:Falta el usuario'),

      -- ——— D no acepta términos nuevos: igual puede irse ———
      (20, 'admin', '(preparación) D no tiene aceptada la versión vigente', format('delete from public.terms_acceptances where user_id = %L', d), 'affected:1'),
      (21, 'D', 'Sin aceptar, D no puede publicar', format(cj, gen_random_uuid()), 'err:aceptar los términos'),
      (22, 'D', 'Sin aceptar, D sí puede cancelar su pedido publicado', format('select public.cancel_job(%L)', jd4), 'ok'),
      (23, 'D', 'Y su pedido vencido', format('select public.cancel_job(%L)', jd5), 'ok'),
      (24, 'D', 'Y retirar su postulación pendiente', format('select public.withdraw_application(%L)', app_d_ja2), 'ok'),
      (25, 'D', 'Y cancelar el trabajo que le asignaron', format('select public.cancel_job(%L)', ja3), 'ok'),
      (26, 'D', 'Y marcar sus avisos como leídos', 'select public.mark_notifications_read()', 'ok'),
      (27, 'D', 'Y sacar un dispositivo', 'select public.delete_push_subscription(''https://fcm.googleapis.com/fcm/send/otro'')', 'ok'),
      (28, 'D', 'Ya no tiene pendientes', 'select * from public.get_my_pending_items()', 'count:0'),
      (29, 'admin', '(control) Antes de borrar, el buscador SÍ encuentra los datos de D', replace(pii, 'OP', '>'), 'count:1'),

      -- ——— Estadísticas antes ———
      (30, 'admin', '(preparación) estadísticas de A y B antes del borrado', format('create temp table t_stats as select %L::uuid as id, s.* from private.profile_stats(%L) s union all select %L::uuid, s.* from private.profile_stats(%L) s; grant select on pg_temp.t_stats to authenticated', a, a, b, b), 'ok'),
      (31, 'admin', 'Antes: B 1 realizado y 80 %; A 1 realizado y 60 %', format('select 1 from pg_temp.t_stats where (id = %L and done_as_cutter = 1 and yes_pct = 80) or (id = %L and done_as_client = 1 and yes_pct = 60)', b, a), 'count:2'),

      -- ——— Borrado (lo que hace la Edge Function) ———
      (40, 'service', 'Con la clave de servicio, delete_account borra a D y devuelve sus archivos', format('create temp table t_del as select public.delete_account(%L) as r; grant select on pg_temp.t_del to postgres', d), 'ok'),
      (41, 'admin', 'Devuelve su foto de perfil y las 2 fotos de su carpeta (también la huérfana)', 'select 1 from pg_temp.t_del where jsonb_array_length(r->''avatars'') = 1 and jsonb_array_length(r->''job_photos'') = 2', 'count:1'),
      (42, 'admin', '(Edge Function) se borran los archivos por la API de Storage', 'select set_config(''storage.allow_delete_query'', ''true'', true); delete from storage.objects o using pg_temp.t_del t where (o.bucket_id = ''avatars'' and o.name in (select jsonb_array_elements_text(t.r->''avatars''))) or (o.bucket_id = ''job-photos'' and o.name in (select jsonb_array_elements_text(t.r->''job_photos''))); select set_config(''storage.allow_delete_query'', ''false'', true)', 'ok'),
      (43, 'admin', '(Edge Function) se borra el usuario de Auth', format('delete from auth.users where id = %L', d), 'affected:1'),

      -- ——— Qué se borró ———
      (50, 'admin', 'No queda el perfil, ni los datos privados, ni la aceptación de términos', format('select 1 from public.profiles where id = %L union all select 1 from public.profile_private where user_id = %L union all select 1 from public.terms_acceptances where user_id = %L', d, d, d), 'count:0'),
      (51, 'admin', 'No quedan sus dispositivos ni sus avisos', format('select 1 from public.push_subscriptions where user_id = %L union all select 1 from public.notifications where user_id = %L', d, d), 'count:0'),
      (52, 'admin', 'No queda ningún archivo en sus carpetas de Storage', format('select 1 from storage.objects where name like %L', d || '/%'), 'count:0'),
      (53, 'admin', 'No queda NINGÚN dato personal de D en ninguna tabla de public, auth ni storage', replace(pii, 'OP', '='), 'count:1'),
      (54, 'admin', 'Su pedido cancelado sin postulaciones y los dos que canceló al irse se borraron', format('select 1 from public.jobs where id in (%L, %L, %L)', jd3, jd4, jd5), 'count:0'),

      -- ——— Qué quedó anónimo ———
      (60, 'admin', 'El pedido realizado por B sigue, sin dueño ni dirección, pin, zona, nota ni fotos', format('select 1 from public.jobs where id = %L and status = ''realizado'' and client_id is null and address_street is null and address_number is null and location_lat is null and zone is null and notes is null and photo_paths = ''{}''', jd1), 'count:1'),
      (61, 'admin', 'El acuerdo de ese trabajo sigue, con B como cortador', format('select 1 from public.job_agreements where job_id = %L and client_id is null and cutter_id = %L and done_by = %L', jd1, b, b), 'count:1'),
      (62, 'admin', 'El cancelado con la postulación de B2 sigue, anónimo', format('select 1 from public.jobs where id = %L and client_id is null and cancelled_by is null and address_street is null', jd2), 'count:1'),
      (63, 'admin', 'El trabajo que D hizo para A sigue: postulación y acuerdo sin D', format('select 1 from public.applications a join public.job_agreements g on g.application_id = a.id where a.id = %L and a.cutter_id is null and a.status = ''aceptada'' and g.cutter_id is null and g.client_id = %L', app_d_ja1, a), 'count:1'),
      (64, 'admin', 'Las calificaciones siguen: las que dio D, sin autor; la que recibió, sin destinatario', format('select 1 from public.ratings where job_id in (%L, %L) and (rater_id is null or ratee_id is null)', jd1, ja1), 'count:3'),
      (65, 'admin', 'El aviso de B ya no tiene el nombre, la dirección ni la zona de D', format('select 1 from public.notifications where user_id = %L and dedupe_key = ''prueba-realizado-jd1'' and not payload ?| array[''actor_name'', ''address'', ''zone'']', b), 'count:1'),
      (66, 'admin', 'Los avisos de A sobre D ya no tienen su nombre (la dirección de A sí)', format('select 1 from public.notifications where user_id = %L and application_id in (%L, %L, %L) and not payload ? ''actor_name'' and payload->>''address'' like ''Mitre%%''', a, app_d_ja1, app_d_ja2, app_d_ja3), 'count:3'),

      -- ——— Las estadísticas de la otra parte no cambian ———
      (70, 'C', 'B: mismos realizados y mismo % que antes', format('select 1 from public.get_profile_stats(%L) s join pg_temp.t_stats t on t.id = %L where s.done_as_cutter = t.done_as_cutter and s.done_as_client = t.done_as_client and s.yes_pct = t.yes_pct', b, b), 'count:1'),
      (71, 'C', 'A: mismos realizados y mismo % que antes', format('select 1 from public.get_profile_stats(%L) s join pg_temp.t_stats t on t.id = %L where s.done_as_cutter = t.done_as_cutter and s.done_as_client = t.done_as_client and s.yes_pct = t.yes_pct', a, a), 'count:1'),

      -- ——— La otra parte después del borrado ———
      (72, 'B', 'B sigue viendo el trabajo que hizo (sin dueño)', format('select 1 from public.jobs where id = %L and client_id is null', jd1), 'count:1'),
      (73, 'B', 'B sigue sabiendo que ya calificó', format('select 1 where public.has_rated_job(%L)', jd1), 'count:1'),
      (74, 'B', 'El contacto de un usuario eliminado no devuelve nada (sin error)', format('select * from public.get_job_contact(%L)', jd1), 'count:0'),
      (75, 'A', 'A tampoco recibe contacto de D', format('select * from public.get_job_contact(%L)', ja1), 'count:0'),
      (76, 'A', 'A ya no puede calificar a D', format('select public.rate_job(%L, true)', ja1), 'err:borró su cuenta'),
      (77, 'C', 'C (no es parte) no puede calificar un trabajo de alguien borrado', format('select public.rate_job(%L, true)', jd1), 'err:No encontramos ese trabajo'),
      (78, 'C', 'C (no es parte) no recibe contacto de un trabajo de alguien borrado', format('select * from public.get_job_contact(%L)', jd1), 'err:No encontramos los datos'),
      (79, 'A', 'En los postulantes de A, D aparece sin nombre ni foto (usuario eliminado)', format('select 1 from public.get_job_applicants(%L) where cutter_id is null and first_name is null and avatar_path is null and status = ''aceptada''', ja1), 'count:1'),
      (80, 'C', 'El perfil de D ya no existe', format('select * from public.get_profile_stats(%L)', d), 'err:No encontramos ese perfil'),

      -- ——— Cuando se va la otra parte también, no queda nada ———
      (85, 'service', 'B2 borra su cuenta', format('select public.delete_account(%L)', b2), 'ok'),
      (86, 'admin', 'El pedido jd2 se borró del todo: ya no le queda nadie', format('select 1 from public.jobs where id = %L union all select 1 from public.applications where id = %L', jd2, app_b2_jd2), 'count:0'),
      (87, 'admin', 'jd1 sigue (le queda B)', format('select 1 from public.jobs where id = %L', jd1), 'count:1'),

      -- ——— Radio de búsqueda ———
      (100, 'anon', 'anon no puede buscar trabajos', 'select * from public.get_available_jobs(-35.0, -60.0, 20::smallint)', 'err:permission denied'),
      (101, 'C', 'C (sin rol de cortador) no puede buscar trabajos', 'select * from public.get_available_jobs(-35.0, -60.0, 20::smallint)', 'err:Corto pasto'),
      (102, 'R', 'Un radio que no es 5, 10, 20 ni 50 se rechaza', 'select * from public.get_available_jobs(-35.0, -60.0, 7::smallint)', 'err:5, 10, 20 o 50'),
      (103, 'R', 'Sin origen se rechaza', 'select * from public.get_available_jobs(null, -60.0, 20::smallint)', 'err:desde dónde buscar'),
      (104, 'R', '5 km: solo 3 y 4,9 km, en orden (no 5,1)', format(near, 5, k3, k49, k51, k8, k9e, k15, k30, k60, rown, kexp, kcan, quote_literal(k3) || ',' || quote_literal(k49)), 'count:1'),
      (105, 'R', '10 km: 3; 4,9; 5,1; 8 y 9 (este), en orden', format(near, 10, k3, k49, k51, k8, k9e, k15, k30, k60, rown, kexp, kcan, concat_ws(',', quote_literal(k3), quote_literal(k49), quote_literal(k51), quote_literal(k8), quote_literal(k9e))), 'count:1'),
      (106, 'R', '20 km: suma el de 15', format(near, 20, k3, k49, k51, k8, k9e, k15, k30, k60, rown, kexp, kcan, concat_ws(',', quote_literal(k3), quote_literal(k49), quote_literal(k51), quote_literal(k8), quote_literal(k9e), quote_literal(k15))), 'count:1'),
      (107, 'R', '50 km: suma el de 30 y no el de 60; nunca el propio, el vencido ni el cancelado', format(near, 50, k3, k49, k51, k8, k9e, k15, k30, k60, rown, kexp, kcan, concat_ws(',', quote_literal(k3), quote_literal(k49), quote_literal(k51), quote_literal(k8), quote_literal(k9e), quote_literal(k15), quote_literal(k30))), 'count:1'),
      (108, 'R', 'La distancia devuelta es la real (3 km ± 5 m)', format('select 1 from public.get_available_jobs(-35.0, -60.0, 5::smallint) where job_id = %L and distance_m between 2995 and 3005', k3), 'count:1'),
      (109, 'R', 'R guarda su radio de 50 km', 'select public.set_my_search_radius(50::smallint)', 'ok'),
      (110, 'R', 'Queda en sus datos privados', format('select 1 from public.profile_private where user_id = %L and search_radius_km = 50', r), 'count:1'),
      (111, 'R', 'Un radio inválido no se guarda', 'select public.set_my_search_radius(7::smallint)', 'err:5, 10, 20 o 50'),
      (112, 'C', 'C no ve el radio de R', format('select search_radius_km from public.profile_private where user_id = %L', r), 'count:0'),
      (113, 'admin', 'El radio por defecto es 20 km', format('select 1 from public.profile_private where user_id = %L and search_radius_km = 20', k), 'count:1'),

      -- ——— Términos ———
      (120, 'anon', 'anon no puede aceptar términos', 'select public.accept_terms(1::smallint)', 'err:permission denied'),
      (121, 'anon', 'anon no lee aceptaciones', 'select * from public.terms_acceptances', 'err:permission denied'),
      (122, 'C', 'C no ve la aceptación de nadie más', format('select * from public.terms_acceptances where user_id <> %L', c), 'count:0'),
      (123, 'C', 'C no puede escribir aceptaciones directo', format('insert into public.terms_acceptances (user_id, version) values (%L, 1)', n), 'err:permission denied'),
      (124, 'N', 'N ve que no aceptó la versión vigente', 'select 1 from public.get_my_terms_status() where not accepted and current_version = 1', 'count:1'),
      (125, 'N', 'Sin aceptar: create_job rechaza', format(cj, gen_random_uuid()), 'err:aceptar los términos'),
      (126, 'N', 'Sin aceptar: update_job rechaza', format('select public.update_job(%L, -35.43, -60.17, ''Calle'', ''1'', 15000, now() + interval ''2 days'')', jn1), 'err:aceptar los términos'),
      (127, 'N', 'Sin aceptar: apply_to_job rechaza', format('select public.apply_to_job(%L)', ja2), 'err:aceptar los términos'),
      (128, 'N', 'Sin aceptar: update_application rechaza', format('select public.update_application(%L, 20000)', app_n_ja2), 'err:aceptar los términos'),
      (129, 'N', 'Sin aceptar: accept_application rechaza', format('select public.accept_application(%L, now())', app_n_ja2), 'err:aceptar los términos'),
      (130, 'N', 'Sin aceptar: mark_job_done rechaza', format('select public.mark_job_done(%L)', ja3), 'err:aceptar los términos'),
      (131, 'N', 'Sin aceptar: rate_job rechaza', format('select public.rate_job(%L, true)', ja1), 'err:aceptar los términos'),
      (132, 'N', 'Sin aceptar: upsert_my_profile rechaza', format('select public.upsert_my_profile(''Nora'', ''Núñez'', ''+5492345444444'', true, true, %L)', n || '/yo.jpg'), 'err:aceptar los términos'),
      (133, 'N', 'Sin aceptar: set_my_base_location rechaza', 'select public.set_my_base_location(-35.4, -60.1)', 'err:aceptar los términos'),
      (134, 'N', 'Sin aceptar: set_my_search_radius rechaza', 'select public.set_my_search_radius(10::smallint)', 'err:aceptar los términos'),
      (135, 'N', 'Sin aceptar: save_push_subscription rechaza', format('select public.save_push_subscription(''https://fcm.googleapis.com/fcm/send/n8'', %L, %L)', 'B' || repeat('a', 86), repeat('c', 22)), 'err:aceptar los términos'),
      (136, 'N', 'Sin aceptar: sí puede retirar su postulación', format('select public.withdraw_application(%L)', app_n_ja2), 'ok'),
      (137, 'N', 'Sin aceptar: sí puede cancelar su pedido', format('select public.cancel_job(%L)', jn1), 'ok'),
      (138, 'N', 'Sin aceptar: sí puede marcar avisos y sacar dispositivos', 'select public.mark_notifications_read(), public.delete_push_subscription(''https://fcm.googleapis.com/fcm/send/n8'')', 'ok'),
      (139, 'N', 'No puede aceptar una versión que no es la vigente', 'select public.accept_terms(99::smallint)', 'err:cambiaron'),
      (140, 'N', 'Acepta la vigente', 'select public.accept_terms(1::smallint)', 'ok'),
      (141, 'N', 'Aceptar dos veces no falla', 'select public.accept_terms(1::smallint)', 'ok'),
      (142, 'N', 'Queda guardado con la fecha', format('select 1 from public.terms_acceptances where user_id = %L and version = 1 and accepted_at > now() - interval ''1 minute''', n), 'count:1'),
      (143, 'N', 'Ya puede publicar', format(cj, jn9), 'ok'),
      (144, 'admin', '(preparación) se publica la versión 2 de los términos', 'insert into public.terms_versions (version) values (2)', 'ok'),
      (145, 'N', 'Con la versión 2 vigente, N vuelve a quedar bloqueado', format(cj, gen_random_uuid()), 'err:aceptar los términos'),
      (146, 'N', 'Y lo ve en su estado', 'select 1 from public.get_my_terms_status() where not accepted and current_version = 2', 'count:1'),
      (147, 'N', 'La versión 1 ya no se puede aceptar', 'select public.accept_terms(1::smallint)', 'err:cambiaron'),
      (148, 'N', 'Acepta la 2 y vuelve a poder', 'select public.accept_terms(2::smallint); ' || format(cj, gen_random_uuid()), 'ok'),
      (149, 'admin', 'Quedan las dos aceptaciones (historial)', format('select 1 from public.terms_acceptances where user_id = %L', n), 'count:2'),
      (150, 'admin', '(preparación) vuelve a ser vigente la 1 (para probar el registro)', 'delete from public.terms_acceptances where version = 2; delete from public.terms_versions where version = 2', 'ok'),
      (151, 'admin', 'Al registrarse con la casilla (terms_version 1 en los metadatos) queda aceptado', 'with u as (insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values (''00000000-0000-4000-a800-000000000101'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''prueba-s1@pastocontrol.test'', '''', now(), now(), ''{}'', ''{"terms_version": 1}'') returning id) select 1 from u', 'ok'),
      (152, 'admin', 'La aceptación del registro está guardada', 'select 1 from public.terms_acceptances where user_id = ''00000000-0000-4000-a800-000000000101'' and version = 1', 'count:1'),
      (153, 'admin', 'Con otra versión en los metadatos no se guarda nada (y el registro anda)', 'insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values (''00000000-0000-4000-a800-000000000102'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''prueba-s2@pastocontrol.test'', '''', now(), now(), ''{}'', ''{"terms_version": "7"}'')', 'ok'),
      (154, 'admin', 'Con basura en los metadatos tampoco (y el registro anda)', 'insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values (''00000000-0000-4000-a800-000000000103'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''prueba-s3@pastocontrol.test'', '''', now(), now(), ''{}'', ''{"terms_version": "1abc"}'')', 'ok'),
      (155, 'admin', 'Ni la versión 7 ni la basura dejaron aceptaciones', 'select 1 from public.terms_acceptances where user_id in (''00000000-0000-4000-a800-000000000102'', ''00000000-0000-4000-a800-000000000103'')', 'count:0'),

      -- ——— Estructura ———
      (160, 'admin', 'delete_account solo la ejecuta service_role', 'select 1 from pg_proc p where p.proname = ''delete_account'' and (has_function_privilege(''authenticated'', p.oid, ''execute'') or has_function_privilege(''anon'', p.oid, ''execute'') or not has_function_privilege(''service_role'', p.oid, ''execute''))', 'count:0'),
      (161, 'admin', 'Las RPCs nuevas son SECURITY DEFINER con search_path vacío (get_available_jobs es INVOKER: respeta el RLS)', 'select 1 from pg_proc where pronamespace = ''public''::regnamespace and proname in (''accept_terms'', ''get_my_terms_status'', ''set_my_search_radius'', ''get_my_pending_items'', ''delete_account'') and prosecdef and proconfig @> array[''search_path=""''] union all select 1 from pg_proc where proname = ''get_available_jobs'' and not prosecdef and proconfig @> array[''search_path=""'']', 'count:6'),
      (162, 'admin', 'anon no ejecuta ninguna RPC nueva', 'select 1 from pg_proc p where p.pronamespace = ''public''::regnamespace and p.proname in (''accept_terms'', ''get_my_terms_status'', ''set_my_search_radius'', ''get_my_pending_items'', ''get_available_jobs'', ''delete_account'') and has_function_privilege(''anon'', p.oid, ''execute'')', 'count:0'),
      (163, 'admin', 'Las FK a profiles de jobs, applications, job_agreements y ratings ya no borran en cascada', 'select 1 from pg_constraint where contype = ''f'' and confrelid = ''public.profiles''::regclass and conrelid in (''public.jobs''::regclass, ''public.applications''::regclass, ''public.job_agreements''::regclass, ''public.ratings''::regclass) and confdeltype <> ''n''', 'count:0'),
      (164, 'admin', 'Ningún pedido activo sin dueño ni postulación pendiente sin cortador (también en los datos reales)', 'select 1 from public.jobs where client_id is null and status in (''publicado'', ''asignado'') union all select 1 from public.applications where cutter_id is null and status = ''pendiente''', 'count:0')
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
      elsif t.who = 'service' then
        perform set_config('role', 'service_role', true);
        perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
      elsif t.who <> 'admin' then
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims',
          json_build_object('sub', case t.who when 'A' then a when 'B' then b when 'C' then c when 'D' then d
                                              when 'N' then n when 'R' then r else k end,
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

  raise exception 'INFORME FASE 8 · % de % casos OK%', v_total - v_fails, v_total, v_report;
end
$test$;
