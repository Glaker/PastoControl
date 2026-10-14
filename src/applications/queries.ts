import { useQuery } from '@tanstack/react-query';
import { useUserId } from '../auth/AuthProvider';
import { JOB_SELECT, toJob, type ApplicationStatus, type Job } from '../jobs/queries';
import { supabase } from '../lib/supabase';

export type Application = {
  id: string;
  job_id: string;
  cutter_id: string;
  status: ApplicationStatus;
  /** null = acepta el precio publicado. */
  proposed_price_ars: number | null;
  /** null = acepta el horario publicado. */
  proposed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MyApplication = Application & { job: Job };

const APPLICATION_SELECT = 'id, job_id, cutter_id, status, proposed_price_ars, proposed_at, created_at, updated_at';

export const applicationKeys = {
  all: ['applications'] as const,
  mine: (userId: string) => ['applications', 'mine', userId] as const,
  forJob: (userId: string, jobId: string) => ['applications', 'job', userId, jobId] as const,
};

/** Postulaciones del cortador logueado, con su trabajo (el RLS de jobs deja ver los trabajos en los que se postuló). */
export function useMyApplications() {
  const userId = useUserId();
  return useQuery({
    queryKey: applicationKeys.mine(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(`${APPLICATION_SELECT}, job:jobs(${JOB_SELECT})`)
        .eq('cutter_id', userId)
        .order('updated_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data.flatMap((row) => {
        const { job, ...app } = row as unknown as Application & { job: unknown };
        return job ? [{ ...app, job: toJob(job) }] : [];
      });
    },
  });
}

/** La postulación del cortador logueado a un trabajo. null = no se postuló. */
export function useMyApplicationForJob(jobId: string | undefined) {
  const userId = useUserId();
  return useQuery({
    queryKey: applicationKeys.forJob(userId, jobId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('applications')
        .select(APPLICATION_SELECT)
        .eq('job_id', jobId!)
        .eq('cutter_id', userId)
        .maybeSingle();
      if (error) throw error;
      return (data as Application | null) ?? null;
    },
    enabled: !!jobId,
  });
}

export type Proposal = { priceArs: number | null; at: string | null };

export async function applyToJob(jobId: string, proposal: Proposal) {
  const { error } = await supabase.rpc('apply_to_job', {
    p_job_id: jobId,
    p_proposed_price_ars: proposal.priceArs ?? undefined,
    p_proposed_at: proposal.at ?? undefined,
  });
  if (error) throw error;
}

export async function updateApplication(applicationId: string, proposal: Proposal) {
  const { error } = await supabase.rpc('update_application', {
    p_application_id: applicationId,
    p_proposed_price_ars: proposal.priceArs ?? undefined,
    p_proposed_at: proposal.at ?? undefined,
  });
  if (error) throw error;
}

export async function withdrawApplication(applicationId: string) {
  const { error } = await supabase.rpc('withdraw_application', { p_application_id: applicationId });
  if (error) throw error;
}
