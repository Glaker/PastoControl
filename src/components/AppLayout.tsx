import { AppShell, Avatar, Badge, Button, Container, Text, VisuallyHidden } from '@mantine/core';
import { Link, Navigate, NavLink, Outlet, useLocation, useMatches } from 'react-router';
import { IconClipboardList, IconPlus, IconScissors } from '@tabler/icons-react';
import { MODES, modeFromPath, type Mode, type NavItem } from '../app/modes';
import { useCurrentMode } from '../app/useCurrentMode';
import { useIsDesktop } from '../app/useIsDesktop';
import { useEffect } from 'react';
import { useUserId } from '../auth/AuthProvider';
import { useNotificationsLive, useUnreadCount } from '../notifications/queries';
import { useAvatarUrl, useMyProfile } from '../profile/queries';
import { DevicePrompts } from '../push/DevicePrompts';
import { startPushSync } from '../push/pushStore';
import classes from './AppLayout.module.css';

const BAR_HEIGHT = 56;
// Con los dos roles, el selector va en la misma barra (en vez de una fila aparte): un poco más alta.
const BAR_WITH_SWITCHER_HEIGHT = 64;
const NAV_HEIGHT = 64;
const DESKTOP_BAR_HEIGHT = 64;
const SIDEBAR_WIDTH = 248;

/** `handle` de las rutas de listas: en escritorio usan más ancho (y las tarjetas van en dos columnas). */
export type RouteHandle = { wide?: boolean };

const MODE_ICONS = { pedir: IconClipboardList, cortar: IconScissors } as const;

