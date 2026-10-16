-- Pruebas de seguridad · Fase 7 (dirección visible, ubicación en el mapa, ubicación base del cortador).
--
-- Cómo funciona: igual que las fases anteriores. Al final hace RAISE EXCEPTION con el informe: eso
-- deshace TODA la transacción. Buscá "FALLA" en el informe.
--
-- Usuarios:
--   A  = cliente de 25 de Mayo (dueño de los pedidos)
--   B  = cortador de 25 de Mayo (después, el elegido en el pedido 2)
--   B2 = cortador de 25 de Mayo (postulado y no elegido en el pedido 2)
--   C  = tercero: cliente de 25 de Mayo sin rol de cortador
--   D  = cortador de OTRA localidad
--   E  = registrado sin perfil
--
-- Fase 8: el pin y la casa valen en cualquier lugar de Argentina (caja lat -55,1 a -21,7, lng -73,6 a
-- -53,6) y la localidad ya no filtra ni se elige. Los casos del radio de la localidad ahora usan puntos
-- fuera del país. Firma nueva de upsert_my_profile y estado final de 0027 simulado dentro de la prueba
-- (términos y ubicación base obligatorios; se deshace con el resto).
--
-- Puntos: 25 de Mayo -35.4300, -60.1700 · Buenos Aires -34.6037, -58.3816 · Ushuaia -54.80, -68.30
--   Fuera: océano Atlántico -40.0, -50.0 · Río de Janeiro -22.90, -43.20 · La Paz (Bolivia) -16.50, -68.15
--
-- Esperado: 'ok' | 'err:<fragmento>' | 'count:<n>' | 'affected:<n>' | 'noeffect' (error o 0 filas)

do $test$
declare
  a uuid := '00000000-0000-4000-a700-00000000000a';
  b uuid := '00000000-0000-4000-a700-00000000000b';
  b2 uuid := '00000000-0000-4000-a700-0000000000b2';
  c uuid := '00000000-0000-4000-a700-00000000000c';
  d uuid := '00000000-0000-4000-a700-00000000000d';
  e uuid := '00000000-0000-4000-a700-00000000000e';
  j1 uuid := '00000000-0000-4000-b700-000000000001';
  j2 uuid := '00000000-0000-4000-b700-000000000002';
  j3 uuid := '00000000-0000-4000-b700-000000000003';
  j9 uuid := '00000000-0000-4000-b700-000000000009';
  app_b uuid := '00000000-0000-4000-c700-00000000000b';
  app_b2 uuid := '00000000-0000-4000-c700-0000000000b2';
  loc smallint;
  loc2 smallint;
  t record;
  v_count bigint;
  v_err text;
  v_ok boolean;
  v_report text := '';
  v_fails int := 0;
  v_total int := 0;
  -- create_job(id, lat, lng, calle, número, precio, fecha, entre calles, zona, nota, fotos, volver a publicar)
  cj text := 'select public.create_job(%L, %s, %s, %L, %L, 15000, now() + interval ''2 days'', %L, %L)';
  -- update_job(id, lat, lng, calle, número, precio, fecha, entre calles, zona)
  uj text := 'select public.update_job(%L, %s, %s, %L, %L, 16000, now() + interval ''3 days'', %L, %L)';
  prof text := 'select public.upsert_my_profile(%L, %L, %L, %L::boolean, %L::boolean, %L)';
