# PastoControl · Plan

Fuente de verdad para las próximas sesiones: decisiones, modelo, RPCs, fases, convenciones y estado.
Se actualiza al cerrar cada fase.

## Estado

| Fase | Contenido | Estado |
|------|-----------|--------|
| 0 | Base: Vite + React + Mantine + PWA + Supabase | ✅ terminada y commiteada |
| 1 | Cuentas, perfiles, avatars, onboarding, recuperar clave, actualización de la PWA | ✅ terminada y commiteada |
| 2 | Trabajos: jobs, job_private, job-photos, publicar/editar/cancelar, listas y detalles | ✅ terminada y commiteada |
| 3 | Postulaciones y notificaciones (bandeja + contador) | ✅ terminada y commiteada |
| 4 | Aceptación atómica, postulantes, contacto + WhatsApp, cancelaciones después de asignar, prueba de carrera | ✅ terminada y commiteada |
| 5 | Acuerdo en tabla aparte, marcar realizado, calificaciones, estadísticas, perfil público, volver a publicar | ✅ terminada y commiteada |
| 5b | Ajustes después de probar el deploy: un solo botón de perfil, WhatsApp neutro, «Sacar foto» / «Elegir de la galería» | ✅ terminada y commiteada |
| 6 | Web Push: avisos al celular, «Activar avisos», instalar la app (Android e iPhone) | 🟡 implementada, esperando revisión y prueba en el celular |
| 7 | Dirección visible, ubicación en el mapa y trabajos cercanos | 🟡 implementada, deployada y verificada; esperando revisión |
| 8 | Términos y privacidad, borrar la cuenta, cualquier ciudad (radio por distancia) | 🟡 paso 1 (0026) en la base y front listo; falta deploy del front y 0027 (destructivo) |

Deploy: https://pastocontrol.vercel.app (Vercel). El ciclo completo se probó en celular y PC.

## Producto

PWA para conseguir quién te corte el pasto. Arrancó en 25 de Mayo (Buenos Aires) y desde la Fase 8 sirve en
cualquier lugar de Argentina: la localidad ya no se elige ni filtra (queda solo para la zona horaria y el centro
del mapa por defecto, `localities.is_default`, nunca un valor fijo en el código).

- **Cliente:** publica su terreno con precio, fecha y hora.
- **Cortador:** se postula aceptando las condiciones o con contraoferta de precio y/o de horario.
- Cada pedido lleva su ubicación marcada en el mapa y la dirección escrita, que ven los cortadores (Fase 7).
  Los cortadores ven los trabajos a menos de 5, 10, 20 o 50 km (eligen ellos) de su ubicación actual o de su
  casa, del más cercano al más lejano, en lista o en mapa (Fase 8).
- Términos y política de privacidad públicos (`/terminos`, `/privacidad`, `/borrar-cuenta`), aceptados al
  registrarse y de nuevo cuando cambia la versión. Cada uno puede borrar su cuenta desde el perfil (Fase 8).
- El cliente acepta una postulación, se liberan el nombre completo y los WhatsApp, y al terminar se califican entre sí.
- Gratis: sin pagos ni chat dentro de la app. Tampoco publicidad ni verificación de identidad. Mapa con
  Leaflet y OpenStreetMap: sin Google Maps, sin geocodificación ni API de rutas.

Stack: React 19, TypeScript, Vite, Mantine 8, React Router, TanStack Query, supabase-js,
vite-plugin-pwa con service worker propio (`src/sw.ts`), deploy en Vercel. Base: Supabase,
operada con el MCP (limitado a este proyecto).

## Convenciones

### SQL
- Se ejecuta con `execute_sql` del MCP. **Nunca `apply_migration`** (más adelante se pasa a
  migraciones de la CLI y no tiene que haber un historial que choque).
- Cada SQL ejecutado se guarda en `sql/` numerado y en orden (`0001_…`, `0002_…`).
- Pruebas de seguridad en `sql/tests/faseN_seguridad.sql`: simulan usuarios con
  `set_config('role', 'authenticated')` + `request.jwt.claims`, y terminan con un `raise exception`
  a propósito (el informe) para que se deshaga todo. Después se verifica que no quedó rastro.
- **Escrituras:** solo por RPCs `SECURITY DEFINER`, con `set search_path = ''`, nombres calificados,
  `auth.uid()` validado al principio, `revoke all … from public, anon` y `grant execute … to authenticated`.
  Ninguna política de insert/update/delete en las tablas de negocio, y sin grants de escritura.
- **Sentencias destructivas** (DROP, DELETE, TRUNCATE, etc.): se prefieren alternativas no destructivas
  (`alter policy`, `create or replace`). Si hace falta una y requiere aprobación del dueño, se le pide y
  se espera su respuesta: nunca se saltea ni se deja como pendiente. (En las Fases 2 y 3 el MCP las
  rechazaba con «Invalid or expired requestState»; se arregló reconectando el servidor de Supabase
  desde `/mcp` en Claude Code. Si vuelve a pasar, reconectar y probar con
  `delete from public.localities where false`.) En la Fase 7 esa prueba pasó pero el SQL destructivo
  real se siguió rechazando hasta que el dueño estuvo presente para aprobar la confirmación: no sirve
  como garantía. Si falla, frenar y pedirle al dueño que esté para aprobar y reintentar.
- **Lecturas:** por RLS (`grant select` + política). Los datos privados viven en tablas aparte que
  solo lee el dueño, para que ni un `select *` ni un embed los filtren:
  - `profile_private`: apellido, teléfono y ubicación base del cortador (Fase 7).
  - (`job_private`, con la dirección, existió hasta la Fase 7: la dirección pasó a `jobs` y es visible.)
- Permisos por defecto de `anon` y `authenticated` revocados en `public` (0001). `anon` no lee nada.
- Schema `private` (no expuesto por la API) para funciones auxiliares; `authenticated` tiene `usage`
  porque las políticas las usan, y cada función concede `execute` explícitamente.
- Los mensajes de error de las RPCs (`raise exception`, código P0001) están escritos para el usuario,
  en rioplatense; `src/lib/errors.ts` los muestra tal cual.
- `src/lib/database.types.ts` se regenera con `generate_typescript_types` en cada fase que cambia el
  esquema (se conserva el comentario de cabecera).

### Edge Functions
- Código en `supabase/functions/<nombre>/index.ts` (la estructura de la CLI), deploy con
  `deploy_edge_function` del MCP. Lo deployado tiene que ser idéntico al archivo del repo.
- `send-push` (Fase 6, `verify_jwt` false, secreto compartido) y `delete-account` (Fase 8, `verify_jwt` true:
  la llama la app con la sesión; además verifica el JWT con `auth.getUser` y la contraseña). La clave de servicio
  solo la usan las funciones (la pone Supabase como variable; no hay que cargarla).
- Secretos (`VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET`): los carga el dueño en Supabase → Edge Functions → Secrets. Nunca en el
  repo, en el front ni en archivos del proyecto.

### Datos personales
- Nombre visible: nombre + inicial del apellido («Ana Á.») hasta la aceptación. Nombre completo y
  WhatsApp, solo después (`get_job_contact`, Fase 4).
- **Dirección y ubicación del pedido: visibles** (decisión del dueño, Fase 7: en un pueblo todos saben
  dónde vive cada uno). Las ve cualquier usuario logueado que pueda ver el pedido según el RLS de `jobs`
  (el dueño, **todos los cortadores** mientras está publicado y no venció —desde la Fase 8, de cualquier
  ciudad: el radio es un filtro de relevancia, no de privacidad— y los que se postularon). Anon, nada.
  Reemplaza la decisión de las fases 2–6 (dirección privada en `job_private`, liberada al aceptar).
- **Ubicación base del cortador («mi casa»): privada y obligatoria para cortar** (Fase 8), en
  `profile_private`; solo la lee el dueño. También el radio de búsqueda (`search_radius_km`).
- Teléfono con libphonenumber-js, guardado como `+549…`. Desde la Fase 8 la característica es obligatoria
  (ejemplo en el campo: «2345 15 123456»); ya no se completa con la de la localidad. Los guardados no se tocaron.
- **Términos y privacidad** (Fase 8): la versión vigente es la más alta de `terms_versions`; cada aceptación
  (versión y fecha) está en `terms_acceptances`, privada. El texto vive en el front (`src/pages/legal/`) con
  `TERMS_VERSION` (`src/legal/terms.ts`). Para publicar una versión nueva: cambiar el texto y el número,
  deployar el front y recién después insertar la fila en `terms_versions`.
- **Borrar la cuenta** (Fase 8): solo desde la app (Edge Function `delete-account`) y sin nada pendiente. Se
  borran el usuario de Auth, el perfil, los datos privados, la aceptación de términos, las fotos (perfil y
  pedidos), los dispositivos y los avisos, y los pedidos propios sin postulaciones. Quedan anónimos los
  trabajos y las calificaciones con otra persona (ids en null, sin dirección, pin, zona, nota ni fotos), para
  que su historial y sus estadísticas no cambien; la app muestra «Usuario eliminado». En los avisos de los
  demás se borran su nombre y, si el pedido era suyo, su dirección y zona.

### Storage
- Buckets privados, URLs firmadas. Cada uno escribe solo en su carpeta (`<uid>/...`).
- Las fotos se achican en el navegador antes de subir (`src/lib/images.ts`).
- Patrón de guardado: subir → RPC → si la RPC falla, borrar lo subido; si sale bien, borrar lo reemplazado.

### Front
- Pantallas cargadas a demanda (`lazy` en `src/app/router.tsx`). Timeout de 30 s en los pedidos a Supabase.
- Acciones importantes con `confirmAction` (`src/lib/confirm.tsx`), separadas de las comunes.
- Precio y fecha con `src/lib/format.ts`, en la zona horaria de la localidad.
- Modo según la URL (`/pedir/...` o `/cortar/...`). Con los dos roles hay un selector arriba y un color
  por modo (azul = pedir, verde = cortar).
- Interfaz: áreas táctiles de 44–48 px como mínimo; siempre ícono con texto; sin truncar dirección,
  precio, fecha, hora, distancia ni zona; sin scroll horizontal a 360 px; textos en español rioplatense.
- Mapas (Fase 7): Leaflet + tiles de OpenStreetMap con su atribución. Todo Leaflet vive en
  `src/map/LeafletMaps.tsx` (chunk aparte, cargado con `lazy` desde `src/map/lazy.tsx`); el resto
  (`src/lib/geo.ts`: haversine, formato de distancia, GPS, link de «Cómo llegar») no importa Leaflet.
  En pantallas táctiles el mapa no se arrastra con un dedo (la página sigue scrolleando): el pin se pone
  tocando y se arrastra con un dedo, el mapa se mueve y se acerca con dos. La rueda del mouse no hace zoom.
