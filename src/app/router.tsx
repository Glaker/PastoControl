import { createBrowserRouter } from 'react-router';
import { PublicOnly, RequireProfile, RequireSession } from '../auth/guards';
import { AppLayout } from '../components/AppLayout';
import { AuthLayout } from '../components/AuthLayout';
import { FullPageLoader } from '../components/FullPageLoader';
import { RootLayout } from './RootLayout';
import { RootRedirect } from './RootRedirect';
import { RouteError } from './RouteError';

// Las pantallas se cargan a demanda: la primera carga en el celular baja solo lo necesario.
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteError />,
    hydrateFallbackElement: <FullPageLoader />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          {
            element: <PublicOnly />,
            children: [
              { path: 'ingresar', lazy: () => import('../pages/auth/IngresarPage').then((m) => ({ Component: m.IngresarPage })) },
              { path: 'registrarse', lazy: () => import('../pages/auth/RegistrarsePage').then((m) => ({ Component: m.RegistrarsePage })) },
              { path: 'recuperar-clave', lazy: () => import('../pages/auth/RecuperarClavePage').then((m) => ({ Component: m.RecuperarClavePage })) },
            ],
          },
          { path: 'nueva-clave', lazy: () => import('../pages/auth/NuevaClavePage').then((m) => ({ Component: m.NuevaClavePage })) },
        ],
      },
      {
        element: <RequireSession />,
        children: [
          {
            element: <AuthLayout />,
            children: [
              { path: 'bienvenida', lazy: () => import('../pages/BienvenidaPage').then((m) => ({ Component: m.BienvenidaPage })) },
            ],
          },
          {
            element: <RequireProfile />,
            children: [
              { index: true, element: <RootRedirect /> },
              {
                element: <AppLayout />,
                children: [
                  { path: 'pedir', lazy: () => import('../pages/pedir/MisPedidosPage').then((m) => ({ Component: m.MisPedidosPage })) },
                  { path: 'pedir/nuevo', lazy: () => import('../pages/pedir/NuevoPedidoPage').then((m) => ({ Component: m.NuevoPedidoPage })) },
                  { path: 'pedir/pedido/:jobId', lazy: () => import('../pages/pedir/PedidoDetallePage').then((m) => ({ Component: m.PedidoDetallePage })) },
                  { path: 'pedir/pedido/:jobId/editar', lazy: () => import('../pages/pedir/EditarPedidoPage').then((m) => ({ Component: m.EditarPedidoPage })) },
                  { path: 'cortar', lazy: () => import('../pages/cortar/TrabajosPage').then((m) => ({ Component: m.TrabajosPage })) },
                  { path: 'cortar/trabajo/:jobId', lazy: () => import('../pages/cortar/TrabajoDetallePage').then((m) => ({ Component: m.TrabajoDetallePage })) },
                  { path: 'cortar/postulaciones', lazy: () => import('../pages/cortar/MisPostulacionesPage').then((m) => ({ Component: m.MisPostulacionesPage })) },
                  { path: 'trabajo/:jobId', lazy: () => import('../pages/TrabajoRedirectPage').then((m) => ({ Component: m.TrabajoRedirectPage })) },
                  { path: 'persona/:personId', lazy: () => import('../pages/PersonaPage').then((m) => ({ Component: m.PersonaPage })) },
                  { path: 'avisos', lazy: () => import('../pages/AvisosPage').then((m) => ({ Component: m.AvisosPage })) },
                  { path: 'perfil', lazy: () => import('../pages/PerfilPage').then((m) => ({ Component: m.PerfilPage })) },
                  { path: '*', lazy: () => import('../pages/NotFoundPage').then((m) => ({ Component: m.NotFoundPage })) },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
