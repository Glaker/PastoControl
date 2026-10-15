-- Pruebas de seguridad · Fase 5 (mark_job_done, rate_job, has_rated_job, get_profile_stats,
-- estadísticas en get_job_applicants, contacto con el trabajo realizado, volver a publicar).
--
-- Cómo funciona: igual que las fases anteriores. Al final hace RAISE EXCEPTION con el informe: eso
-- deshace TODA la transacción. Buscá "FALLA" en el informe.
--
-- Usuarios:
--   A  = cliente
--   B  = cortador elegido en el pedido 1
--   B2 = cortador no elegido en el pedido 1
--   C  = tercero (cliente sin rol de cortador)
--
-- Las calificaciones "de la semana pasada" para probar el lote semanal se insertan como admin con
-- created_at antes del lunes 00:00 de esta semana (zona de la localidad), en pedidos de relleno.
--
-- Esperado: 'ok' | 'err:<fragmento>' | 'count:<n>' | 'affected:<n>'

do $test$
declare
  a uuid := '00000000-0000-4000-a000-00000000000a';
  b uuid := '00000000-0000-4000-a000-00000000000b';
  b2 uuid := '00000000-0000-4000-a000-0000000000b2';
  c uuid := '00000000-0000-4000-a000-00000000000c';
  j1 uuid := '00000000-0000-4000-b000-000000000001';
  j2 uuid := '00000000-0000-4000-b000-000000000002';
  j7 uuid := '00000000-0000-4000-b000-000000000007';
  j8 uuid := '00000000-0000-4000-b000-000000000008';
  loc smallint;
  tz text;
  last_week timestamptz;
  t record;
  v_count bigint;
  v_err text;
  v_ok boolean;
  v_report text := '';
  v_fails int := 0;
  v_total int := 0;
  accept text := 'select public.accept_application(a.id, a.updated_at) from public.applications a where a.job_id = %L and a.cutter_id = %L';
  old_rating text := 'insert into public.ratings (job_id, rater_id, ratee_id, would_work_again, created_at) values (%L, %L, %L, %L::boolean, %L)';
  stats text := 'select 1 from public.get_profile_stats(%L) where done_as_cutter is not distinct from %s and yes_pct is not distinct from %s';
