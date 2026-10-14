import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { applyUpdateIfSafe } from './updateState';

/** Cambiar de pantalla es un momento seguro para aplicar una versión nueva. */
export function UpdateOnNavigation() {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    applyUpdateIfSafe();
  }, [pathname]);

  return null;
}
