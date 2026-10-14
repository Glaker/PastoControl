import { Navigate, useParams } from 'react-router';
import { useUserId } from '../auth/AuthProvider';
import { FullPageLoader } from '../components/FullPageLoader';
import { JobUnavailable, LoadFailed } from '../jobs/JobPageParts';
import { useJob } from '../jobs/queries';

/** /trabajo/:id lleva al detalle desde el lado que corresponde (cliente o cortador). Lo usan los avisos. */
export function TrabajoRedirectPage() {
  const { jobId } = useParams();
  const userId = useUserId();
  const job = useJob(jobId);

  if (job.isPending) return <FullPageLoader />;
  if (job.error) return <LoadFailed error={job.error} onRetry={() => void job.refetch()} />;
  if (!job.data) {
    return (
      <JobUnavailable
        title="No encontramos este trabajo"
        message="Puede que el link esté mal o que ya no tengas acceso."
        backTo="/avisos"
        backLabel="Volver a avisos"
      />
    );
  }
  const to = job.data.client_id === userId ? `/pedir/pedido/${job.data.id}` : `/cortar/trabajo/${job.data.id}`;
  return <Navigate to={to} replace />;
}
