import { Container, Paper } from '@mantine/core';
import { Link, Outlet } from 'react-router';
import classes from './AuthLayout.module.css';

/** Layout sin navegación: ingreso, registro, recuperar clave y onboarding. */
export function AuthLayout() {
  return (
    <div className={classes.page}>
      <header className={classes.bar}>
        <Link to="/" className={classes.brand} aria-label="PastoControl, inicio">
          <img src="/logo.svg" alt="" className={classes.logo} />
          <span className={classes.name}>PastoControl</span>
        </Link>
      </header>
      <Container size="xs" px="md" pb="xl" className={classes.content}>
        <Paper radius="lg" shadow="md" p={{ base: 'md', xs: 'xl' }} className={classes.panel}>
          <Outlet />
        </Paper>
      </Container>
    </div>
  );
}
