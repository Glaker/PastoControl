import { createBrowserRouter } from 'react-router';
import { PublicOnly, RequireProfile, RequireSession } from '../auth/guards';
import { RequireTerms } from '../legal/TermsGate';
import { AppLayout, type RouteHandle } from '../components/AppLayout';
import { AuthLayout } from '../components/AuthLayout';
import { FullPageLoader } from '../components/FullPageLoader';
import { RootLayout } from './RootLayout';
import { RootRedirect } from './RootRedirect';
import { RouteError } from './RouteError';

// Listas: en escritorio usan más ancho.
const wide: RouteHandle = { wide: true };

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
          // Públicas, con sesión o sin ella (se linkean desde el registro, el ingreso y el perfil).
          { path: 'terminos', lazy: () => import('../pages/legal/TerminosPage').then((m) => ({ Component: m.TerminosPage })) },
          { path: 'privacidad', lazy: () => import('../pages/legal/PrivacidadPage').then((m) => ({ Component: m.PrivacidadPage })) },
          { path: 'borrar-cuenta', lazy: () => import('../pages/legal/BorrarCuentaInfoPage').then((m) => ({ Component: m.BorrarCuentaInfoPage })) },
          { path: 'cuenta-borrada', lazy: () => import('../account/CuentaBorradaPage').then((m) => ({ Component: m.CuentaBorradaPage })) },
        ],
      },
      {
        element: <RequireSession />,
        children: [
          {
            // Sin aceptar la versión vigente de los términos solo se puede borrar la cuenta (y cancelar lo pendiente).
            element: <RequireTerms />,
            children: [
              {
                element: <AuthLayout />,
                children: [
                  { path: 'bienvenida', lazy: () => import('../pages/BienvenidaPage').then((m) => ({ Component: m.BienvenidaPage })) },
                  { path: 'cuenta/borrar', lazy: () => import('../account/BorrarCuentaPage').then((m) => ({ Component: m.BorrarCuentaPage })) },
                ],
              },
              {
                element: <RequireProfile />,
                children: [
                  { index: true, element: <RootRedirect /> },
                  {
                    element: <AppLayout />,
                    children: [
                      { path: 'pedir', handle: wide, lazy: () => import('../pages/pedir/MisPedidosPage').then((m) => ({ Component: m.MisPedidosPage })) },
                      { path: 'pedir/nuevo', lazy: () => import('../pages/pedir/NuevoPedidoPage').then((m) => ({ Component: m.NuevoPedidoPage })) },
                      { path: 'pedir/pedido/:jobId', lazy: () => import('../pages/pedir/PedidoDetallePage').then((m) => ({ Component: m.PedidoDetallePage })) },
                      { path: 'pedir/pedido/:jobId/editar', lazy: () => import('../pages/pedir/EditarPedidoPage').then((m) => ({ Component: m.EditarPedidoPage })) },
                      { path: 'cortar', handle: wide, lazy: () => import('../pages/cortar/TrabajosPage').then((m) => ({ Component: m.TrabajosPage })) },
                      { path: 'cortar/trabajo/:jobId', lazy: () => import('../pages/cortar/TrabajoDetallePage').then((m) => ({ Component: m.TrabajoDetallePage })) },
                      { path: 'cortar/postulaciones', handle: wide, lazy: () => import('../pages/cortar/MisPostulacionesPage').then((m) => ({ Component: m.MisPostulacionesPage })) },
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
    ],
  },
]);
