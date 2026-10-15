-- 0023 · Secreto compartido entre el trigger y la Edge Function send-push (Fase 6).
-- El trigger manda el header x-push-secret con el valor guardado en Vault (push_webhook_secret). La función
-- lo compara con su secreto PUSH_WEBHOOK_SECRET y rechaza (401) cualquier llamada sin él antes de leer el
-- cuerpo o tocar la base. Así una llamada de afuera no gasta ni una consulta.
-- El valor NO está en el repo. Se cargó una vez en Vault con:
--   select vault.create_secret('<valor>', 'push_webhook_secret', 'Secreto compartido trigger → send-push ...');
-- y el mismo valor lo cargó el dueño a mano en Supabase → Edge Functions → Secrets (PUSH_WEBHOOK_SECRET).
-- Para rotarlo: vault.update_secret(id, '<nuevo>') y actualizar el secreto de la función al mismo tiempo.
-- Ejecutado en la base con el MCP de Supabase (execute_sql), Fase 6.

create or replace function private.queue_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Sin dispositivos no hay nada que mandar (y no se llama a la función).
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  -- El push es un extra: nunca hace fallar la RPC que generó el aviso.
  raise warning 'No se pudo encolar el push del aviso %: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke all on function private.queue_push() from public;
