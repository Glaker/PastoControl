// Clave pública VAPID (no es secreta: viaja en cada suscripción). La privada vive solo como secreto de la
// Edge Function send-push (VAPID_PRIVATE_KEY). Si se cambia el par, cambiar también esta clave y la de
// supabase/functions/send-push/index.ts; los dispositivos se vuelven a suscribir solos al abrir la app.
export const VAPID_PUBLIC_KEY =
  'BA7K-udBFC60rHCIAuhwUtVk8UL-SrZPbEXZ6yPLYOY-WBSxo2ta456BlfpRW5clyeIA3X2BQZi1EFIc3qCV0OM';
