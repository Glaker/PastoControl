import { AuthError } from '@supabase/supabase-js';

const OFFLINE = 'No hay conexión. Revisá internet y probá de nuevo.';

type MaybeCoded = { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown };

/** Convierte un error de Supabase (o de red) en un texto claro en castellano. */
export function friendlyError(error: unknown, fallback = 'Algo salió mal. Probá de nuevo en un rato.'): string {
  if (!error) return fallback;
  const e = error as MaybeCoded;
  const message = typeof e.message === 'string' ? e.message : '';

  const name = error instanceof Error ? error.name : '';
  if (name === 'TimeoutError' || /signal timed out|timeout/i.test(message)) {
    return 'La conexión está muy lenta. Esperá un momento y probá de nuevo.';
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) return OFFLINE;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return OFFLINE;

  // Errores de validación de nuestras RPC: el mensaje ya está escrito para el usuario.
  if (e.code === 'P0001' && message) return message;
  if (e.code === '28000') return 'Tu sesión venció. Volvé a entrar.';

  if (error instanceof AuthError) return authMessage(error) ?? fallback;

  // Storage
  const status = Number(e.statusCode ?? e.status);
  if (status === 413 || /too large|exceeded the maximum/i.test(message)) return 'La foto es muy pesada. Probá con otra.';
  if (/mime type|invalid_mime/i.test(message)) return 'Ese tipo de archivo no se puede subir. Usá una foto JPG o PNG.';

  return fallback;
}

function authMessage(error: AuthError): string | null {
  switch (error.code) {
    case 'invalid_credentials':
      return 'El email o la contraseña no coinciden.';
    case 'email_not_confirmed':
      return 'Todavía no confirmaste tu email. Revisá tu correo (y la carpeta de no deseado).';
    case 'user_already_exists':
    case 'email_exists':
      return 'Ya hay una cuenta con ese email. Probá entrar o recuperar la contraseña.';
    case 'weak_password':
      return 'La contraseña es muy fácil de adivinar. Usá al menos 8 caracteres, mezclando letras y números.';
    case 'same_password':
      return 'La contraseña nueva tiene que ser distinta de la anterior.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Hiciste varios pedidos seguidos. Esperá unos minutos y probá de nuevo.';
    case 'email_address_invalid':
      return 'Ese email no es válido.';
    case 'signup_disabled':
      return 'Por ahora no se pueden crear cuentas nuevas.';
    case 'session_not_found':
    case 'session_expired':
    case 'refresh_token_not_found':
      return 'Tu sesión venció. Volvé a entrar.';
    case 'otp_expired':
      return 'El link venció o ya se usó. Pedí uno nuevo.';
    default:
      return null;
  }
}
