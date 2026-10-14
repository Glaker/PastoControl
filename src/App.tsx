import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { AuthProvider } from './auth/AuthProvider';
import { theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <DatesProvider settings={{ locale: 'es', firstDayOfWeek: 1 }}>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ModalsProvider labels={{ confirm: 'Confirmar', cancel: 'Volver' }}>
              <Notifications position="top-center" />
              <RouterProvider router={router} />
            </ModalsProvider>
          </AuthProvider>
        </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
