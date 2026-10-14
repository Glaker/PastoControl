-- Pruebas de seguridad · Fase 3 (applications, notifications, apply/update/withdraw, cambios en
-- update_job / cancel_job / upsert_my_profile, visibilidad de trabajos para postulantes).
--
-- Cómo funciona: igual que fase1/fase2. Al final hace RAISE EXCEPTION con el informe: eso deshace
-- TODA la transacción. Buscá "FALLA" en el informe.
-- Los ids que generan las RPCs (postulaciones, avisos) se pasan entre casos con tablas temporales
-- (pg_temp.t_*) a las que se da select para authenticated.
--
-- Usuarios:
--   A  = cliente dueño de los pedidos (también es cortador, para probar "tu propio pedido")
--   B  = cortador que se postula, retira, vuelve, edita
--   B2 = cortador que contraoferta
--   F  = cortador de la misma localidad que nunca se postula al pedido 1
--   C  = tercero: cliente sin rol de cortador
--   D  = cortador de OTRA localidad
--   E  = registrado sin perfil
--
-- Esperado: 'ok' | 'err:<fragmento>' | 'count:<n>' | 'affected:<n>'

do $test$
declare
  a uuid := '00000000-0000-4000-a000-00000000000a';
  b uuid := '00000000-0000-4000-a000-00000000000b';
  b2 uuid := '00000000-0000-4000-a000-0000000000b2';
  f uuid := '00000000-0000-4000-a000-00000000000f';
  c uuid := '00000000-0000-4000-a000-00000000000c';
  d uuid := '00000000-0000-4000-a000-00000000000d';
  e uuid := '00000000-0000-4000-a000-00000000000e';
  j1 uuid := '00000000-0000-4000-b000-000000000001';
  j2 uuid := '00000000-0000-4000-b000-000000000002';
  p1 text;
  loc smallint;
  loc2 smallint;
  t record;
  v_count bigint;
  v_err text;
  v_ok boolean;
  v_report text := '';
  v_fails int := 0;
  v_total int := 0;
  app_b text;   -- subconsulta: id de la postulación de B al pedido 1
  app_b2 text;  -- id de la postulación de B2 al pedido 1
  app_f text;   -- id de la postulación de F al pedido 2
  prof_b text;  -- upsert_my_profile de B (cliente y cortador según %s)
