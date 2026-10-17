import { Accordion, Anchor, Badge, Button, Container, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import {
  IconBell,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconCoin,
  IconHome,
  IconLock,
  IconLogin,
  IconMapPin,
  IconRoute,
  IconStar,
  IconUserPlus,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import { Link } from 'react-router';
import classes from './LandingPage.module.css';

const CLIENT_STEPS = [
  { title: 'Publicá tu terreno', text: 'Marcás dónde está, cuánto pagás y qué día te viene bien. Si querés, sumás fotos.' },
  { title: 'Recibí postulaciones', text: 'Los cortadores de la zona aceptan tu precio o te proponen otro precio u horario.' },
  { title: 'Elegí y arreglen', text: 'Mirás sus calificaciones, elegís a uno y se escriben por WhatsApp para coordinar.' },
];

const CUTTER_STEPS = [
  { title: 'Decí desde dónde salís', text: 'Elegís hasta qué distancia te movés: 5, 10, 20 o 50 km.' },
  { title: 'Mirá los trabajos cerca', text: 'En lista o en el mapa, del más cercano al más lejano, con precio, día y fotos.' },
  { title: 'Postulate', text: 'Aceptás lo publicado o hacés tu contraoferta. Si te eligen, te llega el aviso al celular.' },
];

const FEATURES: Array<{ icon: Icon; title: string; text: string }> = [
  { icon: IconCoin, title: 'Gratis y sin comisiones', text: 'Lo que se acuerda se paga directo entre ustedes. La app no cobra nada.' },
  { icon: IconBrandWhatsapp, title: 'Trato directo', text: 'Al elegir a alguien se comparten los WhatsApp para coordinar sin intermediarios.' },
  { icon: IconStar, title: 'Calificaciones', text: 'Después de cada corte se califican entre sí. Antes de elegir, ves con quién tratás.' },
  { icon: IconBell, title: 'Avisos al celular', text: 'Postulaciones, aceptaciones y cambios te llegan al toque, aunque tengas la app cerrada.' },
  { icon: IconMapPin, title: 'Cerca tuyo', text: 'Cada pedido tiene su pin en el mapa. Funciona en cualquier lugar de Argentina.' },
  { icon: IconLock, title: 'Tus datos cuidados', text: 'Tu apellido y tu WhatsApp solo los ve la persona con la que acordás un trabajo.' },
];

const FAQ = [
  {
    q: '¿Cuánto cuesta?',
    a: 'Nada. Publicar, postularse y usar la app es gratis, y no hay comisiones: el precio que acuerdan se paga completo a quien corta.',
  },
  {
    q: '¿Cómo se paga el corte?',
    a: 'Como arreglen entre ustedes (efectivo, transferencia). La app no maneja pagos.',
  },
  {
    q: '¿Tengo que instalar algo?',
    a: 'No hace falta: funciona desde el navegador. Si querés, la instalás en el celular desde la misma app para tenerla como cualquier otra y recibir avisos.',
  },
  {
    q: '¿Puedo pedir y cortar con la misma cuenta?',
    a: 'Sí. Elegís una o las dos cosas al registrarte y lo cambiás cuando quieras desde tu perfil.',
  },
];

/** Inicio público: lo que ve quien entra a la página sin sesión. */
export function LandingPage() {
  return (
    <div className={classes.page}>
      <header className={classes.topBar}>
        <Container size="lg" className={classes.topBarInner}>
          <Link to="/" className={classes.brand} aria-label="PastoControl, inicio">
            <img src="/logo.svg" alt="" className={classes.brandLogo} />
            <span>PastoControl</span>
          </Link>
          <Button component={Link} to="/ingresar" variant="white" size="md" leftSection={<IconLogin size={18} aria-hidden />}>
            Entrar
          </Button>
        </Container>
      </header>

      <section className={classes.hero}>
        <Container size="lg" className={classes.heroInner}>
          <div className={classes.heroText}>
            <Group gap="xs" mb="md">
              <Badge variant="white" color="pasto" size="lg">
                Gratis
              </Badge>
              <Badge variant="white" color="pasto" size="lg">
                Sin comisiones
              </Badge>
              <Badge variant="white" color="pasto" size="lg">
                Toda Argentina
              </Badge>
            </Group>
            <Title order={1} className={classes.heroTitle}>
              Tu pasto cortado, <span className={classes.heroAccent}>sin vueltas.</span>
            </Title>
            <Text className={classes.heroLead}>
              Publicá tu terreno con el precio y el día. Los cortadores de la zona se postulan, elegís a quién y arreglan
              por WhatsApp. ¿Cortás pasto? Encontrá trabajos cerca tuyo.
            </Text>
            <div className={classes.heroCtas}>
              <Button component={Link} to="/registrarse" size="lg" variant="white" leftSection={<IconUserPlus size={20} aria-hidden />}>
                Crear cuenta gratis
              </Button>
              <Button component={Link} to="/ingresar" size="lg" variant="outline" color="white" leftSection={<IconLogin size={20} aria-hidden />}>
                Ya tengo cuenta
              </Button>
            </div>
          </div>
          <HeroMock />
        </Container>
        <svg className={classes.heroGrass} viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden>
          <path d="M0 80V48Q90 16 180 44T360 44T540 44T720 44T900 44T1080 44T1260 44T1440 44V80Z" />
        </svg>
      </section>

      <section className={classes.section} aria-labelledby="como-funciona">
        <Container size="lg">
          <Title order={2} id="como-funciona" className={classes.sectionTitle}>
            Cómo funciona
          </Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" mt="xl">
            <StepsCard color="blue" icon={IconHome} title="Si necesitás un corte" steps={CLIENT_STEPS} />
            <StepsCard color="pasto" icon={IconUsers} title="Si cortás pasto" steps={CUTTER_STEPS} />
          </SimpleGrid>
        </Container>
      </section>

      <section className={classes.sectionAlt} aria-labelledby="por-que">
        <Container size="lg">
          <Title order={2} id="por-que" className={classes.sectionTitle}>
            Pensada para tu barrio
          </Title>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="lg" mt="xl">
            {FEATURES.map(({ icon: FeatureIcon, title, text }) => (
              <div key={title} className={classes.feature}>
                <ThemeIcon size={48} radius="md" variant="light" color="pasto">
                  <FeatureIcon size={26} aria-hidden />
                </ThemeIcon>
                <Text fw={800} size="lg" mt="sm">
                  {title}
                </Text>
                <Text c="dimmed" mt={4}>
                  {text}
                </Text>
              </div>
            ))}
          </SimpleGrid>
        </Container>
      </section>

      <section className={classes.section} aria-labelledby="preguntas">
        <Container size="sm">
          <Title order={2} id="preguntas" className={classes.sectionTitle}>
            Preguntas frecuentes
          </Title>
          <Accordion variant="separated" radius="md" mt="xl">
            {FAQ.map(({ q, a }) => (
              <Accordion.Item key={q} value={q}>
                <Accordion.Control>
                  <Text fw={700}>{q}</Text>
                </Accordion.Control>
                <Accordion.Panel>{a}</Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Container>
      </section>

      <section className={classes.finalCta}>
        <Container size="sm">
          <Stack align="center" gap="md">
            <Title order={2} ta="center" c="white">
              ¿Arrancamos?
            </Title>
            <Text ta="center" c="pasto.0" size="lg">
              Crear la cuenta lleva un minuto.
            </Text>
            <Button component={Link} to="/registrarse" size="lg" variant="white" leftSection={<IconUserPlus size={20} aria-hidden />}>
              Crear cuenta gratis
            </Button>
          </Stack>
        </Container>
      </section>

      <footer className={classes.footer}>
        <Container size="lg">
          <Group justify="space-between" gap="md">
            <Text size="sm" c="dimmed">
              © {new Date().getFullYear()} PastoControl
            </Text>
            <Group gap="lg">
              <Anchor component={Link} to="/terminos" size="sm" c="dimmed">
                Términos
              </Anchor>
              <Anchor component={Link} to="/privacidad" size="sm" c="dimmed">
                Privacidad
              </Anchor>
              <Anchor component={Link} to="/borrar-cuenta" size="sm" c="dimmed">
                Borrar mi cuenta
              </Anchor>
            </Group>
          </Group>
        </Container>
      </footer>
    </div>
  );
}

function StepsCard({
  color,
  icon: CardIcon,
  title,
  steps,
}: {
  color: string;
  icon: Icon;
  title: string;
  steps: Array<{ title: string; text: string }>;
}) {
  return (
    <div className={classes.stepsCard} style={{ ['--steps-color' as string]: `var(--mantine-color-${color}-8)` }}>
      <Group gap="sm" mb="lg">
        <ThemeIcon size={44} radius="md" color={color}>
          <CardIcon size={24} aria-hidden />
        </ThemeIcon>
        <Title order={3} size="h3">
          {title}
        </Title>
      </Group>
      <ol className={classes.steps}>
        {steps.map((s, i) => (
          <li key={s.title} className={classes.step}>
            <span className={classes.stepNumber} aria-hidden>
              {i + 1}
            </span>
            <div>
              <Text fw={700}>{s.title}</Text>
              <Text c="dimmed" size="sm" mt={2}>
                {s.text}
              </Text>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Ilustración: un pedido como se ve en la app (datos de ejemplo). */
function HeroMock() {
  return (
    <div className={classes.mock} aria-hidden>
      <div className={classes.mockCard}>
        <Group gap="xs">
          <Badge variant="light" color="blue" size="md">
            Publicado
          </Badge>
          <Badge variant="filled" color="blue" size="md" leftSection={<IconUsers size={14} />}>
            3 postulaciones
          </Badge>
        </Group>
        <Text fw={800} size="1.75rem" mt="sm" lh={1.1}>
          $ 25.000
        </Text>
        <Stack gap={6} mt="sm">
          <Group gap={6} wrap="nowrap">
            <IconCalendarEvent size={18} />
            <Text size="sm">sáb. 18/10 · 10:00 h</Text>
          </Group>
          <Group gap={6} wrap="nowrap">
            <IconHome size={18} />
            <Text size="sm">Calle 9</Text>
          </Group>
          <Group gap={6} wrap="nowrap" c="pasto.8">
            <IconRoute size={18} />
            <Text size="sm" fw={700} c="inherit">
              a 1,2 km
            </Text>
          </Group>
        </Stack>
      </div>
      <div className={classes.mockToast}>
        <ThemeIcon size={36} radius="xl" color="teal">
          <IconBell size={20} />
        </ThemeIcon>
        <div>
          <Text fw={800} size="sm">
            ¡Te eligieron!
          </Text>
          <Text size="xs" c="dimmed">
            Ya podés escribirle por WhatsApp.
          </Text>
        </div>
      </div>
    </div>
  );
}