- Distancias en el front con haversine (en línea recta). «Cómo llegar»: link universal de Google Maps
  (`/maps/dir/?api=1&destination=lat,lng`), sin API de rutas.

### Proceso
- Nunca commitear, mergear ni pushear (lo hace el dueño).
- Los mensajes que el dueño pega (aprobaciones, decisiones, pedidos de fase) son suyos: si están
  claros, se ejecutan directamente, sin reconfirmar.
- Una fase a la vez; al terminar, frenar para revisión.
- Limpieza de usuarios de prueba: el `delete` de `sql/tests/limpiar_usuarios_prueba.sql` (exactamente
  ese, con sus tres patrones de mail de prueba) está aprobado de forma permanente: al final de cada
  fase se corre por el MCP sin pedir permiso y se informa cuántas filas borró. Cualquier otra
  sentencia destructiva sigue necesitando aprobación.
- Responder siempre en español rioplatense.
- Si algo parece mal planteado, avisar con el motivo antes de cambiarlo.
- Nunca la service_role key en el front, ni tokens o claves en archivos del repo.

## Decisiones

- **Una cuenta por persona**, con las marcas `is_client` e `is_cutter`, cambiables desde el perfil.
  Foto obligatoria solo para el cortador.
  - No se puede sacar el rol de cliente con trabajos publicados o asignados (Fase 2).
  - No se puede sacar el rol de cortador con postulaciones activas (Fase 3).
- **Trabajo:** `publicado → asignado → realizado`, o `cancelado` desde cualquier estado salvo realizado.
  - «Vencido» no se guarda: se calcula (publicado y con `desired_at` pasada). Computed field
    `is_expired` y función `private.job_is_expired`, con el reloj del servidor.
  - Un vencido no aparece en la lista de disponibles ni recibe postulaciones nuevas, pero el cliente
    igual puede aceptar una postulación cuyo horario propuesto sea futuro.
  - Un trabajo con postulaciones pendientes no se edita: se cancela y se vuelve a publicar.
    Sin postulaciones se puede editar, también vencido (así se «renueva» con otra fecha).
  - Si el cortador aceptado cancela, el trabajo queda cancelado y el cliente tiene «Volver a
    publicar», que precarga los datos (`republished_from`). El mismo botón sirve cuando no le gustó el corte.
  - «Marcar realizado» lo puede hacer cualquiera de las dos partes, recién desde el día acordado.
- **Postulación:** `pendiente → aceptada | rechazada | retirada | cancelada` (cancelada = se canceló el trabajo).
  - Una por cortador y trabajo: `unique (job_id, cutter_id)`. Si se retira y se vuelve a postular, se reusa la fila.
  - `proposed_price_ars` y `proposed_at` en null = acepta lo publicado.
- **Aceptación atómica:** RPC con `FOR UPDATE` sobre el trabajo y `expected_updated_at` de la
  postulación (falla si cambió desde que el cliente la vio). Rechaza las demás pendientes y notifica,
  todo en una transacción. Red de seguridad: índice único parcial `(job_id) where status = 'aceptada'`.
  Las RPCs de postulación usan `FOR SHARE` sobre el trabajo.
- **Contacto:** `get_job_contact` devuelve nombre completo y WhatsApp de la contraparte, solo a las dos
  partes y solo con el trabajo asignado o realizado. (Hasta la Fase 7 devolvía también la dirección.)
- **Acuerdo** (Fase 5): precio y horario acordados, quién es el elegido y quién canceló un asignado
  viven en `job_agreements`, que solo leen las dos partes (también en la API). Los cortadores no
  elegidos ven el pedido como asignado/realizado/cancelado, pero no el acuerdo ni quién fue elegido.
- **Calificaciones:** «¿Volverías a trabajar con esta persona? Sí/No», una por lado. Nadie las lee
  (RLS sin políticas y sin grants). El perfil público muestra trabajos realizados y % de «sí»:
  - solo con 5 calificaciones o más;
  - en lotes semanales: cuentan las hechas antes del lunes 00:00 (zona de la localidad), calculado al leer;
  - redondeado a la decena;
  - nunca la cantidad de calificaciones.
- **Notificaciones:** se insertan en la misma transacción que el cambio de estado, con `dedupe_key`
  única por destinatario y `on conflict do nothing`. El payload nunca lleva datos privados. Bandeja en
  `/avisos`, contador de no leídas por Realtime que también se refresca al volver al frente. Web Push
  (Fase 6): cada aviso insertado sale también como notificación a los dispositivos del destinatario.
- **Zona:** texto libre y opcional (Fase 7; antes era obligatoria). Va al final del formulario.
- **Ubicación (Fase 7):** el pin es el dato principal y es obligatorio; la dirección escrita (calle y
  número obligatorios, «entre calles» opcional) es para que la lea una persona. El pin tiene que caer
  dentro del radio de la localidad (`localities.center_lat/center_lng/radius_m`; 25 de Mayo: centro del
  límite en OSM y 10 km, que cubre todo el límite —hasta 9,4 km del centro— y las quintas).
- (Hasta la Fase 6, al publicar un cartel pedía «no pongas la dirección en la nota ni en las fotos»; se
  sacó con la dirección visible.)
- **Mails:** «Confirm email» desactivado para la beta. SMTP propio pendiente (lo configura el dueño).
- **Ubicación desde la Fase 8:** el pin y la casa valen en cualquier lugar de Argentina (caja aproximada:
  latitud −55,1 a −21,7, longitud −73,6 a −53,6, `private.check_in_argentina`; incluye un poco de los países
  vecinos). Reemplaza el radio de la localidad (`localities.radius_m` ya no se usa). Sin GPS, el mapa arranca
  en el centro de la localidad por defecto (25 de Mayo) y se puede mover y marcar en cualquier lado.
- **Trabajos disponibles desde la Fase 8:** `get_available_jobs(origen, radio)` filtra por radio y ordena por
  distancia en el servidor. Técnica: haversine en SQL (`private.distance_m`, la misma fórmula que el front)
  con un prefiltro por una caja lat/lng que contiene el círculo, sobre un índice btree parcial de los
  publicados (`jobs_published_location_idx`). Los publicados son pocos (5 por cliente, vencen en 60 días):
  el índice es chico y la caja lo vuelve un range scan. PostGIS no hacía falta (sin polígonos ni grandes
  volúmenes) y sumaba una extensión y un tipo de columna nuevo. Sin aviso de «no hay cortadores cerca».

### Decisiones tomadas en la Fase 2 (además de lo pedido)
- El `id` del trabajo lo genera el navegador (`crypto.randomUUID()`) para subir las fotos a
  `job-photos/<uid>/<job_id>/` antes de llamar a `create_job`, igual que el avatar: si la RPC falla,
  se borran. `create_job` verifica que cada foto esté en esa carpeta y exista.
- Los cortadores ven por RLS solo los trabajos **publicados, no vencidos y de su localidad** (desde la
  Fase 8, de cualquier localidad: la localidad ya no filtra). Las fotos
  se leen con la misma regla (la política del bucket consulta `jobs` con el RLS del que llama), así que
  un cortador de otra localidad o un cliente sin rol de cortador no ve ni el trabajo ni sus fotos.
  En la Fase 3 se suma: el cortador que se postuló ve el trabajo (y sus fotos) en cualquier estado.
- Límites: precio entero entre $ 1.000 y $ 5.000.000; fecha entre ahora y 60 días; zona 2–80 letras
  (opcional desde la Fase 7); calle 2–120, número 1–10 («s/n» vale), entre calles 3–120 (Fase 7); nota
  hasta 500; hasta 5 fotos; hasta 5 pedidos publicados a la vez por cliente (anti-spam).
- `jobs.locality_id` se copia del perfil del cliente al publicar (desde la Fase 8 es siempre la de por
  defecto: solo da la zona horaria).

## Modelo de datos

### Existente
- `localities` (0002): id, slug, name, province, timezone, phone_area_code, is_active. Lectura: logueados.
  Fase 7 (0024): center_lat, center_lng, radius_m (validaban los pines; el mapa arranca en el centro).
  Fase 8 (0026): `is_default` (una sola: 25 de Mayo). `radius_m` y `phone_area_code` ya no se usan.
- `profiles` (0003): id = auth.users.id, locality_id, first_name, last_initial, avatar_path, is_client,
  is_cutter. Lectura: logueados. Fase 8: `locality_id` lo pone `upsert_my_profile` (la de por defecto en un
  perfil nuevo); trigger `profiles_before_delete` (`private.before_profile_delete`, ver «Borrar la cuenta»).
- `profile_private` (0003): user_id, last_name, phone_e164. Lectura: solo el dueño.
  Fase 7 (0024): base_lat, base_lng (ubicación base del cortador; se escribe con `set_my_base_location`).
  Fase 8 (0026): `search_radius_km` (5, 10, 20 o 50; 20 por defecto). La casa pasa a ser obligatoria para
  cortar (0027) y ya no se borra al cambiar de localidad (la localidad no se elige).
- Bucket `avatars` (0004): privado, 2 MB, jpeg/png/webp. Lectura: logueados; escritura: carpeta propia.
- `jobs` (0005): id, client_id → profiles (Fase 8: null si el cliente borró su cuenta), locality_id, zone, price_ars, desired_at, notes,
  photo_paths text[] (≤ 5, todas en `<client_id>/<id>/`), status
  (`publicado|asignado|realizado|cancelado`), republished_from → jobs, cancelled_at, cancelled_by,
  created_at, updated_at. Computed field `is_expired`.
  Fase 7 (0024/0025): `zone` opcional; address_street (not null), address_number, address_between,
  location_lat, location_lng (pin). address_number y el pin son null solo en los pedidos anteriores
  (la dirección vieja se copió entera a address_street); las RPCs los exigen.
  Lectura: el dueño (todos los suyos), los cortadores de la localidad (publicados no vencidos) y los
  cortadores que se postularon (cualquier estado), en una sola política SELECT (0009, ampliada en 0010).
  `cancelled_by` solo guarda al cliente: si cancela el cortador elegido queda null (lo verían los
  no elegidos) y el autor va en `job_agreements.cancelled_by` (0020).
  Fase 8 (0026): `client_id` y `address_street` pueden ser null (cuenta borrada); checks
  `jobs_deleted_client_check` (sin cliente, solo realizado o cancelado) y `jobs_address_street_required_check`.
  La política SELECT pasó a «Trabajos: el dueño, los cortadores y los postulados» (`private.i_am_cutter()`).
  **Embeds:** con `job_agreements` hay caminos indirectos entre jobs, applications y profiles: siempre
  nombrar la relación (`applications!applications_job_id_fkey(...)`, `job:jobs!applications_job_id_fkey(...)`,
  `client:profiles!jobs_client_id_fkey(...)`, `agreement:job_agreements!job_agreements_job_id_fkey(...)`).
  Sin el nombre, PostgREST responde PGRST201.
