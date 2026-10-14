-- Pruebas de seguridad · Fase 1 (localidades, perfiles, avatars).
--
-- Cómo funciona: crea usuarios de prueba A, B y C en auth.users, ejecuta cada caso con el rol
-- y el JWT de ese usuario (o como anon) y compara con lo esperado. Al final hace RAISE EXCEPTION
-- con el informe: eso deshace TODA la transacción, así que no queda nada en la base.
-- El informe aparece como mensaje de error; buscá "FALLA" en él.
--
-- Usuarios:
--   A = cliente que después agrega el rol de cortador
--   B = cliente y cortador
--   C = recién registrado, sin perfil

do $test$
declare
  a uuid := '00000000-0000-4000-a000-00000000000a';
  b uuid := '00000000-0000-4000-a000-00000000000b';
  c uuid := '00000000-0000-4000-a000-00000000000c';
  loc smallint;
  t record;
  v_count bigint;
  v_err text;
  v_ok boolean;
  v_report text := '';
  v_fails int := 0;
  v_total int := 0;
begin
  select id into loc from public.localities where slug = '25-de-mayo-bsas';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', e, '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
  from (values (a, 'prueba-a@pastocontrol.test'), (b, 'prueba-b@pastocontrol.test'), (c, 'prueba-c@pastocontrol.test')) as v(u, e);

  for t in
    select * from (values
      -- quien, descripción, sql, esperado ('ok' | 'err:<fragmento>' | 'count:<n>' | 'affected:<n>')
      (1,  'anon', 'anon no puede leer localidades', 'select * from public.localities', 'err:permission denied'),
      (2,  'anon', 'anon no puede leer perfiles', 'select * from public.profiles', 'err:permission denied'),
      (3,  'anon', 'anon no puede leer datos privados', 'select * from public.profile_private', 'err:permission denied'),
      (4,  'anon', 'anon no puede llamar a upsert_my_profile', format('select public.upsert_my_profile(''X'',''Y'',''+5492345123456'',%s::smallint,true,false)', loc), 'err:permission denied'),
      (5,  'A', 'A ve la localidad activa', 'select * from public.localities', 'count:1'),
      (6,  'A', 'A crea su perfil de cliente sin foto', format('select public.upsert_my_profile(''Ana'',''Álvarez'',''+5492345111111'',%s::smallint,true,false)', loc), 'ok'),
      (7,  'A', 'A no puede ser cortador sin foto', format('select public.upsert_my_profile(''Ana'',''Álvarez'',''+5492345111111'',%s::smallint,true,true)', loc), 'err:necesitás una foto'),
      (8,  'A', 'A no puede crear un perfil sin roles', format('select public.upsert_my_profile(''Ana'',''Álvarez'',''+5492345111111'',%s::smallint,false,false)', loc), 'err:al menos una opción'),
      (9,  'A', 'A no puede guardar un teléfono inválido', format('select public.upsert_my_profile(''Ana'',''Álvarez'',''+54234511'',%s::smallint,true,false)', loc), 'err:no es válido'),
      (10, 'A', 'A no puede usar una localidad inexistente', 'select public.upsert_my_profile(''Ana'',''Álvarez'',''+5492345111111'',999::smallint,true,false)', 'err:localidad'),
      (11, 'A', 'A sube una foto a su carpeta', format('insert into storage.objects (bucket_id, name, owner_id) values (''avatars'', %L, %L)', a || '/foto.jpg', a), 'ok'),
      (12, 'A', 'A no puede subir una foto a la carpeta de B', format('insert into storage.objects (bucket_id, name, owner_id) values (''avatars'', %L, %L)', b || '/intrusa.jpg', a), 'err:row-level security'),
      (13, 'A', 'A no puede subir fuera de una carpeta', 'insert into storage.objects (bucket_id, name) values (''avatars'', ''suelta.jpg'')', 'err:row-level security'),
      (14, 'B', 'B sube su foto', format('insert into storage.objects (bucket_id, name, owner_id) values (''avatars'', %L, %L)', b || '/yo.jpg', b), 'ok'),
      (15, 'A', 'A no puede poner como suya la foto de B', format('select public.upsert_my_profile(''Ana'',''Álvarez'',''+5492345111111'',%s::smallint,true,true,%L)', loc, b || '/yo.jpg'), 'err:no es tuya'),
      (16, 'A', 'A no puede apuntar a una foto que no existe', format('select public.upsert_my_profile(''Ana'',''Álvarez'',''+5492345111111'',%s::smallint,true,true,%L)', loc, a || '/no-existe.jpg'), 'err:No encontramos la foto'),
      (17, 'A', 'A agrega el rol de cortador con su foto', format('select public.upsert_my_profile(''Ana'',''Álvarez'',''+5492345111111'',%s::smallint,true,true,%L)', loc, a || '/foto.jpg'), 'ok'),
      (18, 'B', 'B crea su perfil con los dos roles', format('select public.upsert_my_profile(''Beto'',''Benítez'',''+5492345222222'',%s::smallint,true,true,%L)', loc, b || '/yo.jpg'), 'ok'),
      (19, 'B', 'B ve los perfiles públicos (A y B)', format('select * from public.profiles where id in (%L, %L, %L)', a, b, c), 'count:2'),
      (20, 'B', 'El perfil público de A muestra solo la inicial del apellido', format('select 1 from public.profiles where id = %L and first_name = ''Ana'' and last_initial = ''Á''', a), 'count:1'),
      (21, 'B', 'B solo ve SUS datos privados', 'select * from public.profile_private', 'count:1'),
      (22, 'B', 'B no ve el teléfono ni el apellido de A', format('select * from public.profile_private where user_id = %L', a), 'count:0'),
      (23, 'B', 'B no puede insertar perfiles directo', format('insert into public.profiles (id, locality_id, first_name, last_initial, is_client) values (%L, %s, ''X'', ''Y'', true)', c, loc), 'err:permission denied'),
      (24, 'B', 'B no puede modificar el perfil de A', format('update public.profiles set first_name = ''Hackeado'' where id = %L', a), 'err:permission denied'),
      (25, 'B', 'B no puede modificar ni su propio perfil directo (solo por RPC)', format('update public.profiles set is_cutter = false where id = %L', b), 'err:permission denied'),
      (26, 'B', 'B no puede borrar el perfil de A', format('delete from public.profiles where id = %L', a), 'err:permission denied'),
      (27, 'B', 'B no puede cambiar el teléfono de A', format('update public.profile_private set phone_e164 = ''+5492345999999'' where user_id = %L', a), 'err:permission denied'),
      (28, 'B', 'B no puede insertar localidades', 'insert into public.localities (slug, name, province, phone_area_code) values (''x'', ''X'', ''X'', ''2345'')', 'err:permission denied'),
      (29, 'B', 'B no puede renombrar la foto de A', format('update storage.objects set name = %L where bucket_id = ''avatars'' and name = %L', b || '/robada.jpg', a || '/foto.jpg'), 'affected:0'),
      (30, 'B', 'B puede ver la foto de A (lectura para logueados)', format('select 1 from storage.objects where bucket_id = ''avatars'' and name = %L', a || '/foto.jpg'), 'count:1'),
      (31, 'C', 'C (sin perfil) no ve datos privados de nadie', 'select * from public.profile_private', 'count:0'),
      (32, 'C', 'C ve los perfiles públicos', format('select * from public.profiles where id in (%L, %L, %L)', a, b, c), 'count:2'),
      (33, 'anon', 'anon no ve fotos de perfil', 'select * from storage.objects where bucket_id = ''avatars''', 'count:0'),
      (34, 'admin', 'Los datos de A siguen intactos', format('select 1 from public.profiles p join public.profile_private pp on pp.user_id = p.id where p.id = %L and p.first_name = ''Ana'' and pp.phone_e164 = ''+5492345111111'' and p.is_cutter', a), 'count:1'),
      (35, 'admin', 'profiles no tiene columnas de teléfono ni apellido', 'select 1 from information_schema.columns where table_schema = ''public'' and table_name = ''profiles'' and column_name in (''phone_e164'', ''last_name'')', 'count:0')
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
          json_build_object('sub', case t.who when 'A' then a when 'B' then b else c end, 'role', 'authenticated')::text, true);
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
      || lpad(t.n::text, 2) || ' [' || t.who || '] ' || t.label
      || case when coalesce(v_ok, false) then '' else ' (esperado ' || t.expected || '; obtuvo '
           || coalesce('error: ' || v_err, 'filas: ' || v_count) || ')' end;
  end loop;

  raise exception 'INFORME FASE 1 · % de % casos OK%', v_total - v_fails, v_total, v_report;
end
$test$;
