-- Pruebas de seguridad · Fase 4 (accept_application, get_job_applicants, get_job_contact,
-- cancelaciones después de asignar, regla de localidad en upsert_my_profile).
-- Desde la Fase 5 el acuerdo vive en job_agreements (0018/0019): casos 35, 43, 44, 54, 59, 63, 81, 85-89, 94, 96, 97.
--
-- Cómo funciona: igual que las fases anteriores. Al final hace RAISE EXCEPTION con el informe: eso
-- deshace TODA la transacción. Buscá "FALLA" en el informe.
-- Los ids que generan las RPCs se pasan entre casos con tablas temporales (pg_temp.t_*).
-- La versión "fresca" de una postulación (updated_at) se lee con la sesión del cliente, que por RLS
-- ve las postulaciones de sus pedidos, igual que la app.
--
-- Usuarios:
--   A  = cliente dueño de los pedidos
--   B  = cortador (aceptado en el pedido 1)
--   B2 = cortador (rechazado en el 1; aceptado en el 3 y en el 4)
--   F  = cortador de la misma localidad que no se postula
--   C  = tercero: cliente sin rol de cortador
--   D  = cortador de OTRA localidad
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
  j1 uuid := '00000000-0000-4000-b000-000000000001';
  j2 uuid := '00000000-0000-4000-b000-000000000002';
  j3 uuid := '00000000-0000-4000-b000-000000000003';
  j4 uuid := '00000000-0000-4000-b000-000000000004';
  loc smallint;
  loc2 smallint;
  t record;
  v_count bigint;
  v_err text;
  v_ok boolean;
  v_report text := '';
  v_fails int := 0;
  v_total int := 0;
  -- id de la postulación de <cortador> al <pedido>, y su updated_at actual leído como el cliente
  app text := '(select id from pg_temp.t_app where cutter_id = %L and job_id = %L)';
  fresh text := '(select updated_at from public.applications where id = (select id from pg_temp.t_app where cutter_id = %L and job_id = %L))';
  accept text;
  prof text;