- `job_agreements` (0018, reemplaza las columnas de acuerdo de jobs desde 0019): job_id (PK = un solo
  acuerdo por pedido) → jobs, application_id (único) → applications, client_id, cutter_id → profiles,
  price_ars, agreed_at, assigned_at, done_at, done_by, cancelled_by. Se crea en `accept_application` y
  queda como historial si se cancela. Lectura: solo `client_id` o `cutter_id`; sin escritura directa.
- ~~`job_private` (0005): job_id, address~~ — se borra en 0025 (la dirección pasó a `jobs`, Fase 7).
- Bucket `job-photos` (0006): privado, 3 MB, jpeg/png/webp, `<uid>/<job_id>/...`. Lectura: el dueño
  (su carpeta) y quien puede ver el trabajo por RLS (solo las fotos listadas en `photo_paths`);
  escritura: carpeta propia.

- `applications` (0010): id, job_id, cutter_id, status (`pendiente|aceptada|rechazada|retirada|cancelada`),
  proposed_price_ars, proposed_at (null = acepta lo publicado), attempt (sube al volver a postularse),
  edits (ediciones en el intento), created_at, updated_at (versión para la aceptación: trigger con
  clock_timestamp(), siempre distinto del anterior, 0017). `unique (job_id, cutter_id)`; único parcial
  `(job_id) where status = 'aceptada'` (red de seguridad de la Fase 4).
  Lectura: el cortador las suyas y el cliente las de sus pedidos (no tienen datos privados).
  Las políticas cruzadas jobs↔applications usan `private.my_job_ids()` y `private.my_applied_job_ids()`
  (SECURITY DEFINER) para evitar la recursión de RLS.
- `notifications` (0011): id, user_id, kind, job_id, application_id, payload jsonb, dedupe_key, read_at,
  created_at. `unique (user_id, dedupe_key)`. Lectura: el destinatario. En la publicación `supabase_realtime`.
  Se insertan solo con `private.notify` (lista blanca de campos del payload: zone, actor_name,
  price_ars, desired_at, proposed_price_ars, proposed_at, tz; cualquier otro campo hace fallar la RPC).
  dedupe_key: `postulacion_nueva:<app>:<attempt>`, `postulacion_editada:<app>:<attempt>:<edits>`,
  `postulacion_retirada:<app>:<attempt>`, `pedido_cancelado:<job>`, `trabajo_realizado:<job>`.
- `ratings` (0021): job_id, rater_id, ratee_id, would_work_again, created_at; PK (job_id, rater_id).
  Fase 8 (0026): PK `id` (identity) + único (job_id, rater_id); rater_id y ratee_id pueden ser null.
  RLS sin políticas y sin grants: nadie las lee, ni las partes. Solo se usan dentro de
  `private.profile_stats`.

- `push_subscriptions` (0022): id, user_id → profiles (cascade), endpoint (único; solo servicios de push
  conocidos: FCM, Mozilla, Apple, Windows — `private.is_push_endpoint`), p256dh, auth, created_at,
  updated_at. RLS sin políticas y sin grants: nadie la lee por la API (ni el dueño). Se escribe con
  `save_push_subscription` / `delete_push_subscription`; la lee la Edge Function `send-push` con la clave
  de servicio. Hasta 10 dispositivos por persona.
- `notifications.pushed_at` (0022): cuándo `send-push` reclamó el aviso (sale una sola vez).
- **Fase 8 (0026), claves foráneas para borrar cuentas:** `jobs.client_id`, `applications.cutter_id`,
  `job_agreements.client_id/cutter_id` y `ratings.rater_id/ratee_id` → profiles con **on delete set null**
  (antes cascade: borrar a alguien se llevaba el historial de la otra parte). Mismos nombres de FK (los embeds
  de PostgREST los usan). `applications_deleted_cutter_check`: sin cortador, nunca pendiente.
- `terms_versions` (0026): version (PK), published_at. Lectura: logueados. Vigente = la más alta.
- `terms_acceptances` (0026): user_id → auth.users (cascade), version → terms_versions, accepted_at;
  PK (user_id, version) = historial. Lectura: solo el dueño. Se escribe con el trigger
  `accept_terms_on_signup` (auth.users, con `terms_version` en los metadatos del registro) o con `accept_terms`.
  Va aparte de `profile_private` porque se acepta al registrarse, antes de que exista el perfil.

## RPCs

| RPC | Fase | Qué hace |
|-----|------|----------|
| `upsert_my_profile(p_first_name, p_last_name, p_phone_e164, p_is_client, p_is_cutter, p_avatar_path)` | 1 (+2, +3, +4, +8) | Crea/actualiza el perfil propio. Fase 2: no deja sacar el rol de cliente con trabajos publicados o asignados. Fase 3: idem cortador con postulaciones activas. Fase 8: firma sin localidad (la de por defecto en un perfil nuevo) y sin la regla de no cambiarla; la firma vieja (con `p_locality_id`, Fase 4) se borra en 0027. |
| `create_job(p_id, p_location_lat, p_location_lng, p_address_street, p_address_number, p_price_ars, p_desired_at, p_address_between, p_zone, p_notes, p_photo_paths, p_republished_from)` | 2 (+7) | Publica un trabajo (id generado por el front). Fase 7: pin obligatorio dentro del radio de la localidad, calle y número en `jobs`, zona opcional. |
| `update_job(p_job_id, p_location_lat, …)` | 2 (+3, +7) | Edita un trabajo publicado propio (también vencido). Fase 3: falla si hay postulaciones pendientes. Fase 7: mismas validaciones de ubicación que `create_job`. |
| `set_my_base_location(p_lat, p_lng)` | 7 (+8) | Guarda la ubicación base del que llama (Fase 8: en cualquier lugar de Argentina). Con los dos en null la borra, salvo a un cortador (0027). |
| `cancel_job` | 2 (+3, +4) | Publicado: solo el cliente; cancela las pendientes y avisa. Asignado (Fase 4): el cliente o el cortador aceptado; la aceptada pasa a cancelada y avisa a la otra parte. |
| `apply_to_job`, `update_application`, `withdraw_application` | 3 | Postularse (reusa la fila si estaba retirada), editar, retirar. Bloqueos: perfil `FOR SHARE` → trabajo `FOR SHARE` → postulación `FOR UPDATE`. Avisan al cliente. Hasta 20 pendientes por cortador. |
| `mark_notifications_read(p_ids default null)` | 3 | Marca avisos propios como leídos (los indicados o todos). Devuelve cuántos. |
| `accept_application(p_application_id, p_expected_updated_at)` | 4 | Aceptación atómica: trabajo `FOR UPDATE`, versión de la postulación, acuerdo (propuesta o lo publicado; el horario tiene que ser futuro), rechaza las demás pendientes y avisa a todos. |
| `get_job_applicants(p_job_id)` | 4 (+5) | Postulantes (sin retiradas) con nombre visible, foto y propuesta, solo para el dueño. Fase 5: `done_jobs` (realizados como cortador) y `yes_pct`. |
| `get_job_contact(p_job_id)` | 4 (+5, +7) | Nombre completo y WhatsApp de la contraparte + el acuerdo; solo las dos partes y solo con el trabajo asignado o realizado. Fase 5: lee `job_agreements`. Fase 7: sin la dirección (está en `jobs`). |
| `mark_job_done(p_job_id)` | 5 | Cualquiera de las dos partes, con el trabajo asignado y desde el día acordado (hora local). Pasa a realizado y avisa a la otra parte. |
| `rate_job(p_job_id, p_would_work_again)` | 5 | Una calificación por parte, con el trabajo realizado. No se puede cambiar. |
| `has_rated_job(p_job_id)` | 5 | Si el que llama ya calificó (sin decir qué puso). |
| `get_profile_stats(p_user_id)` | 5 | done_as_cutter, done_as_client y yes_pct (null con menos de 5; lote semanal; redondeado a la decena). Nunca la cantidad. |
| `save_push_subscription(p_endpoint, p_p256dh, p_auth)` | 6 | Guarda o actualiza el dispositivo del que llama (requiere perfil). Si el endpoint era de otra cuenta, pasa a la actual (el endpoint es del dispositivo). Valida servicio de push y formato de claves. Deja los 10 más recientes. |
| `delete_push_subscription(p_endpoint)` | 6 | Saca un dispositivo propio (desactivar avisos o cerrar sesión). Devuelve si había algo. |
| `accept_terms(p_version)` | 8 | Guarda la aceptación de la versión vigente (falla si `p_version` no es la vigente: el front muestra otro texto). |
| `get_my_terms_status()` | 8 | Versión vigente y si el que llama la aceptó. |
| `get_available_jobs(p_lat, p_lng, p_radius_km)` | 8 | **SECURITY INVOKER** (respeta el RLS de jobs): ids y distancia en metros de los publicados no vencidos a menos de 5/10/20/50 km del origen, del más cercano al más lejano (hasta 200; sin los propios). Solo cortadores. |
| `set_my_search_radius(p_km)` | 8 | Guarda el radio de búsqueda (5, 10, 20 o 50). |
| `get_my_pending_items()` | 8 | Lo que impide borrar la cuenta: pedidos publicados (también vencidos) o asignados, postulaciones pendientes o aceptadas en un trabajo asignado (`private.pending_items`). |
| `delete_account(p_user_id)` | 8 | **Solo service_role** (la llama `delete-account`): rechaza con pendientes (hint `pendientes`), borra el perfil (el trigger anonimiza) y la aceptación, y devuelve los archivos de sus carpetas para borrarlos por la API de Storage. |

Fase 8 (0026), en todas las RPCs: las comparaciones con ids que pueden ser null usan `is distinct from`
(con `<>` o `not in` un null dejaba pasar el `if`: cualquiera podía calificar un trabajo de alguien borrado).
`rate_job` rechaza si la otra parte borró su cuenta; `get_job_contact` no devuelve filas; `get_job_applicants`
devuelve a los borrados sin nombre ni foto; `private.notify` no avisa a un destinatario null. Las RPCs de
escritura llaman a `private.require_terms` (apagado hasta 0027) salvo las que sirven para irse: `cancel_job`,
`withdraw_application`, `delete_push_subscription`, `mark_notifications_read` y el borrado.
`apply_to_job` ya no compara localidades y pide la casa (0027).

