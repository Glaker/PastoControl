import { Alert, Button, Checkbox, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconCheck, IconX } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useUnsavedChanges } from '../app/update/updateState';
import { FullPageLoader } from '../components/FullPageLoader';
import { useUserId } from '../auth/AuthProvider';
import { friendlyError } from '../lib/errors';
import { formatPhone, normalizeArPhone } from '../lib/phone';
import { AvatarPicker } from './AvatarPicker';
import { myProfileKey, useLocalities, type Locality, type MyProfile } from './queries';
import { saveProfile } from './saveProfile';

type Props = {
  profile: MyProfile | null;
  /** Roles iniciales (en el onboarding vienen del paso anterior). */
  initialRoles: { isClient: boolean; isCutter: boolean };
  showRoles: boolean;
  submitLabel: string;
  onSaved: () => void;
  onCancel?: () => void;
};

type Values = {
  firstName: string;
  lastName: string;
  phone: string;
  localityId: string;
  isClient: boolean;
  isCutter: boolean;
};

export function ProfileForm({ profile, initialRoles, showRoles, submitLabel, onSaved, onCancel }: Props) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const { data: localities, isPending: loadingLocalities, error: localitiesError } = useLocalities();
  // Las reglas de validación se arman una sola vez: leen las localidades por ref para ver las actuales.
  const localitiesRef = useRef(localities);
  localitiesRef.current = localities;

  const [newAvatar, setNewAvatar] = useState<Blob | null>(null);
  const [removedAvatar, setRemovedAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<Values>({
    initialValues: {
      firstName: profile?.first_name ?? '',
      lastName: profile?.private.last_name ?? '',
      phone: profile ? formatPhone(profile.private.phone_e164) : '',
      localityId: profile ? String(profile.locality_id) : '',
      isClient: initialRoles.isClient,
      isCutter: initialRoles.isCutter,
    },
    validate: {
      firstName: (v) => (v.trim() ? (v.trim().length > 40 ? 'Hasta 40 letras.' : null) : 'Escribí tu nombre.'),
      lastName: (v) => (v.trim() ? (v.trim().length > 60 ? 'Hasta 60 letras.' : null) : 'Escribí tu apellido.'),
      phone: (v, values) => {
        const r = normalizeArPhone(v, areaCodeFor(values.localityId));
        return r.ok ? null : r.error;
      },
      localityId: (v) => (pickLocality(localitiesRef.current, v) ? null : 'Elegí tu localidad.'),
      isCutter: (v, values) => (v || values.isClient ? null : 'Elegí al menos una opción.'),
    },
  });

  const locality = pickLocality(localities, form.values.localityId);
  const effectiveLocalityId = form.values.localityId || (locality ? String(locality.id) : '');

  function areaCodeFor(localityId: string) {
    return pickLocality(localitiesRef.current, localityId)?.phone_area_code ?? '';
  }

  function normalizePhoneField() {
    const r = normalizeArPhone(form.values.phone, areaCodeFor(effectiveLocalityId));
    if (r.ok) form.setFieldValue('phone', r.display);
    form.validateField('phone');
  }

  const hasPhoto = !!newAvatar || (!!profile?.avatar_path && !removedAvatar);
  useUnsavedChanges(form.isDirty() || !!newAvatar || removedAvatar);

  const onSubmit = form.onSubmit(async (values) => {
    setSaveError(null);
    if (values.isCutter && !hasPhoto) {
      setAvatarError('Para cortar pasto necesitás una foto de perfil.');
      return;
    }
    const phone = normalizeArPhone(values.phone, areaCodeFor(effectiveLocalityId));
    if (!phone.ok || !effectiveLocalityId) return;

    setSaving(true);
    try {
      await saveProfile(userId, {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phoneE164: phone.e164,
        localityId: Number(effectiveLocalityId),
        isClient: values.isClient,
        isCutter: values.isCutter,
        currentAvatarPath: profile?.avatar_path ?? null,
        newAvatar,
        removeAvatar: removedAvatar,
      });
      form.resetDirty();
      setNewAvatar(null);
      setRemovedAvatar(false);
      await queryClient.invalidateQueries({ queryKey: myProfileKey(userId) });
      onSaved();
    } catch (e) {
      setSaveError(friendlyError(e, 'No pudimos guardar tus datos. Probá de nuevo.'));
    } finally {
      setSaving(false);
    }
  });

  if (localitiesError) {
    return (
      <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="No pudimos cargar las localidades">
        {friendlyError(localitiesError)}
      </Alert>
    );
  }

  // El formulario aparece recién con las localidades cargadas: la característica telefónica
  // hace falta para completar los números locales, y así nadie toca "Guardar" antes de tiempo.
  if (loadingLocalities) return <FullPageLoader label="Cargando tus datos…" />;

  const initials = `${form.values.firstName.trim().charAt(0)}${form.values.lastName.trim().charAt(0)}`.toUpperCase();

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap="lg">
        <AvatarPicker
          currentPath={profile?.avatar_path ?? null}
          newAvatar={newAvatar}
          removed={removedAvatar}
          required={form.values.isCutter}
          initials={initials}
          error={avatarError}
          onChange={({ newAvatar: blob, removed }) => {
            setNewAvatar(blob);
            setRemovedAvatar(removed);
            setAvatarError(null);
          }}
        />

        <TextInput label="Nombre" autoComplete="given-name" withAsterisk {...form.getInputProps('firstName')} />
        <TextInput
          label="Apellido"
          description="Los demás ven solo la inicial hasta que acuerdan un trabajo con vos."
          autoComplete="family-name"
          withAsterisk
          {...form.getInputProps('lastName')}
        />
        <TextInput
          label="WhatsApp"
          description="Con característica. Ej.: 2345 15 123456. Solo lo ve la persona con la que acordás un trabajo."
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          withAsterisk
          {...form.getInputProps('phone')}
          onBlur={normalizePhoneField}
        />

        {localities && localities.length > 1 ? (
          <Select
            label="Localidad"
            description={
              profile
                ? 'No se puede cambiar mientras tengas pedidos publicados o asignados, o postulaciones pendientes o aceptadas.'
                : undefined
            }
            withAsterisk
            allowDeselect={false}
            data={localities.map((l) => ({ value: String(l.id), label: `${l.name}, ${l.province}` }))}
            {...form.getInputProps('localityId')}
          />
        ) : (
          <div>
            <Text size="sm" fw={500}>
              Localidad
            </Text>
            <Text size="lg">{locality ? `${locality.name}, ${locality.province}` : '—'}</Text>
          </div>
        )}

        {showRoles && (
          <Stack gap="xs">
            <Text fw={600}>¿Qué querés hacer en PastoControl?</Text>
            <Checkbox
              label="Quiero que me corten el pasto"
              description="Publicás tu terreno y elegís quién lo corta."
              {...form.getInputProps('isClient', { type: 'checkbox' })}
            />
            <Checkbox
              label="Corto pasto"
              description="Ves los trabajos publicados y te postulás."
              {...form.getInputProps('isCutter', { type: 'checkbox' })}
              onChange={(e) => {
                form.setFieldValue('isCutter', e.currentTarget.checked);
                setAvatarError(null);
              }}
            />
          </Stack>
        )}
        {!showRoles && form.errors.isCutter && (
          <Text c="red.8" size="sm">
            {form.errors.isCutter}
          </Text>
        )}

        {saveError && (
          <Alert color="red" icon={<IconAlertTriangle aria-hidden />} title="No se guardó" role="alert">
            {saveError}
          </Alert>
        )}

        <Stack gap="sm">
          <Button type="submit" loading={saving} leftSection={<IconCheck size={20} aria-hidden />}>
            {submitLabel}
          </Button>
          {onCancel && (
            <Button variant="default" onClick={onCancel} disabled={saving} leftSection={<IconX size={20} aria-hidden />}>
              Cancelar
            </Button>
          )}
        </Stack>
      </Stack>
    </form>
  );
}

function pickLocality(localities: Locality[] | undefined, localityId: string): Locality | undefined {
  if (!localities?.length) return undefined;
  return localities.find((l) => String(l.id) === localityId) ?? (localities.length === 1 ? localities[0] : undefined);
}
