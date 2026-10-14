import { useQuery } from '@tanstack/react-query';
import dayjs from '../lib/dayjs';
import { supabase } from '../lib/supabase';

export type ProfileStats = {
  done_as_cutter: number;
  done_as_client: number;
  /** % de "sí" redondeado a la decena; null si todavía no hay 5 calificaciones (de semanas cerradas). */
  yes_pct: number | null;
};

export const completionKeys = {
  hasRated: (jobId: string) => ['jobs', 'has-rated', jobId] as const,
  stats: (userId: string) => ['profile-stats', userId] as const,
};

/** Si el usuario ya calificó el trabajo (no devuelve qué puso). */
export function useHasRated(jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: completionKeys.hasRated(jobId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('has_rated_job', { p_job_id: jobId });
      if (error) throw error;
      return data as boolean;
    },
    enabled,
  });
}

/** Estadísticas públicas de un perfil (trabajos realizados y % de "sí"). */
export function useProfileStats(userId: string | undefined) {
  return useQuery({
    queryKey: completionKeys.stats(userId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profile_stats', { p_user_id: userId! });
      if (error) throw error;
      return ((data as ProfileStats[])[0] ?? { done_as_cutter: 0, done_as_client: 0, yes_pct: null }) as ProfileStats;
    },
    enabled: !!userId,
    staleTime: 10 * 60_000,
  });
}

export async function markJobDone(jobId: string) {
  const { error } = await supabase.rpc('mark_job_done', { p_job_id: jobId });
  if (error) throw error;
}

export async function rateJob(jobId: string, wouldWorkAgain: boolean) {
  const { error } = await supabase.rpc('rate_job', { p_job_id: jobId, p_would_work_again: wouldWorkAgain });
  if (error) throw error;
}

/** "Marcar realizado" se habilita desde el día acordado (en la zona de la localidad), como en la RPC. */
export function canMarkDone(agreedAt: string, timeZone: string) {
  const today = dayjs().tz(timeZone).format('YYYY-MM-DD');
  const agreedDay = dayjs(agreedAt).tz(timeZone).format('YYYY-MM-DD');
  return today >= agreedDay;
}
