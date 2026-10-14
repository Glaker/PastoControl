-- Borra los usuarios que crean las pruebas de punta a punta (registro real desde la interfaz).
-- Solo toca emails con estos patrones de prueba; nunca usuarios reales.
-- Antes de correrlo, borrar sus fotos por la API de Storage (Supabase no permite borrar
-- archivos de storage.objects por SQL). El borrado de auth.users arrastra (on delete cascade)
-- profiles y profile_private.

delete from auth.users
where email like 'prueba-%@pastocontrol.test'
   or email like 'prueba-recupero-%@example.com'
   or email like 'pastocontrol.prueba.%@gmail.com'
returning email;
