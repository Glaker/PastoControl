import { Alert, Button, Group, NumberInput, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconArrowLeft } from '@tabler/icons-react';
import { useRef, useState, type ReactNode } from 'react';
import { useUnsavedChanges } from '../app/update/updateState';
import dayjs from '../lib/dayjs';
import { friendlyError } from '../lib/errors';
import { isInArgentina, OUTSIDE_ARGENTINA, type LatLng } from '../lib/geo';
import { LocationField } from '../map/LocationField';
import { PhotoPicker } from './PhotoPicker';
import type { JobInput, PhotoItem } from './saveJob';
import { DayTimeFields, MAX_PRICE, MIN_PRICE, splitInstant, toInstant, validatePrice, validateWhen } from './schedule';

export type JobFormInitial = {
  location: LatLng | null;
  street: string;
  number: string;
  between: string;
  zone: string;
  priceArs: number;
  desiredAt: string | null;
  notes: string;
  photoPaths: string[];
};

type Props = {
  /** Zona horaria en la que se eligen y se guardan la fecha y la hora (la de la localidad por defecto). */
  timeZone: string;
  /** Dónde arranca el mapa sin pin ni GPS. El pin vale en cualquier lugar de Argentina. */
  defaultCenter: LatLng;
  initial?: JobFormInitial;
  submitLabel: string;
  submitIcon: ReactNode;
  /** Volver a publicar: las fotos de initial se copian al pedido nuevo en vez de reusarse. */
  copyPhotos?: boolean;
  /** Antes de enviar (ej.: confirmar la publicación). Si devuelve false, no se envía. */
  beforeSubmit?: (input: JobInput) => Promise<boolean>;
  onSubmit: (input: JobInput) => Promise<void>;
  onCancel: () => void;
};

type Values = {
  location: LatLng | null;
  street: string;
  number: string;
  between: string;
  zone: string;
  price: number | string;
  date: string | null;
  time: string | null;
  notes: string;
};

export function JobForm({ timeZone, defaultCenter, initial, copyPhotos, submitLabel, submitIcon, beforeSubmit, onSubmit, onCancel }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>(() =>
    (initial?.photoPaths ?? []).map((path) => ({ kind: copyPhotos ? 'copy' : 'existing', key: path, path })),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const now = dayjs().tz(timeZone);
  const initialWhen = initial?.desiredAt ? splitInstant(initial.desiredAt, timeZone) : null;
  // Un pedido vencido se edita para elegir una fecha nueva: no se precarga la vieja.
  const initialStillValid = !!initial?.desiredAt && dayjs(initial.desiredAt).isAfter(now);

  const form = useForm<Values>({
    initialValues: {
      location: initial?.location ?? null,
      street: initial?.street ?? '',
      number: initial?.number ?? '',
      between: initial?.between ?? '',
      zone: initial?.zone ?? '',
      price: initial?.priceArs ?? '',
      date: initialWhen && initialStillValid ? initialWhen.date : null,
      time: initialWhen?.time ?? null,
      notes: initial?.notes ?? '',
    },
    validate: {
      location: (v) =>
        !v ? 'Marcá la ubicación en el mapa.' : isInArgentina(v) ? null : OUTSIDE_ARGENTINA,
      street: (v) => {
        const len = v.trim().length;
        return len < 2 ? 'Escribí la calle.' : len > 120 ? 'Hasta 120 letras.' : null;
      },
      number: (v) => (v.trim().length === 0 ? 'Escribí el número (o «s/n»).' : null),
      between: (v) => {
        const len = v.trim().length;
        return len > 0 && len < 3 ? 'Escribí las dos calles o dejalo vacío.' : null;
      },
      zone: (v) => {
        const len = v.trim().length;
        return len > 0 && len < 2 ? 'Escribí al menos 2 letras o dejalo vacío.' : null;
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

  // Si falta algo, lleva al primer campo con error (el mapa está arriba y el botón abajo de todo).
  const showFirstError = () =>
    requestAnimationFrame(() =>
      formRef.current
        ?.querySelector('.mantine-InputWrapper-error')
        ?.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );

  const handleSubmit = form.onSubmit(async (values) => {
    setSaveError(null);
    const input: JobInput = {
      location: values.location!,
      street: values.street.trim(),
      number: values.number.trim(),
      between: values.between.trim(),
      zone: values.zone.trim(),
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
  }, showFirstError);

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate>
      <Stack gap="lg">
        <LocationField
          label="Dónde hay que cortar"
          description="Marcá el terreno en el mapa: así los cortadores ven qué tan cerca les queda y llegan sin perderse."
          required
          defaultCenter={defaultCenter}
          value={form.values.location}
          onChange={(value) => {
            form.setFieldValue('location', value);
            form.clearFieldError('location');
          }}
          error={form.errors.location as string | undefined}
        />

        <Group gap="sm" align="flex-start" wrap="nowrap">
          <TextInput
            label="Calle"
            autoComplete="address-line1"
            withAsterisk
            maxLength={120}
            style={{ flex: 1, minWidth: 0 }}
            {...form.getInputProps('street')}
          />
          <TextInput
            label="Número"
            withAsterisk
            maxLength={10}
            w={112}
            style={{ flex: 'none' }}
            {...form.getInputProps('number')}
          />
        </Group>
        <TextInput
          label="Entre calles (opcional)"
          description="Ej.: Mitre y Belgrano."
          maxLength={120}
          {...form.getInputProps('between')}
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
        {initial?.desiredAt && !initialStillValid && (
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

        <TextInput
          label="Zona o barrio (opcional)"
          description="Si ayuda a ubicarse. Ej.: Barrio Centro, cerca de la plaza."
          maxLength={80}
          {...form.getInputProps('zone')}
        />

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
