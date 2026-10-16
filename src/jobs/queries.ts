import { useQuery } from '@tanstack/react-query';
import { useUserId } from '../auth/AuthProvider';
import dayjs from '../lib/dayjs';
import { pointOf, type LatLng, type MapCenter } from '../lib/geo';
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
// Si alguien borró su cuenta (Fase 8), su id queda en null (client y client_id, agreement.cutter_id,
// applications.cutter_id) y el pedido, sin dirección ni pin: la app muestra «Usuario eliminado».
export const JOB_SELECT =
  'id, client_id, locality_id, zone, address_street, address_number, address_between, location_lat, location_lng, ' +
  'price_ars, desired_at, notes, photo_paths, status, republished_from, cancelled_at, cancelled_by, created_at, updated_at, is_expired, ' +
  'agreement:job_agreements!job_agreements_job_id_fkey(application_id, cutter_id, price_ars, agreed_at, assigned_at, done_at, done_by, cancelled_by), ' +
  'locality:localities(timezone, center_lat, center_lng), client:profiles!jobs_client_id_fkey(id, first_name, last_initial, avatar_path), ' +
  'applications!applications_job_id_fkey(id, status, cutter_id)';

export type Job = {
  id: string;
  /** null: el cliente borró su cuenta. */
  client_id: string | null;
  locality_id: number;
  /** Zona o barrio (opcional). */
  zone: string | null;
  /** null solo si el cliente borró su cuenta (el pedido queda sin sus datos). */
  address_street: string | null;
  /** null en los pedidos anteriores al mapa (la dirección entera está en address_street). */
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
  /** Solo la zona horaria y el centro del mapa (la localidad ya no filtra nada). */
  locality: { timezone: string } & MapCenter;
  client: JobClient | null;
  applications: { id: string; status: ApplicationStatus; cutter_id: string | null }[];
};

export type JobClient = { id: string; first_name: string; last_initial: string; avatar_path: string | null };

export type JobAgreement = {
  application_id: string;
  /** null: el cortador borró su cuenta. */
  cutter_id: string | null;
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
  available: (userId: string, origin: LatLng | null, radiusKm: number) =>
    ['jobs', 'available', userId, origin?.lat, origin?.lng, radiusKm] as const,
  detail: (jobId: string) => ['jobs', 'detail', jobId] as const,
};

export function toJob(row: unknown): Job {
  const job = row as Job;
  if (!job.locality) throw new Error('Pedido incompleto');
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

export type AvailableJob = { job: Job; distanceM: number };

/**
 * Trabajos que puede tomar el cortador logueado, a menos de radiusKm del origen (su ubicación actual o su
 * casa), del más cercano al más lejano. El filtro y el orden los hace el servidor (get_available_jobs);
 * después se traen los pedidos con el select de siempre y se respeta ese orden.
 */
export function useAvailableJobs(origin: LatLng | null, radiusKm: number) {
  const userId = useUserId();
  return useQuery({
    queryKey: jobKeys.available(userId, origin, radiusKm),
    queryFn: async (): Promise<AvailableJob[]> => {
      const { data: near, error } = await supabase.rpc('get_available_jobs', {
        p_lat: origin!.lat,
        p_lng: origin!.lng,
        p_radius_km: radiusKm,
      });
      if (error) throw error;
      if (near.length === 0) return [];
      const { data, error: jobsError } = await supabase
        .from('jobs')
        .select(JOB_SELECT)
        .in('id', near.map((n) => n.job_id));
      if (jobsError) throw jobsError;
      const byId = new Map(data.map((row) => [(row as unknown as Job).id, toJob(row)]));
      // Puede faltar alguno si venció o se canceló entre los dos pedidos.
      return near.flatMap((n) => {
        const job = byId.get(n.job_id);
        return job ? [{ job, distanceM: n.distance_m }] : [];
      });
    },
    enabled: !!origin,
    placeholderData: (previous) => previous,
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
  if (!job.address_street) return 'Dirección borrada';
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
