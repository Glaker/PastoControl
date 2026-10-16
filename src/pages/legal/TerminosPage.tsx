import { Button, Stack, Text, Title } from '@mantine/core';
import { IconShieldLock } from '@tabler/icons-react';
import { Link } from 'react-router';
import { TERMS_DATE, TERMS_VERSION } from '../../legal/terms';
import { BackButton, Bullets, ContactEmail, DraftNote, LegalSection, MailButton } from './LegalParts';

/** Términos y condiciones (borrador para revisar con un abogado). Si cambia el texto, sube TERMS_VERSION. */
export function TerminosPage({ embedded = false }: { embedded?: boolean }) {
  return (
    <Stack gap="lg">
      {!embedded && <BackButton />}
      <div>
        <Title order={1} size="h2">
          Términos y condiciones
        </Title>
        <DraftNote version={TERMS_VERSION} date={TERMS_DATE} />
      </div>
      <Text>
        Estas son las reglas para usar PastoControl. Las escribimos para que se entiendan. Si usás la app, quiere
        decir que estás de acuerdo con ellas.
      </Text>

      <LegalSection title="1. Qué es PastoControl">
        <Text>
          Una app gratuita que pone en contacto a quien necesita que le corten el pasto con quien hace ese trabajo.
          Sirve para publicar pedidos, postularse, elegir a alguien y pasarse el WhatsApp.
        </Text>
      </LegalSection>

      <LegalSection title="2. PastoControl no es parte del trabajo">
        <Text>
          Solo conectamos a las personas. No empleamos ni contratamos a nadie, no organizamos el trabajo, no
          fijamos los precios y no cobramos ni pagamos nada. El acuerdo es entre la persona que pide el corte y la
          que lo hace.
        </Text>
      </LegalSection>

      <LegalSection title="3. De qué no nos hacemos responsables">
        <Text>Lo que pase con el trabajo lo arreglan entre las dos personas. PastoControl no responde por:</Text>
        <Bullets
          items={[
            'accidentes o lesiones mientras se hace el trabajo;',
            'daños a personas, animales, plantas, herramientas o cualquier cosa;',
            'la calidad del trabajo o si se hizo o no;',
            'el pago, si se pagó de más, de menos o no se pagó.',
          ]}
        />
        <Text>
          Te recomendamos dejar claro por WhatsApp, antes de empezar, el precio, el día y qué incluye el trabajo.
        </Text>
      </LegalSection>

      <LegalSection title="4. Lo que publicás es tu responsabilidad">
        <Text>
          Cada persona es responsable de lo que publica (pedidos, fotos, notas, propuestas) y de los datos que
          carga. Tienen que ser verdaderos y tuyos. No publiques datos de otras personas sin su permiso, ni nada
          ofensivo, engañoso o ilegal.
        </Text>
      </LegalSection>

      <LegalSection title="5. Cuentas que abusan">
        <Text>
          Podemos suspender o borrar cuentas que abusen de la app: datos falsos, pedidos o postulaciones que no son
          en serio, mensajes molestos, maltrato o cualquier uso que no sea conseguir o hacer cortes de pasto.
        </Text>
      </LegalSection>

      <LegalSection title="6. Es gratis">
        <Text>
          Usar PastoControl no cuesta nada: no cobramos comisión ni suscripción, y no hay publicidad. Si algún día
          eso cambiara, te avisamos antes y vas a tener que aceptar los términos nuevos.
        </Text>
      </LegalSection>

      <LegalSection title="7. Si cambian estos términos">
        <Text>
          Te vamos a pedir que aceptes la versión nueva para seguir usando la app. Si no estás de acuerdo, podés
          borrar tu cuenta.
        </Text>
      </LegalSection>

      <LegalSection title="8. Tus datos y tu cuenta">
        <Text>
          Cómo usamos tus datos lo explicamos en la política de privacidad. Podés borrar tu cuenta cuando quieras
          desde tu perfil.
        </Text>
        {!embedded && (
          <Button
            component={Link}
            to="/privacidad"
            variant="default"
            leftSection={<IconShieldLock size={20} aria-hidden />}
            style={{ alignSelf: 'flex-start' }}
          >
            Ver la política de privacidad
          </Button>
        )}
      </LegalSection>

      <LegalSection title="9. La app, tal como está">
        <Text>
          Hacemos lo posible para que PastoControl funcione bien, pero puede tener errores o dejar de andar un rato.
          No garantizamos que esté siempre disponible.
        </Text>
      </LegalSection>

      <LegalSection title="10. Contacto">
        <Text>
          Por cualquier consulta, escribinos a <ContactEmail />.
        </Text>
        <MailButton />
        <Text>Estos términos se rigen por las leyes de la República Argentina.</Text>
      </LegalSection>
    </Stack>
  );
}
