import { AppShell, Badge, Container, SegmentedControl, VisuallyHidden } from '@mantine/core';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { IconClipboardList, IconScissors } from '@tabler/icons-react';
import { MODES, modeFromPath, type Mode, type NavItem } from '../app/modes';
import { useCurrentMode } from '../app/useCurrentMode';
import { useNotificationsLive, useUnreadCount } from '../notifications/queries';
import classes from './AppLayout.module.css';

const BAR_HEIGHT = 56;
const SWITCHER_HEIGHT = 64;
const NAV_HEIGHT = 64;

const MODE_ICONS = { pedir: IconClipboardList, cortar: IconScissors } as const;

export function AppLayout() {
  const { pathname } = useLocation();
  const { mode, modes } = useCurrentMode();
  const config = MODES[mode];
  const showSwitcher = modes.length > 1;
  // Contador de avisos sin leer: Realtime + al volver la app al frente.
  useNotificationsLive();
  const unread = useUnreadCount().data ?? 0;

  // Una ruta de un modo que el usuario no tiene (ej.: /cortar sin perfil de cortador).
  const pathMode = modeFromPath(pathname);
  if (pathMode && !modes.includes(pathMode)) return <Navigate to={config.home} replace />;

  return (
    <AppShell
      header={{ height: BAR_HEIGHT + (showSwitcher ? SWITCHER_HEIGHT : 0) }}
      footer={{ height: `calc(${NAV_HEIGHT}px + env(safe-area-inset-bottom))` }}
      padding="md"
    >
      <AppShell.Header withBorder={false}>
        <div className={classes.headerBar} style={{ background: `var(--mantine-color-${config.color}-8)` }}>
          <Link to={config.home} className={classes.brand} aria-label="PastoControl, ir al inicio">
            <img src="/logo.svg" alt="" className={classes.brandLogo} />
            <span className={classes.brandName}>PastoControl</span>
          </Link>
          {/* Con un solo rol no hay selector: el encabezado igual dice en qué modo estás. */}
          {!showSwitcher && <span className={classes.modeTag}>{config.headerLabel}</span>}
        </div>
        {showSwitcher && <ModeSwitcher mode={mode} modes={modes} />}
      </AppShell.Header>

      <AppShell.Main className={classes.main}>
        <Container size="sm" px={0}>
          <Outlet />
        </Container>
      </AppShell.Main>

      <AppShell.Footer>
        <BottomNav items={config.nav} color={config.color} unread={unread} />
      </AppShell.Footer>
    </AppShell>
  );
}

function ModeSwitcher({ mode, modes }: { mode: Mode; modes: Mode[] }) {
  const navigate = useNavigate();

  return (
    <div className={classes.switcherRow} style={{ height: SWITCHER_HEIGHT }}>
      <SegmentedControl
        fullWidth
        aria-label="Elegí qué querés hacer"
        value={mode}
        color={MODES[mode].color}
        classNames={{ control: classes.switcherControl, label: classes.switcherTouch }}
        onChange={(value) => navigate(MODES[value as Mode].home)}
        data={modes.map((m) => {
          const Icon = MODE_ICONS[m];
          return {
            value: m,
            label: (
              <span className={classes.switcherLabel}>
                <Icon size={20} stroke={2} aria-hidden />
                <span>{MODES[m].label}</span>
              </span>
            ),
          };
        })}
      />
    </div>
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