## Fases

### Fase 2 · Trabajos ✅ (aprobada y commiteada)
- [x] Tablas `jobs` y `job_private`; bucket `job-photos` (`<uid>/<job_id>/...`, hasta 5 fotos).
- [x] `create_job`, `update_job`, `cancel_job` (sin asignar); vencido calculado (`is_expired`).
- [x] `/pedir`: Mis pedidos (`/pedir`), Nuevo pedido (`/pedir/nuevo`), Detalle (`/pedir/pedido/:id`) y Editar (`/pedir/pedido/:id/editar`).
- [x] `/cortar`: Trabajos disponibles (`/cortar`) y Detalle (`/cortar/trabajo/:id`).
- [x] `upsert_my_profile`: no deja sacar el rol de cliente con trabajos publicados (vencidos incluidos) o asignados.

Front: `src/jobs/` (queries, saveJob, JobForm, PhotoPicker, JobPhotos, JobCard, JobFacts, JobStatusBadge, JobPageParts).

Verificación (14/10/2026):
- `sql/tests/fase2_seguridad.sql`: 97/97 casos (anon, dueño A, cortador B, tercero C sin rol de
  cortador, cortador D de otra localidad, E sin perfil). `fase1_seguridad.sql` sigue 35/35 (se ajustaron
  los casos 19 y 32 para contar solo usuarios de prueba: ahora hay perfiles reales). Sin rastro después.
- `scripts/verificar-red-fase2.mjs`: sesiones reales de cliente, cortador, tercero y anon; 51 respuestas
  revisadas, 21/21 chequeos (incluye control positivo del detector). Ni la dirección ni teléfonos ni
  apellidos ajenos aparecen en ninguna respuesta, tampoco con `select *` o embeds de `job_private` / `profile_private`.
- Navegador: publicar (con fotos y confirmación), editar (precio y quitar foto: el archivo se borra),
  cancelar, lista y detalle del cortador. 8 pantallas medidas a 360 px sin scroll horizontal. Hora
  guardada en la zona de la localidad (08:00 ART = 11:00 UTC). Áreas táctiles del calendario y de las horas: 48 px.
- `tsc -b` y `npm run build` sin errores.
- Advisors: 0029 (SECURITY DEFINER ejecutable por authenticated) en las 4 RPCs, que es el diseño;
  «leaked password protection» desactivado (configuración de Auth, a decidir por el dueño);
  índices nuevos «sin uso» (normal).

Cerrado después de la revisión: `0009` unificó las políticas SELECT de `jobs` (ejecutado desde el
panel, porque el MCP no puede correr DROP/DELETE: su confirmación falla con «Invalid or expired
requestState»). Se borraron los usuarios de prueba de punta a punta. Pruebas de la Fase 2 de nuevo
97/97 con la política nueva; el advisor de performance quedó solo con un índice sin uso (normal).

### Fase 3 · Postulaciones y avisos ✅ (aprobada y commiteada)
- [x] `applications`; postularse (aceptando o con contraoferta de precio y/o horario), editar y retirar.
- [x] `update_job` falla con postulaciones pendientes; `cancel_job` las pasa a `cancelada` y avisa a cada cortador.
- [x] `notifications` con bandeja en `/avisos` (abrirla marca todo como leído; los nuevos quedan
  resaltados mientras se mira) y contador en la barra (Realtime + al volver al frente + al reconectar).
- [x] `upsert_my_profile` no deja sacar el rol de cortador con postulaciones activas.
- [x] RLS de `jobs` (y fotos): el cortador ve los trabajos en los que se postuló, con `alter policy`.

Front: `src/applications/` (queries, ApplicationForm, ApplicationPanel, ApplicationParts),
`src/notifications/` (queries con Realtime, describe), `src/jobs/schedule.tsx` (día/hora y precio
compartidos por JobForm y ApplicationForm), `/cortar/postulaciones`, `/avisos`. El cliente ve en sus
pedidos cuántas postulaciones pendientes hay (la lista con nombres y "elegir" es de la Fase 4).

Decisiones de la Fase 3:
- El cliente lee por RLS las postulaciones de sus pedidos (no tienen datos privados): hoy solo se usa
  para contarlas. La Fase 4 decide si la lista va por `get_job_applicants` (con estadísticas).
- Con el pedido vencido, el cortador puede cambiar su propuesta a un horario futuro (así el cliente
  todavía lo puede aceptar), pero no quedarse con el horario publicado que ya pasó.
- Cambiar la propuesta sin cambios reales no actualiza ni avisa.
- La lista de disponibles filtra en el servidor (`is_expired = false`, localidad del perfil), porque
  el RLS también devuelve los pedidos en los que el cortador se postuló.

Verificación (14/10/2026):
- `sql/tests/fase3_seguridad.sql`: 95/95 (anon, cliente A, cortadores B y B2, cortador F no
  postulado, C sin rol de cortador, D de otra localidad, E sin perfil). Fase 1 35/35 y Fase 2 97/97
  de nuevo con las funciones y la política cambiadas. Sin rastro después.
- `scripts/verificar-red-fase3.mjs`: 30/30 con sesiones reales, 72 respuestas HTTP y los eventos de
  Realtime revisados. Un cortador suscripto con filtro `user_id=eq.<cliente>` y un tercero sin filtro
  no reciben ningún aviso ajeno. Corrido 3 veces: todos los avisos llegaron en vivo (en una corrida
  previa con un error del propio script llegaron 3 de 4; no se repitió, y el contador igual se
  corrige al volver al frente o reconectar).
- Navegador: postularse con contraoferta, cambiar la propuesta (precio y otro día/hora), "Mis
  postulaciones", retirar y volver a postularse; aviso en vivo al cancelar el cliente (la lista y el
  contador se actualizan sin recargar); bandeja; del lado del cliente, contador de postulaciones en
  vivo, Editar bloqueado con postulaciones. 10 pantallas a 360 px sin scroll horizontal; radios de 44 px o más.
- `tsc -b` y build sin errores. Advisors: solo 0029 (las 8 RPCs, por diseño), «leaked password
  protection» (configuración de Auth) e índice sin uso en `profiles`.
- Limpieza: los 15 usuarios de prueba de punta a punta se borraron por el MCP (con aprobación del
  dueño); sus archivos de Storage, antes por la API. En la base queda solo el usuario real.

### Fase 4 · Asignación ✅ (aprobada y commiteada)
- [x] `accept_application` atómica, `get_job_applicants`, `get_job_contact` + botón de WhatsApp.
- [x] Cancelaciones después de asignar (cliente o cortador aceptado), con aviso a la otra parte.
- [x] Localidad: no se cambia con pedidos publicados o asignados ni postulaciones pendientes o
  aceptadas (decisión del dueño; mensaje de la RPC + aclaración en el selector de localidad).
- [x] Prueba de carrera real: `scripts/prueba-carrera-fase4.mjs`.

Front: `src/assignment/` (ApplicantsList con "Elegir a…", AssignedPanel con contacto, WhatsApp y
"Cancelar trabajo"). `jobTerms()` muestra el precio y el horario acordados donde corresponde.
Avisos nuevos: postulacion_aceptada, postulacion_rechazada, trabajo_cancelado_por_cliente,
trabajo_cancelado_por_cortador.

Decisiones de la Fase 4:
- El acuerdo usa la propuesta del cortador o, si no propuso, lo publicado. Con el pedido vencido solo
  se puede elegir una postulación con horario futuro.
- `updated_at` de applications como versión con `clock_timestamp()` (0017): con `now()`, dos cambios
  en la misma transacción dejaban el mismo valor (lo encontró la prueba SQL).
- Los cortadores no elegidos siguen viendo el pedido (RLS de la Fase 3). En la Fase 4 la API les
  devolvía también el acuerdo; el dueño decidió ocultarlo y en la Fase 5 se movió a `job_agreements`.
- Después de cancelar, nadie recibe más el contacto.
- El mensaje inicial de WhatsApp se arma en la app (wa.me con texto), sin pasar datos por el servidor.

Verificación (14/10/2026):
- `sql/tests/fase4_seguridad.sql`: 71/71 (anon, cliente A, cortadores B y B2, F no postulado,
  C tercero, D de otra localidad). Incluye versión vieja rechazada, red de seguridad del índice
  único, contacto antes/durante/después, cancelación por cada parte, vencido y localidad.
  Fases 1, 2 y 3 de nuevo: 35/35, 97/97, 95/95.
- Prueba de carrera (`node scripts/prueba-carrera-fase4.mjs 10`): 6 escenarios × 10 rondas con
  sesiones reales en paralelo (el cliente en 5 sesiones a la vez y 6 cortadores): 5 aceptaciones
  simultáneas, aceptar vs. cambiar la propuesta, aceptar vs. retirarse, aceptar vs. cancelar,
  postularse tarde vs. aceptar, doble cancelación de un asignado. 0 invariantes rotas; en todos los
  escenarios se dieron los dos desenlaces posibles (hubo carrera de verdad). Verificado además por
  SQL sobre los 60 pedidos: ninguno con 2 aceptadas, ninguna pendiente en pedidos no publicados,
  acuerdos iguales a la propuesta aceptada, exactamente un aviso por aceptada/rechazada, sin avisos duplicados.
- `scripts/verificar-red-fase4.mjs`: 23/23 con 126 respuestas HTTP y los eventos de Realtime: la
  dirección, el apellido y el WhatsApp solo los recibe la contraparte y solo mientras está asignado;
  el no elegido, el tercero y anon nunca reciben datos privados. Fase 3 de nuevo: 30/30.
- Encontrado y corregido en la verificación: con la FK nueva jobs → applications los embeds pasaron a
  ser ambiguos (PGRST201) y rompían las consultas de la app; ahora nombran la relación.
- Navegador: lista de postulantes; la propuesta cambia con el modal de confirmación abierto → la
  elección se rechaza con "La postulación cambió…" y la lista muestra la nueva (además ya se había
  actualizado sola por Realtime); elegir → acuerdo + contacto + WhatsApp (wa.me con mensaje); el
  cortador ve "¡Te eligieron!" con dirección y WhatsApp. Pantallas nuevas a 360 px sin scroll
  horizontal. "Cancelar trabajo" del cortador se probó por API (con la pestaña de Chrome en segundo
  plano los modales no se abren); el aviso al cliente llegó.
