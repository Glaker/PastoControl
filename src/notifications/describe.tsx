import { IconArrowBackUp, IconBan, IconBell, IconCircleCheck, IconClockQuestion, IconConfetti, IconPencil, IconUserPlus, IconUserX, type Icon } from '@tabler/icons-react';
import { formatDateTime, formatPrice } from '../lib/format';
import type { AppNotification } from './queries';

export type NotificationView = {
  icon: Icon;
  color: string;
  title: string;
  body: string;
  /** Pantalla a la que lleva el aviso (null si no tiene). */
  to: string | null;
};

/**
 * Texto de cada aviso. Solo usa el payload (campos públicos): nunca teléfono ni apellido.
 * La zona horaria viene en el payload (la de la localidad del pedido); si faltara, la del perfil.
 */
export function describeNotification(
  n: Pick<AppNotification, 'kind' | 'job_id' | 'payload'>,
  fallbackTimeZone: string,
): NotificationView {
  const p = n.payload ?? {};
  const tz = p.tz ?? fallbackTimeZone;
  // Lugar del pedido: la dirección (la zona en los avisos anteriores a que fuera visible). Puede faltar si
  // el dueño del pedido borró su cuenta; el nombre, si la persona que actuó la borró (Fase 8).
  const place = p.address ?? p.zone;
  const en = place ? ` en ${place}` : '';
  const actor = p.actor_name ?? 'Usuario eliminado';

  const proposal = () => {
    const price = p.proposed_price_ars ? `propone ${formatPrice(p.proposed_price_ars)}` : null;
    const when = p.proposed_at ? `para el ${formatDateTime(p.proposed_at, tz)}` : null;
    if (price && when) return `${price} ${when}`;
    if (price) return `${price} (horario publicado)`;
    if (when) return `propone otro horario: ${formatDateTime(p.proposed_at!, tz)} (precio publicado)`;
    return 'acepta el precio y el horario publicados';
  };

  switch (n.kind) {
    case 'postulacion_nueva':
      return {
        icon: IconUserPlus,
        color: 'blue',
        title: 'Nueva postulación',
        body: `${actor} se postuló a tu pedido${en} y ${proposal()}.`,
        to: n.job_id ? `/pedir/pedido/${n.job_id}` : null,
      };
    case 'postulacion_editada':
      return {
        icon: IconPencil,
        color: 'blue',
        title: 'Cambió una postulación',
        body: `${actor} cambió su postulación a tu pedido${en}: ahora ${proposal()}.`,
        to: n.job_id ? `/pedir/pedido/${n.job_id}` : null,
      };
    case 'postulacion_retirada':
      return {
        icon: IconArrowBackUp,
        color: 'gray',
        title: 'Postulación retirada',
        body: `${actor} retiró su postulación a tu pedido${en}.`,
        to: n.job_id ? `/pedir/pedido/${n.job_id}` : null,
      };
    case 'pedido_cancelado':
      return {
        icon: IconBan,
        color: 'gray',
        title: 'Pedido cancelado',
        body: `El cliente canceló el pedido${en}${p.desired_at ? ` del ${formatDateTime(p.desired_at, tz)}` : ''}. Tu postulación quedó sin efecto.`,
        to: n.job_id ? `/cortar/trabajo/${n.job_id}` : null,
      };
    case 'postulacion_aceptada':
      return {
        icon: IconConfetti,
        color: 'teal',
        title: '¡Te eligieron!',
        body: `${actor} aceptó tu postulación${place ? ` para ${place}` : ''}${p.price_ars ? `: ${formatPrice(p.price_ars)}` : ''}${
          p.desired_at ? `, ${formatDateTime(p.desired_at, tz)}` : ''
        }. Ya podés escribirle por WhatsApp.`,
        to: n.job_id ? `/cortar/trabajo/${n.job_id}` : null,
      };
    case 'postulacion_rechazada':
      return {
        icon: IconUserX,
        color: 'gray',
        title: 'Eligieron a otra persona',
        body: `El cliente eligió a otra persona para el trabajo${en}. ¡Suerte con el próximo!`,
        to: n.job_id ? `/cortar/trabajo/${n.job_id}` : null,
      };
    case 'trabajo_cancelado_por_cliente':
      return {
        icon: IconBan,
        color: 'red',
        title: 'Trabajo cancelado',
        body: `${actor} canceló el trabajo${en}${p.desired_at ? ` del ${formatDateTime(p.desired_at, tz)}` : ''}.`,
        to: n.job_id ? `/cortar/trabajo/${n.job_id}` : null,
      };
    case 'trabajo_cancelado_por_cortador':
      return {
        icon: IconBan,
        color: 'red',
        title: 'Trabajo cancelado',
        body: `${actor} canceló el trabajo${en}${p.desired_at ? ` del ${formatDateTime(p.desired_at, tz)}` : ''}. Si querés, publicalo de nuevo.`,
        to: n.job_id ? `/pedir/pedido/${n.job_id}` : null,
      };
    case 'trabajo_realizado':
      return {
        icon: IconCircleCheck,
        color: 'teal',
        title: 'Trabajo realizado',
        body: `${actor} marcó como realizado el trabajo${en}${p.desired_at ? ` del ${formatDateTime(p.desired_at, tz)}` : ''}. Contanos si volverías a trabajar con esa persona.`,
        // Le llega a cualquiera de las dos partes: /trabajo/:id lleva a la pantalla que corresponde.
        to: n.job_id ? `/trabajo/${n.job_id}` : null,
      };
    case 'recordatorio_realizado':
      return {
        icon: IconClockQuestion,
        color: 'orange',
        title: '¿Ya cortaron?',
        body: `El trabajo${en} con ${actor}${p.desired_at ? ` era el ${formatDateTime(p.desired_at, tz)}` : ''}. Si ya se hizo, marcalo como realizado y calificá; si no, cancelalo.`,
        // Le llega a las dos partes: /trabajo/:id lleva a la pantalla que corresponde.
        to: n.job_id ? `/trabajo/${n.job_id}` : null,
      };
    default:
      return { icon: IconBell, color: 'gray', title: 'Aviso', body: '', to: null };
  }
}
