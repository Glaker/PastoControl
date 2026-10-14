import {
  IconBell,
  IconClipboardList,
  IconListSearch,
  IconPlus,
  IconSend,
  IconUserCircle,
  type Icon,
} from '@tabler/icons-react';

export type Mode = 'pedir' | 'cortar';

export type NavItem = { to: string; label: string; icon: Icon; end?: boolean; badgeKey?: 'unread' };

type ModeConfig = {
  label: string;
  /** Texto corto que acompaña al nombre de la app en el encabezado. */
  headerLabel: string;
  /** Color de Mantine del encabezado y del selector: cada modo se distingue a simple vista. */
  color: string;
  home: string;
  nav: NavItem[];
};

const shared: NavItem[] = [
  { to: '/avisos', label: 'Avisos', icon: IconBell, badgeKey: 'unread' },
  { to: '/perfil', label: 'Perfil', icon: IconUserCircle },
];

export const MODES: Record<Mode, ModeConfig> = {
  pedir: {
    label: 'Pedir corte',
    headerLabel: 'Pedir corte',
    color: 'blue',
    home: '/pedir',
    nav: [
      { to: '/pedir', label: 'Mis pedidos', icon: IconClipboardList, end: true },
      { to: '/pedir/nuevo', label: 'Publicar', icon: IconPlus },
      ...shared,
    ],
  },
  cortar: {
    label: 'Cortar',
    headerLabel: 'Cortar pasto',
    color: 'pasto',
    home: '/cortar',
    nav: [
      { to: '/cortar', label: 'Trabajos', icon: IconListSearch, end: true },
      { to: '/cortar/postulaciones', label: 'Postulaciones', icon: IconSend },
      ...shared,
    ],
  },
};

export const LAST_MODE_KEY = 'pastocontrol:last-mode';

export function modeFromPath(pathname: string): Mode | null {
  if (pathname === '/pedir' || pathname.startsWith('/pedir/')) return 'pedir';
  if (pathname === '/cortar' || pathname.startsWith('/cortar/')) return 'cortar';
  return null;
}
