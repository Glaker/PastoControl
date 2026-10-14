# PastoControl · Plan

Fuente de verdad para las próximas sesiones: decisiones, modelo, RPCs, fases, convenciones y estado.
Se actualiza al cerrar cada fase.

## Estado

| Fase | Contenido | Estado |
|------|-----------|--------|
| 0 | Base: Vite + React + Mantine + PWA + Supabase | ✅ terminada y commiteada |
| 1 | Cuentas, perfiles, avatars, onboarding, recuperar clave, actualización de la PWA | ✅ terminada y commiteada |
| 2 | Trabajos: jobs, job_private, job-photos, publicar/editar/cancelar, listas y detalles | 🟡 implementada, esperando revisión |
| 3 | Postulaciones y notificaciones (bandeja + contador) | ⏳ pendiente |
| 4 | Aceptación atómica, postulantes, contacto + WhatsApp, cancelaciones después de asignar, prueba de carrera | ⏳ pendiente |
| 5 | Marcar realizado, calificaciones, estadísticas, perfil público, volver a publicar | ⏳ pendiente |
| 6 | Web Push | ⏳ pendiente |

Pendiente del dueño del proyecto (no bloquea fases): configurar el SMTP propio en Supabase.

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
- Sentencias destructivas (DROP, DELETE): el MCP no las puede ejecutar (falla su confirmación).
  Se prefieren alternativas no destructivas (`alter policy`); si no hay, el dueño las corre desde el panel.
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
- Una fase a la vez; al terminar, frenar para revisión.
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
- **Calificaciones:** «¿Volverías a trabajar con esta persona? Sí/No», una por lado. Nadie las lee
  (RLS sin políticas y sin grants). El perfil público muestra trabajos realizados y % de «sí»:
  - solo con 5 calificaciones o más;
  - en lotes semanales: cuentan las hechas antes del lunes 00:00 (zona de la localidad), calculado al leer;
  - redondeado a la decena;
  - nunca la cantidad de calificaciones.
- **Notificaciones:** se insertan en la misma transacción que el cambio de estado, con `dedupe_key`
  única por destinatario y `on conflict do nothing`. El payload nunca lleva datos privados. Bandeja en
  `/avisos`, contador de no leídas por Realtime que también se refresca al volver al frente. Web Push en la Fase 6.
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
  Lectura: el dueño (todos los suyos) y los cortadores de la localidad (publicados no vencidos),
  en una sola política SELECT (0009). Embed del cliente: `client:profiles!jobs_client_id_fkey(...)`
  (hay dos FK a profiles).
- `job_private` (0005): job_id, address. Lectura: solo el dueño del trabajo.
- Bucket `job-photos` (0006): privado, 3 MB, jpeg/png/webp, `<uid>/<job_id>/...`. Lectura: el dueño
  (su carpeta) y quien puede ver el trabajo por RLS (solo las fotos listadas en `photo_paths`);
  escritura: carpeta propia.

### Planeado
- `applications` (Fase 3): id, job_id, cutter_id, status (`pendiente|aceptada|rechazada|retirada|cancelada`),
  proposed_price_ars, proposed_at, created_at, updated_at. `unique (job_id, cutter_id)`;
  único parcial `(job_id) where status = 'aceptada'`. Lectura: el cortador las suyas; el cliente,
  vía `get_job_applicants` (Fase 4) o RLS limitada.
- `notifications` (Fase 3): id, user_id, kind, job_id, application_id, payload jsonb (sin datos
  privados), dedupe_key, read_at, created_at. `unique (user_id, dedupe_key)`. Lectura: el destinatario. Realtime.
- `jobs` (Fase 4): + assigned_cutter_id, agreed_price_ars, agreed_at. (Fase 5): + done_at, done_by.
- `ratings` (Fase 5): job_id, rater_id, ratee_id, would_work_again boolean, created_at;
  `unique (job_id, rater_id)`. RLS sin políticas, sin grants.
- `push_subscriptions` (Fase 6): user_id, endpoint, p256dh, auth, created_at.

## RPCs

| RPC | Fase | Qué hace |
|-----|------|----------|
| `upsert_my_profile` | 1 (+2, +3) | Crea/actualiza el perfil propio. Fase 2: no deja sacar el rol de cliente con trabajos publicados o asignados. Fase 3: idem cortador con postulaciones activas. |
| `create_job` | 2 | Publica un trabajo (id generado por el front) con dirección en `job_private`. |
| `update_job` | 2 (+3) | Edita un trabajo publicado propio (también vencido). Fase 3: falla si hay postulaciones pendientes. |
| `cancel_job` | 2 (+3, +4) | Cancela un trabajo publicado propio. Fase 3: cancela las postulaciones y notifica. Fase 4: también asignado, por cualquiera de las dos partes. |
| `apply_to_job`, `update_application`, `withdraw_application` | 3 | Postularse (reusa la fila si estaba retirada), editar, retirar. `FOR SHARE` sobre el trabajo. |
| `mark_notifications_read` | 3 | Marca avisos propios como leídos. |
| `accept_application(p_application_id, p_expected_updated_at)` | 4 | Aceptación atómica. |
| `get_job_applicants(p_job_id)` | 4 | Postulantes con nombre visible, foto y estadísticas, solo para el dueño. |
| `get_job_contact(p_job_id)` | 4 | Dirección, nombre completo y WhatsApp de la contraparte. |
| `mark_job_done`, `rate_job`, `get_profile_stats` | 5 | Realizado, calificación, estadísticas públicas. |
| `save_push_subscription` / `delete_push_subscription` | 6 | Web Push. |

## Fases

### Fase 2 · Trabajos (implementada, esperando revisión)
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

### Fase 3 · Postulaciones y avisos
- `applications`; postularse, editar y retirar; `update_job` bloquea con postulaciones pendientes;
  `cancel_job` cancela postulaciones.
- `notifications` con bandeja en `/avisos` y contador (Realtime + al volver al frente).
- Bloquear sacar el rol de cortador con postulaciones activas.
- RLS de `jobs` (y fotos): el cortador ve los trabajos en los que se postuló. Se agrega como otra
  condición del `or` de la única política SELECT con `alter policy ... using (...)` (no requiere DROP).
- A considerar: hoy un cliente puede cambiar de localidad con pedidos activos (los pedidos conservan
  la localidad con la que se publicaron).

### Fase 4 · Asignación
- `accept_application`, `get_job_applicants`, `get_job_contact` + botón de WhatsApp,
  cancelaciones después de asignar, prueba de carrera real (script Node con sesiones en paralelo).

### Fase 5 · Cierre
- Marcar realizado, `rate_job`, `get_profile_stats`, perfil público `/persona/:id`, volver a publicar
  (`/pedir/nuevo?desde=<job_id>`; las fotos se copian a la carpeta nueva).

### Fase 6 · Web Push
- VAPID, `push_subscriptions`, Edge Function al insertar en `notifications`, instrucciones de instalación en iOS.

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
| `sql/tests/fase1_seguridad.sql` | 1 | 35 casos |
| `sql/tests/fase2_seguridad.sql` | 2 | 97 casos |
| `sql/tests/limpiar_usuarios_prueba.sql` | 1 | Borra usuarios de pruebas de punta a punta |

Scripts: `scripts/verificar-red-fase2.mjs` (Fase 2) revisa las respuestas de red con sesiones reales.
Uso: `node scripts/verificar-red-fase2.mjs <foto.jpg>`. Crea usuarios `pastocontrol.prueba.f2-*`.