- `tsc -b` y build sin errores. Advisors: 0029 en las 11 RPCs (por diseño), «leaked password
  protection» e índices nuevos sin uso.
- Limpieza: 22 usuarios de prueba borrados por el MCP con aprobación del dueño (sus archivos, antes
  por la API). En la base queda solo el usuario real.

### Fase 5 · Cierre ✅ (aprobada y commiteada)
- [x] Acuerdo fuera de `jobs` (decisión del dueño): `job_agreements` (0018), columnas viejas borradas
  y RPCs adaptadas (0019, destructivo, aprobado), autor de la cancelación de un asignado (0020).
  Después del cambio pasaron de nuevo todas las pruebas SQL de las fases 1–4, las de red de las
  fases 3 y 4 y la prueba de carrera completa (60 y 120 rondas, 0 invariantes rotas).
- [x] `get_job_contact` con el trabajo asignado o realizado.
- [x] Marcar realizado, calificar (Sí/No, con confirmación), estadísticas públicas (0021).
- [x] Perfil público `/persona/:id`: foto, nombre visible, roles, localidad, desde cuándo, trabajos
  realizados (como cortador y/o como cliente, según el rol) y % de «volverían a trabajar» o «todavía no
  hay suficientes calificaciones». Links desde la lista de postulantes, el detalle del trabajo del
  cortador, el panel del trabajo asignado y «Mi perfil» («Ver mi perfil público»).
- [x] Volver a publicar: `/pedir/nuevo?desde=<job_id>` (pedido propio cancelado o realizado) precarga
  zona, dirección, precio, nota y fotos; la fecha queda vacía. Las fotos se copian a la carpeta del
  pedido nuevo con `storage.copy` (si algo falla se borran las copias).

Front: `src/completion/` (queries, MarkDoneButton, RatingCard), `src/pages/PersonaPage.tsx`,
`src/pages/TrabajoRedirectPage.tsx` (`/trabajo/:id` lleva al detalle del lado que corresponde; lo usa el
aviso `trabajo_realizado`, que le llega a cualquiera de las dos partes). En «Mis postulaciones» una
aceptada pasa a «Anteriores» cuando el trabajo deja de estar asignado, con el estado del trabajo.

Decisiones de la Fase 5:
- `jobs.cancelled_by` ya no guarda al cortador elegido (los no elegidos lo verían): queda null y el
  autor va en `job_agreements.cancelled_by`. Para el no elegido, el pedido figura «cancelado» sin más.
- Una vez realizado no se puede cancelar ni desmarcar. La calificación tampoco se puede cambiar.
- `has_rated_job` existe para que la interfaz sepa si mostrar la pregunta, sin leer `ratings`.
- Copiar una foto a la carpeta propia requiere poder leerla (`can_see_job_photo`): para cualquier otro
  usuario equivale a descargarla y subirla, así que no expone nada nuevo.

Verificación (14/10/2026):
- `sql/tests/fase5_seguridad.sql`: 61/61 (anon, cliente A, cortador elegido B, no elegido B2, tercero
  C): realizado antes del día, por no partes, aviso, no cancelar un realizado, contacto con el
  realizado, calificaciones ilegibles para todos (también las partes), doble calificación, umbral de 5,
  lote semanal (la de esta semana no cuenta), redondeo (83,3 → 80; 85,7 → 90), estadísticas en
  postulantes, volver a publicar. Con el esquema final: Fase 1 35/35, Fase 2 97/97, Fase 3 95/95,
  Fase 4 82/82 (ajustada a `job_agreements`; 11 casos nuevos). Total 370/370. Sin rastro después.
- `scripts/verificar-red-fase5.mjs`: 29/29 con 207 respuestas HTTP y los eventos de Realtime. Con el
  trabajo realizado, la dirección y el WhatsApp solo los recibe la contraparte; el no elegido ve el
  pedido realizado sin acuerdo; nadie (ni las partes) recibe filas de `ratings` ni los campos
  `would_work_again`/`rater_id`/`ratee_id`; las estadísticas no traen cantidades; ningún aviso revela
  una calificación. `verificar-red-fase4.mjs` ampliado: 27/27 (el no elegido no recibe el acuerdo ni
  quién es el elegido); Fase 3: 30/30.
- Navegador (en `ui.localhost:5173`, para no tocar la sesión real de `localhost`): trabajo asignado
  hoy → «Marcar como realizado» habilitado; realizado → tarjeta «¿Volverías a trabajar con…?» y luego
  «Ya calificaste»; «Mis postulaciones» → Anteriores con Aceptada + Realizado; aviso «Trabajo
  realizado» → `/trabajo/:id` → detalle del cliente; «Volver a publicar» con los datos y la foto
  precargados; postulantes con «1 trabajo realizado · todavía sin suficientes calificaciones» y «Ver el
  perfil de…»; perfil público. Con la ventana de Chrome oculta los modales de confirmación no se abren:
  marcar, calificar y publicar se hicieron por la API con los mismos usuarios y se revisó el resultado
  en las pantallas. 6 pantallas a 360 px: sin scroll horizontal, ningún botón de menos de 44 px.
- `tsc -b` y build sin errores. Advisors: 0029 en las 15 RPCs (por diseño), `ratings` con RLS y sin
  políticas (a propósito), «leaked password protection» e índices sin uso.
- Limpieza: 33 usuarios de prueba borrados por el MCP (sus archivos, antes por la API). En la base
  queda solo el usuario real.

### Ajustes después de la Fase 5 ✅ (aprobados y commiteados)
- Perfil de la contraparte: un solo botón, «Ver su perfil», en el bloque de contacto. El cortador elegido
  ya no ve además «Ver el perfil de…» en la tarjeta del cliente (los no elegidos y los postulados sí).
- WhatsApp: un solo mensaje inicial para las dos partes y para asignado o realizado:
  «Hola <nombre>, te escribo por el corte de pasto de PastoControl del <sábado 18 de octubre>.»
- Fotos (perfil y pedido): `src/components/PhotoSourceButtons.tsx` con «Sacar foto» (`capture`: cámara
  frontal para el perfil, trasera para el terreno) y «Elegir de la galería». En pantallas no táctiles
  (`pointer: coarse` falso) el navegador ignora `capture`, así que se muestra un solo botón «Elegir foto».

### Fase 6 · Web Push (implementada, esperando revisión y prueba en el celular)
- [x] `push_subscriptions`, `save_push_subscription`, `delete_push_subscription`, `notifications.pushed_at` (0022).
- [x] Trigger `notifications_queue_push` (AFTER INSERT): si el destinatario tiene dispositivos, encola con
  pg_net un POST a la Edge Function con `{ notification_id }` y nada más. pg_net es asíncrono y
  transaccional: si la RPC falla, no sale nada. Cualquier error del trigger es un `warning`: el push nunca
  hace fallar la RPC. La URL de la función está en Vault (`push_function_url`).
- [x] Secreto compartido trigger → función (0023): el trigger manda el header `x-push-secret` con el valor
  de Vault (`push_webhook_secret`); la función lo compara (en tiempo constante) con su secreto
  `PUSH_WEBHOOK_SECRET` y responde 401 sin leer el cuerpo ni tocar la base. Si falta en Vault, el trigger
  no encola nada. El valor no está en el repo: está en Vault y lo cargó el dueño a mano en
  Edge Functions → Secrets. Para rotarlo: `vault.update_secret` y el secreto de la función a la vez.
- [x] Edge Function `send-push` (`supabase/functions/send-push/index.ts`, deploy con el MCP, `verify_jwt`
  false porque el trigger no tiene un JWT de usuario; se autentica con `x-push-secret`): reclama el aviso
  con un update atómico (`pushed_at is null` y creado hace menos de 10 min),
  arma el texto (igual que `src/notifications/describe.tsx`) y lo manda con `web-push` a cada dispositivo.
  404/410 (y `BadWebPushToken`/`BadDeviceToken` de Apple) → borra el dispositivo.
- [x] VAPID: la clave privada es solo el secreto `VAPID_PRIVATE_KEY` de la Edge Function (cargado a mano
  por el dueño en Supabase → Edge Functions → Secrets, igual que `PUSH_WEBHOOK_SECRET`). La pública (no es secreta) está en
  `src/push/vapid.ts` y en la función. Subject: `https://pastocontrol.vercel.app`.
- [x] Service worker (`src/sw.ts`): `push` muestra siempre una notificación (título, texto, ícono, link
  interno); `notificationclick` trae la app al frente y navega a la pantalla del aviso (o la abre).
- [x] Front (`src/push/`): `pushStore` (permiso, suscripción, sincronización), `installStore`
  (`beforeinstallprompt`), `DevicePrompts` (carteles), `DeviceSettings` (sección del perfil),
  `IosInstallSteps` (pasos con dibujos), `PushParts`. `src/auth/signOut.ts` saca el dispositivo antes de
  cerrar sesión.

Decisiones de la Fase 6:
- El permiso se pide **solo** al tocar «Activar avisos». Con el permiso ya dado, al abrir la app (y al
  volver al frente) la suscripción se crea o renueva sola y se guarda para la cuenta actual (también si
  se cambió el par VAPID).
- Carteles solo en Mis pedidos, Trabajos y Avisos, de a uno: (1) iPhone sin instalar → pasos para
  instalar (el push en iOS solo funciona instalada); (2) «Activá los avisos» / «Faltan activar los
  avisos» (permiso dado pero falló la suscripción) / «Los avisos están bloqueados» con los pasos según
  el dispositivo; (3) «Instalá PastoControl» con el diálogo del navegador (Chrome/Android/Edge). «Ahora
  no» los cierra para siempre en ese dispositivo (localStorage); todo queda en el perfil, en «Avisos en
  este dispositivo» e «Instalar la app».
- «Desactivar avisos» saca el dispositivo y no se reactiva solo. «Cerrar sesión» también lo saca (si
  entra otra cuenta y el permiso sigue dado, se suscribe para esa cuenta).
- `send-push` se autentica con dos capas: (1) el secreto compartido `x-push-secret` (sin él, 401 antes de
  tocar la base: una llamada ajena no gasta ni una consulta); (2) aun con el secreto, no recibe texto
  sino un id, y reclama cada aviso una vez y solo si es reciente: no se puede mandar nada nuevo ni repetir
  un aviso. Lo pidió el dueño después de revisar la primera versión (que tenía solo la capa 2).
- El texto de la notificación no lleva datos privados (mismo payload que la bandeja). Viaja cifrado de
  punta a punta (Web Push) a través de Google/Apple.

