import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { jobsApi, workersApi } from '@/api';
import { JobForm, initialJobForm } from '@/components/jobs/JobForm';
import { FairPriceHint } from '@/components/pricing/FairPriceHint';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/States';
import { useAuthStore } from '@/stores/authStore';

export default function JobPostPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clientProfile = useAuthStore((s) => s.profile);

  const existing = useQuery({ queryKey: ['job', id], queryFn: () => jobsApi.get(id), enabled: isEdit });

  // "Hire <name>" arrives here with ?invite=<userId>. The same four steps are collected, but
  // the result is a private request to that one worker rather than an open call for offers.
  const inviteId = isEdit ? null : params.get('invite');
  const invited = useQuery({ queryKey: ['worker', inviteId], queryFn: () => workersApi.get(inviteId), enabled: Boolean(inviteId) });
  const hiring = invited.data ?? null;

  const save = useMutation({
    mutationFn: (body) => (isEdit ? jobsApi.update(id, body) : jobsApi.create(body)),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.setQueryData(['job', job._id], (old) => ({ ...old, ...job }));
      // A direct hire's whole point is the conversation it opens, so land in the thread
      if (job.offer) {
        queryClient.invalidateQueries({ queryKey: ['offers'] });
        navigate(`/negotiations/${job.offer._id}`, { replace: true });
        return;
      }
      navigate(`/jobs/${job._id}${isEdit ? '' : '?posted=1'}`, { replace: true });
    },
  });

  if (isEdit && existing.isPending) {
    return (
      <LoadingRegion className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </LoadingRegion>
    );
  }
  if (isEdit && existing.isError) return <ErrorState error={existing.error} onRetry={existing.refetch} className="py-20" />;
  if (inviteId && invited.isPending) {
    return (
      <LoadingRegion className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </LoadingRegion>
    );
  }
  if (inviteId && invited.isError) return <ErrorState error={invited.error} onRetry={invited.refetch} className="py-20" />;

  const firstName = hiring?.user.name.split(' ')[0];
  const initial = initialJobForm({
    job: existing.data,
    clientProfile,
    defaults: {
      category: params.get('category') ?? hiring?.categories?.[0] ?? '',
      // Their own daily rate is the obvious opening figure
      offerAmount: hiring?.rates?.daily ?? '',
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8">
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">
        {isEdit ? 'Edit job' : hiring ? `Hire ${hiring.user.name}` : 'Post a job'}
      </h1>
      <p className="mb-6 text-ink-600">
        {isEdit
          ? 'Changes are visible to workers straight away.'
          : hiring
            ? `${firstName} receives this as a private request — nobody else can see it or bid on it. They can accept your offer or counter it.`
            : 'Takes about two minutes. Nearby workers will start sending offers.'}
      </p>

      {hiring && (
        <Card className="mb-5 flex items-center gap-3 p-4">
          <Avatar src={hiring.user.avatar?.url} name={hiring.user.name} size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold">{hiring.user.name}</p>
            <p className="truncate text-sm text-ink-600">{hiring.headline}</p>
          </div>
        </Card>
      )}

      <JobForm
        hiring={hiring}
        initial={initial}
        submitting={save.isPending}
        serverError={save.error}
        submitLabel={isEdit ? 'Save changes' : hiring ? `Send request to ${firstName}` : 'Post job'}
        renderBudgetAside={(form, applyRange) => (
          <FairPriceHint
            category={form.category}
            city={form.place.city}
            durationType={form.durationType}
            durationCount={Number(form.durationCount) || 1}
            urgency={form.urgency}
            onApply={(min, max) => applyRange(min, max)}
          />
        )}
        onSubmit={(body, { onFieldError }) =>
          save.mutate(body, { onError: (err) => err.details?.length && onFieldError(err.fieldErrors) })
        }
      />
    </div>
  );
}
