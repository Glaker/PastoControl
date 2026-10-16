import { Alert, Button, Card, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconBan, IconBrandWhatsapp, IconCheck, IconPhone, IconUser, IconUserCircle, IconUserOff } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { applicationKeys } from '../applications/queries';
import { confirmAction } from '../lib/confirm';
import { friendlyError } from '../lib/errors';
import { formatDateLong } from '../lib/format';
import { formatPhone, whatsappLink } from '../lib/phone';
import { jobKeys, type Job } from '../jobs/queries';
import { cancelJob } from '../jobs/saveJob';
import { MarkDoneButton, RatingCard } from '../completion/CompletionParts';
import { DELETED_USER } from '../profile/queries';
import { useJobContact } from './queries';

type Props = {
  job: Job;
  /** Quién mira: el cliente (dueño) o el cortador aceptado. */
  viewer: 'cliente' | 'cortador';
};

/**
 * Trabajo asignado o realizado: datos de contacto de la contraparte (por get_job_contact, solo a las
 * dos partes) con botón de WhatsApp. Asignado: "Marcar como realizado" (desde el día acordado) y
 * "Cancelar trabajo" separado y con confirmación. Realizado: calificar a la otra parte.
 */
export function AssignedPanel({ job, viewer }: Props) {
  const queryClient = useQueryClient();
  // Perfil público de la contraparte (para el cliente, el cortador elegido; para el cortador, el cliente).
  // null: borró su cuenta (el trabajo queda como historial, sin sus datos).
  const counterpartId = viewer === 'cliente' ? job.agreement?.cutter_id : job.client_id;
  const counterpartDeleted = counterpartId === null;
  const active = (job.status === 'asignado' || job.status === 'realizado') && !counterpartDeleted;
  const { data: contact, isPending, error, refetch } = useJobContact(job.id, active);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const counterpartName = contact ? `${contact.first_name} ${contact.last_name}` : null;
  // Mensaje inicial neutro: sirve igual con el trabajo asignado o realizado, y para las dos partes.
  const greeting = contact
    ? `Hola ${contact.first_name}, te escribo por el corte de pasto de PastoControl del ${formatDateLong(contact.agreed_at, job.locality.timezone)}.`
    : '';

  const onCancel = async () => {
    const ok = await confirmAction({
      title: '¿Cancelar el trabajo?',
      message:
        viewer === 'cliente'
          ? `Le avisamos a ${contact?.first_name ?? 'la persona que elegiste'}. El pedido queda cancelado y no se puede deshacer.`
          : `Le avisamos a ${contact?.first_name ?? 'el cliente'}. El trabajo queda cancelado y no se puede deshacer. Si podés, avisale también por WhatsApp.`,
      confirmLabel: 'Sí, cancelar trabajo',
      cancelLabel: 'No, volver',
      danger: true,
      confirmIcon: <IconBan size={20} aria-hidden />,
    });
    if (!ok) return;
    setCancelError(null);
    setCancelling(true);
    try {
      await cancelJob(job.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: jobKeys.all }),
        queryClient.invalidateQueries({ queryKey: applicationKeys.all }),
      ]);
      notifications.show({ color: 'gray', icon: <IconCheck size={18} />, message: 'Cancelaste el trabajo.' });
    } catch (e) {
      setCancelError(friendlyError(e, 'No pudimos cancelar el trabajo. Probá de nuevo.'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Stack gap="md">
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Title order={2} size="h3">
            {viewer === 'cliente' ? 'Quién corta el pasto' : 'Datos del cliente'}
          </Title>

          {counterpartDeleted && (
            <ContactRow icon={<IconUserOff size={22} aria-hidden />} label="Nombre">
              <Text size="lg" fw={700}>
                {DELETED_USER}
              </Text>
              <Text size="sm" c="dimmed">
                Esta persona borró su cuenta: sus datos de contacto ya no están.
              </Text>
            </ContactRow>
          )}
          {active && isPending && <Text c="dimmed">Cargando los datos de contacto…</Text>}
          {error && (
            <Stack gap="xs">
              <Alert color="red" icon={<IconAlertTriangle aria-hidden />}>
                {friendlyError(error)}
              </Alert>
              <Button variant="default" onClick={() => void refetch()}>
                Probar de nuevo
              </Button>
            </Stack>
          )}

          {contact && (
            <>
              <ContactRow icon={<IconUser size={22} aria-hidden />} label="Nombre">
                <Text size="lg" fw={700}>
                  {counterpartName}
                </Text>
              </ContactRow>
              <ContactRow icon={<IconPhone size={22} aria-hidden />} label="WhatsApp">
                <Text size="lg">{formatPhone(contact.phone_e164)}</Text>
              </ContactRow>
              <Button
                component="a"
                href={whatsappLink(contact.phone_e164, greeting)}
                target="_blank"
                rel="noopener noreferrer"
                color="green"
                leftSection={<IconBrandWhatsapp size={22} aria-hidden />}
              >
                Escribir por WhatsApp
              </Button>
              {counterpartId && (
                <Button
                  component={Link}
                  to={`/persona/${counterpartId}`}
                  variant="default"
                  leftSection={<IconUserCircle size={20} aria-hidden />}
                >
                  Ver su perfil
                </Button>
              )}
              <Text size="sm" c="dimmed">
                PastoControl no cobra ni intermedia en el pago: lo arreglan entre ustedes.
              </Text>
            </>
          )}
        </Stack>
      </Card>

      {job.status === 'asignado' && (
        <MarkDoneButton job={job} counterpartName={contact?.first_name ?? (viewer === 'cliente' ? 'la persona que elegiste' : 'el cliente')} />
      )}
      {job.status === 'realizado' && contact && <RatingCard job={job} counterpartFirstName={contact.first_name} />}

      {cancelError && (
        <Alert color="red" title="No se pudo" role="alert">
          {cancelError}
        </Alert>
      )}

      {job.status === 'asignado' && (
        <>
          <Divider mt="lg" label="Acciones importantes" labelPosition="left" />
          <Button
            variant="outline"
            color="red"
            loading={cancelling}
            leftSection={<IconBan size={20} aria-hidden />}
            onClick={() => void onCancel()}
          >
            Cancelar trabajo
          </Button>
        </>
      )}
    </Stack>
  );
}

function ContactRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <div style={{ flex: 'none', marginTop: 4, color: 'var(--mantine-color-gray-7)' }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        {children}
      </div>
    </Group>
  );
}
