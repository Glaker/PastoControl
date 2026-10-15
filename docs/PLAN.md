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

Deploy: https://pastocontrol.vercel.app (Vercel). El ciclo completo se probó en celular y PC.

## Producto

PWA para conseguir quién te corte el pasto. Arranca en 25 de Mayo (Buenos Aires), pero la localidad
es un dato del modelo (`localities`), nunca un valor fijo en el código.

- **Cliente:** publica su terreno con precio, fecha y hora.
- **Cortador:** se postula aceptando las condiciones o con contraoferta de precio y/o de horario.
- El cliente acepta una postulación, se liberan la dirección y los WhatsApp, y al terminar se califican entre sí.
- Gratis: sin pagos ni chat dentro de la app. Tampoco mapas, publicidad ni verificación de identidad.

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
  `delete from public.localities where false`.)
- **Lecturas:** por RLS (`grant select` + política). Los datos privados viven en tablas aparte que
  solo lee el dueño, para que ni un `select *` ni un embed los filtren:
  - `profile_private`: apellido y teléfono;
  - `job_private`: dirección.
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
- Secretos (`VAPID_PRIVATE_KEY`, `PUSH_WEBHOOK_SECRET`): los carga el dueño en Supabase → Edge Functions → Secrets. Nunca en el
  repo, en el front ni en archivos del proyecto.

### Datos personales
- Nombre visible: nombre + inicial del apellido («Ana Á.») hasta la aceptación. Nombre completo y
  WhatsApp, solo después (`get_job_contact`, Fase 4).
- Teléfono con libphonenumber-js, guardado como `+549…`; si falta la característica se completa con
  la de la localidad (`src/lib/phone.ts`).

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
- Interfaz: áreas táctiles de 44–48 px como mínimo; siempre ícono con texto; sin truncar precio,
  fecha, hora ni zona; sin scroll horizontal a 360 px; textos en español rioplatense.

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
- **Contacto:** `get_job_contact` devuelve dirección, nombre completo y WhatsApp de la contraparte,
  solo a las dos partes y solo con el trabajo asignado o realizado.
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
- **Zona:** texto libre por ahora.
- Al publicar, un aviso pide «no pongas la dirección en la nota ni en las fotos».
- **Mails:** «Confirm email» desactivado para la beta. SMTP propio pendiente (lo configura el dueño).

### Decisiones tomadas en la Fase 2 (además de lo pedido)
- El `id` del trabajo lo genera el navegador (`crypto.randomUUID()`) para subir las fotos a
  `job-photos/<uid>/<job_id>/` antes de llamar a `create_job`, igual que el avatar: si la RPC falla,
  se borran. `create_job` verifica que cada foto esté en esa carpeta y exista.
- Los cortadores ven por RLS solo los trabajos **publicados, no vencidos y de su localidad**. Las fotos
  se leen con la misma regla (la política del bucket consulta `jobs` con el RLS del que llama), así que
  un cortador de otra localidad o un cliente sin rol de cortador no ve ni el trabajo ni sus fotos.
  En la Fase 3 se suma: el cortador que se postuló ve el trabajo (y sus fotos) en cualquier estado.
- Límites: precio entero entre $ 1.000 y $ 5.000.000; fecha entre ahora y 60 días; zona 2–80 letras;
  dirección 3–200; nota hasta 500; hasta 5 fotos; hasta 5 pedidos publicados a la vez por cliente (anti-spam).
- `jobs.locality_id` se copia del perfil del cliente al publicar.

## Modelo de datos

### Existente
- `localities` (0002): id, slug, name, province, timezone, phone_area_code, is_active. Lectura: logueados.
- `profiles` (0003): id = auth.users.id, locality_id, first_name, last_initial, avatar_path, is_client,
  is_cutter. Lectura: logueados.
- `profile_private` (0003): user_id, last_name, phone_e164. Lectura: solo el dueño.
- Bucket `avatars` (0004): privado, 2 MB, jpeg/png/webp. Lectura: logueados; escritura: carpeta propia.
- `jobs` (0005): id, client_id → profiles, locality_id, zone, price_ars, desired_at, notes,
  photo_paths text[] (≤ 5, todas en `<client_id>/<id>/`), status
  (`publicado|asignado|realizado|cancelado`), republished_from → jobs, cancelled_at, cancelled_by,
  created_at, updated_at. Computed field `is_expired`.
  Lectura: el dueño (todos los suyos), los cortadores de la localidad (publicados no vencidos) y los
  cortadores que se postularon (cualquier estado), en una sola política SELECT (0009, ampliada en 0010).
  `cancelled_by` solo guarda al cliente: si cancela el cortador elegido queda null (lo verían los
  no elegidos) y el autor va en `job_agreements.cancelled_by` (0020).
  **Embeds:** con `job_agreements` hay caminos indirectos entre jobs, applications y profiles: siempre
  nombrar la relación (`applications!applications_job_id_fkey(...)`, `job:jobs!applications_job_id_fkey(...)`,
  `client:profiles!jobs_client_id_fkey(...)`, `agreement:job_agreements!job_agreements_job_id_fkey(...)`).
  Sin el nombre, PostgREST responde PGRST201.
- `job_agreements` (0018, reemplaza las columnas de acuerdo de jobs desde 0019): job_id (PK = un solo
  acuerdo por pedido) → jobs, application_id (único) → applications, client_id, cutter_id → profiles,
  price_ars, agreed_at, assigned_at, done_at, done_by, cancelled_by. Se crea en `accept_application` y
  queda como historial si se cancela. Lectura: solo `client_id` o `cutter_id`; sin escritura directa.
