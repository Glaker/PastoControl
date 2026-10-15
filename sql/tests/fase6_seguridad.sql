-- Pruebas de seguridad · Fase 6 (push_subscriptions, save_push_subscription, delete_push_subscription,
-- trigger notifications_queue_push con el secreto compartido x-push-secret, 0023).
--
-- Cómo funciona: igual que las fases anteriores. Al final hace RAISE EXCEPTION con el informe: eso
-- deshace TODA la transacción (también los pedidos HTTP que pg_net encoló: solo salen si se confirma).
-- Buscá "FALLA" en el informe.
--
-- Usuarios:
--   A = cliente con dispositivos
--   B = cortador
--   C = cliente sin dispositivos
--   E = usuario sin perfil
--
-- Esperado: 'ok' | 'err:<fragmento>' | 'count:<n>' | 'affected:<n>'

do $test$
declare
  a uuid := '00000000-0000-4000-a000-00000000000a';
  b uuid := '00000000-0000-4000-a000-00000000000b';
  c uuid := '00000000-0000-4000-a000-00000000000c';
  e uuid := '00000000-0000-4000-a000-00000000000e';
  j1 uuid := '00000000-0000-4000-b000-000000000001';
  j3 uuid := '00000000-0000-4000-b000-000000000003';
  loc smallint;
  t record;
  v_count bigint;
  v_err text;
  v_ok boolean;
  v_report text := '';
  v_fails int := 0;
  v_total int := 0;
  -- Claves con el formato real (65 y 16 bytes en base64url).
  k1 text := 'B' || repeat('a', 86);
  k2 text := 'B' || repeat('b', 86);
  s1 text := repeat('c', 22);
  fcm text := 'https://fcm.googleapis.com/fcm/send/prueba-dispositivo-1';
  apple text := 'https://web.push.apple.com/prueba-dispositivo-2';
  save text := 'select public.save_push_subscription(%L, %L, %L)';
  queued text := 'select 1 from net.http_request_queue q join public.notifications n on convert_from(q.body, ''UTF8'')::jsonb = jsonb_build_object(''notification_id'', n.id) where n.user_id = %L and n.job_id = %L and q.method = ''POST'' and q.url = (select decrypted_secret from vault.decrypted_secrets where name = ''push_function_url'')';
