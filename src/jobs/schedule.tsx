import { Select, SimpleGrid } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import type { ReactNode } from 'react';
import dayjs from '../lib/dayjs';

// Mismos límites que las RPCs (create_job, apply_to_job, update_application).
export const MIN_PRICE = 1000;
export const MAX_PRICE = 5_000_000;
export const MAX_DAYS_AHEAD = 60;

// Turnos cada media hora, de 6 a 21 h.
const TIME_SLOTS = Array.from({ length: (21 - 6) * 2 + 1 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

/** Día ("YYYY-MM-DD") y hora ("HH:mm") elegidos en la zona horaria de la localidad → instante. */
export function toInstant(date: string, time: string, timeZone: string) {
  return dayjs.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', timeZone);
}

/** Instante → día y hora en la zona de la localidad (para precargar el formulario). */
export function splitInstant(iso: string, timeZone: string) {
  const d = dayjs(iso).tz(timeZone);
  return { date: d.format('YYYY-MM-DD'), time: d.format('HH:mm') };
}

export function validatePrice(v: number | string, emptyMessage: string): string | null {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return emptyMessage;
  if (n < MIN_PRICE) return 'El precio mínimo es $ 1.000.';
  if (n > MAX_PRICE) return 'El precio máximo es $ 5.000.000.';
  return null;
}

/** Error de la hora: la del día elegido tiene que ser futura y hasta 60 días adelante. */
export function validateWhen(date: string | null, time: string | null, timeZone: string): string | null {
  if (!time) return 'Elegí la hora.';
  if (!date) return null;
  const when = toInstant(date, time, timeZone);
  if (!when.isAfter(dayjs())) return 'Esa hora ya pasó. Elegí una más tarde.';
  if (when.isAfter(dayjs().add(MAX_DAYS_AHEAD, 'day'))) return `Hasta ${MAX_DAYS_AHEAD} días adelante.`;
  return null;
}

type DayTimeFieldsProps = {
  timeZone: string;
  date: string | null;
  time: string | null;
  dateError?: ReactNode;
  timeError?: ReactNode;
  onDateChange: (date: string | null) => void;
  onTimeChange: (time: string | null) => void;
  dateLabel?: string;
  timeLabel?: string;
};

/** Día (calendario) y hora (turnos de media hora). Con el día de hoy, los turnos pasados no se ofrecen. */
export function DayTimeFields({
  timeZone,
  date,
  time,
  dateError,
  timeError,
  onDateChange,
  onTimeChange,
  dateLabel = 'Día',
  timeLabel = 'Hora',
}: DayTimeFieldsProps) {
  const now = dayjs().tz(timeZone);
  const isToday = date === now.format('YYYY-MM-DD');
  const options = TIME_SLOTS.map((slot) => ({
    value: slot,
    label: `${slot} h`,
    disabled: isToday && !toInstant(date!, slot, timeZone).isAfter(now),
  }));
  if (time && !TIME_SLOTS.includes(time)) options.unshift({ value: time, label: `${time} h`, disabled: false });

  return (
    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="lg">
      <DatePickerInput
        label={dateLabel}
        placeholder="Elegí el día"
        withAsterisk
        dropdownType="modal"
        valueFormat="dddd D [de] MMMM"
        minDate={now.format('YYYY-MM-DD')}
        maxDate={now.add(MAX_DAYS_AHEAD, 'day').format('YYYY-MM-DD')}
        value={date}
        error={dateError}
        onChange={onDateChange}
      />
      <Select
        label={timeLabel}
        placeholder="Elegí la hora"
        withAsterisk
        allowDeselect={false}
        data={options}
        maxDropdownHeight={280}
        value={time}
        error={timeError}
        onChange={onTimeChange}
      />
    </SimpleGrid>
  );
}
