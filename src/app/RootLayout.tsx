import { Progress } from '@mantine/core';
import { Outlet, useNavigation } from 'react-router';
import { UpdateBanner } from './update/UpdateBanner';
import { UpdateOnNavigation } from './update/UpdateOnNavigation';

export function RootLayout() {
  const navigation = useNavigation();
  return (
    <>
      {navigation.state === 'loading' && (
        <Progress
          value={100}
          animated
          size="sm"
          radius={0}
          aria-label="Cargando pantalla"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400 }}
        />
      )}
      <Outlet />
      <UpdateOnNavigation />
      <UpdateBanner />
    </>
  );
}
