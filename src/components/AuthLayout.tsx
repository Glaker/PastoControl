import { Container } from '@mantine/core';
import { Outlet } from 'react-router';
import classes from './AuthLayout.module.css';

/** Layout sin navegación: ingreso, registro, recuperar clave y onboarding. */
export function AuthLayout() {
  return (
    <div className={classes.page}>
      <header className={classes.bar}>
        <img src="/logo.svg" alt="" className={classes.logo} />
        <span className={classes.name}>PastoControl</span>
      </header>
      <Container size="xs" px="md" py="lg">
        <Outlet />
      </Container>
    </div>
  );
}
