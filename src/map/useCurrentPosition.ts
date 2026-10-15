import { useCallback, useState } from 'react';
import { getCurrentPosition, GeoError, type CurrentPosition } from '../lib/geo';

type State = { position: CurrentPosition | null; loading: boolean; error: string | null };

/** Ubicación actual a pedido (no se pide sola: el permiso se pide recién al llamar a request). */
export function useCurrentPosition() {
  const [state, setState] = useState<State>({ position: null, loading: false, error: null });

  const request = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const position = await getCurrentPosition();
      setState({ position, loading: false, error: null });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof GeoError ? e.message : 'No pudimos obtener tu ubicación.',
      }));
    }
  }, []);

  return { ...state, request };
}
