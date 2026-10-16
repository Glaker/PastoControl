import { useQuery } from '@tanstack/react-query';
import type { ApplicationStatus } from '../jobs/queries';
import { supabase } from '../lib/supabase';

export type Applicant = {
  application_id: string;
  /** null (y sin nombre ni foto): el cortador borró su cuenta. */
  cutter_id: string | null;
  first_name: string | null;
  last_initial: string | null;
  avatar_path: string | null;
  status: ApplicationStatus;
  proposed_price_ars: number | null;
  proposed_at: string | null;
  created_at: string;
  /** Versión de la postulación: se manda tal cual al aceptar (no pasarla por Date: perdería microsegundos). */
  updated_at: string;
  /** Estadísticas públicas como cortador (yes_pct es null con menos de 5 calificaciones). */
  done_jobs: number | null;
  yes_pct: number | null;
};

export type JobContact = {
  counterpart_role: 'cliente' | 'cortador';
  first_name: string;
  last_name: string;
  phone_e164: string;
  agreed_price_ars: number;
  agreed_at: string;
};

export const assignmentKeys = {
  applicants: (jobId: string) => ['jobs', 'applicants', jobId] as const,
  contact: (jobId: string) => ['jobs', 'contact', jobId] as const,
};

/** Postulantes de un pedido propio (sin las retiradas), con nombre visible y foto. */
export function useJobApplicants(jobId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: assignmentKeys.applicants(jobId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_job_applicants', { p_job_id: jobId! });
      if (error) throw error;
      return data as Applicant[];
    },
    enabled: !!jobId && enabled,
  });
}

/** Contacto de la contraparte (solo las dos partes y con el trabajo asignado o realizado). */
export function useJobContact(jobId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: assignmentKeys.contact(jobId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_job_contact', { p_job_id: jobId! });
      if (error) throw error;
      return ((data as JobContact[])[0] ?? null) as JobContact | null;
    },
    enabled: !!jobId && enabled,
    // Datos personales: no se guardan en caché más de lo necesario.
    gcTime: 5 * 60_000,
  });
}

export async function acceptApplication(applicationId: string, expectedUpdatedAt: string) {
  const { error } = await supabase.rpc('accept_application', {
    p_application_id: applicationId,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw error;
}

