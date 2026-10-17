import type { ReactNode } from 'react';
import classes from './CardGrid.module.css';

/** Tarjetas de una lista: una columna en el celular, dos en escritorio. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <div className={classes.grid}>{children}</div>;
}
