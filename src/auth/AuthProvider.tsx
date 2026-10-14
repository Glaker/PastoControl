import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

type AuthState = { session: Session | null; loading: boolean };

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ session: null, loading: true });

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ session: data.session, loading: false });
    });

    // Importante: no llamar a supabase dentro de este callback (puede trabar el cliente de auth).
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, loading: false });
      if (event === 'SIGNED_OUT') queryClient.clear();
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Id del usuario logueado. Solo para pantallas detrás de RequireSession. */
export function useUserId(): string {
  const { session } = useAuth();
  if (!session) throw new Error('useUserId fuera de una ruta protegida');
  return session.user.id;
}
