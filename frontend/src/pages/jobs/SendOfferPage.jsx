import { Navigate, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { jobsApi } from '@/api';
import { offersApi } from '@/api/negotiation';
import { OfferForm } from '@/components/negotiation/OfferForm';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { formatBudget, formatDate, formatDuration } from '@/lib/format';

export default function SendOfferPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const job = useQuery({ queryKey: ['job', id], queryFn: () => jobsApi.get(id) });

  const create = useMutation({
    mutationFn: (body) => offersApi.create(id, body),
    onSuccess: (offer) => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      navigate(`/negotiations/${offer._id}`, { replace: true });
    },
  });

  if (job.isPending) {
    return (
      <LoadingRegion className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </LoadingRegion>
    );
  }
  if (job.isError) return <ErrorState error={job.error} onRetry={job.refetch} className="py-20" />;

  const j = job.data;
  if (j.myOffer) return <Navigate to={`/negotiations/${j.myOffer._id}`} replace />;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 md:py-8">
      <h1 className="text-2xl font-bold sm:text-3xl">Send an offer</h1>

      <Card>
        <CardBody>
          <p className="font-semibold">{j.title}</p>
          <p className="mt-1 text-sm text-ink-600">
            Budget {formatBudget(j.budget)} · {formatDuration(j.durationType, j.durationCount)} · starts {formatDate(j.startDate)} · {j.city}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Your offer" description="The client can accept, decline or send a counter-offer." />
        <CardBody>
          <OfferForm
            mode="create"
            durationType={j.durationType}
            initial={{ amount: j.budget.max, durationCount: j.durationCount, startDate: j.startDate }}
            onSubmit={(body) => create.mutate(body)}
            submitting={create.isPending}
            error={create.error}
            onCancel={() => navigate(-1)}
          />
        </CardBody>
      </Card>
    </div>
  );
}
