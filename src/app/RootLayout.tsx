import { Progress } from '@mantine/core';
import { useEffect } from 'react';
import { Outlet, useNavigate, useNavigation } from 'react-router';
import { UpdateBanner } from './update/UpdateBanner';
import { UpdateOnNavigation } from './update/UpdateOnNavigation';

export function RootLayout() {
  const navigation = useNavigation();
  const navigate = useNavigate();

  // Al tocar una notificación push con la app abierta, el service worker pide ir a esa pantalla.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: unknown } | null;
      if (data?.type === 'NAVIGATE' && typeof data.path === 'string' && data.path.startsWith('/') && !data.path.startsWith('//')) {
        void navigate(data.path);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
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