Verificación (14/10/2026):
- `sql/tests/fase6_seguridad.sql`: 50/50 (anon, A con dispositivos, B, C sin dispositivos, E sin
  perfil): tabla ilegible e inescribible por la API, validación de endpoint (http, host ajeno, host
  imitado, `@`, largo), claves, paso de dispositivo entre cuentas, máximo 10, trigger encola solo para
  quien tiene dispositivos, con el id solo y el header `x-push-secret` igual al de Vault; sin URL o sin
  secreto en Vault no encola nada y el aviso igual se crea. Con el trigger
  nuevo, de nuevo: Fase 3 95/95, Fase 4 82/82, Fase 5 61/61. Sin rastro después.
- Backend real (sesiones reales de prueba): aviso real → trigger → pg_net → `send-push` → FCM y Apple con
  dispositivos de formato válido pero inexistentes. FCM: 404/410 → dispositivo borrado; Apple: 400
  `BadWebPushToken` (rechaza el token, no la firma: con VAPID mal sería `BadJwtToken`) → borrado.
  `pushed_at` marcado; volver a llamar con el mismo id → `skipped`; ids inválidos → 400; GET → 405.
- Navegador (build de producción con `vite preview`): cartel «Activá los avisos» → permiso → este Chrome
  de Linux no tiene servicio de push («Registration failed - push service error»; pasa en builds de
  Chromium sin claves de Google) → se corrigió que el cartel desapareciera sin mostrar el error: ahora
  queda «Faltan activar los avisos» con el motivo y reintentar. «Ahora no» no vuelve ni al cambiar de
  pantalla ni al recargar; después aparece el de instalar y también se cierra. Pasos del iPhone con
  dibujos revisados (simulando el userAgent). Cerrar sesión funciona. A 360 px sin scroll horizontal ni
  botones de menos de 44 px.
- Secreto compartido, contra la función deployada: sin header, con uno equivocado, vacío, y sin header con
  un cuerpo que no es JSON → 401 las cuatro (el cuerpo ni se lee). El aviso usado en esas llamadas
  (reciente y sin reclamar) siguió con `pushed_at` en null: no se tocó la base. Aviso normal con un
  dispositivo (Apple, token inventado) → el trigger llamó con el header → 200 `{removed: 1}`, aviso
  reclamado y dispositivo dado de baja.
- Limpieza: 4 usuarios de prueba (`pastocontrol.prueba.ui-*` y `pastocontrol.prueba.secreto-*`) borrados por
  el MCP (sus archivos, antes por la API). Sin usuarios de prueba, dispositivos ni archivos huérfanos.
- Pendiente: la prueba de punta a punta con un celular real (Android con Chrome e iPhone con la app
  instalada) contra el deploy de Vercel, que hace el dueño.
- `tsc -b` y build sin errores. Advisors: 0029 en las 17 RPCs (por diseño), `push_subscriptions` y
  `ratings` con RLS sin políticas (a propósito), «leaked password protection», índice sin uso.

### Fase 7 · Dirección visible, mapa y trabajos cercanos (implementada, deployada y verificada; esperando revisión)
Pedido del dueño después de probar el MVP en el pueblo: la dirección no necesita ser privada y los
cortadores tienen que ver qué trabajos tienen más cerca.

- [x] Dirección y pin en `jobs`, visibles con el RLS de siempre (0024). Teléfono y apellido sin cambios.
- [x] Localidades con centro y radio; `private.check_location` rechaza pines fuera del radio con «La
  ubicación marcada está fuera de <localidad>.» (también NaN, infinito y valores imposibles).
- [x] Publicar / editar, en este orden: mapa (obligatorio, «Usar mi ubicación actual» + pin que se
  arrastra o se pone tocando), calle y número, entre calles (opcional), … y la zona (opcional) al final.
  Sin pin no se publica; si falta algo, la pantalla lleva al primer campo con error. Sin el cartel
  «Cuidá tu privacidad».
- [x] Ubicación base del cortador en el perfil («Desde dónde salís a cortar»), privada (`profile_private`).
- [x] Trabajos disponibles: «Ordenar por distancia» con «Desde mi ubicación actual» / «Desde mi casa»,
  «a 800 m» / «a 2,3 km» en cada tarjeta, vista Lista / Mapa (precio en cada pin; tocarlo muestra la
  tarjeta, que lleva al detalle). Sin origen: por fecha, con un aviso para usar el GPS o cargar la casa.
- [x] «Cómo llegar» en el detalle del trabajo (para el cortador, publicado o si lo eligieron).
- [x] Volver a publicar copia pin y dirección (de los pedidos viejos, sin pin, copia la dirección y pide el pin).
- [x] Avisos: llevan `address` (calle y número) y el texto la usa en lugar de la zona (también `send-push`).
- [x] `0025` (destructivo, aprobado por el dueño el 15/10/2026): `job_private` y las firmas viejas borradas.
  Orden pedido por el dueño para no romper la app: primero se confirmó que el front nuevo no depende de
  0025 (anda igual con 0024 sola y después de 0025), el dueño commiteó y deployó, y recién ahí se corrió 0025.

Front: `src/lib/geo.ts`, `src/map/` (LeafletMaps, lazy, LocationField, useCurrentPosition, map.css),
`src/profile/BaseLocationCard.tsx`; cambios en JobForm, JobCard, JobFacts, queries, saveJob, TrabajosPage,
Nuevo/Editar/Detalle de pedido, TrabajoDetallePage, AssignedPanel, describe y `send-push`.

Decisiones de la Fase 7:
- Migración en dos pasos para que el front deployado siga andando hasta el deploy nuevo: 0024 agrega y
  copia (RPCs nuevas al lado de las viejas); 0025 vuelve a copiar lo que haya cambiado y borra lo viejo.
  Entre 0025 y el deploy del front nuevo, el front viejo no puede publicar ni editar.
- La dirección de los pedidos viejos se copió entera a `address_street` (no se adivina el número) y
  quedan sin pin: el detalle no muestra «Cómo llegar» y al volver a publicarlos se pide el pin.
- Número de casa como texto (1–10): admite «s/n» y «1234 bis».
- Radio de 25 de Mayo: 10 km desde el centro del límite de la localidad en OSM (el límite llega a 9,4 km).
- Si el GPS da una ubicación fuera de la localidad, el pin no se mueve y se avisa; si es imprecisa
  (más de 50 m), se pone el pin y se pide revisarlo.
- Al abrir el formulario sin pin, el mapa arranca en el centro de la localidad; si el permiso de ubicación
  ya estaba dado, se mueve a donde está la persona pero sin poner el pin (puede no estar en el terreno).
- Trabajos disponibles: sin preferencia guardada, el origen es la casa si está cargada; si no, el GPS solo
  si el permiso ya estaba dado (el permiso se pide recién al tocar «Desde mi ubicación actual»). Origen y
  vista se recuerdan en el dispositivo (localStorage).
- Cambiar de localidad borra la ubicación base (quedaría fuera del radio).
- Los tiles de OSM no pasan por el service worker (solo se precachean los archivos de la app).

