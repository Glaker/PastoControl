import { Button, Stack, Table, Text, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router';
import { TERMS_DATE, TERMS_VERSION } from '../../legal/terms';
import { BackButton, Bullets, ContactEmail, DraftNote, LegalSection, MailButton } from './LegalParts';

// Quién ve cada dato. Tiene que coincidir con las reglas de la base (RLS y RPCs): si cambian, cambiar esto
// y subir TERMS_VERSION.
const WHO_SEES: Array<[string, string]> = [
  ['Email y contraseña', 'Solo vos. La contraseña se guarda cifrada: nadie la puede leer.'],
  ['Nombre', 'Cualquier persona con cuenta en PastoControl.'],
  [
    'Apellido',
    'Los demás ven solo la inicial. El apellido completo, solo la persona con la que acordás un trabajo, mientras el trabajo está asignado o después de hecho.',
  ],
  ['Teléfono (WhatsApp)', 'Solo la persona con la que acordás un trabajo, mientras está asignado o después de hecho.'],
  ['Foto de perfil', 'Cualquier persona con cuenta. Para cortar pasto es obligatoria.'],
  [
    'Dirección y ubicación del pedido (y su zona, nota, fotos, precio y fecha)',
    'Vos; todas las personas que cortan pasto, de cualquier ciudad, mientras el pedido está publicado y no pasó la fecha (la app les muestra los que les quedan a la distancia que eligen); y quienes se postularon a ese pedido.',
  ],
  ['Tu postulación (precio y horario que proponés)', 'Vos y la persona que publicó el pedido, con tu nombre, tu foto y tus estadísticas.'],
  ['Ubicación base del cortador («mi casa») y la distancia hasta la que buscás', 'Solo vos.'],
  [
    'Calificaciones',
    'Nadie, ni quien las recibe. En el perfil público solo se muestra el porcentaje de «volverían a trabajar», con 5 calificaciones o más, redondeado y actualizado una vez por semana.',
  ],
  ['Perfil público', 'Cualquier persona con cuenta: nombre, inicial del apellido, foto, si pedís o cortás, desde cuándo estás y cuántos trabajos hiciste.'],
  ['Avisos y dispositivos donde recibís avisos', 'Solo vos.'],
  ['Qué versión de estos términos aceptaste y cuándo', 'Solo vos.'],
];

/** Política de privacidad (borrador, Ley 25.326). Si cambia el texto, sube TERMS_VERSION. */
export function PrivacidadPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <Stack gap="lg">
      {!embedded && <BackButton />}
      <div>
        <Title order={1} size="h2">
          Política de privacidad
        </Title>
        <DraftNote version={TERMS_VERSION} date={TERMS_DATE} />
      </div>
      <Text>
        Acá contamos qué datos tuyos guardamos, quién los ve, para qué los usamos y cómo borrarlos. Seguimos la Ley
        25.326 de Protección de los Datos Personales.
      </Text>

      <LegalSection title="Qué datos guardamos">
        <Bullets
          items={[
            'Tu email y tu contraseña (para entrar).',
            'Nombre, apellido y teléfono (WhatsApp).',
            'Foto de perfil.',
            'Si pedís cortes, cortás pasto o las dos cosas.',
            'De cada pedido: dirección, ubicación en el mapa, zona, nota, fotos, precio y fecha.',
            'Si cortás pasto: tu ubicación base («desde dónde salís») y la distancia hasta la que buscás trabajos.',
            'Tus postulaciones, los trabajos acordados y las calificaciones.',
            'Los avisos que te mandamos y, si los activás, los datos técnicos del dispositivo para mandarte avisos.',
            'Qué versión de los términos aceptaste y cuándo.',
          ]}
        />
        <Text>
          Tu ubicación actual (GPS) no la guardamos: la usamos en el momento para marcar un pin o para buscar trabajos
          cerca de donde estás.
        </Text>
      </LegalSection>

      <LegalSection title="Quién ve cada dato">
        <Table withRowBorders verticalSpacing="sm" layout="fixed">
          <Table.Tbody>
            {WHO_SEES.map(([what, who]) => (
              <Table.Tr key={what}>
                <Table.Td w="38%" fw={600} style={{ verticalAlign: 'top' }}>
                  {what}
                </Table.Td>
                <Table.Td style={{ verticalAlign: 'top' }}>{who}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text>
          Las personas que administran PastoControl pueden acceder a la base de datos para mantenerla o atender un
          reclamo. No la usan para nada más.
        </Text>
      </LegalSection>

      <LegalSection title="Para qué los usamos">
        <Text>
          Solo para que la app funcione: publicar pedidos, postularse, ponerse en contacto, mandarte avisos, calcular
          distancias, mostrar las estadísticas del perfil y evitar abusos. No vendemos ni compartimos tus datos con
          nadie para publicidad, y la app no tiene publicidad.
        </Text>
      </LegalSection>

      <LegalSection title="Dónde se guardan y qué servicios usamos">
        <Bullets
          items={[
            'Supabase guarda la base de datos, las fotos y las cuentas. Vercel publica la app. Sus servidores pueden estar fuera de Argentina.',
            'El mapa usa OpenStreetMap: al verlo, tu celular le pide las imágenes del mapa a sus servidores (como cualquier página web).',
            'Los avisos al celular pasan cifrados por el servicio de avisos de tu navegador (Google, Apple, Mozilla o Microsoft).',
            '«Escribir por WhatsApp» y «Cómo llegar» abren WhatsApp y Google Maps: lo que hagas ahí queda fuera de PastoControl.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Cuánto tiempo los guardamos">
        <Text>
          Mientras tengas la cuenta. Los servicios que usamos pueden guardar registros técnicos (por ejemplo, de
          accesos) y copias de seguridad por un tiempo limitado, que se renuevan solas.
        </Text>
      </LegalSection>

      <LegalSection title="Cómo borrar tu cuenta y qué pasa con tus datos">
        <Text>
          Desde tu perfil, en «Borrar mi cuenta». Antes tenés que cancelar tus pedidos publicados o asignados y retirar
          tus postulaciones pendientes o aceptadas. Si no podés entrar, escribinos.
        </Text>
        <Text fw={600}>Se borra:</Text>
        <Bullets
          items={[
            'tu cuenta (email y contraseña), tu nombre, apellido, teléfono, foto, ubicación base y distancia de búsqueda;',
            'la aceptación de los términos;',
            'las fotos de todos tus pedidos y los pedidos en los que no participó nadie más;',
            'tus avisos y tus dispositivos.',
          ]}
        />
        <Text fw={600}>Queda, sin ningún dato tuyo:</Text>
        <Bullets
          items={[
            'los trabajos que hiciste o que te hicieron, y los pedidos cancelados en los que alguien se había postulado: solo el estado, el precio y las fechas, sin dirección, ubicación, nota ni fotos;',
            'las calificaciones, sin quién las dio ni quién las recibió.',
          ]}
        />
        <Text>
          Así la otra persona no pierde su historial ni su porcentaje. Donde aparecías, va a decir «Usuario eliminado».
          En los avisos de los demás se borran tu nombre y, si el pedido era tuyo, tu dirección.
        </Text>
        {!embedded && (
          <Button
            component={Link}
            to="/borrar-cuenta"
            variant="default"
            leftSection={<IconTrash size={20} aria-hidden />}
            style={{ alignSelf: 'flex-start' }}
          >
            Cómo borrar la cuenta
          </Button>
        )}
      </LegalSection>

      <LegalSection title="Tus derechos">
        <Text>
          Podés pedir ver tus datos, corregirlos, actualizarlos o borrarlos. Casi todo lo podés hacer vos desde tu
          perfil; si no, escribinos a <ContactEmail /> desde el email de tu cuenta. Respondemos los pedidos de acceso
          en 10 días corridos y los de corrección o borrado en 5 días hábiles.
        </Text>
        <Text size="sm">
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma
          gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto
          conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326. La Agencia de Acceso a la
          Información Pública, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender
          las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las
          normas vigentes en materia de protección de datos personales.
        </Text>
      </LegalSection>

      <LegalSection title="Si cambia esta política">
        <Text>Te vamos a pedir que aceptes la versión nueva para seguir usando la app.</Text>
      </LegalSection>

      <LegalSection title="Contacto">
        <Text>
          Escribinos a <ContactEmail />.
        </Text>
        <MailButton />
      </LegalSection>
    </Stack>
  );
}
