import { parsePhoneNumberFromString } from 'libphonenumber-js';

export type PhoneResult = { ok: true; e164: string; display: string } | { ok: false; error: string };

/**
 * Normaliza un celular argentino al formato de WhatsApp: +549 + característica + número (10 dígitos).
 * Acepta como lo escribe la gente: "2345 15 123456", "02345-15-123456", "11 2345 6789", "+54 9 2345 123456".
 * La característica es obligatoria (la app sirve en cualquier ciudad: no hay una para completar).
 */
export function normalizeArPhone(input: string): PhoneResult {
  const digits = input.replace(/\D/g, '');
  if (!digits) return { ok: false, error: 'Escribí tu número de WhatsApp.' };

  const parsed = parsePhoneNumberFromString(input, 'AR');
  if (!parsed || parsed.countryCallingCode !== '54') {
    return { ok: false, error: 'No es un número de Argentina válido. Ej.: 2345 15 123456.' };
  }
  let national = String(parsed.nationalNumber);
  if (national.length === 11 && national.startsWith('9')) national = national.slice(1);

  // Las características argentinas empiezan con 1, 2 o 3 y, sumadas al número, son 10 dígitos.
  if (!/^[1-3]\d{9}$/.test(national)) {
    return { ok: false, error: 'Falta la característica o el número está incompleto. Ej.: 2345 15 123456.' };
  }

  const e164 = `+549${national}`;
  return { ok: true, e164, display: formatPhone(e164) };
}

/** "+54 9 2345 12-3456" */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/** Link para abrir el chat de WhatsApp. */
export function whatsappLink(e164: string, text?: string): string {
  const base = `https://wa.me/${e164.replace(/\D/g, '')}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
