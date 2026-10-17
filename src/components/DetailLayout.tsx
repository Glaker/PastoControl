import type { ReactNode } from 'react';
import classes from './DetailLayout.module.css';

/**
 * Detalle de un pedido o trabajo. En el celular, una columna: primero los datos y después las acciones.
 * En escritorio, dos columnas: los datos (con mapa y fotos) a la izquierda y las acciones a la derecha.
 */
export function DetailLayout({ info, actions }: { info: ReactNode; actions: ReactNode }) {
  return (
    <div className={classes.layout}>
      <div className={classes.info}>{info}</div>
      <div className={classes.actions}>{actions}</div>
    </div>
  );
}
