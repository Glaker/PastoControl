import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { readLocal, writeLocal } from '../lib/storage';
import { LAST_MODE_KEY, modeFromPath, type Mode } from './modes';
import { availableModes, useRoles } from './roles';

/**
 * El modo sale de la URL (/pedir/... o /cortar/...). En las pantallas comunes
 * (avisos, perfil) se mantiene el último modo usado, siempre que el usuario tenga ese rol.
 */
export function useCurrentMode(): { mode: Mode; modes: Mode[] } {
  const { pathname } = useLocation();
  const modes = availableModes(useRoles());
  const fromPath = modeFromPath(pathname);

  const stored = readLocal(LAST_MODE_KEY);
  const fallback: Mode = stored === 'pedir' || stored === 'cortar' ? stored : 'pedir';
  const candidate = fromPath ?? fallback;
  const mode = modes.includes(candidate) ? candidate : (modes[0] ?? 'pedir');

  useEffect(() => {
    if (fromPath) writeLocal(LAST_MODE_KEY, fromPath);
  }, [fromPath]);

  return { mode, modes };
}
