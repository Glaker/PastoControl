import { useMediaQuery } from '@mantine/hooks';

/** Desde acá (62em = 992px) se usa el diseño de escritorio: menú lateral, columnas, mapas extra. */
export const DESKTOP_QUERY = '(min-width: 62em)';

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY, false, { getInitialValueInEffect: false });
}
