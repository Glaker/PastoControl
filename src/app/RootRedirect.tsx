import { Navigate } from 'react-router';
import { MODES } from './modes';
import { useCurrentMode } from './useCurrentMode';

/** "/" lleva al inicio del último modo usado. */
export function RootRedirect() {
  const { mode } = useCurrentMode();
  return <Navigate to={MODES[mode].home} replace />;
}
