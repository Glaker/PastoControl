import { useQuery } from '@tanstack/react-query';
import { useUserId } from '../auth/AuthProvider';
import dayjs from '../lib/dayjs';
import { pointOf, type LatLng, type LocalityArea } from '../lib/geo';
import { supabase } from '../lib/supabase';

export type JobStatus = 'publicado' | 'asignado' | 'realizado' | 'cancelado';
/** Estado para mostrar: "vencido" no se guarda, se calcula. */
export type JobDisplayStatus = JobStatus | 'vencido';

// La dirección y el pin están en jobs: los recibe todo el que puede ver el pedido (RLS). Apellido y
// WhatsApp no: van por get_job_contact, solo a las partes.
// Hay dos FK a profiles (client_id y cancelled_by): el embed nombra la del cliente.
// applications: por RLS, el dueño recibe las de su pedido y un cortador solo la suya.
// El embed de applications nombra la FK (applications.job_id): job_agreements también une jobs con
// applications y PostgREST lo vería como otra relación posible.
// agreement: el acuerdo (job_agreements). Por RLS solo lo reciben el cliente y el cortador elegido;
// para cualquier otro llega null.
export const JOB_SELECT =
  'id, client_id, locality_id, zone, address_street, address_number, address_between, location_lat, location_lng, ' +
  'price_ars, desired_at, notes, photo_paths, status, republished_from, cancelled_at, cancelled_by, created_at, updated_at, is_expired, ' +
  'agreement:job_agreements!job_agreements_job_id_fkey(application_id, cutter_id, price_ars, agreed_at, assigned_at, done_at, done_by, cancelled_by), ' +
  'locality:localities(name, timezone, center_lat, center_lng, radius_m), client:profiles!jobs_client_id_fkey(id, first_name, last_initial, avatar_path), ' +
  'applications!applications_job_id_fkey(id, status, cutter_id)';

export type Job = {
  id: string;
  client_id: string;
  locality_id: number;
  /** Zona o barrio (opcional). */
  zone: string | null;
  address_street: string;
  /** null solo en los pedidos anteriores al mapa (la dirección entera está en address_street). */
  address_number: string | null;
  address_between: string | null;
  /** Pin del pedido (null solo en los anteriores al mapa). */
  location_lat: number | null;
  location_lng: number | null;
  price_ars: number;
  desired_at: string;
  notes: string | null;
  photo_paths: string[];
  status: JobStatus;
  republished_from: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
  is_expired: boolean | null;
  /** Acuerdo (desde la aceptación; queda como historial si después se cancela). Solo las dos partes. */
  agreement: JobAgreement | null;
  locality: { name: string; timezone: string } & LocalityArea;
  client: { id: string; first_name: string; last_initial: string; avatar_path: string | null };
  applications: { id: string; status: ApplicationStatus; cutter_id: string }[];
};

export type JobAgreement = {
  application_id: string;
  cutter_id: string;
  price_ars: number;
  agreed_at: string;
  assigned_at: string;
  done_at: string | null;
  done_by: string | null;
  /** Quién canceló el trabajo asignado (jobs.cancelled_by no guarda al cortador: lo verían los demás). */
  cancelled_by: string | null;
};

export type ApplicationStatus = 'pendiente' | 'aceptada' | 'rechazada' | 'retirada' | 'cancelada';

export const jobKeys = {
  all: ['jobs'] as const,
  mine: (userId: string) => ['jobs', 'mine', userId] as const,
  available: (userId: string) => ['jobs', 'available', userId] as const,
  detail: (jobId: string) => ['jobs', 'detail', jobId] as const,
};

export function toJob(row: unknown): Job {
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

/** Trabajos que puede tomar el cortador logueado (sin los propios: con los dos roles también los ve). */
export function useAvailableJobs(localityId: number | undefined) {
  const userId = useUserId();
  return useQuery({
    queryKey: [...jobKeys.available(userId), localityId],
    queryFn: async () => {
      // El RLS también devuelve los trabajos en los que me postulé (en cualquier estado): la lista
      // filtra publicados, no vencidos (reloj del servidor) y de mi localidad.
      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_SELECT)
        .eq('status', 'publicado')
        .eq('is_expired', false)
        .eq('locality_id', localityId!)
        .neq('client_id', userId)
        .order('desired_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data.map(toJob);
    },
    enabled: localityId !== undefined,
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

/** Precio y horario que valen: los acordados si el trabajo está asignado o realizado; si no, los publicados. */
export function jobTerms(job: Pick<Job, 'status' | 'price_ars' | 'desired_at' | 'agreement'>) {
  const a = job.agreement;
  const agreed = (job.status === 'asignado' || job.status === 'realizado') && !!a;
  return {
    agreed,
    priceArs: agreed ? a!.price_ars : job.price_ars,
    at: agreed ? a!.agreed_at : job.desired_at,
  };
}

/** Postulaciones pendientes de un pedido (para el dueño). */
export function pendingCount(job: Pick<Job, 'applications'>) {
  return job.applications.filter((a) => a.status === 'pendiente').length;
}

export function jobDisplayStatus(job: Pick<Job, 'status' | 'is_expired' | 'desired_at'>): JobDisplayStatus {
  if (job.status !== 'publicado') return job.status;
  // El servidor lo calcula al leer; si la pantalla quedó abierta, el reloj local lo actualiza.
  return job.is_expired || !dayjs(job.desired_at).isAfter(dayjs()) ? 'vencido' : 'publicado';
}

/** "Mitre 1234" (en los pedidos anteriores al mapa, la dirección tal como se cargó). */
export function jobAddress(job: Pick<Job, 'address_street' | 'address_number'>): string {
  return job.address_number ? `${job.address_street} ${job.address_number}` : job.address_street;
}

/** "Entre Mitre y Belgrano", se haya escrito con "entre" o sin. */
export function jobBetween(job: Pick<Job, 'address_between'>): string | null {
  const text = job.address_between;
  if (!text) return null;
  return /^entre\s/i.test(text) ? `Entre ${text.slice(6)}` : `Entre ${text}`;
}

export function jobPoint(job: Pick<Job, 'location_lat' | 'location_lng'>): LatLng | null {
  return pointOf(job.location_lat, job.location_lng);
}
