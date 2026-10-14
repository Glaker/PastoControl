import { Alert, Button, NumberInput, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconArrowLeft, IconShieldLock } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { useUnsavedChanges } from '../app/update/updateState';
import dayjs from '../lib/dayjs';
import { friendlyError } from '../lib/errors';
import { PhotoPicker } from './PhotoPicker';
import type { JobInput, PhotoItem } from './saveJob';
import { DayTimeFields, MAX_PRICE, MIN_PRICE, splitInstant, toInstant, validatePrice, validateWhen } from './schedule';

export type JobFormInitial = {
  zone: string;
  address: string;
  priceArs: number;
  desiredAt: string | null;
  notes: string;
  photoPaths: string[];
};

type Props = {
  /** Zona horaria de la localidad: la fecha y la hora se eligen y se guardan en esa zona. */
  timeZone: string;
  initial?: JobFormInitial;
  submitLabel: string;
  submitIcon: ReactNode;
  /** Antes de enviar (ej.: confirmar la publicación). Si devuelve false, no se envía. */
  beforeSubmit?: (input: JobInput) => Promise<boolean>;
  onSubmit: (input: JobInput) => Promise<void>;
  onCancel: () => void;
};

type Values = {
  zone: string;
  address: string;
  price: number | string;
  date: string | null;
  time: string | null;
  notes: string;
};

export function JobForm({ timeZone, initial, submitLabel, submitIcon, beforeSubmit, onSubmit, onCancel }: Props) {
  const [photos, setPhotos] = useState<PhotoItem[]>(() =>
    (initial?.photoPaths ?? []).map((path) => ({ kind: 'existing', key: path, path })),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const now = dayjs().tz(timeZone);
  const initialWhen = initial?.desiredAt ? splitInstant(initial.desiredAt, timeZone) : null;
  // Un pedido vencido se edita para elegir una fecha nueva: no se precarga la vieja.
  const initialStillValid = !!initial?.desiredAt && dayjs(initial.desiredAt).isAfter(now);

  const form = useForm<Values>({
    initialValues: {
      zone: initial?.zone ?? '',
      address: initial?.address ?? '',
      price: initial?.priceArs ?? '',
      date: initialWhen && initialStillValid ? initialWhen.date : null,
      time: initialWhen?.time ?? null,
      notes: initial?.notes ?? '',
    },
    validate: {
      zone: (v) => {
        const len = v.trim().length;
        return len < 2 ? 'Escribí la zona o el barrio.' : len > 80 ? 'Hasta 80 letras.' : null;
      },
      address: (v) => {
        const len = v.trim().length;
        return len < 3 ? 'Escribí la dirección.' : len > 200 ? 'Hasta 200 letras.' : null;
      },
      price: (v) => validatePrice(v, 'Escribí cuánto pagás.'),
      date: (v) => (v ? null : 'Elegí el día.'),
      time: (v, values) => validateWhen(values.date, v, timeZone),
      notes: (v) => (v.trim().length > 500 ? 'Hasta 500 letras.' : null),
    },
  });

  const photosChanged =
    photos.length !== (initial?.photoPaths.length ?? 0) ||
    photos.some((p, i) => p.kind === 'new' || p.path !== initial?.photoPaths[i]);
  useUnsavedChanges(form.isDirty() || photosChanged);

  const handleSubmit = form.onSubmit(async (values) => {
    setSaveError(null);
    const input: JobInput = {
      zone: values.zone.trim(),
      address: values.address.trim(),
      priceArs: values.price as number,
      desiredAt: toInstant(values.date!, values.time!, timeZone).toISOString(),
      notes: values.notes.trim(),
      photos,
    };
    if (beforeSubmit && !(await beforeSubmit(input))) return;

    setSaving(true);
    try {
      await onSubmit(input);
      form.resetDirty();
    } catch (e) {
      setSaveError(friendlyError(e, 'No pudimos guardar el pedido. Probá de nuevo.'));
    } finally {
      setSaving(false);
    }
  });

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="lg">
        <Alert color="yellow" icon={<IconShieldLock aria-hidden />} title="Cuidá tu privacidad">
          No pongas la dirección en la nota ni en las fotos (por ejemplo, el número de la casa). La dirección va
          en su campo y solo la ve la persona que elijas.
        </Alert>

        <TextInput
          label="Zona o barrio"
          description="Para que los cortadores sepan más o menos dónde queda. Ej.: Barrio Centro, cerca de la plaza."
          withAsterisk
          maxLength={80}
          {...form.getInputProps('zone')}
        />
        <TextInput
          label="Dirección"
          description="Solo la ve la persona que elijas, cuando aceptes su postulación."
          autoComplete="street-address"
          withAsterisk
          maxLength={200}
          {...form.getInputProps('address')}
        />
        <NumberInput
          label="Cuánto pagás"
          description="En pesos. Los cortadores pueden aceptarlo o proponerte otro precio."
          withAsterisk
          prefix="$ "
          thousandSeparator="."
          decimalSeparator=","
          allowDecimal={false}
          allowNegative={false}
          hideControls
          inputMode="numeric"
          min={MIN_PRICE}
          max={MAX_PRICE}
          {...form.getInputProps('price')}
        />

        <DayTimeFields
          timeZone={timeZone}
          date={form.values.date}
          time={form.values.time}
          dateError={form.errors.date}
          timeError={form.errors.time}
          onDateChange={(value) => {
            form.setFieldValue('date', value);
            if (form.values.time) form.validateField('time');
          }}
          onTimeChange={(value) => form.setFieldValue('time', value)}
        />
        {initial && !initialStillValid && (
          <Text size="sm" c="orange.9">
            La fecha anterior ya pasó: elegí una nueva.
          </Text>
        )}

        <Textarea
          label="Nota (opcional)"
          description="Tamaño aproximado, si hay que juntar el pasto, si hay perro, etc."
          autosize
          minRows={3}
          maxLength={500}
          {...form.getInputProps('notes')}
        />

        <PhotoPicker photos={photos} onChange={setPhotos} disabled={saving} />

        {saveError && (
          <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="No se guardó" role="alert">
            {saveError}
          </Alert>
        )}

        <Stack gap="sm">
          <Button type="submit" loading={saving} leftSection={submitIcon}>
            {submitLabel}
          </Button>
          <Button variant="default" onClick={onCancel} disabled={saving} leftSection={<IconArrowLeft size={20} aria-hidden />}>
            Volver sin guardar
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