begin
  select id into loc from public.localities where slug = '25-de-mayo-bsas';
  insert into public.localities (slug, name, province, phone_area_code)
  values ('otra-localidad-prueba', 'Otra', 'Buenos Aires', '2346')
  returning id into loc2;

  p1 := a || '/' || j1 || '/1.jpg';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', m, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
  from (values
    (a, 'prueba-a@pastocontrol.test'), (b, 'prueba-b@pastocontrol.test'), (b2, 'prueba-b2@pastocontrol.test'),
    (f, 'prueba-f@pastocontrol.test'), (c, 'prueba-c@pastocontrol.test'), (d, 'prueba-d@pastocontrol.test'),
    (e, 'prueba-e@pastocontrol.test')
  ) as v(u, m);

  insert into storage.objects (bucket_id, name, owner_id) values
    ('avatars', a || '/yo.jpg', a), ('avatars', b || '/yo.jpg', b), ('avatars', b2 || '/yo.jpg', b2),
    ('avatars', f || '/yo.jpg', f), ('avatars', d || '/yo.jpg', d),
    ('job-photos', p1, a);

  insert into public.profiles (id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter) values
    (a, loc, 'Ana', 'Á', a || '/yo.jpg', true, true),
    (b, loc, 'Beto', 'B', b || '/yo.jpg', false, true),
    (b2, loc, 'Bruno', 'B', b2 || '/yo.jpg', false, true),
    (f, loc, 'Fede', 'F', f || '/yo.jpg', false, true),
    (c, loc, 'Carla', 'C', null, true, false),
    (d, loc2, 'Dani', 'D', d || '/yo.jpg', false, true);
  insert into public.profile_private (user_id, last_name, phone_e164) values
    (a, 'Álvarez', '+5492345111111'), (b, 'Benítez', '+5492345222222'), (b2, 'Bustos', '+5492345222333'),
    (f, 'Funes', '+5492345666666'), (c, 'Castro', '+5492345333333'), (d, 'Díaz', '+5492346444444');

  insert into public.jobs (id, client_id, locality_id, zone, price_ars, desired_at, photo_paths) values
    (j1, a, loc, 'Barrio Centro', 15000, now() + interval '2 days', array[p1]),
    (j2, a, loc, 'Villa Sanz', 15000, now() + interval '3 days', '{}');
  insert into public.job_private (job_id, address) values (j1, 'Calle Falsa 123'), (j2, 'Mitre 450');

  app_b := format('(select id from pg_temp.t_app where cutter_id = %L and job_id = %L)', b, j1);
  app_b2 := format('(select id from pg_temp.t_app where cutter_id = %L and job_id = %L)', b2, j1);
  app_f := format('(select id from pg_temp.t_app where cutter_id = %L and job_id = %L)', f, j2);
  prof_b := 'select public.upsert_my_profile(''Beto'', ''Benítez'', ''+5492345222222'', %s::smallint, true, %L::boolean, %L)';

  for t in
    select * from (values
      -- anon
      (1,  'anon', 'anon no puede leer postulaciones', 'select * from public.applications', 'err:permission denied'),
      (2,  'anon', 'anon no puede leer avisos', 'select * from public.notifications', 'err:permission denied'),
      (3,  'anon', 'anon no puede postularse', format('select public.apply_to_job(%L)', j1), 'err:permission denied'),
      (4,  'anon', 'anon no puede editar postulaciones', format('select public.update_application(%L, 20000)', j1), 'err:permission denied'),
      (5,  'anon', 'anon no puede retirar postulaciones', format('select public.withdraw_application(%L)', j1), 'err:permission denied'),
      (6,  'anon', 'anon no puede marcar avisos', 'select public.mark_notifications_read()', 'err:permission denied'),
      (7,  'anon', 'anon no puede usar private.notify', format('select private.notify(%L, ''x_x'', null, null, ''{}'', ''k'')', a), 'err:permission denied'),

      -- Postularse
      (10, 'B', 'B se postula al pedido 1 aceptando lo publicado', format('select public.apply_to_job(%L)', j1), 'ok'),
      (11, 'admin', 'A recibió el aviso "postulacion_nueva" con el nombre visible de B', format('select 1 from public.notifications where user_id = %L and kind = ''postulacion_nueva'' and payload->>''actor_name'' = ''Beto B.'' and payload->>''zone'' = ''Barrio Centro''', a), 'count:1'),
      (12, 'B', 'B no puede postularse dos veces', format('select public.apply_to_job(%L)', j1), 'err:Ya te postulaste'),
      (13, 'B2', 'B2 se postula con otro precio y otro horario', format('select public.apply_to_job(%L, 20000, now() + interval ''3 days'')', j1), 'ok'),
      (14, 'admin', 'La contraoferta de B2 quedó guardada', format('select 1 from public.applications where cutter_id = %L and proposed_price_ars = 20000 and proposed_at is not null and status = ''pendiente''', b2), 'count:1'),
      (15, 'F', 'F se postula al pedido 2 "proponiendo" lo mismo que lo publicado', format('select public.apply_to_job(%L, 15000, (select desired_at from public.jobs where id = %L))', j2, j2), 'ok'),
      (16, 'admin', 'Proponer lo publicado se guarda como null (acepta lo publicado)', format('select 1 from public.applications where cutter_id = %L and proposed_price_ars is null and proposed_at is null', f), 'count:1'),
      (17, 'C', 'C (sin rol de cortador) no puede postularse', format('select public.apply_to_job(%L)', j2), 'err:Corto pasto'),
      (18, 'D', 'D (otra localidad) no puede postularse', format('select public.apply_to_job(%L)', j2), 'err:No encontramos ese trabajo'),
      (19, 'E', 'E (sin perfil) no puede postularse', format('select public.apply_to_job(%L)', j2), 'err:Corto pasto'),
      (20, 'A', 'A no puede postularse a su propio pedido', format('select public.apply_to_job(%L)', j1), 'err:propio pedido'),
      (21, 'B', 'B no puede proponer menos de $ 1.000', format('select public.apply_to_job(%L, 500)', j2), 'err:precio que proponés'),
      (22, 'B', 'B no puede proponer un horario pasado', format('select public.apply_to_job(%L, null, now() - interval ''1 hour'')', j2), 'err:ya pasó'),
      (23, 'B', 'B no puede proponer a más de 60 días', format('select public.apply_to_job(%L, null, now() + interval ''61 days'')', j2), 'err:60 días'),
      (24, 'B', 'B no puede postularse a un trabajo que no existe', format('select public.apply_to_job(%L)', gen_random_uuid()), 'err:No encontramos ese trabajo'),
      (25, 'admin', '(preparación) ids de postulaciones para los casos siguientes', 'create temp table t_app as select id, job_id, cutter_id from public.applications; grant select on pg_temp.t_app to authenticated', 'ok'),

      -- Lecturas
      (30, 'B', 'B ve solo su postulación', 'select * from public.applications', 'count:1'),
      (31, 'B2', 'B2 ve solo la suya', 'select * from public.applications', 'count:1'),
      (32, 'A', 'A ve las 2 postulaciones de su pedido 1', format('select * from public.applications where job_id = %L', j1), 'count:2'),
      (33, 'C', 'C no ve postulaciones', 'select * from public.applications', 'count:0'),
      (34, 'D', 'D no ve postulaciones', 'select * from public.applications', 'count:0'),
      (35, 'B', 'B no ve la postulación de B2', format('select * from public.applications where cutter_id = %L', b2), 'count:0'),
      (36, 'B', 'B no ve los avisos de A', 'select * from public.notifications', 'count:0'),
      (37, 'A', 'A ve sus 3 avisos (B y B2 en el pedido 1, F en el 2)', 'select * from public.notifications', 'count:3'),
      (38, 'admin', 'Ningún aviso tiene dirección, teléfono ni apellido', 'select 1 from public.notifications where payload::text ilike any (array[''%Calle Falsa%'', ''%Mitre 450%'', ''%+549%'', ''%Benítez%'', ''%Bustos%'', ''%Funes%'', ''%Álvarez%''])', 'count:0'),
      (39, 'admin', 'Los avisos solo tienen campos de la lista blanca', 'select 1 from public.notifications where (payload - array[''zone'', ''actor_name'', ''price_ars'', ''desired_at'', ''proposed_price_ars'', ''proposed_at'', ''tz'']) <> ''{}''::jsonb', 'count:0'),
      (40, 'B', 'B no puede insertar postulaciones directo', format('insert into public.applications (job_id, cutter_id) values (%L, %L)', j2, b), 'err:permission denied'),
      (41, 'B', 'B no puede cambiar el estado de su postulación directo', format('update public.applications set status = ''aceptada'' where cutter_id = %L', b), 'err:permission denied'),
      (42, 'B', 'B no puede borrar postulaciones directo', format('delete from public.applications where cutter_id = %L', b), 'err:permission denied'),
      (43, 'A', 'A no puede marcar avisos directo', 'update public.notifications set read_at = now()', 'err:permission denied'),
      (44, 'A', 'A no puede insertar avisos directo', format('insert into public.notifications (user_id, kind, dedupe_key) values (%L, ''falso'', ''x'')', b), 'err:permission denied'),
      (45, 'B', 'B no puede usar private.notify', format('select private.notify(%L, ''falso'', null, null, ''{}'', ''x'')', a), 'err:permission denied'),

      -- Marcar como leído
      (50, 'admin', '(preparación) ids de los avisos de A', format('create temp table t_notif as select id from public.notifications where user_id = %L; grant select on pg_temp.t_notif to authenticated', a), 'ok'),
      (51, 'B', 'B no puede marcar como leídos los avisos de A (0 marcados)', 'select 1 where public.mark_notifications_read(array(select id from pg_temp.t_notif)) = 0', 'count:1'),
      (52, 'admin', 'Los avisos de A siguen sin leer', format('select 1 from public.notifications where user_id = %L and read_at is null', a), 'count:3'),
      (53, 'A', 'A marca uno como leído', 'select 1 where public.mark_notifications_read(array(select id from pg_temp.t_notif limit 1)) = 1', 'count:1'),
      (54, 'A', 'A marca el resto (2)', 'select 1 where public.mark_notifications_read() = 2', 'count:1'),
      (55, 'A', 'A no tiene avisos sin leer', 'select * from public.notifications where read_at is null', 'count:0'),

      -- Editar postulación
      (60, 'B2', 'B2 no puede editar la postulación de B', format('select public.update_application(%s, 1000)', app_b), 'err:No encontramos esa postulación'),
      (61, 'B', 'B cambia su postulación: propone $ 18.000', format('select public.update_application(%s, 18000)', app_b), 'ok'),
      (62, 'admin', 'A recibió "postulacion_editada"', format('select 1 from public.notifications where user_id = %L and kind = ''postulacion_editada''', a), 'count:1'),
      (63, 'B', 'B "edita" sin cambiar nada', format('select public.update_application(%s, 18000)', app_b), 'ok'),
      (64, 'admin', 'Sin cambios no hay aviso nuevo', format('select 1 from public.notifications where user_id = %L and kind = ''postulacion_editada''', a), 'count:1'),
      (65, 'A', 'A no puede editar un pedido con postulaciones pendientes', format('select public.update_job(%L, ''Centro'', ''Calle Falsa 123'', 16000, now() + interval ''2 days'', null, ''{}'')', j1), 'err:ya tiene postulaciones'),

      -- Retirar y volver
      (70, 'B', 'B retira su postulación', format('select public.withdraw_application(%s)', app_b), 'ok'),
      (71, 'admin', 'A recibió "postulacion_retirada"', format('select 1 from public.notifications where user_id = %L and kind = ''postulacion_retirada''', a), 'count:1'),
      (72, 'B', 'B no puede retirarla de nuevo', format('select public.withdraw_application(%s)', app_b), 'err:Ya habías retirado'),
      (73, 'B', 'B se vuelve a postular', format('select public.apply_to_job(%L)', j1), 'ok'),
      (74, 'admin', 'Se reusó la misma fila (intento 2, pendiente)', format('select 1 from public.applications where id = %s and attempt = 2 and edits = 0 and status = ''pendiente'' and proposed_price_ars is null', app_b), 'count:1'),
      (75, 'admin', 'A recibió 2 avisos de postulación de B (uno por intento)', format('select 1 from public.notifications where user_id = %L and kind = ''postulacion_nueva'' and application_id = %s', a, app_b), 'count:2'),
      (76, 'B', 'B edita en el intento 2', format('select public.update_application(%s, 17000)', app_b), 'ok'),
      (77, 'admin', 'La edición del intento 2 genera su propio aviso', format('select 1 from public.notifications where user_id = %L and kind = ''postulacion_editada''', a), 'count:2'),
      (78, 'admin', 'Dedupe: el mismo aviso dos veces se guarda una sola', format('select private.notify(%L, ''prueba_dedupe'', null, null, ''{}'', ''misma-clave''), private.notify(%L, ''prueba_dedupe'', null, null, ''{}'', ''misma-clave'')', a, a), 'ok'),
      (79, 'admin', 'Dedupe: hay un solo aviso con esa clave', format('select 1 from public.notifications where user_id = %L and dedupe_key = ''misma-clave''', a), 'count:1'),
      (80, 'admin', 'private.notify rechaza campos fuera de la lista blanca', format('select private.notify(%L, ''prueba'', null, null, ''{"phone": "x"}'', ''otra-clave'')', a), 'err:no permitido'),

      -- Vencido: los postulantes siguen viendo el trabajo
      (90, 'admin', '(preparación) el pedido 1 pasa a estar vencido', format('update public.jobs set desired_at = now() - interval ''1 hour'' where id = %L', j1), 'affected:1'),
      (91, 'B', 'B (postulado) sigue viendo el pedido 1 vencido', format('select * from public.jobs where id = %L', j1), 'count:1'),
      (92, 'F', 'F (no postulado) ya no lo ve', format('select * from public.jobs where id = %L', j1), 'count:0'),
      (93, 'B', 'B sigue viendo la foto del pedido 1', format('select 1 from storage.objects where bucket_id = ''job-photos'' and name = %L', p1), 'count:1'),
      (94, 'F', 'F no ve la foto', format('select 1 from storage.objects where bucket_id = ''job-photos'' and name = %L', p1), 'count:0'),
      (95, 'B', 'B no ve la dirección del pedido en el que se postuló', format('select * from public.job_private where job_id = %L', j1), 'count:0'),
      (96, 'F', 'F no puede postularse a un pedido vencido', format('select public.apply_to_job(%L)', j1), 'err:ya no recibe'),
      (97, 'B2', 'B2 no puede quedarse con el horario publicado si ya pasó', format('select public.update_application(%s, 20000, null)', app_b2), 'err:horario publicado ya pasó'),
      (98, 'B2', 'B2 sí puede proponer un horario futuro en un pedido vencido', format('select public.update_application(%s, 20000, now() + interval ''1 day'')', app_b2), 'ok'),
      (99, 'B', 'Lista de disponibles de B (publicados y no vencidos): solo el pedido 2', 'select * from public.jobs j where j.status = ''publicado'' and not j.is_expired', 'count:1'),

      -- Rol de cortador
      (100, 'B', 'B no puede dejar de ser cortador con postulaciones pendientes', format(prof_b, loc, false, b || '/yo.jpg'), 'err:postulaciones activas'),
      (101, 'B', 'B sí puede sumar el rol de cliente', format(prof_b, loc, true, b || '/yo.jpg'), 'ok'),

      -- Cancelar el pedido
      (110, 'A', 'A cancela el pedido 1', format('select public.cancel_job(%L)', j1), 'ok'),
      (111, 'admin', 'Las 2 postulaciones pendientes quedaron canceladas', format('select 1 from public.applications where job_id = %L and status = ''cancelada''', j1), 'count:2'),
      (112, 'admin', 'B recibió "pedido_cancelado"', format('select 1 from public.notifications where user_id = %L and kind = ''pedido_cancelado'' and job_id = %L', b, j1), 'count:1'),
      (113, 'admin', 'B2 recibió "pedido_cancelado"', format('select 1 from public.notifications where user_id = %L and kind = ''pedido_cancelado'' and job_id = %L', b2, j1), 'count:1'),
      (114, 'admin', 'F (no postulado al pedido 1) no recibió nada', format('select 1 from public.notifications where user_id = %L', f), 'count:0'),
      (115, 'B', 'B ve sus avisos (solo el de cancelación)', 'select * from public.notifications', 'count:1'),
      (116, 'B', 'B sigue viendo el pedido cancelado', format('select * from public.jobs where id = %L and status = ''cancelado''', j1), 'count:1'),
      (117, 'B', 'B no puede retirar una postulación cancelada', format('select public.withdraw_application(%s)', app_b), 'err:ya no está pendiente'),
      (118, 'B', 'B no puede editar una postulación cancelada', format('select public.update_application(%s, 16000)', app_b), 'err:ya no se puede editar'),
      (119, 'B', 'B no puede volver a postularse a un pedido cancelado', format('select public.apply_to_job(%L)', j1), 'err:ya no recibe'),
      (120, 'B', 'Sin postulaciones activas, B ya puede dejar de ser cortador', format(prof_b, loc, false, b || '/yo.jpg'), 'ok'),
      (121, 'B', 'B sin rol de cortador no puede postularse', format('select public.apply_to_job(%L)', j2), 'err:Corto pasto'),
      (122, 'F', 'F retira su postulación al pedido 2', format('select public.withdraw_application(%s)', app_f), 'ok'),

      -- Estructura
      (130, 'admin', 'applications y notifications no tienen políticas de escritura', 'select 1 from pg_policies where schemaname = ''public'' and tablename in (''applications'', ''notifications'') and cmd <> ''SELECT''', 'count:0'),
      (131, 'admin', 'anon sin permisos y authenticated solo select', 'select 1 from information_schema.role_table_grants where table_schema = ''public'' and table_name in (''applications'', ''notifications'') and (grantee = ''anon'' or (grantee = ''authenticated'' and privilege_type <> ''SELECT''))', 'count:0'),
      (132, 'admin', 'Las RPCs nuevas son SECURITY DEFINER con search_path vacío', 'select 1 from pg_proc where pronamespace = ''public''::regnamespace and proname in (''apply_to_job'', ''update_application'', ''withdraw_application'', ''mark_notifications_read'') and prosecdef and proconfig @> array[''search_path=""'']', 'count:4'),
      (133, 'admin', 'anon no puede ejecutar las RPCs nuevas', 'select 1 from pg_proc p where p.pronamespace = ''public''::regnamespace and p.proname in (''apply_to_job'', ''update_application'', ''withdraw_application'', ''mark_notifications_read'') and has_function_privilege(''anon'', p.oid, ''execute'')', 'count:0'),
      (134, 'admin', 'authenticated no puede ejecutar private.notify ni normalize_proposal', 'select 1 from pg_proc p where p.pronamespace = ''private''::regnamespace and p.proname in (''notify'', ''normalize_proposal'', ''display_name'') and has_function_privilege(''authenticated'', p.oid, ''execute'')', 'count:0'),
      (135, 'admin', 'notifications está en la publicación de Realtime', 'select 1 from pg_publication_tables where pubname = ''supabase_realtime'' and schemaname = ''public'' and tablename = ''notifications''', 'count:1'),
      (136, 'admin', 'Existe el índice único de una sola aceptada por trabajo', 'select 1 from pg_indexes where indexname = ''applications_one_accepted_per_job'' and indexdef ilike ''%unique%where%aceptada%''', 'count:1'),
      (137, 'admin', 'La política de jobs es una sola', 'select 1 from pg_policies where schemaname = ''public'' and tablename = ''jobs''', 'count:1')
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
          json_build_object('sub', case t.who when 'A' then a when 'B' then b when 'B2' then b2 when 'F' then f
                                              when 'C' then c when 'D' then d else e end,
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

  raise exception 'INFORME FASE 3 · % de % casos OK%', v_total - v_fails, v_total, v_report;
end
$test$;