export function AppLayout() {
  const { pathname } = useLocation();
  const { mode, modes } = useCurrentMode();
  const config = MODES[mode];
  const showSwitcher = modes.length > 1;
  const desktop = useIsDesktop();
  const wide = useMatches().some((m) => (m.handle as RouteHandle | undefined)?.wide);
  // Contador de avisos sin leer: Realtime + al volver la app al frente.
  useNotificationsLive();
  const unread = useUnreadCount().data ?? 0;
  // Push: con el permiso ya dado, la suscripción de este dispositivo queda guardada para esta cuenta.
  const userId = useUserId();
  useEffect(() => {
    startPushSync(userId);
  }, [userId]);
  // Carteles de "Activar avisos" / "Instalar" solo en las pantallas principales, no en cada pantalla.
  const showDevicePrompts = pathname === MODES.pedir.home || pathname === MODES.cortar.home || pathname === '/avisos';

  // Una ruta de un modo que el usuario no tiene (ej.: /cortar sin perfil de cortador).
  const pathMode = modeFromPath(pathname);
  if (pathMode && !modes.includes(pathMode)) return <Navigate to={config.home} replace />;

  const modeLabel = !showSwitcher && <span className={classes.modeTag}>{config.headerLabel}</span>;
  // En el celular con selector, solo el logo: el nombre no entra al lado del selector.
  const brand = (
    <Link to={config.home} className={classes.brand} aria-label="PastoControl, ir al inicio">
      <img src="/logo.svg" alt="" className={classes.brandLogo} />
      {(desktop || !showSwitcher) && <span className={classes.brandName}>PastoControl</span>}
    </Link>
  );

  if (desktop) {
    return (
      <AppShell header={{ height: DESKTOP_BAR_HEIGHT }} navbar={{ width: SIDEBAR_WIDTH, breakpoint: 0 }} padding="xl">
        <AppShell.Header withBorder={false}>
          <div className={classes.headerBar} style={{ height: DESKTOP_BAR_HEIGHT, background: `var(--mantine-color-${config.color}-8)` }}>
            {brand}
            {showSwitcher ? <ModeSwitcher mode={mode} modes={modes} className={classes.switcherDesktop} /> : modeLabel}
          </div>
        </AppShell.Header>

        <AppShell.Navbar className={classes.sidebar}>
          {mode === 'pedir' && <SidebarAction />}
          <SideNav items={config.nav.filter((item) => item.to !== '/pedir/nuevo')} color={config.color} unread={unread} />
          <SidebarUser />
        </AppShell.Navbar>

        <AppShell.Main className={classes.main}>
          <Container size={wide ? 'lg' : 'md'} px={0}>
            {showDevicePrompts && <DevicePrompts />}
            <Outlet />
          </Container>
        </AppShell.Main>
      </AppShell>
    );
  }

  return (
    <AppShell
      header={{ height: showSwitcher ? BAR_WITH_SWITCHER_HEIGHT : BAR_HEIGHT }}
      footer={{ height: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom))` }}
      padding="md"
    >
      <AppShell.Header withBorder={false}>
        <div
          className={classes.headerBar}
          style={{
            height: showSwitcher ? BAR_WITH_SWITCHER_HEIGHT : BAR_HEIGHT,
            background: `var(--mantine-color-${config.color}-8)`,
          }}
        >
          {brand}
          {/* Con un solo rol no hay selector: el encabezado igual dice en qué modo estás. */}
          {showSwitcher ? <ModeSwitcher mode={mode} modes={modes} className={classes.switcherMobile} /> : modeLabel}
        </div>
      </AppShell.Header>

      <AppShell.Main className={classes.main}>
        <Container size="sm" px={0}>
          {showDevicePrompts && <DevicePrompts />}
          <Outlet />
        </Container>
      </AppShell.Main>

      <AppShell.Footer className={classes.footer}>
        <BottomNav items={config.nav} color={config.color} unread={unread} />
      </AppShell.Footer>
    </AppShell>
  );
}

/**
 * Selector «Pedir corte / Cortar» sobre la barra de color: una pastilla con las dos opciones (links a cada modo)
 * y un fondo blanco que se desliza hasta la activa.
 */
function ModeSwitcher({ mode, modes, className }: { mode: Mode; modes: Mode[]; className?: string }) {
  const activeIndex = modes.indexOf(mode);
  return (
    <nav
      aria-label="Elegí qué querés hacer"
      className={`${classes.modeToggle} ${className ?? ''}`}
      style={{
        ['--toggle-count' as string]: modes.length,
        ['--toggle-index' as string]: activeIndex,
        ['--toggle-active' as string]: `var(--mantine-color-${MODES[mode].color}-8)`,
      }}
    >
      <span className={classes.modeThumb} aria-hidden />
      {modes.map((m) => {
        const Icon = MODE_ICONS[m];
        const active = m === mode;
        return (
          <Link
            key={m}
            to={MODES[m].home}
            className={classes.modeOption}
            data-active={active || undefined}
            aria-current={active ? 'true' : undefined}
          >
            <Icon size={20} stroke={2} aria-hidden />
            <span>{MODES[m].label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNav({ items, color, unread }: { items: NavItem[]; color: string; unread: number }) {
  return (
    <nav
      className={classes.nav}
      aria-label="Navegación principal"
      data-bottom-nav
      style={{ ['--nav-active-color' as string]: `var(--mantine-color-${color}-8)` }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const badge = item.badgeKey === 'unread' && unread > 0 ? unread : null;
        return (
          <NavLink key={item.to} to={item.to} end={item.end} className={classes.navItem}>
            <span className={classes.navIcon}>
              <Icon size={26} stroke={1.8} aria-hidden />
              {badge !== null && (
                <Badge size="sm" color="red" circle className={classes.navBadge}>
                  {badge > 9 ? '9+' : badge}
                </Badge>
              )}
            </span>
            <span>
              {item.label}
              {badge !== null && <VisuallyHidden>, {badge} sin leer</VisuallyHidden>}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Escritorio: la misma navegación, vertical y con el texto al lado del ícono. */
function SideNav({ items, color, unread }: { items: NavItem[]; color: string; unread: number }) {
  return (
    <nav
      className={classes.sideNav}
      aria-label="Navegación principal"
      style={{ ['--nav-active-color' as string]: `var(--mantine-color-${color}-8)` }}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const badge = item.badgeKey === 'unread' && unread > 0 ? unread : null;
        return (
          <NavLink key={item.to} to={item.to} end={item.end} className={classes.sideItem}>
            <Icon size={24} stroke={1.8} aria-hidden />
            <span className={classes.sideLabel}>{item.label}</span>
            {badge !== null && (
              <Badge size="md" color="red" circle>
                {badge > 9 ? '9+' : badge}
                <VisuallyHidden> sin leer</VisuallyHidden>
              </Badge>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

/** Arriba del menú lateral, «Publicar un pedido» como botón principal (reemplaza al ítem del menú). */
function SidebarAction() {
  return (
    <Button component={Link} to="/pedir/nuevo" color="blue" size="md" fullWidth mb="md" leftSection={<IconPlus size={20} aria-hidden />}>
      Nuevo pedido
    </Button>
  );
}

/** Abajo del menú lateral: quién tiene la sesión abierta (lleva al perfil). */
function SidebarUser() {
  const { data: profile } = useMyProfile();
  const { data: avatarUrl } = useAvatarUrl(profile?.avatar_path);
  if (!profile) return null;
  return (
    <Link to="/perfil" className={classes.sideUser}>
      <Avatar src={avatarUrl ?? null} size={40} radius={999} color="pasto" alt="">
        {`${profile.first_name.charAt(0)}${profile.last_initial}`}
      </Avatar>
      <div style={{ minWidth: 0 }}>
        <Text fw={700} size="sm" truncate>
          {profile.first_name} {profile.private.last_name}
        </Text>
        <Text size="xs" c="dimmed">
          Ver mi perfil
        </Text>
      </div>
    </Link>
  );
}
