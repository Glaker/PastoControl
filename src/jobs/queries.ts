import { useQuery } from '@tanstack/react-query';
import { useUserId } from '../auth/AuthProvider';
import dayjs from '../lib/dayjs';
import { supabase } from '../lib/supabase';

export type JobStatus = 'publicado' | 'asignado' | 'realizado' | 'cancelado';
/** Estado para mostrar: "vencido" no se guarda, se calcula. */
export type JobDisplayStatus = JobStatus | 'vencido';

// Nunca incluye job_private: la dirección se pide aparte y solo la recibe el dueño (RLS).
// Hay dos FK a profiles (client_id y cancelled_by): el embed nombra la del cliente.
const JOB_SELECT =
  'id, client_id, locality_id, zone, price_ars, desired_at, notes, photo_paths, status, republished_from, cancelled_at, created_at, updated_at, is_expired, ' +
  'locality:localities(name, timezone), client:profiles!jobs_client_id_fkey(id, first_name, last_initial, avatar_path)';

export type Job = {
  id: string;
  client_id: string;
  locality_id: number;
  zone: string;
  price_ars: number;
  desired_at: string;
  notes: string | null;
  photo_paths: string[];
  status: JobStatus;
  republished_from: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  is_expired: boolean | null;
  locality: { name: string; timezone: string };
  client: { id: string; first_name: string; last_initial: string; avatar_path: string | null };
};

export const jobKeys = {
  all: ['jobs'] as const,
  mine: (userId: string) => ['jobs', 'mine', userId] as const,
  available: (userId: string) => ['jobs', 'available', userId] as const,
  detail: (jobId: string) => ['jobs', 'detail', jobId] as const,
  address: (jobId: string) => ['jobs', 'address', jobId] as const,
};

function toJob(row: unknown): Job {
  const job = row as Job;
  if (!job.locality || !job.client) throw new Error('Pedido incompleto');
  return job;
}

/** Pedidos del cliente logueado, todos los estados. */
export function useMyJobs() {
  const userId = useUserId();
  return useQuery({
    queryKey: jobKeys.mine(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_SELECT)
        .eq('client_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data.map(toJob);
    },
  });
}

/**
 * Trabajos que puede tomar el cortador logueado. El RLS ya deja solo los publicados, no vencidos
 * y de su localidad; acá se sacan los propios (con los dos roles, el dueño también ve los suyos).
 */
export function useAvailableJobs() {
  const userId = useUserId();
  return useQuery({
    queryKey: jobKeys.available(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_SELECT)
        .eq('status', 'publicado')
        .neq('client_id', userId)
        .order('desired_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data.map(toJob);
    },
  });
}

/** Un trabajo. null = no existe o el usuario no lo puede ver (RLS). */
export function useJob(jobId: string | undefined) {
  return useQuery({
    queryKey: jobKeys.detail(jobId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.from('jobs').select(JOB_SELECT).eq('id', jobId!).maybeSingle();
      if (error) throw error;
      return data ? toJob(data) : null;
    },
    enabled: !!jobId,
  });
}

/** Dirección de un pedido propio. El RLS de job_private no la devuelve a nadie más. */
export function useJobAddress(jobId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: jobKeys.address(jobId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.from('job_private').select('address').eq('job_id', jobId!).maybeSingle();
      if (error) throw error;
      return data?.address ?? null;
    },
    enabled: !!jobId && enabled,
  });
}

const SIGNED_URL_SECONDS = 60 * 60;

/** URLs firmadas de fotos de trabajos (el bucket es privado), en un solo pedido. */
export function useJobPhotoUrls(paths: string[]) {
  const sorted = [...new Set(paths)].sort();
  return useQuery({
    queryKey: ['job-photo-urls', sorted],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('job-photos').createSignedUrls(sorted, SIGNED_URL_SECONDS);
      if (error) throw error;
      const urls: Record<string, string> = {};
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
      }
      return urls;
    },
    enabled: sorted.length > 0,
    staleTime: (SIGNED_URL_SECONDS - 10 * 60) * 1000,
    gcTime: (SIGNED_URL_SECONDS - 5 * 60) * 1000,
  });
}

export function jobDisplayStatus(job: Pick<Job, 'status' | 'is_expired' | 'desired_at'>): JobDisplayStatus {
  if (job.status !== 'publicado') return job.status;
  // El servidor lo calcula al leer; si la pantalla quedó abierta, el reloj local lo actualiza.
  return job.is_expired || !dayjs(job.desired_at).isAfter(dayjs()) ? 'vencido' : 'publicado';
}
