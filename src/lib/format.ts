import dayjs from './dayjs';

const priceFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

/** "$ 15.000" */
export function formatPrice(ars: number): string {
  return priceFormatter.format(ars);
}

/** "sáb 18/10 · 16:00 h", en la zona horaria de la localidad. */
export function formatDateTime(iso: string, timeZone: string): string {
  const d = dayjs(iso).tz(timeZone);
  return `${d.format('ddd D/M')} · ${d.format('HH:mm')} h`;
}