begin
  select id into loc from public.localities where slug = '25-de-mayo-bsas';
  insert into public.localities (slug, name, province, phone_area_code, center_lat, center_lng, radius_m)
  values ('otra-localidad-prueba', 'Otra', 'Buenos Aires', '2346', -35.0, -60.0, 5000)
  returning id into loc2;
  execute $f$create or replace function private.terms_enforced() returns boolean language sql immutable set search_path = '' as 'select true'$f$;
  execute $f$create or replace function private.cutter_base_required() returns boolean language sql immutable set search_path = '' as 'select true'$f$;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', m, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
  from (values
    (a, 'prueba-a@pastocontrol.test'), (b, 'prueba-b@pastocontrol.test'), (b2, 'prueba-b2@pastocontrol.test'),
    (c, 'prueba-c@pastocontrol.test'), (d, 'prueba-d@pastocontrol.test'), (e, 'prueba-e@pastocontrol.test')
  ) as v(u, m);
  insert into public.terms_acceptances (user_id, version) select u, private.current_terms_version() from unnest(array[a, b, b2, c, d, e]) u;

  insert into storage.objects (bucket_id, name, owner_id)
  values ('avatars', b || '/yo.jpg', b), ('avatars', b2 || '/yo.jpg', b2), ('avatars', d || '/yo.jpg', d);

  insert into public.profiles (id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter) values
    (a, loc, 'Ana', 'Á', null, true, false),
    (b, loc, 'Beto', 'B', b || '/yo.jpg', false, true),
    (b2, loc, 'Bruno', 'B', b2 || '/yo.jpg', false, true),
    (c, loc, 'Carla', 'C', null, true, false),
    (d, loc2, 'Dani', 'D', d || '/yo.jpg', false, true);
  insert into public.profile_private (user_id, last_name, phone_e164, base_lat, base_lng) values
    (a, 'Álvarez', '+5492345111111', null, null),
    (b, 'Benítez', '+5492345222222', null, null),
    (b2, 'Bustos', '+5492345222333', -35.4400, -60.1800),
    (c, 'Castro', '+5492345333333', null, null),
    (d, 'Díaz', '+5492346444444', -35.0010, -60.0010);

  for t in
    select * from (values
      -- anon
      (1,  'anon', 'anon no puede leer direcciones ni pines', 'select address_street, location_lat from public.jobs', 'err:permission denied'),
      (2,  'anon', 'anon no puede leer datos privados (ni ubicaciones base)', 'select base_lat from public.profile_private', 'err:permission denied'),
      (3,  'anon', 'anon no puede guardar una ubicación base', 'select public.set_my_base_location(-35.43, -60.17)', 'err:permission denied'),
      (4,  'anon', 'anon no puede publicar', format(cj, j9, -35.43, -60.17, 'Calle 1', '1', null, null), 'err:permission denied'),
      (5,  'anon', 'anon no puede leer localidades', 'select center_lat from public.localities', 'err:permission denied'),

      -- Publicar con pin
      (10, 'A', 'A publica el pedido 1 con pin, calle, número y entre calles (sin zona)', format(cj, j1, -35.4300, -60.1700, ' Calle 9 ', '1150', 'entre 24 y 25', '  '), 'ok'),
      (11, 'A', 'Se guardan calle (recortada), número, entre calles y pin; la zona vacía queda null', format('select 1 from public.jobs where id = %L and address_street = ''Calle 9'' and address_number = ''1150'' and address_between = ''entre 24 y 25'' and location_lat = -35.43 and location_lng = -60.17 and zone is null', j1), 'count:1'),
      (12, 'A', 'A no puede publicar sin pin', format(cj, j9, 'null', 'null', 'Calle 1', '1', null, null), 'err:Marcá la ubicación'),
      (13, 'A', 'A no puede publicar con solo la latitud', format(cj, j9, -35.43, 'null', 'Calle 1', '1', null, null), 'err:Marcá la ubicación'),
      (14, 'A', 'A publica un pedido en Buenos Aires: otra ciudad vale (Fase 8)', format(cj, j3, -34.6037, -58.3816, 'Corrientes', '1234', null, null), 'ok'),
      (15, 'A', 'A no puede publicar un pin en el océano Atlántico (fuera de Argentina)', format(cj, j9, -40.0, -50.0, 'Calle 1', '1', null, null), 'err:La ubicación marcada está fuera de Argentina'),
      (16, 'admin', 'Un pin en Ushuaia está dentro de Argentina', 'select private.check_in_argentina(-54.80, -68.30)', 'ok'),
      (27, 'admin', 'Un pin en Río de Janeiro queda fuera', 'select private.check_in_argentina(-22.90, -43.20)', 'err:fuera de Argentina'),
      (28, 'admin', 'Un pin en La Paz (Bolivia) queda fuera', 'select private.check_in_argentina(-16.50, -68.15)', 'err:fuera de Argentina'),
      (17, 'A', 'A no puede publicar una latitud imposible', format(cj, j9, 95, -60.17, 'Calle 1', '1', null, null), 'err:no es válida'),
      (18, 'A', 'A no puede publicar un pin NaN', format(cj, j9, '''NaN''::float8', -60.17, 'Calle 1', '1', null, null), 'err:no es válida'),
      (19, 'A', 'A no puede publicar un pin infinito', format(cj, j9, -35.43, '''-Infinity''::float8', 'Calle 1', '1', null, null), 'err:no es válida'),
      (20, 'A', 'A no puede publicar sin calle', format(cj, j9, -35.43, -60.17, ' ', '1', null, null), 'err:calle'),
      (21, 'A', 'A no puede publicar sin número', format(cj, j9, -35.43, -60.17, 'Calle 1', ' ', null, null), 'err:número'),
      (22, 'A', 'A no puede publicar un número de más de 10 letras', format(cj, j9, -35.43, -60.17, 'Calle 1', '12345678901', null, null), 'err:número'),
      (23, 'A', 'A no puede publicar entre calles de 2 letras', format(cj, j9, -35.43, -60.17, 'Calle 1', '1', 'ab', null), 'err:entre calles'),
      (24, 'A', 'A no puede publicar una zona de 1 letra', format(cj, j9, -35.43, -60.17, 'Calle 1', '1', null, 'X'), 'err:zona'),
      (25, 'A', 'A publica sin número de casa con «s/n» y con zona', format(cj, j2, -35.4350, -60.1750, 'Avenida 30', 's/n', null, 'Barrio Norte'), 'ok'),
      (26, 'A', 'Ningún intento rechazado dejó un pedido', format('select 1 from public.jobs where id = %L', j9), 'count:0'),

      -- Editar
      (30, 'A', 'A no puede mover el pin fuera de Argentina al editar', format(uj, j1, -40.0, -50.0, 'Calle 9', '1150', null, null), 'err:fuera de Argentina'),
      (31, 'A', 'A no puede sacar el pin al editar', format(uj, j1, 'null', 'null', 'Calle 9', '1150', null, null), 'err:Marcá la ubicación'),
      (32, 'A', 'A edita pin, número y zona; entre calles vacío queda null', format(uj, j1, -35.4310, -60.1710, 'Calle 9', '1152', '', 'Centro'), 'ok'),
      (33, 'A', 'El pedido editado tiene el pin, número y zona nuevos', format('select 1 from public.jobs where id = %L and location_lat = -35.431 and location_lng = -60.171 and address_number = ''1152'' and address_between is null and zone = ''Centro'' and price_ars = 16000', j1), 'count:1'),
      (34, 'B', 'B no puede editar el pedido de A', format(uj, j1, -35.43, -60.17, 'Robada', '1', null, null), 'err:No encontramos ese pedido'),
      (35, 'A', 'A no puede escribir el pin directo', format('update public.jobs set location_lat = 0 where id = %L', j1), 'err:permission denied'),

      -- Visibilidad: la dirección y el pin, sí; teléfono, apellido y ubicación base, no
      (40, 'B', 'B (cortador de la localidad) ve la dirección y el pin del pedido 1', format('select 1 from public.jobs where id = %L and address_street = ''Calle 9'' and address_number = ''1152'' and location_lat is not null', j1), 'count:1'),
      (41, 'B', 'B no ve el teléfono ni el apellido de A', format('select * from public.profile_private where user_id = %L', a), 'count:0'),
      (42, 'B', 'B no ve la ubicación base de B2', format('select * from public.profile_private where user_id = %L', b2), 'count:0'),
      (43, 'B', 'B no obtiene datos privados ajenos ni con join', 'select pp.* from public.jobs j join public.profile_private pp on pp.user_id = j.client_id', 'count:0'),
      (44, 'A', 'A no ve la ubicación base de ningún cortador', format('select * from public.profile_private where user_id in (%L, %L, %L)', b, b2, d), 'count:0'),
      (45, 'C', 'C (sin rol de cortador) no ve los pedidos de A ni su dirección', format('select address_street from public.jobs where client_id = %L', a), 'count:0'),
      (46, 'D', 'D (otra localidad) ve los 3 pedidos publicados de A con su dirección: la localidad ya no filtra (Fase 8)', format('select address_street from public.jobs where client_id = %L', a), 'count:3'),
      (47, 'E', 'E (sin perfil) no ve pedidos', 'select * from public.jobs', 'count:0'),
      (48, 'admin', 'profiles (público) no tiene ubicación, teléfono ni apellido', 'select 1 from information_schema.columns where table_schema = ''public'' and table_name = ''profiles'' and column_name ilike any (array[''%lat%'', ''%lng%'', ''%base%'', ''%phone%'', ''%last_name%''])', 'count:0'),
      (49, 'admin', 'Ninguna RPC devuelve la ubicación base', 'select 1 from pg_proc where pronamespace = ''public''::regnamespace and pg_get_function_result(oid) ilike ''%base_l%''', 'count:0'),

      -- Ubicación base
      (50, 'B', 'B guarda su ubicación base', 'select public.set_my_base_location(-35.4405, -60.1735)', 'ok'),
      (51, 'B', 'B ve su propia ubicación base', format('select 1 from public.profile_private where user_id = %L and base_lat = -35.4405 and base_lng = -60.1735', b), 'count:1'),
      (52, 'B', 'B no puede guardar una ubicación base fuera de Argentina', 'select public.set_my_base_location(-40.0, -50.0)', 'err:fuera de Argentina'),
      (53, 'B', 'B no puede guardar solo la latitud', 'select public.set_my_base_location(-35.44, null)', 'err:Marcá la ubicación'),
      (54, 'B', 'B no puede guardar una ubicación NaN', 'select public.set_my_base_location(''NaN''::float8, -60.17)', 'err:no es válida'),
      (55, 'B', 'La ubicación de B no cambió con los intentos rechazados', format('select 1 from public.profile_private where user_id = %L and base_lat = -35.4405', b), 'count:1'),
      (56, 'B', 'B no puede escribir su ubicación base directo', format('update public.profile_private set base_lat = 0 where user_id = %L', b), 'err:permission denied'),
      (57, 'E', 'E (sin perfil) no puede guardar una ubicación base', 'select public.set_my_base_location(-35.43, -60.17)', 'err:completá tu perfil'),
      (58, 'D', 'D (otra localidad) guarda su casa en 25 de Mayo: la localidad ya no limita (Fase 8)', 'select public.set_my_base_location(-35.43, -60.17)', 'ok'),

      -- Contacto con el trabajo asignado (preparado por admin: B elegido, B2 no elegido)
      (60, 'admin', '(preparación) B y B2 se postularon al pedido 2; eligen a B', format(
        'with x as (insert into public.applications (id, job_id, cutter_id, status) values (%L, %L, %L, ''aceptada''), (%L, %L, %L, ''rechazada'') returning 1),
              y as (update public.jobs set status = ''asignado'' where id = %L returning 1)
         insert into public.job_agreements (job_id, application_id, client_id, cutter_id, price_ars, agreed_at)
         values (%L, %L, %L, %L, 15000, now() + interval ''2 days'')',
        app_b, j2, b, app_b2, j2, b2, j2, j2, app_b, a, b), 'ok'),
      (61, 'B', 'B (elegido) recibe apellido y WhatsApp de A por get_job_contact', format('select 1 from public.get_job_contact(%L) where last_name = ''Álvarez'' and phone_e164 = ''+5492345111111''', j2), 'count:1'),
      (62, 'A', 'A recibe apellido y WhatsApp de B, nunca su ubicación base', format('select 1 from public.get_job_contact(%L) c where c.last_name = ''Benítez'' and c.phone_e164 = ''+5492345222222'' and to_jsonb(c)::text not like ''%%-35.4405%%''', j2), 'count:1'),
      (63, 'B2', 'B2 (no elegido) no recibe el contacto', format('select * from public.get_job_contact(%L)', j2), 'err:No encontramos los datos'),
      (64, 'B2', 'B2 ve la dirección del pedido en el que se postuló, pero no el teléfono ni el apellido', format('select 1 from public.jobs j where j.id = %L and j.address_street = ''Avenida 30'' and not exists (select 1 from public.profile_private pp where pp.user_id = j.client_id)', j2), 'count:1'),
      (65, 'C', 'C (tercero) no recibe el contacto', format('select * from public.get_job_contact(%L)', j2), 'err:No encontramos los datos'),
      (66, 'admin', 'get_job_contact ya no devuelve la dirección (está en jobs)', 'select 1 from pg_proc where proname = ''get_job_contact'' and pg_get_function_result(oid) ilike ''%address%''', 'count:0'),

      -- Fase 8: la localidad no se elige; guardar el perfil no toca la ubicación base
      (70, 'B2', 'B2 guarda su perfil (firma nueva, sin localidad)', format(prof, 'Bruno', 'Bustos', '+5492345222333', false, true, b2 || '/yo.jpg'), 'ok'),
      (71, 'B2', 'La ubicación base de B2 sigue', format('select 1 from public.profile_private where user_id = %L and base_lat = -35.44 and base_lng = -60.18', b2), 'count:1'),
      (72, 'B', 'B guarda su perfil', format(prof, 'Beto', 'Benítez', '+5492345222222', false, true, b || '/yo.jpg'), 'ok'),
      (73, 'B', 'La ubicación base de B sigue', format('select 1 from public.profile_private where user_id = %L and base_lat = -35.4405', b), 'count:1'),

      -- Avisos: llevan la dirección, nunca teléfono, apellido ni ubicación base
      (80, 'B', 'B se postula al pedido 1', format('select public.apply_to_job(%L)', j1), 'ok'),
      (81, 'admin', 'El aviso a A lleva la dirección del pedido', format('select 1 from public.notifications where user_id = %L and kind = ''postulacion_nueva'' and job_id = %L and payload->>''address'' = ''Calle 9 1152'' and payload->>''zone'' = ''Centro''', a, j1), 'count:1'),
      (82, 'admin', 'Ningún aviso de la prueba lleva teléfonos, apellidos ni ubicaciones', format('select 1 from public.notifications where user_id in (%L, %L, %L) and (payload::text ~ ''\+549|Benítez|Álvarez|-35\.44'' or payload ? ''base_lat'' or payload ? ''location_lat'')', a, b, b2), 'count:0'),
      (83, 'admin', 'private.notify rechaza un campo fuera de la lista blanca', format('select private.notify(%L, ''x'', null, null, ''{"phone_e164": "+5492345111111"}''::jsonb, ''x'')', a), 'err:no permitido'),
      (84, 'admin', '(preparación) aviso sin pedido', format('select private.notify(%L, ''postulacion_retirada'', null, null, ''{}''::jsonb, ''prueba-sin-pedido'')', a), 'ok'),
      (85, 'admin', 'Un aviso sin pedido no inventa dirección', format('select 1 from public.notifications where user_id = %L and dedupe_key = ''prueba-sin-pedido'' and not payload ? ''address''', a), 'count:1'),

      -- Estructura
      (90, 'admin', 'job_private ya no existe', 'select 1 where to_regclass(''public.job_private'') is null', 'count:1'),
      (91, 'admin', 'create_job y update_job tienen una sola firma (la del pin)', 'select 1 from pg_proc where pronamespace = ''public''::regnamespace and proname in (''create_job'', ''update_job'') and pg_get_function_identity_arguments(oid) like ''%p_location_lat%''', 'count:2'),
      (92, 'admin', 'No quedan firmas viejas de create_job, update_job ni check_job_input', 'select 1 from pg_proc where proname in (''create_job'', ''update_job'', ''check_job_input'') and pg_get_function_identity_arguments(oid) not like ''%lat%''', 'count:0'),
      (93, 'admin', 'set_my_base_location es SECURITY DEFINER con search_path vacío', 'select 1 from pg_proc where pronamespace = ''public''::regnamespace and proname = ''set_my_base_location'' and prosecdef and proconfig @> array[''search_path=""'']', 'count:1'),
      (94, 'admin', 'anon no ejecuta las RPCs de ubicación', 'select 1 from pg_proc p where p.pronamespace = ''public''::regnamespace and p.proname in (''create_job'', ''update_job'', ''set_my_base_location'') and has_function_privilege(''anon'', p.oid, ''execute'')', 'count:0'),
      (95, 'admin', 'authenticated no ejecuta las validaciones internas de ubicación (distance_m sí: es solo cuenta, la usa get_available_jobs)', 'select 1 from pg_proc p where p.pronamespace = ''private''::regnamespace and p.proname in (''check_location'', ''check_in_argentina'', ''check_job_input'') and has_function_privilege(''authenticated'', p.oid, ''execute'')', 'count:0'),
      (96, 'admin', '25 de Mayo es la única localidad por defecto (centro del mapa)', 'select 1 from public.localities where is_default and slug = ''25-de-mayo-bsas'' and center_lat between -35.44 and -35.42 and center_lng between -60.18 and -60.16', 'count:1'),
      (97, 'admin', 'Todos los pedidos con dueño (también los reales) tienen dirección', 'select 1 from public.jobs where address_street is null and client_id is not null', 'count:0'),
      (98, 'admin', 'La distancia de private.distance_m es la esperada (centro → 9 km al este)', 'select 1 where round(private.distance_m(-35.4324152, -60.171624, -35.4324152, -60.0724)) between 8950 and 9050', 'count:1')
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
          json_build_object('sub', case t.who when 'A' then a when 'B' then b when 'B2' then b2 when 'C' then c when 'D' then d else e end,
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

  raise exception 'INFORME FASE 7 · % de % casos OK%', v_total - v_fails, v_total, v_report;
end
$test$;
