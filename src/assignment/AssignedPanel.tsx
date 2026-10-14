import { Alert, Button, Card, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconBan, IconBrandWhatsapp, IconCheck, IconHome, IconPhone, IconUser } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { applicationKeys } from '../applications/queries';
import { confirmAction } from '../lib/confirm';
import { friendlyError } from '../lib/errors';
import { formatDateTimeLong } from '../lib/format';
import { formatPhone, whatsappLink } from '../lib/phone';
import { jobKeys, type Job } from '../jobs/queries';
import { cancelJob } from '../jobs/saveJob';
import { useJobContact } from './queries';

type Props = {
  job: Job;
  /** Quién mira: el cliente (dueño) o el cortador aceptado. */
  viewer: 'cliente' | 'cortador';
  /** Nombre visible propio, para el mensaje inicial de WhatsApp. */
  myName: string;
};

/**
 * Trabajo asignado: datos de contacto de la contraparte (por get_job_contact, solo a las dos partes)
 * con botón de WhatsApp, y "Cancelar trabajo" separado y con confirmación.
 */
export function AssignedPanel({ job, viewer, myName }: Props) {
  const queryClient = useQueryClient();
  const { data: contact, isPending, error, refetch } = useJobContact(job.id, job.status === 'asignado');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const counterpartName = contact ? `${contact.first_name} ${contact.last_name}` : null;
  const greeting =
    viewer === 'cliente'
      ? `Hola ${contact?.first_name ?? ''}, soy ${myName} de PastoControl. Te elegí para cortar el pasto en ${job.zone} el ${
          contact ? formatDateTimeLong(contact.agreed_at, job.locality.timezone) : ''
        }.`
      : `Hola ${contact?.first_name ?? ''}, soy ${myName} de PastoControl. Gracias por elegirme para cortar el pasto el ${
          contact ? formatDateTimeLong(contact.agreed_at, job.locality.timezone) : ''
        }.`;

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

          {isPending && <Text c="dimmed">Cargando los datos de contacto…</Text>}
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
              {viewer === 'cortador' && (
                <ContactRow icon={<IconHome size={22} aria-hidden />} label="Dirección">
                  <Text size="lg">{contact.address}</Text>
                </ContactRow>
              )}
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
              <Text size="sm" c="dimmed">
                PastoControl no cobra ni intermedia en el pago: lo arreglan entre ustedes.
              </Text>
            </>
          )}
        </Stack>
      </Card>

      {cancelError && (
        <Alert color="red" title="No se pudo" role="alert">
          {cancelError}
        </Alert>
      )}

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