- `job_private` (0005): job_id, address. Lectura: solo el dueño del trabajo.
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
  RLS sin políticas y sin grants: nadie las lee, ni las partes. Solo se usan dentro de
  `private.profile_stats`.

- `push_subscriptions` (0022): id, user_id → profiles (cascade), endpoint (único; solo servicios de push
  conocidos: FCM, Mozilla, Apple, Windows — `private.is_push_endpoint`), p256dh, auth, created_at,
  updated_at. RLS sin políticas y sin grants: nadie la lee por la API (ni el dueño). Se escribe con
  `save_push_subscription` / `delete_push_subscription`; la lee la Edge Function `send-push` con la clave
  de servicio. Hasta 10 dispositivos por persona.
- `notifications.pushed_at` (0022): cuándo `send-push` reclamó el aviso (sale una sola vez).

## RPCs

| RPC | Fase | Qué hace |
|-----|------|----------|
| `upsert_my_profile` | 1 (+2, +3, +4) | Crea/actualiza el perfil propio. Fase 2: no deja sacar el rol de cliente con trabajos publicados o asignados. Fase 3: idem cortador con postulaciones activas. Fase 4: no deja cambiar de localidad con pedidos publicados/asignados ni postulaciones pendientes/aceptadas. |
| `create_job` | 2 | Publica un trabajo (id generado por el front) con dirección en `job_private`. |
| `update_job` | 2 (+3) | Edita un trabajo publicado propio (también vencido). Fase 3: falla si hay postulaciones pendientes. |
| `cancel_job` | 2 (+3, +4) | Publicado: solo el cliente; cancela las pendientes y avisa. Asignado (Fase 4): el cliente o el cortador aceptado; la aceptada pasa a cancelada y avisa a la otra parte. |
| `apply_to_job`, `update_application`, `withdraw_application` | 3 | Postularse (reusa la fila si estaba retirada), editar, retirar. Bloqueos: perfil `FOR SHARE` → trabajo `FOR SHARE` → postulación `FOR UPDATE`. Avisan al cliente. Hasta 20 pendientes por cortador. |
| `mark_notifications_read(p_ids default null)` | 3 | Marca avisos propios como leídos (los indicados o todos). Devuelve cuántos. |
| `accept_application(p_application_id, p_expected_updated_at)` | 4 | Aceptación atómica: trabajo `FOR UPDATE`, versión de la postulación, acuerdo (propuesta o lo publicado; el horario tiene que ser futuro), rechaza las demás pendientes y avisa a todos. |
| `get_job_applicants(p_job_id)` | 4 (+5) | Postulantes (sin retiradas) con nombre visible, foto y propuesta, solo para el dueño. Fase 5: `done_jobs` (realizados como cortador) y `yes_pct`. |
| `get_job_contact(p_job_id)` | 4 (+5) | Nombre completo, WhatsApp y dirección de la contraparte + el acuerdo; solo las dos partes y solo con el trabajo asignado o realizado. Fase 5: lee `job_agreements`. |
| `mark_job_done(p_job_id)` | 5 | Cualquiera de las dos partes, con el trabajo asignado y desde el día acordado (hora local). Pasa a realizado y avisa a la otra parte. |
| `rate_job(p_job_id, p_would_work_again)` | 5 | Una calificación por parte, con el trabajo realizado. No se puede cambiar. |
| `has_rated_job(p_job_id)` | 5 | Si el que llama ya calificó (sin decir qué puso). |
| `get_profile_stats(p_user_id)` | 5 | done_as_cutter, done_as_client y yes_pct (null con menos de 5; lote semanal; redondeado a la decena). Nunca la cantidad. |
| `save_push_subscription(p_endpoint, p_p256dh, p_auth)` | 6 | Guarda o actualiza el dispositivo del que llama (requiere perfil). Si el endpoint era de otra cuenta, pasa a la actual (el endpoint es del dispositivo). Valida servicio de push y formato de claves. Deja los 10 más recientes. |
| `delete_push_subscription(p_endpoint)` | 6 | Saca un dispositivo propio (desactivar avisos o cerrar sesión). Devuelve si había algo. |

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
- Dirección: reemplazar la zona por calle, entre qué calles y número, más la selección de la ubicación
  exacta en Google Maps. Se plantea aparte.
- Mejorar la interfaz (hoy muy simple). Va al final, cuando el flujo esté cerrado.
- Antes de abrir a usuarios reales: SMTP propio en Supabase, borrar la cuenta, política de privacidad y
  términos, y pasar el SQL de `sql/` a migraciones versionadas con la CLI.

## Verificación al cerrar cada fase
- Pruebas SQL con varios usuarios (dueño, cortador, tercero y anon) sobre cada política y RPC nueva.
- Revisar las respuestas de red como usuario sin permiso: la dirección y el teléfono ajenos no aparecen nunca.
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
| `sql/tests/limpiar_usuarios_prueba.sql` | 1 | Borra usuarios de pruebas de punta a punta |

Scripts (revisan las respuestas de red con sesiones reales; crean usuarios `pastocontrol.prueba.*`
que después se borran con `sql/tests/limpiar_usuarios_prueba.sql`):
- `node scripts/verificar-red-fase2.mjs <foto.jpg>` (Fase 2).
- `node scripts/verificar-red-fase3.mjs` (Fase 3: postulaciones, avisos y Realtime).
- `node scripts/verificar-red-fase4.mjs` (Fase 4: postulantes, contacto y cancelación).
- `node scripts/prueba-carrera-fase4.mjs [rondas]` (Fase 4: carreras con sesiones en paralelo).
- `node scripts/verificar-red-fase5.mjs` (Fase 5: realizado, calificaciones y estadísticas; el
  trabajo se crea para dentro de 20 minutos, así que hay que correrlo antes de las 23:40 hora local).