begin
  select id into loc from public.localities where slug = '25-de-mayo-bsas';
  insert into public.localities (slug, name, province, phone_area_code, center_lat, center_lng, radius_m)
  values ('otra-localidad-prueba', 'Otra', 'Buenos Aires', '2346', -35.0, -60.0, 5000)
  returning id into loc2;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', m, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
  from (values
    (a, 'prueba-a@pastocontrol.test'), (b, 'prueba-b@pastocontrol.test'), (b2, 'prueba-b2@pastocontrol.test'),
    (f, 'prueba-f@pastocontrol.test'), (c, 'prueba-c@pastocontrol.test'), (d, 'prueba-d@pastocontrol.test')
  ) as v(u, m);

  insert into storage.objects (bucket_id, name, owner_id) values
    ('avatars', a || '/yo.jpg', a), ('avatars', b || '/yo.jpg', b), ('avatars', b2 || '/yo.jpg', b2),
    ('avatars', f || '/yo.jpg', f), ('avatars', d || '/yo.jpg', d);

  insert into public.profiles (id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter) values
    (a, loc, 'Ana', 'Á', a || '/yo.jpg', true, false),
    (b, loc, 'Beto', 'B', b || '/yo.jpg', false, true),
    (b2, loc, 'Bruno', 'B', b2 || '/yo.jpg', false, true),
    (f, loc, 'Fede', 'F', f || '/yo.jpg', false, true),
    (c, loc, 'Carla', 'C', null, true, false),
    (d, loc2, 'Dani', 'D', d || '/yo.jpg', false, true);
  insert into public.profile_private (user_id, last_name, phone_e164) values
    (a, 'Álvarez', '+5492345111111'), (b, 'Benítez', '+5492345222222'), (b2, 'Bustos', '+5492345222333'),
    (f, 'Funes', '+5492345666666'), (c, 'Castro', '+5492345333333'), (d, 'Díaz', '+5492346444444');

  insert into public.jobs (id, client_id, locality_id, zone, address_street, address_number, location_lat, location_lng, price_ars, desired_at) values
    (j1, a, loc, 'Barrio Centro', 'Calle Falsa', '123', -35.4324, -60.1716, 15000, now() + interval '2 days'),
    (j2, a, loc, 'Villa Sanz', 'Mitre', '450', -35.4300, -60.1700, 15000, now() + interval '3 days'),
    (j3, a, loc, 'Las Quintas', 'Rivadavia', '77', -35.4350, -60.1750, 15000, now() + interval '4 days'),
    (j4, a, loc, 'El Ombú', 'Belgrano', '9', -35.4280, -60.1650, 15000, now() + interval '5 days');

  accept := 'select public.accept_application(' || app || ', ' || fresh || ')';
  prof := 'select public.upsert_my_profile(%L, %L, %L, %s::smallint, %L::boolean, %L::boolean, %L)';

  for t in
    select * from (values
      -- anon
      (1, 'anon', 'anon no puede aceptar', format('select public.accept_application(%L, now())', j1), 'err:permission denied'),
      (2, 'anon', 'anon no puede ver postulantes', format('select * from public.get_job_applicants(%L)', j1), 'err:permission denied'),
      (3, 'anon', 'anon no puede pedir el contacto', format('select * from public.get_job_contact(%L)', j1), 'err:permission denied'),

      -- Postulaciones de partida
      (10, 'B', 'B se postula al pedido 1 (acepta lo publicado)', format('select public.apply_to_job(%L)', j1), 'ok'),
      (11, 'B2', 'B2 se postula al pedido 1 con $ 20.000', format('select public.apply_to_job(%L, 20000)', j1), 'ok'),
      (12, 'B', 'B se postula al pedido 2', format('select public.apply_to_job(%L)', j2), 'ok'),
      (13, 'B', 'B se postula al pedido 3 (acepta lo publicado)', format('select public.apply_to_job(%L)', j3), 'ok'),
      (14, 'B2', 'B2 se postula al pedido 3 (acepta lo publicado)', format('select public.apply_to_job(%L)', j3), 'ok'),
      (15, 'B2', 'B2 se postula al pedido 4 con $ 25.000', format('select public.apply_to_job(%L, 25000)', j4), 'ok'),
      (16, 'admin', '(preparación) ids de postulaciones', 'create temp table t_app as select id, job_id, cutter_id, updated_at from public.applications; grant select on pg_temp.t_app to authenticated', 'ok'),

      -- Lista de postulantes
      (20, 'A', 'A ve los 2 postulantes del pedido 1', format('select * from public.get_job_applicants(%L)', j1), 'count:2'),
      (21, 'A', 'Los postulantes vienen con nombre visible y la propuesta', format('select 1 from public.get_job_applicants(%L) where first_name = ''Bruno'' and last_initial = ''B'' and proposed_price_ars = 20000 and status = ''pendiente''', j1), 'count:1'),
      (22, 'admin', 'get_job_applicants no devuelve apellido ni teléfono', 'select 1 from pg_proc where proname = ''get_job_applicants'' and pg_get_function_result(oid) ilike any (array[''%last_name%'', ''%phone%'', ''%address%''])', 'count:0'),
      (23, 'B', 'B (cortador) no puede ver los postulantes del pedido de A', format('select * from public.get_job_applicants(%L)', j1), 'err:No encontramos ese pedido'),
      (24, 'C', 'C (tercero) tampoco', format('select * from public.get_job_applicants(%L)', j1), 'err:No encontramos ese pedido'),

      -- Contacto antes de asignar
      (25, 'A', 'A no recibe contacto antes de asignar', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),
      (26, 'B', 'B no recibe contacto antes de asignar', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),

      -- Aceptar
      (30, 'B', 'B no puede aceptar su propia postulación', format(accept, b, j1, b, j1), 'err:No encontramos esa postulación'),
      (31, 'A', 'A no puede aceptar con un updated_at inventado', format('select public.accept_application(' || app || ', now() - interval ''1 day'')', b, j1), 'err:cambió'),
      (32, 'B2', 'B2 cambia su propuesta después de que A la vio', format('select public.update_application(' || app || ', 21000)', b2, j1), 'ok'),
      (33, 'A', 'A no puede aceptar la versión vieja de B2', format('select public.accept_application(' || app || ', (select updated_at from pg_temp.t_app where cutter_id = %L and job_id = %L))', b2, j1, b2, j1), 'err:cambió'),
      (34, 'A', 'A acepta a B (versión actual)', format(accept, b, j1, b, j1), 'ok'),
      (35, 'admin', 'El pedido 1 queda asignado a B con lo publicado ($ 15.000 y la fecha publicada)', format('select 1 from public.jobs j join public.job_agreements g on g.job_id = j.id where j.id = %L and j.status = ''asignado'' and g.client_id = %L and g.cutter_id = %L and g.price_ars = 15000 and g.agreed_at = j.desired_at and g.application_id = %s', j1, a, b, format(app, b, j1)), 'count:1'),
      (43, 'A', 'A (cliente) lee el acuerdo del pedido 1', format('select 1 from public.job_agreements where job_id = %L', j1), 'count:1'),
      (44, 'B', 'B (cortador elegido) lee el acuerdo del pedido 1', format('select 1 from public.job_agreements where job_id = %L', j1), 'count:1'),
      (36, 'admin', 'La de B queda aceptada y la de B2 rechazada', format('select 1 from public.applications where job_id = %L and ((cutter_id = %L and status = ''aceptada'') or (cutter_id = %L and status = ''rechazada''))', j1, b, b2), 'count:2'),
      (37, 'admin', 'B recibió "postulacion_aceptada" y B2 "postulacion_rechazada"', format('select 1 from public.notifications where job_id = %L and ((user_id = %L and kind = ''postulacion_aceptada'') or (user_id = %L and kind = ''postulacion_rechazada''))', j1, b, b2), 'count:2'),
      (38, 'A', 'A no puede aceptar a otro en un pedido asignado', format(accept, b2, j1, b2, j1), 'err:Ya elegiste'),
      (39, 'admin', 'Red de seguridad: no puede haber dos aceptadas en un pedido', format('update public.applications set status = ''aceptada'' where id = %s', format(app, b2, j1)), 'err:applications_one_accepted_per_job'),
      (40, 'B2', 'B2 no puede volver a postularse a un pedido asignado', format('select public.apply_to_job(%L)', j1), 'err:ya no recibe'),
      (41, 'B', 'B no puede retirar una postulación aceptada (lo orienta a cancelar)', format('select public.withdraw_application(' || app || ')', b, j1), 'err:cancelá el trabajo'),
      (42, 'B', 'B no puede editar una postulación aceptada', format('select public.update_application(' || app || ', 30000)', b, j1), 'err:ya no se puede editar'),

      -- Contacto después de asignar
      (45, 'A', 'A recibe nombre completo y WhatsApp de B', format('select 1 from public.get_job_contact(%L) where counterpart_role = ''cortador'' and first_name = ''Beto'' and last_name = ''Benítez'' and phone_e164 = ''+5492345222222'' and agreed_price_ars = 15000', j1), 'count:1'),
      (46, 'B', 'B recibe nombre completo y WhatsApp de A', format('select 1 from public.get_job_contact(%L) where counterpart_role = ''cliente'' and last_name = ''Álvarez'' and phone_e164 = ''+5492345111111''', j1), 'count:1'),
      (47, 'B2', 'B2 (rechazado) no recibe el contacto', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),
      (48, 'F', 'F (no postulado) no recibe el contacto', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),
      (49, 'C', 'C (tercero) no recibe el contacto', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),
      (50, 'D', 'D (otra localidad) no recibe el contacto', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),
      (51, 'B', 'B no puede leer el teléfono ni el apellido de A directo (solo por get_job_contact)', format('select * from public.profile_private where user_id = %L', a), 'count:0'),
      (52, 'B', 'B sigue sin poder leer profile_private de A directo', format('select * from public.profile_private where user_id = %L', a), 'count:0'),
      (53, 'B2', 'B2 ve el pedido asignado (se había postulado) con su dirección, pero no el teléfono ni el apellido de A', format('select 1 from public.jobs j where j.id = %L and j.status = ''asignado'' and j.address_street = ''Calle Falsa'' and not exists (select 1 from public.profile_private pp where pp.user_id = %L)', j1, a), 'count:1'),
      (54, 'B2', 'B2 (no elegido) no lee el acuerdo: ni precio ni horario ni quién', 'select * from public.job_agreements', 'count:0'),
      (85, 'F', 'F (no postulado) no lee ningún acuerdo', 'select * from public.job_agreements', 'count:0'),
      (86, 'C', 'C (tercero) no lee ningún acuerdo', 'select * from public.job_agreements', 'count:0'),
      (87, 'anon', 'anon no lee acuerdos', 'select * from public.job_agreements', 'err:permission denied'),
      (88, 'B', 'B no puede escribir acuerdos directo', format('update public.job_agreements set price_ars = 1 where job_id = %L', j1), 'err:permission denied'),
      (89, 'admin', 'Un solo acuerdo por pedido (job_id único)', format('insert into public.job_agreements (job_id, application_id, client_id, cutter_id, price_ars, agreed_at) select job_id, %s, client_id, cutter_id, price_ars, agreed_at from public.job_agreements where job_id = %L', format(app, b2, j1), j1), 'err:duplicate key'),

      -- Pedido vencido: solo se acepta una propuesta con horario futuro
      (55, 'admin', '(preparación) el pedido 3 pasa a estar vencido', format('update public.jobs set desired_at = now() - interval ''1 hour'' where id = %L', j3), 'affected:1'),
      (56, 'A', 'A no puede aceptar a B en el 3 (horario publicado, ya pasó)', format(accept, b, j3, b, j3), 'err:ya pasó'),
      (57, 'B2', 'B2 propone un horario futuro en el pedido vencido', format('select public.update_application(' || app || ', null, now() + interval ''1 day'')', b2, j3), 'ok'),
      (58, 'A', 'A acepta a B2 en el pedido 3 vencido', format(accept, b2, j3, b2, j3), 'ok'),
      (59, 'admin', 'El acuerdo del 3 usa el horario propuesto y el precio publicado', format('select 1 from public.jobs j join public.job_agreements g on g.job_id = j.id where j.id = %L and j.status = ''asignado'' and g.cutter_id = %L and g.price_ars = 15000 and g.agreed_at > now()', j3, b2), 'count:1'),

      -- Cancelar después de asignar
      (60, 'F', 'F no puede cancelar el pedido 1', format('select public.cancel_job(%L)', j1), 'err:No encontramos ese pedido'),
      (61, 'B2', 'B2 (rechazado) no puede cancelar el pedido 1', format('select public.cancel_job(%L)', j1), 'err:No encontramos ese pedido'),
      (62, 'B', 'B (cortador aceptado) cancela el pedido 1', format('select public.cancel_job(%L)', j1), 'ok'),
      (63, 'admin', 'El pedido 1 queda cancelado por B (en el acuerdo, no en jobs) y su postulación cancelada', format('select 1 from public.jobs j join public.job_agreements g on g.job_id = j.id join public.applications a on a.id = g.application_id where j.id = %L and j.status = ''cancelado'' and j.cancelled_by is null and g.cancelled_by = %L and a.status = ''cancelada''', j1, b), 'count:1'),
      (71, 'B2', 'B2 (no elegido) no puede saber que canceló el elegido ni quién era', format('select 1 from public.jobs where id = %L and status = ''cancelado'' and cancelled_by is null', j1), 'count:1'),
      (64, 'admin', 'A recibió "trabajo_cancelado_por_cortador" con el nombre visible de B', format('select 1 from public.notifications where user_id = %L and kind = ''trabajo_cancelado_por_cortador'' and job_id = %L and payload->>''actor_name'' = ''Beto B.''', a, j1), 'count:1'),
      (65, 'A', 'Cancelado, A ya no recibe el contacto', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),
      (66, 'B', 'Cancelado, B ya no recibe el contacto', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),
      (67, 'B', 'B no puede cancelarlo de nuevo', format('select public.cancel_job(%L)', j1), 'err:No encontramos ese pedido'),
      (68, 'A', 'A cancela el pedido 3 (asignado a B2)', format('select public.cancel_job(%L)', j3), 'ok'),
      (69, 'admin', 'B2 recibió "trabajo_cancelado_por_cliente"', format('select 1 from public.notifications where user_id = %L and kind = ''trabajo_cancelado_por_cliente'' and job_id = %L and payload->>''actor_name'' = ''Ana Á.''', b2, j3), 'count:1'),
      (70, 'B', 'B (postulado pendiente) no puede cancelar el pedido 2', format('select public.cancel_job(%L)', j2), 'err:No encontramos ese pedido'),

      -- Localidad
      (75, 'B', 'B (postulación pendiente) no puede cambiar de localidad', format(prof, 'Beto', 'Benítez', '+5492345222222', loc2, false, true, b || '/yo.jpg'), 'err:No podés cambiar de localidad'),
      (76, 'A', 'A (pedido publicado) no puede cambiar de localidad', format(prof, 'Ana', 'Álvarez', '+5492345111111', loc2, true, false, a || '/yo.jpg'), 'err:No podés cambiar de localidad'),
      (77, 'C', 'C (sin pedidos ni postulaciones activas) sí puede', format(prof, 'Carla', 'Castro', '+5492345333333', loc2, true, false, null), 'ok'),
      (78, 'B', 'B retira su postulación al pedido 2', format('select public.withdraw_application(' || app || ')', b, j2), 'ok'),
      (79, 'B', 'Sin nada activo, B ya puede cambiar de localidad', format(prof, 'Beto', 'Benítez', '+5492345222222', loc2, false, true, b || '/yo.jpg'), 'ok'),
      (80, 'A', 'A acepta a B2 en el pedido 4 (con su precio propuesto)', format(accept, b2, j4, b2, j4), 'ok'),
      (81, 'admin', 'El acuerdo del 4 usa el precio propuesto ($ 25.000)', format('select 1 from public.jobs j join public.job_agreements g on g.job_id = j.id where j.id = %L and g.price_ars = 25000 and g.agreed_at = j.desired_at', j4), 'count:1'),
      (82, 'B2', 'B2 (aceptado en un trabajo asignado) no puede cambiar de localidad', format(prof, 'Bruno', 'Bustos', '+5492345222333', loc2, false, true, b2 || '/yo.jpg'), 'err:No podés cambiar de localidad'),
      (83, 'B2', 'B2 tampoco puede dejar de ser cortador', format(prof, 'Bruno', 'Bustos', '+5492345222333', loc, true, false, b2 || '/yo.jpg'), 'err:postulaciones activas'),
      (84, 'B2', 'B2 sí puede editar sus datos sin cambiar de localidad', format(prof, 'Bruno', 'Bustos', '+5492345222334', loc, false, true, b2 || '/yo.jpg'), 'ok'),

      -- Estructura y datos
      (90, 'admin', 'Las RPCs nuevas son SECURITY DEFINER con search_path vacío', 'select 1 from pg_proc where pronamespace = ''public''::regnamespace and proname in (''accept_application'', ''get_job_applicants'', ''get_job_contact'') and prosecdef and proconfig @> array[''search_path=""'']', 'count:3'),
      (91, 'admin', 'anon no puede ejecutar las RPCs nuevas', 'select 1 from pg_proc p where p.pronamespace = ''public''::regnamespace and p.proname in (''accept_application'', ''get_job_applicants'', ''get_job_contact'') and has_function_privilege(''anon'', p.oid, ''execute'')', 'count:0'),
      (92, 'admin', 'jobs sigue sin columnas de teléfono ni apellido', 'select 1 from information_schema.columns where table_schema = ''public'' and table_name = ''jobs'' and column_name ilike any (array[''%phone%'', ''%telef%'', ''%last_name%'', ''%apellido%''])', 'count:0'),
      (93, 'admin', 'Ningún aviso tiene dirección, teléfono ni apellido', 'select 1 from public.notifications where payload::text ilike any (array[''%Calle Falsa%'', ''%Mitre 450%'', ''%Rivadavia%'', ''%Belgrano 9%'', ''%+549%'', ''%Benítez%'', ''%Bustos%'', ''%Álvarez%''])', 'count:0'),
      (94, 'admin', 'Ningún pedido asignado sin acuerdo', 'select 1 from public.jobs j where j.status in (''asignado'', ''realizado'') and not exists (select 1 from public.job_agreements g where g.job_id = j.id)', 'count:0'),
      (96, 'admin', 'jobs ya no tiene columnas de acuerdo', 'select 1 from information_schema.columns where table_schema = ''public'' and table_name = ''jobs'' and column_name in (''assigned_application_id'', ''assigned_cutter_id'', ''agreed_price_ars'', ''agreed_at'', ''assigned_at'')', 'count:0'),
      (97, 'admin', 'job_agreements sin políticas de escritura', 'select 1 from pg_policies where schemaname = ''public'' and tablename = ''job_agreements'' and cmd <> ''SELECT''', 'count:0'),
      (95, 'admin', 'Ninguna postulación pendiente en un pedido no publicado', 'select 1 from public.applications a join public.jobs j on j.id = a.job_id where a.status = ''pendiente'' and j.status <> ''publicado''', 'count:0')
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
                                              when 'C' then c else d end,
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

  raise exception 'INFORME FASE 4 · % de % casos OK%', v_total - v_fails, v_total, v_report;
end
$test$;
