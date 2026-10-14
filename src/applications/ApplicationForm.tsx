import { Alert, Button, NumberInput, Radio, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconArrowLeft, IconCheck, IconSend } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useUnsavedChanges } from '../app/update/updateState';
import { confirmAction } from '../lib/confirm';
import dayjs from '../lib/dayjs';
import { friendlyError } from '../lib/errors';
import { formatDateTime, formatPrice } from '../lib/format';
import { jobKeys, type Job } from '../jobs/queries';
import { DayTimeFields, MAX_PRICE, MIN_PRICE, splitInstant, toInstant, validatePrice, validateWhen } from '../jobs/schedule';
import { ProposalSummary } from './ApplicationParts';
import { applicationKeys, applyToJob, updateApplication, type Application, type Proposal } from './queries';

type Props = {
  job: Job;
  /** Para editar una postulación pendiente. Sin esto, es una postulación nueva. */
  existing?: Application;
  onDone: () => void;
  onCancel: () => void;
};

type Values = {
  priceMode: 'publicado' | 'otro';
  price: number | string;
  timeMode: 'publicado' | 'otro';
  date: string | null;
  time: string | null;
};

/** Postularse aceptando lo publicado o con contraoferta de precio y/o de horario. */
export function ApplicationForm({ job, existing, onDone, onCancel }: Props) {
  const queryClient = useQueryClient();
  const tz = job.locality.timezone;
  // Si el horario publicado ya pasó (pedido vencido), solo se puede proponer otro.
  const publishedTimePassed = !dayjs(job.desired_at).isAfter(dayjs());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const proposedWhen = existing?.proposed_at ? splitInstant(existing.proposed_at, tz) : null;
  const form = useForm<Values>({
    initialValues: {
      priceMode: existing?.proposed_price_ars ? 'otro' : 'publicado',
      price: existing?.proposed_price_ars ?? '',
      timeMode: proposedWhen || publishedTimePassed ? 'otro' : 'publicado',
      date: proposedWhen?.date ?? null,
      time: proposedWhen?.time ?? null,
    },
    validate: {
      price: (v, values) => (values.priceMode === 'otro' ? validatePrice(v, 'Escribí el precio que proponés.') : null),
      date: (v, values) => (values.timeMode === 'otro' && !v ? 'Elegí el día.' : null),
      time: (v, values) => (values.timeMode === 'otro' ? validateWhen(values.date, v, tz) : null),
    },
  });
  useUnsavedChanges(form.isDirty());

  const handleSubmit = form.onSubmit(async (values) => {
    setSaveError(null);
    const proposal: Proposal = {
      priceArs: values.priceMode === 'otro' ? (values.price as number) : null,
      at: values.timeMode === 'otro' ? toInstant(values.date!, values.time!, tz).toISOString() : null,
    };
    if (proposal.priceArs === job.price_ars) proposal.priceArs = null;

    const ok = await confirmAction({
      title: existing ? '¿Guardamos los cambios?' : '¿Te postulás a este trabajo?',
      confirmLabel: existing ? 'Guardar cambios' : 'Postularme',
      confirmIcon: existing ? <IconCheck size={20} aria-hidden /> : <IconSend size={20} aria-hidden />,
      message: (
        <Stack gap="sm">
          <ProposalSummary job={job} application={{ proposed_price_ars: proposal.priceArs, proposed_at: proposal.at }} />
          <Text size="sm" c="dimmed">
            Le avisamos al cliente. Si te elige, se comparten la dirección y los WhatsApp.
          </Text>
        </Stack>
      ),
    });
    if (!ok) return;

    setSaving(true);
    try {
      if (existing) await updateApplication(existing.id, proposal);
      else await applyToJob(job.id, proposal);
      form.resetDirty();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: applicationKeys.all }),
        queryClient.invalidateQueries({ queryKey: jobKeys.all }),
      ]);
      notifications.show({
        color: 'pasto',
        icon: <IconCheck size={18} />,
        message: existing ? 'Guardamos tu postulación.' : 'Te postulaste. Le avisamos al cliente.',
      });
      onDone();
    } catch (e) {
      setSaveError(friendlyError(e, 'No pudimos guardar tu postulación. Probá de nuevo.'));
    } finally {
      setSaving(false);
    }
  });

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Stack gap="lg">
        <Radio.Group
          label="Precio"
          value={form.values.priceMode}
          onChange={(v) => form.setFieldValue('priceMode', v as Values['priceMode'])}
        >
          <Stack gap="xs" mt="xs">
            <Radio value="publicado" label={`Acepto el publicado: ${formatPrice(job.price_ars)}`} />
            <Radio value="otro" label="Propongo otro precio" />
          </Stack>
        </Radio.Group>
        {form.values.priceMode === 'otro' && (
          <NumberInput
            label="Precio que proponés"
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
        )}

        <Radio.Group
          label="Día y hora"
          value={form.values.timeMode}
          onChange={(v) => form.setFieldValue('timeMode', v as Values['timeMode'])}
        >
          <Stack gap="xs" mt="xs">
            <Radio
              value="publicado"
              disabled={publishedTimePassed}
              label={`Acepto el publicado: ${formatDateTime(job.desired_at, tz)}${publishedTimePassed ? ' (ya pasó)' : ''}`}
            />
            <Radio value="otro" label="Propongo otro día u hora" />
          </Stack>
        </Radio.Group>
        {form.values.timeMode === 'otro' && (
          <DayTimeFields
            timeZone={tz}
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
        )}

        {saveError && (
          <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="No se guardó" role="alert">
            {saveError}
          </Alert>
        )}

        <Stack gap="sm">
          <Button
            type="submit"
            loading={saving}
            leftSection={existing ? <IconCheck size={20} aria-hidden /> : <IconSend size={20} aria-hidden />}
          >
            {existing ? 'Guardar cambios' : 'Postularme'}
          </Button>
          <Button variant="default" onClick={onCancel} disabled={saving} leftSection={<IconArrowLeft size={20} aria-hidden />}>
            Volver sin guardar
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