begin
  select id into loc from public.localities where slug = '25-de-mayo-bsas';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', m, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
  from (values
    (a, 'prueba-a@pastocontrol.test'), (b, 'prueba-b@pastocontrol.test'), (c, 'prueba-c@pastocontrol.test'),
    (e, 'prueba-e@pastocontrol.test')
  ) as v(u, m);
  insert into storage.objects (bucket_id, name, owner_id) values ('avatars', b || '/yo.jpg', b);
  insert into public.profiles (id, locality_id, first_name, last_initial, avatar_path, is_client, is_cutter) values
    (a, loc, 'Ana', 'Á', null, true, false),
    (b, loc, 'Beto', 'B', b || '/yo.jpg', false, true),
    (c, loc, 'Carla', 'C', null, true, false);
  insert into public.profile_private (user_id, last_name, phone_e164) values
    (a, 'Álvarez', '+5492345111111'), (b, 'Benítez', '+5492345222222'), (c, 'Castro', '+5492345333333');
  insert into public.jobs (id, client_id, locality_id, zone, price_ars, desired_at) values
    (j1, a, loc, 'Barrio Centro', 15000, now() + interval '2 days'),
    (j3, c, loc, 'Villa Sanz', 15000, now() + interval '3 days');
  insert into public.job_private (job_id, address) values (j1, 'Calle Falsa 123'), (j3, 'Mitre 450');

  for t in
    select * from (values
      -- anon
      (1, 'anon', 'anon no puede guardar un dispositivo', format(save, fcm, k1, s1), 'err:permission denied'),
      (2, 'anon', 'anon no puede borrar un dispositivo', format('select public.delete_push_subscription(%L)', fcm), 'err:permission denied'),
      (3, 'anon', 'anon no puede leer push_subscriptions', 'select * from public.push_subscriptions', 'err:permission denied'),

      -- Acceso directo a la tabla
      (10, 'A', 'A no puede leer push_subscriptions (ni las suyas)', 'select * from public.push_subscriptions', 'err:permission denied'),
      (11, 'A', 'A no puede insertar directo', format('insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (%L, %L, %L, %L)', a, fcm, k1, s1), 'err:permission denied'),
      (12, 'A', 'A no puede borrar directo', 'delete from public.push_subscriptions', 'err:permission denied'),
      (13, 'A', 'A no puede marcar pushed_at en sus avisos', 'update public.notifications set pushed_at = now()', 'err:permission denied'),
      (14, 'A', 'A no puede llamar al trigger', 'select private.queue_push()', 'err:permission denied'),
      (15, 'A', 'A no puede usar la validación interna', format('select private.is_push_endpoint(%L)', fcm), 'err:permission denied'),

      -- Validaciones de save_push_subscription
      (20, 'E', 'E (sin perfil) no puede guardar un dispositivo', format(save, fcm, k1, s1), 'err:Completá tu perfil'),
      (21, 'A', 'Endpoint http (no https)', format(save, 'http://fcm.googleapis.com/fcm/send/x', k1, s1), 'err:no es compatible'),
      (22, 'A', 'Endpoint de un host cualquiera', format(save, 'https://evil.example.com/fcm/send/x', k1, s1), 'err:no es compatible'),
      (23, 'A', 'Endpoint que imita el host (fcm.googleapis.com.evil.com)', format(save, 'https://fcm.googleapis.com.evil.com/x', k1, s1), 'err:no es compatible'),
      (24, 'A', 'Endpoint con credenciales (fcm.googleapis.com@evil.com)', format(save, 'https://fcm.googleapis.com@evil.com/x', k1, s1), 'err:no es compatible'),
      (25, 'A', 'Endpoint de más de 1000 caracteres', format(save, 'https://fcm.googleapis.com/' || repeat('x', 1000), k1, s1), 'err:no es compatible'),
      (26, 'A', 'p256dh inválida', format(save, fcm, 'corta', s1), 'err:No pudimos activar'),
      (27, 'A', 'auth inválido', format(save, fcm, k1, 'no válido!'), 'err:No pudimos activar'),
      (28, 'A', 'Endpoint null', format('select public.save_push_subscription(null, %L, %L)', k1, s1), 'err:no es compatible'),

      -- Guardar, actualizar, pasar de cuenta, borrar
      (30, 'A', 'A guarda su dispositivo (Chrome)', format(save, fcm, k1, s1), 'ok'),
      (31, 'admin', 'Queda una fila de A', format('select 1 from public.push_subscriptions where user_id = %L and endpoint = %L', a, fcm), 'count:1'),
      (32, 'A', 'A lo vuelve a guardar con otra clave', format(save, fcm, k2, s1), 'ok'),
      (33, 'admin', 'Sigue habiendo una sola fila, con la clave nueva', format('select 1 from public.push_subscriptions where endpoint = %L and p256dh = %L', fcm, k2), 'count:1'),
      (34, 'B', 'B inicia sesión en el mismo navegador y lo guarda', format(save, fcm, k1, s1), 'ok'),
      (35, 'admin', 'El dispositivo pasó a B (una sola fila)', format('select 1 from public.push_subscriptions where endpoint = %L and user_id = %L', fcm, b), 'count:1'),
      (36, 'A', 'A ya no puede borrar ese dispositivo (es de B)', format('select 1 where not public.delete_push_subscription(%L)', fcm), 'count:1'),
      (37, 'admin', 'El dispositivo de B sigue', format('select 1 from public.push_subscriptions where endpoint = %L', fcm), 'count:1'),
      (38, 'B', 'B borra su dispositivo', format('select 1 where public.delete_push_subscription(%L)', fcm), 'count:1'),
      (39, 'admin', 'Ya no está', format('select 1 from public.push_subscriptions where endpoint = %L', fcm), 'count:0'),
      (40, 'A', 'A guarda un iPhone (Safari)', format(save, apple, k1, s1), 'ok'),
      (41, 'A', 'A guarda 11 dispositivos más', format('select public.save_push_subscription(%L || g, %L, %L) from generate_series(1, 11) g', fcm || '-', k1, s1), 'ok'),
      (42, 'admin', 'A queda con 10 dispositivos como máximo', format('select 1 from public.push_subscriptions where user_id = %L', a), 'count:10'),

      -- Trigger: al insertar un aviso se encola el POST a send-push solo para quien tiene dispositivos
      (50, 'B', 'B se postula al pedido de A (aviso para A)', format('select public.apply_to_job(%L)', j1), 'ok'),
      (51, 'admin', 'Se encoló un POST a send-push con solo el id del aviso de A', format(queued, a, j1), 'count:1'),
      (52, 'B', 'B se postula al pedido de C (C no tiene dispositivos)', format('select public.apply_to_job(%L)', j3), 'ok'),
      (53, 'admin', 'C recibió el aviso en la app', format('select 1 from public.notifications where user_id = %L and job_id = %L', c, j3), 'count:1'),
      (54, 'admin', 'Pero no se encoló ningún push para C', format(queued, c, j3), 'count:0'),
      (55, 'admin', 'El cuerpo encolado no lleva datos del aviso (ni zona, ni nombre, ni payload)', format('select 1 from net.http_request_queue q where q.url = (select decrypted_secret from vault.decrypted_secrets where name = ''push_function_url'') and (convert_from(q.body, ''UTF8'')::jsonb - ''notification_id'') <> ''{}''::jsonb'), 'count:0'),
      (56, 'admin', 'Los avisos nuevos arrancan sin pushed_at', format('select 1 from public.notifications where user_id in (%L, %L) and pushed_at is null', a, c), 'count:2'),
      (57, 'admin', 'El POST encolado lleva x-push-secret igual al de Vault', format('select 1 from net.http_request_queue q join public.notifications n on convert_from(q.body, ''UTF8'')::jsonb = jsonb_build_object(''notification_id'', n.id) where n.user_id = %L and q.headers->>''x-push-secret'' = (select decrypted_secret from vault.decrypted_secrets where name = ''push_webhook_secret'')', a), 'count:1'),

      -- Sin la URL en Vault el aviso igual se crea (el push nunca hace fallar la RPC)
      (60, 'admin', '(preparación) se esconde la URL de Vault', 'select vault.update_secret(id, new_name => ''push_function_url_oculta'') from vault.decrypted_secrets where name = ''push_function_url''', 'affected:1'),
      (61, 'B', 'B retira su postulación (aviso para A) sin URL de push', format('select public.withdraw_application(a.id) from public.applications a where a.job_id = %L and a.cutter_id = %L', j1, b), 'ok'),
      (62, 'admin', 'A recibió el aviso de retiro igual', format('select 1 from public.notifications where user_id = %L and kind = ''postulacion_retirada''', a), 'count:1'),
      (63, 'admin', '(preparación) vuelve la URL', 'select vault.update_secret(id, new_name => ''push_function_url'') from vault.decrypted_secrets where name = ''push_function_url_oculta''', 'affected:1'),
      (64, 'admin', 'Sin URL no se encoló nada para el aviso de retiro', format('select 1 from net.http_request_queue q join public.notifications n on convert_from(q.body, ''UTF8'')::jsonb = jsonb_build_object(''notification_id'', n.id) where n.user_id = %L and n.kind = ''postulacion_retirada''', a), 'count:0'),

      -- Sin el secreto en Vault tampoco se encola nada (la función lo rechazaría)
      (65, 'admin', '(preparación) se esconde el secreto de Vault', 'select vault.update_secret(id, new_name => ''push_webhook_secret_oculto'') from vault.decrypted_secrets where name = ''push_webhook_secret''', 'affected:1'),
      (66, 'B', 'B se vuelve a postular al pedido de A (aviso para A) sin secreto', format('select public.apply_to_job(%L)', j1), 'ok'),
      (67, 'admin', 'A tiene el aviso nuevo', format('select 1 from public.notifications where user_id = %L and kind = ''postulacion_nueva''', a), 'count:2'),
      (68, 'admin', 'Pero sigue habiendo un solo POST encolado para A (el del caso 50)', format('select 1 from net.http_request_queue q join public.notifications n on convert_from(q.body, ''UTF8'')::jsonb = jsonb_build_object(''notification_id'', n.id) where n.user_id = %L', a), 'count:1'),
      (69, 'admin', '(preparación) vuelve el secreto', 'select vault.update_secret(id, new_name => ''push_webhook_secret'') from vault.decrypted_secrets where name = ''push_webhook_secret_oculto''', 'affected:1'),

      -- Borrar la cuenta borra sus dispositivos (se mira la FK, sin borrar nada)
      (70, 'admin', 'push_subscriptions.user_id → profiles con on delete cascade', 'select 1 from pg_constraint where conname = ''push_subscriptions_user_id_fkey'' and confrelid = ''public.profiles''::regclass and confdeltype = ''c''', 'count:1')
    ) as v(n, who, label, sql, expected)
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
          json_build_object('sub', case t.who when 'A' then a when 'B' then b when 'C' then c else e end,
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

  raise exception 'INFORME FASE 6 · % de % casos OK%', v_total - v_fails, v_total, v_report;
end
$test$;