Verificación (15/10/2026, con el esquema final, después de 0025):
- SQL: `fase1` 35/35, `fase2` 97/97, `fase3` 95/95, `fase4` 82/82, `fase5` 61/61, `fase6` 50/50,
  `fase7_seguridad.sql` 73/73 (pin dentro/fuera del radio, NaN/infinito, calle/número/entre calles/zona,
  editar, visibilidad de la dirección para cortadores de la localidad y postulados, nada para el tercero
  sin rol de cortador, otra localidad, sin perfil y anon; teléfono, apellido y ubicación base nunca para
  otros; ubicación base fuera del radio; se borra al cambiar de localidad; `get_job_contact` sin dirección;
  avisos con `address` y sin datos privados; estructura). Total 493/493. Sin rastro después.
  Ajustes a las pruebas viejas: los casos que afirmaban que la dirección era privada ahora verifican que
  la ve el cortador (y que el teléfono y el apellido no); los avisos ya pueden llevar la dirección; dos
  casos (fase2 #40, fase3 #99) contaban todos los pedidos visibles y ahora solo los de la prueba, para no
  depender de los datos reales de la base.
- Red (sesiones reales): `verificar-red-fase7.mjs` 27/27 (123 respuestas), fase 2 21/21, fase 3 31/31,
  fase 4 27/27, fase 5 29/29; prueba de carrera 6 escenarios × 10 rondas, 0 invariantes rotas (en todos
  hubo los dos desenlaces).
- Front contra la base con 0024 sola (antes del deploy): publicar desde el navegador y `update_job` con los
  parámetros del front (con y sin opcionales) funcionaron con las dos firmas de las RPCs conviviendo.
- Navegador a 360 px (iframe de 360 px: Chrome no achica la ventana a menos de 500 px), con el GPS
  simulado: publicar con «Usar mi ubicación actual» y con el pin arrastrado y tocando el mapa (en la base
  quedó el pin ajustado); errores sin pin, GPS fuera de la localidad, GPS impreciso (± 140 m) y permiso
  denegado; Trabajos «Desde mi casa» y «Desde mi ubicación actual» con el orden y las distancias correctas
  («a 200 m» … «a 4,8 km»); vista de mapa con precios de 44 px, tocar uno resalta el pin y muestra la tarjeta
  (con margen para no quedar bajo la barra); detalle con «Cómo llegar» (`/maps/dir/?api=1&destination=…`);
  ubicación base desde el perfil. Sin scroll horizontal. Corregido en la prueba: el botón del GPS se cortaba.
  Pantalla táctil simulada (`pointer: coarse`): el mapa no se arrastra con un dedo (`touch-action: pan-x
  pan-y`), el pin sí (`touch-action: none`), botones + y − de 44 px. Falta la prueba con un celular real (dueño).
- `tsc -b` y build sin errores; Leaflet en su propio chunk (`LeafletMaps`, 45 kB gzip + 7 kB de CSS), fuera
  del bundle principal. `database.types.ts` regenerado (igual al escrito a mano con el esquema final).
- `send-push` redeployado (texto con la dirección), con el mismo contenido que el archivo del repo.
- Advisors: 0029 en las 18 RPCs (por diseño; se sumó `set_my_base_location`), `push_subscriptions` y
  `ratings` con RLS sin políticas (a propósito), «leaked password protection», índice sin uso.
- Limpieza: 32 usuarios de prueba borrados por el MCP (el único archivo que quedaba, un avatar, antes por
  la API). En la base quedan solo los datos reales; sin archivos ni dispositivos huérfanos.
- Calendario de «Día» (de la Fase 2, arreglado a pedido del dueño): a 360 px el modal dejaba 292 px para
  7 días de 48 px y tenía scroll horizontal (el domingo quedaba fuera). Ahora el modal tiene menos margen
  y relleno, ancho fijo de 400 px (en el celular lo limita la pantalla) y las celdas se reparten el ancho
  (`src/jobs/schedule.tsx` + `calendar.module.css`). Medido en días, meses y años, a 360 y 1200 px: sin
  scroll; celdas de 46 × 48 (días), 100 × 48 (meses) y 108 × 48 (años) a 360. Elegir un día sigue andando
  y los días fuera de rango siguen deshabilitados. Se midió con una página temporal que solo muestra el
  campo (sin usuarios de prueba) y se borró después.

### Fase 8 · Términos y privacidad, borrar la cuenta, cualquier ciudad (paso 1 y front listos; falta deploy y 0027)
Pedido del dueño antes de abrir a usuarios reales. Cambia decisiones anteriores: la localidad deja de
filtrar y de elegirse; la visibilidad pasa a ser por distancia.

- [x] Páginas públicas `/terminos`, `/privacidad` y `/borrar-cuenta` (borrador en criollo para revisar con un
  abogado; contacto pastocontrol@gmail.com), linkeadas desde el registro, el ingreso y el perfil. En el registro
  y en la pantalla de aceptación se abren en un modal (pantalla completa en el celular) para no perder el formulario.
- [x] Versionado: `terms_versions` / `terms_acceptances`; casilla obligatoria en el registro (la aceptación viaja
  en el `signUp` y la guarda un trigger); `RequireTerms` pide aceptar a quien no aceptó la vigente (los usuarios
  existentes, la primera vez). Si el front es más viejo que la versión vigente, pide recargar.
- [x] Validación en la base: `private.require_terms` en las RPCs de escritura (se prende en 0027).
- [x] Borrar la cuenta: botón en el perfil (zona aparte, en rojo) → `/cuenta/borrar`: lista de pendientes con un
  link a cada uno (no se cancela nada solo), contraseña, modal final. Edge Function `delete-account` →
  `delete_account` → Storage → Auth. Página `/cuenta-borrada`; el dispositivo queda limpio (push, preferencias,
  sesión).
- [x] FK a profiles con `on delete set null`, PK de `ratings`, checks y RPCs revisadas para ids en null (0026).
- [x] Cualquier ciudad: pin y casa en todo el país; sin localidad en el onboarding ni en el perfil; casa
  obligatoria para cortar (paso del onboarding y, a los cortadores que no la tienen, antes de ver los trabajos);
  teléfono con característica obligatoria; «Usuario eliminado» en tarjetas, detalle, postulantes, contacto y avisos.
- [x] Trabajos disponibles por radio (5/10/20/50 km, 20 por defecto, guardado en la cuenta) desde la ubicación
  actual o la casa (si el GPS falla, desde la casa, con un aviso); filtro y orden en el servidor.

Orden de deploy (como la Fase 7, sin ventana rota):
1. **0026 (hecho, 16/10/2026)**: no rompe el front deployado. Agrega tablas, columnas, RPCs y la firma nueva de
   `upsert_my_profile` al lado de la vieja; el RLS deja ver los publicados a todos los cortadores (el front
   viejo igual filtra por localidad y todos tienen 25 de Mayo); el pin vale en todo el país (el front viejo
   igual lo limita a 25 de Mayo); los interruptores de términos y casa quedan apagados. Las FK y la PK de
   `ratings` se rehicieron con DROP CONSTRAINT (aprobado por el dueño): sin perder datos y con los mismos nombres.
   Edge Function `delete-account` deployada y `send-push` redeployada (texto con «Usuario eliminado»).
2. **Deploy del front nuevo (lo hace el dueño)**: anda con 0026 solo (probado así en el navegador).
3. **0027 (destructivo, requiere aprobación)**: prende términos y casa obligatorios, borra la firma vieja de
   `upsert_my_profile`, `private.my_cutter_locality_id` y el índice `jobs_available_idx`. Después de 0027 el
   front viejo (si quedó abierto o en caché) no puede guardar el perfil ni escribir sin aceptar los términos.

Decisiones de la Fase 8 (planteadas al dueño y aprobadas antes de implementar):
- Quien no aceptó la versión vigente igual puede irse: cancelar, retirar, desactivar avisos, marcar avisos
  leídos y borrar la cuenta (Ley 25.326: no se condiciona el borrado). La pantalla de aceptación ofrece «Quiero
  borrar mi cuenta» y deja entrar solo a `/cuenta/borrar` y a los detalles de pedidos y trabajos.
- La aceptación va en una tabla privada aparte (al registrarse todavía no existe `profile_private`).
- La validación de términos y de la casa en la base se prende recién en 0027 (antes trabaría al front viejo).
- Borrar desde el panel de Supabase pasa por el mismo trigger: anonimiza igual y falla si hay pendientes (no
  borra los archivos de Storage: eso lo hace solo la Edge Function). Para la limpieza de pruebas, si hiciera
  falta, `sql/tests/cerrar_pendientes_prueba.sql`.
- Un pedido queda en la base mientras le quede alguna de las partes; cuando se van todas, se borra entero.
- `delete_account` solo la ejecuta service_role: así la contraseña se verifica siempre (alguien con el celular
  desbloqueado no puede borrar la cuenta sin ella).
- La contraseña se verifica en la función con un `signInWithPassword` aparte; la sesión que abre se cierra.

Verificación (16/10/2026, con 0026 y el estado final de 0027 simulado dentro de cada prueba SQL):
- SQL: `fase8_seguridad.sql` 111/111: pendientes (publicado, vencido, postulación pendiente y aceptada)
  bloquean el borrado por la RPC y desde el panel; nadie puede borrar a otro (anon, otro usuario, ni el propio
  sin la Edge Function); sin aceptar, D igual cancela, retira y se va; después del borrado no queda NINGÚN dato
  de D en ninguna columna de texto, json, uuid o array de `public`, `auth` y `storage` (con control positivo
  antes), ni archivos; las estadísticas de la otra parte quedan iguales (80 % y 60 %, con 5 calificaciones de la
  semana pasada); trabajos, acuerdos y calificaciones anónimos; avisos sin nombre ni dirección; contacto y
  calificación con alguien borrado; un pedido sin partes se borra; radio 5/10/20/50 con orden exacto y bordes
  (4,9 y 5,1 km); términos en las 11 RPCs de escritura, las 4 exentas, versión nueva, historial y el trigger del
  registro (versión vigente, otra y basura).
  Fases anteriores, adaptadas (firma nueva del perfil, términos aceptados y casa cargada; lo que verificaba que
  otra localidad no veía nada ahora verifica que la ve y que igual no recibe teléfonos, apellidos ni casas):
  fase1 37/37, fase2 98/98, fase3 96/96, fase4 82/82 (la regla de cambiar de localidad se reemplazó por la casa
  obligatoria y la localidad que no se toca), fase5 61/61, fase6 50/50, fase7 75/75 (radio de la localidad →
  fuera de Argentina). Total 610/610. Sin rastro después (interruptores apagados, sin usuarios ni filas de prueba).
- Red (sesiones reales): `verificar-red-fase8.mjs` 31/31: preflight CORS; sin sesión 401; token inventado 401;
  contraseña de otra cuenta 403; contraseña equivocada 403; con pendientes 409 sin borrar nada; con todo
  cancelado 200 borrando solo a quien llama aunque el cuerpo traiga el id de otro; después: no puede entrar, sus
  fotos no existen, el trabajo sigue para la otra parte sin datos, sus estadísticas iguales, ninguna de las 20
  respuestas posteriores trae datos del borrado; registro con y sin la casilla; radio con sesiones reales.
  Fases 2 21/21, 3 31/31, 4 27/27, 5 29/29, 7 27/27; carrera 6 escenarios × 30 rondas, 0 invariantes rotas y
  los dos desenlaces en todos.
- Navegador a 360 px (iframe; `ui.localhost:5173`): registro sin la casilla (error) y con ella (modal de términos
  sin perder el formulario) → onboarding de los dos roles → teléfono sin característica rechazado → casa con GPS
  simulado en Rosario → publicar con el pin en Córdoba (en la base, -31.4201, -64.1888); usuario existente sin
  aceptar: bloqueado también entrando por URL, error sin la casilla, acepta y entra; borrar cuenta: bloqueado con
  la lista (postulación y pedido), retira y cancela desde los links, contraseña equivocada rechazada, borrado →
  «Borramos tu cuenta» y nada en la base; cortador en Rosario: 20 km (3 y 8 km), 5 km (3 km), 50 km (3, 8 y 30 km
  en orden, guardado), mapa con «Tu casa», «Mi ubicación actual»; trabajo realizado cuyo cliente se borró:
  «Usuario eliminado», «Dirección borrada», sin contacto ni calificación, avisos con «Usuario eliminado». Sin
  scroll horizontal, sin textos cortados y sin botones de menos de 44 px (medido en cada pantalla; corregidos en
  la prueba: «Términos»/«Privacidad» del perfil y un botón de `/borrar-cuenta` se cortaban, Lista/Mapa medían 42).
  No probado en el navegador: el GPS denegado sin una ubicación previa (cae a la casa; el permiso real hubiera
  abierto un diálogo del navegador).
- `tsc -b` y build sin errores. `database.types.ts` regenerado (sin la firma vieja de `upsert_my_profile`, que
  se va en 0027). Funciones deployadas iguales a los archivos del repo.
- Advisors: 0029 en 23 RPCs (por diseño; 22 después de 0027), `push_subscriptions` y `ratings` con RLS sin
  políticas (a propósito), «leaked password protection», índice sin uso (`profiles_locality_id_idx`).
  `delete_account` no figura: authenticated no la puede ejecutar.
- Limpieza: los usuarios de la prueba del navegador se borraron con la Edge Function (con sus archivos). El
  `delete` de los demás usuarios de prueba (sin archivos ni pendientes) lo rechazó el MCP con «Invalid or expired
  requestState»: queda para correr con el dueño presente.

Front: `src/legal/` (terms, TermsGate), `src/pages/legal/` (Términos, Privacidad, BorrarCuentaInfo, LegalLinks,
LegalParts), `src/account/` (deleteAccount, BorrarCuentaPage, CuentaBorradaPage), `src/profile/BaseLocationStep.tsx`;
cambios en router, Registrarse, Ingresar, Bienvenida, Perfil, ProfileForm, BaseLocationCard, TrabajosPage,
jobs/queries, JobCard, JobForm, LocationField, geo, phone, AssignedPanel, ApplicantsList, ApplicationPanel,
TrabajoDetalle, Nuevo/Editar pedido, PersonaPage, describe y `send-push`.

### Pendientes futuros (sin fase asignada)
- Limpieza de fotos huérfanas en `job-photos`: archivos subidos cuyo `create_job` nunca se completó
  (se cerró la app, se cortó la red entre la subida y la RPC). Hoy el front borra lo subido si la RPC
  falla, pero si el navegador se cierra en el medio quedan en `<uid>/<job_id>/` sin pedido. Opciones:
  tarea periódica (Edge Function con cron) que borre por la API de Storage los objetos de más de 24 h
  cuya carpeta no corresponde a ningún `jobs.id` o que no estén en `photo_paths`.
- Retención de `notifications` (borrar o archivar las leídas viejas).
- Recordatorio «¿Ya cortaron?»: el día después de la fecha acordada, si el trabajo sigue asignado (nadie
  lo marcó realizado), aviso a las dos partes para que lo marquen. Necesita un proceso programado
  (pg_cron o Edge Function con cron) que inserte el aviso con `private.notify` y una dedupe_key por trabajo.
- Mejorar la interfaz (hoy muy simple). Va al final, cuando el flujo esté cerrado.
- Antes de abrir a usuarios reales: SMTP propio en Supabase, revisión de los términos y la privacidad con un
  abogado (sugerencias: edad mínima, quién es el responsable de los datos y su domicilio, inscripción de la base
  en la AAIP, transferencia internacional por los servidores de Supabase y Vercel), y pasar el SQL de `sql/` a
  migraciones versionadas con la CLI.
- Columnas que ya no se usan desde la Fase 8 (`localities.radius_m`, `localities.phone_area_code`): se pueden
  borrar más adelante (destructivo, con aprobación).

## Verificación al cerrar cada fase
- Pruebas SQL con varios usuarios (dueño, cortador, tercero y anon) sobre cada política y RPC nueva.
- Revisar las respuestas de red como usuario sin permiso: el teléfono, el apellido y la ubicación base
  ajenos no aparecen nunca; la dirección, solo para quien ve el pedido.
- Las pruebas SQL simulan el estado final (términos y casa obligatorios) y cada usuario de prueba acepta los
  términos (y los cortadores cargan su casa): seguir el mismo patrón en las nuevas.
- `tsc -b` y el build sin errores. Sin scroll horizontal a 360 px.
- Listar los SQL nuevos y lo ejecutado. Revisar los advisors de Supabase.
- Actualizar este archivo.

## Registro de SQL

| Archivo | Fase | Contenido |
|---------|------|-----------|
| `sql/0001_base.sql` | 1 | Schema private, permisos por defecto, `touch_updated_at` |
| `sql/0002_localidades.sql` | 1 | `localities` + 25 de Mayo |
| `sql/0003_perfiles.sql` | 1 | `profiles`, `profile_private`, `upsert_my_profile` |
| `sql/0004_storage_avatars.sql` | 1 | Bucket `avatars` y políticas |
| `sql/0005_trabajos.sql` | 2 | `jobs`, `job_private`, helpers, `is_expired`, RLS |
| `sql/0006_storage_job_photos.sql` | 2 | Bucket `job-photos` y políticas |
| `sql/0007_rpc_trabajos.sql` | 2 | `create_job`, `update_job`, `cancel_job` |
| `sql/0008_perfil_rol_cliente.sql` | 2 | `upsert_my_profile` bloquea sacar el rol de cliente con trabajos activos (y bloquea la fila del perfil) |
| `sql/0009_jobs_politica_unica.sql` | 2 | Una sola política SELECT en `jobs` (ejecutado desde el panel) |
| `sql/0010_postulaciones.sql` | 3 | `applications`, helpers de RLS, política de `jobs` ampliada (alter policy) |
| `sql/0011_avisos.sql` | 3 | `notifications`, `private.notify`, `mark_notifications_read`, Realtime |
| `sql/0012_rpc_postulaciones.sql` | 3 | `apply_to_job`, `update_application`, `withdraw_application` |
| `sql/0013_trabajos_perfil_fase3.sql` | 3 | `update_job`, `cancel_job` y `upsert_my_profile` con las reglas de la Fase 3 |
| `sql/tests/fase1_seguridad.sql` | 1 | 35 casos |
| `sql/tests/fase2_seguridad.sql` | 2 | 97 casos |
| `sql/0014_asignacion.sql` | 4 | Acuerdo en `jobs` (columnas, checks, índices) |
| `sql/0015_rpc_asignacion.sql` | 4 | `accept_application`, `get_job_applicants`, `get_job_contact` |
| `sql/0016_cancelacion_asignados_y_localidad.sql` | 4 | `cancel_job` (asignados), `withdraw_application` (mensaje), `upsert_my_profile` (localidad) |
| `sql/0017_postulaciones_version.sql` | 4 | `applications.updated_at` con `clock_timestamp()` (versión confiable) |
| `sql/tests/fase3_seguridad.sql` | 3 | 95 casos |
| `sql/tests/fase4_seguridad.sql` | 4 | 82 casos (ajustada a `job_agreements` en la Fase 5) |
| `sql/0018_acuerdos.sql` | 5 | `job_agreements` (un acuerdo por pedido, solo las dos partes) + copia de los acuerdos existentes |
| `sql/0019_acuerdo_fuera_de_jobs.sql` | 5 | **Destructivo, aprobado:** borra las columnas de acuerdo de `jobs`; `accept_application`, `get_job_contact` y `cancel_job` usan `job_agreements` |
| `sql/0020_cancelacion_privada.sql` | 5 | `job_agreements.cancelled_by`; `cancel_job` ya no pone al cortador en `jobs.cancelled_by` |
| `sql/0021_realizado_y_calificaciones.sql` | 5 | `ratings`, `private.profile_stats`, `get_profile_stats`, `mark_job_done`, `rate_job`, `has_rated_job`, estadísticas en `get_job_applicants` |
| `sql/tests/fase5_seguridad.sql` | 5 | 61 casos |
| `sql/0022_web_push.sql` | 6 | pg_net, `push_subscriptions`, `save_push_subscription`, `delete_push_subscription`, `notifications.pushed_at`, trigger `notifications_queue_push`, URL en Vault |
| `sql/0023_push_secreto.sql` | 6 | Trigger con el header `x-push-secret` (valor en Vault, no en el repo) |
| `sql/tests/fase6_seguridad.sql` | 6 | 50 casos |
| `sql/0024_ubicacion_y_direccion_visible.sql` | 7 | No destructivo: centro y radio de las localidades, `private.distance_m` / `check_location`, dirección y pin en `jobs` (copia de `job_private`), `zone` opcional, ubicación base en `profile_private`, `create_job` / `update_job` con firma nueva, `set_my_base_location`, `private.notify` con `address`, `upsert_my_profile` borra la ubicación base si cambia la localidad |
| `sql/0025_borrar_job_private.sql` | 7 | **Destructivo, requiere aprobación:** vuelve a copiar la dirección, `address_street` not null, borra las firmas viejas de `create_job` / `update_job` / `check_job_input`, `get_job_contact` sin dirección y la tabla `job_private` |
| `sql/tests/fase7_seguridad.sql` | 7 | 73 casos (75 desde la Fase 8) |
| `sql/0026_terminos_borrado_y_distancia.sql` | 8 | Paso 1, no rompe el front viejo: localidad por defecto, `check_in_argentina`, términos (tablas, `require_terms` apagado, `accept_terms`, `get_my_terms_status`, trigger del registro), casa obligatoria (apagada), radio, `get_available_jobs` e índice, RLS de jobs sin localidad, `upsert_my_profile` sin localidad, FK con set null y PK de `ratings` (DROP CONSTRAINT aprobado), `pending_items`, trigger de borrado, `delete_account`, RPCs con ids que pueden ser null |
| `sql/0027_terminos_y_casa_obligatorios.sql` | 8 | **Destructivo, requiere aprobación; después del deploy del front:** prende términos y casa obligatorios, borra la firma vieja de `upsert_my_profile`, `my_cutter_locality_id` y `jobs_available_idx` |
| `sql/tests/fase8_seguridad.sql` | 8 | 111 casos |
| `sql/tests/cerrar_pendientes_prueba.sql` | 8 | Solo si hace falta antes de la limpieza: cancela lo pendiente de los usuarios de prueba (no borra nada) |
| `sql/tests/limpiar_usuarios_prueba.sql` | 1 | Borra usuarios de pruebas de punta a punta |

Scripts (revisan las respuestas de red con sesiones reales; crean usuarios `pastocontrol.prueba.*`
que después se borran con `sql/tests/limpiar_usuarios_prueba.sql`):
- `node scripts/verificar-red-fase2.mjs <foto.jpg>` (Fase 2).
- `node scripts/verificar-red-fase3.mjs` (Fase 3: postulaciones, avisos y Realtime).
- `node scripts/verificar-red-fase4.mjs` (Fase 4: postulantes, contacto y cancelación).
- `node scripts/prueba-carrera-fase4.mjs [rondas]` (Fase 4: carreras con sesiones en paralelo).
- `node scripts/verificar-red-fase5.mjs` (Fase 5: realizado, calificaciones y estadísticas; el
  trabajo se crea para dentro de 20 minutos, así que hay que correrlo antes de las 23:40 hora local).
- `node scripts/verificar-red-fase7.mjs` (Fase 7: dirección visible, pin, ubicación base, radio).
- `node scripts/preparar-prueba-mapa.mjs` (Fase 7: crea un cliente con 4 pedidos en distintos puntos y un
  cortador con su casa, e imprime los mails y la contraseña para probar el mapa en el navegador).
- `node scripts/verificar-red-fase8.mjs` (Fase 8: Edge Function `delete-account`, términos y radio; antes de las
  23:40 hora local).
- `node scripts/preparar-prueba-fase8.mjs` (Fase 8: usuario sin aceptar los términos, uno con pendientes para
  borrar, un cortador en Rosario y pedidos a 3, 8 y 30 km).

Desde la Fase 8 todos los scripts se registran con la casilla de términos (`terms_version` en el `signUp`), usan la
firma nueva de `upsert_my_profile` y cargan la casa de los cortadores, así andan con 0026 y después de 0027.

Desde la Fase 7 los scripts de las fases 2–5 publican con pin y ya no tratan la dirección como secreta
para los cortadores que ven el pedido (sí para anon y para quien no lo ve); siguen controlando apellidos
y WhatsApp. La dirección la controla en detalle `verificar-red-fase7.mjs`.