begin
  select id, timezone into loc, tz from public.localities where slug = '25-de-mayo-bsas';
  last_week := (date_trunc('week', now() at time zone tz) at time zone tz) - interval '1 day';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', m, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
  from (values
    (a, 'prueba-a@pastocontrol.test'), (b, 'prueba-b@pastocontrol.test'), (b2, 'prueba-b2@pastocontrol.test'),
    (c, 'prueba-c@pastocontrol.test')
  ) as v(u, m);
  insert into storage.objects (bucket_id, name, owner_id) values
    ('avatars', b || '/yo.jpg', b), ('avatars', b2 || '/yo.jpg', b2);
  insert into public.profiles (id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter) values
    (a, loc, 'Ana', 'Á', null, true, false),
    (b, loc, 'Beto', 'B', b || '/yo.jpg', false, true),
    (b2, loc, 'Bruno', 'B', b2 || '/yo.jpg', false, true),
    (c, loc, 'Carla', 'C', null, true, false);
  insert into public.profile_private (user_id, last_name, phone_e164) values
    (a, 'Álvarez', '+5492345111111'), (b, 'Benítez', '+5492345222222'), (b2, 'Bustos', '+5492345222333'),
    (c, 'Castro', '+5492345333333');

  insert into public.jobs (id, client_id, locality_id, zone, address_street, address_number, location_lat, location_lng, price_ars, desired_at) values
    (j1, a, loc, 'Barrio Centro', 'Calle Falsa', '123', -35.4324, -60.1716, 15000, now() + interval '2 days'),
    (j2, a, loc, 'Villa Sanz', 'Mitre', '450', -35.4300, -60.1700, 15000, now() + interval '3 days'),
    (j7, a, loc, 'El Ombú', 'Belgrano', '9', -35.4280, -60.1650, 15000, now() + interval '4 days');
  -- Pedidos de relleno para las calificaciones viejas (la clave es job_id + rater_id).
  -- Cancelados, para que no cuenten en el límite de 5 pedidos publicados de A.
  insert into public.jobs (id, client_id, locality_id, zone, address_street, price_ars, desired_at, status, cancelled_at)
  select ('00000000-0000-4000-c000-00000000000' || g)::uuid, a, loc, 'Relleno', 'Relleno 1', 15000, now() + interval '1 day', 'cancelado', now()
  from generate_series(1, 7) g;

  for t in
    select * from (values
      -- anon
      (1, 'anon', 'anon no puede marcar realizado', format('select public.mark_job_done(%L)', j1), 'err:permission denied'),
      (2, 'anon', 'anon no puede calificar', format('select public.rate_job(%L, true)', j1), 'err:permission denied'),
      (3, 'anon', 'anon no puede pedir estadísticas', format('select * from public.get_profile_stats(%L)', b), 'err:permission denied'),
      (4, 'anon', 'anon no puede leer calificaciones', 'select * from public.ratings', 'err:permission denied'),
      (5, 'anon', 'anon no puede preguntar si calificó', format('select public.has_rated_job(%L)', j1), 'err:permission denied'),

      -- Preparación: B y B2 se postulan, A elige a B
      (10, 'B', 'B se postula al pedido 1', format('select public.apply_to_job(%L)', j1), 'ok'),
      (11, 'B2', 'B2 se postula al pedido 1', format('select public.apply_to_job(%L)', j1), 'ok'),
      (12, 'A', 'A elige a B', format(accept, j1, b), 'ok'),
      (13, 'B', 'B se postula al pedido 2', format('select public.apply_to_job(%L)', j2), 'ok'),
      (14, 'A', 'A elige a B en el pedido 2', format(accept, j2, b), 'ok'),

      -- Marcar realizado
      (20, 'B', 'B no puede marcar realizado antes del día acordado', format('select public.mark_job_done(%L)', j1), 'err:desde el día acordado'),
      (21, 'admin', '(preparación) el día acordado del pedido 1 pasa a ser hoy', format('update public.job_agreements set agreed_at = now() - interval ''1 minute'' where job_id = %L', j1), 'affected:1'),
      (22, 'B2', 'B2 (no elegido) no puede marcar realizado', format('select public.mark_job_done(%L)', j1), 'err:No encontramos ese trabajo'),
      (23, 'C', 'C (tercero) no puede marcar realizado', format('select public.mark_job_done(%L)', j1), 'err:No encontramos ese trabajo'),
      (24, 'B', 'B no puede calificar antes de que esté realizado', format('select public.rate_job(%L, true)', j1), 'err:marcado como realizado'),
      (25, 'A', 'A (cliente) marca realizado el pedido 1', format('select public.mark_job_done(%L)', j1), 'ok'),
      (26, 'admin', 'El pedido 1 queda realizado y el acuerdo con done_at y done_by = A', format('select 1 from public.jobs j join public.job_agreements g on g.job_id = j.id where j.id = %L and j.status = ''realizado'' and g.done_at is not null and g.done_by = %L', j1, a), 'count:1'),
      (27, 'admin', 'B recibió "trabajo_realizado" con el nombre visible de A', format('select 1 from public.notifications where user_id = %L and kind = ''trabajo_realizado'' and job_id = %L and payload->>''actor_name'' = ''Ana Á.''', b, j1), 'count:1'),
      (28, 'B', 'B no puede volver a marcarlo', format('select public.mark_job_done(%L)', j1), 'err:ya estaba marcado'),
      (29, 'A', 'Un pedido realizado no se puede cancelar', format('select public.cancel_job(%L)', j1), 'err:realizado no se puede cancelar'),

      -- Contacto con el trabajo realizado
      (30, 'A', 'A sigue recibiendo el contacto de B con el trabajo realizado', format('select 1 from public.get_job_contact(%L) where phone_e164 = ''+5492345222222''', j1), 'count:1'),
      (31, 'B', 'B sigue recibiendo el contacto de A con el trabajo realizado', format('select 1 from public.get_job_contact(%L) where last_name = ''Álvarez'' and phone_e164 = ''+5492345111111''', j1), 'count:1'),
      (32, 'B2', 'B2 no recibe el contacto del realizado', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),
      (33, 'C', 'C no recibe el contacto del realizado', format('select * from public.get_job_contact(%L)', j1), 'err:No encontramos los datos'),
      (34, 'B2', 'B2 no lee el acuerdo del realizado', 'select * from public.job_agreements', 'count:0'),

      -- Calificar
      (40, 'B2', 'B2 (no elegido) no puede calificar', format('select public.rate_job(%L, false)', j1), 'err:No encontramos ese trabajo'),
      (41, 'C', 'C (tercero) no puede calificar', format('select public.rate_job(%L, false)', j1), 'err:No encontramos ese trabajo'),
      (42, 'A', 'A califica a B: sí', format('select public.rate_job(%L, true)', j1), 'ok'),
      (43, 'A', 'A no puede calificar dos veces', format('select public.rate_job(%L, false)', j1), 'err:Ya calificaste'),
      (44, 'B', 'B califica a A: no', format('select public.rate_job(%L, false)', j1), 'ok'),
      (45, 'admin', 'Las calificaciones quedaron cruzadas (A→B sí, B→A no)', format('select 1 from public.ratings where job_id = %L and ((rater_id = %L and ratee_id = %L and would_work_again) or (rater_id = %L and ratee_id = %L and not would_work_again))', j1, a, b, b, a), 'count:2'),
      (46, 'A', 'A sabe que ya calificó', format('select 1 where public.has_rated_job(%L)', j1), 'count:1'),
      (47, 'C', 'Para C, has_rated_job da falso', format('select 1 where not public.has_rated_job(%L)', j1), 'count:1'),
      (48, 'A', 'A no puede leer calificaciones (ni las suyas)', 'select * from public.ratings', 'err:permission denied'),
      (49, 'B', 'B no puede leer la calificación que recibió', 'select * from public.ratings', 'err:permission denied'),
      (50, 'B', 'B no puede insertar calificaciones directo', format('insert into public.ratings (job_id, rater_id, ratee_id, would_work_again) values (%L, %L, %L, true)', j2, b, a), 'err:permission denied'),
      (51, 'A', 'A no puede calificar un trabajo asignado (no realizado)', format('select public.rate_job(%L, true)', j2), 'err:marcado como realizado'),

      -- Estadísticas: umbral de 5, lote semanal, redondeo
      (60, 'C', 'Stats de B: 1 realizado como cortador, % oculto (1 sola calificación y es de esta semana)', format(stats, b, 1, 'null'), 'count:1'),
      (61, 'admin', '(preparación) 4 calificaciones de la semana pasada para B: 3 sí, 1 no', format(old_rating, '00000000-0000-4000-c000-000000000001', a, b, true, last_week) || '; ' || format(old_rating, '00000000-0000-4000-c000-000000000002', a, b, true, last_week) || '; ' || format(old_rating, '00000000-0000-4000-c000-000000000003', a, b, true, last_week) || '; ' || format(old_rating, '00000000-0000-4000-c000-000000000004', a, b, false, last_week), 'ok'),
      (62, 'C', 'Con 4 que cuentan (la de esta semana no), el % sigue oculto', format(stats, b, 1, 'null'), 'count:1'),
      (63, 'admin', '(preparación) una más de la semana pasada: sí (5 en total: 4 sí)', format(old_rating, '00000000-0000-4000-c000-000000000005', a, b, true, last_week), 'ok'),
      (64, 'C', 'Con 5: 4 de 5 = 80 %', format(stats, b, 1, 80), 'count:1'),
      (65, 'admin', '(preparación) una más de la semana pasada: sí (6: 5 sí = 83,3 %)', format(old_rating, '00000000-0000-4000-c000-000000000006', a, b, true, last_week), 'ok'),
      (66, 'C', '83,3 % se redondea a la decena: 80 %', format(stats, b, 1, 80), 'count:1'),
      (67, 'admin', '(preparación) una de ESTA semana: no (no tiene que contar todavía)', format(old_rating, j2, c, b, false, now()), 'ok'),
      (68, 'B2', 'Cualquiera logueado ve las estadísticas públicas de B', format(stats, b, 1, 80), 'count:1'),
      (72, 'admin', '(preparación) una más de la semana pasada: sí (7: 6 sí = 85,7 %)', format(old_rating, '00000000-0000-4000-c000-000000000007', a, b, true, last_week), 'ok'),
      (73, 'C', '85,7 % se redondea a la decena: 90 %', format(stats, b, 1, 90), 'count:1'),
      (69, 'admin', 'get_profile_stats nunca devuelve la cantidad de calificaciones', 'select 1 from pg_proc where proname in (''get_profile_stats'', ''get_job_applicants'') and pg_get_function_result(oid) ilike any (array[''%count%'', ''%total%'', ''%ratings%''])', 'count:0'),
      (70, 'C', 'Stats de A como cliente: 1 realizado, % oculto', format('select 1 from public.get_profile_stats(%L) where done_as_client = 1 and done_as_cutter = 0 and yes_pct is null', a), 'count:1'),
      (71, 'C', 'Stats de un perfil que no existe: error', format('select * from public.get_profile_stats(%L)', j1), 'err:No encontramos ese perfil'),

      -- Postulantes con estadísticas
      (80, 'B', 'B se postula al pedido 7', format('select public.apply_to_job(%L)', j7), 'ok'),
      (81, 'A', 'En la lista de postulantes, B trae 1 realizado y 90 %', format('select 1 from public.get_job_applicants(%L) where cutter_id = %L and done_jobs = 1 and yes_pct = 90', j7, b), 'count:1'),

      -- Volver a publicar
      (90, 'A', 'A vuelve a publicar el pedido realizado', format('select public.create_job(%L, -35.4324, -60.1716, ''Calle Falsa'', ''123'', 15000, now() + interval ''7 days'', null, ''Barrio Centro'', null, ''{}'', %L)', j8, j1), 'ok'),
      (91, 'admin', 'El pedido nuevo queda publicado y apunta al original', format('select 1 from public.jobs where id = %L and status = ''publicado'' and republished_from = %L', j8, j1), 'count:1'),
      (92, 'C', 'C no puede volver a publicar el pedido de A', format('select public.create_job(gen_random_uuid(), -35.4324, -60.1716, ''Calle'', ''1'', 15000, now() + interval ''1 day'', null, null, null, ''{}'', %L)', j1), 'err:volver a publicar'),

      -- Estructura
      (95, 'admin', 'ratings: RLS activo, sin políticas', 'select 1 from pg_class c where c.oid = ''public.ratings''::regclass and c.relrowsecurity and not exists (select 1 from pg_policies p where p.tablename = ''ratings'')', 'count:1'),
      (96, 'admin', 'ratings: sin permisos para anon ni authenticated', 'select 1 from information_schema.role_table_grants where table_schema = ''public'' and table_name = ''ratings'' and grantee in (''anon'', ''authenticated'')', 'count:0'),
      (97, 'admin', 'Las RPCs nuevas son SECURITY DEFINER con search_path vacío', 'select 1 from pg_proc where pronamespace = ''public''::regnamespace and proname in (''mark_job_done'', ''rate_job'', ''has_rated_job'', ''get_profile_stats'') and prosecdef and proconfig @> array[''search_path=""'']', 'count:4'),
      (98, 'admin', 'anon no puede ejecutar las RPCs nuevas', 'select 1 from pg_proc p where p.pronamespace = ''public''::regnamespace and p.proname in (''mark_job_done'', ''rate_job'', ''has_rated_job'', ''get_profile_stats'') and has_function_privilege(''anon'', p.oid, ''execute'')', 'count:0'),
      (99, 'admin', 'authenticated no puede ejecutar private.profile_stats', 'select 1 from pg_proc p where p.pronamespace = ''private''::regnamespace and p.proname = ''profile_stats'' and has_function_privilege(''authenticated'', p.oid, ''execute'')', 'count:0')
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
          json_build_object('sub', case t.who when 'A' then a when 'B' then b when 'B2' then b2 else c end,
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

  raise exception 'INFORME FASE 5 · % de % casos OK%', v_total - v_fails, v_total, v_report;
end
$test$;
