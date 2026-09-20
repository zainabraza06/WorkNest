import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { jobsApi } from '@/api';
import { JobForm, initialJobForm } from '@/components/jobs/JobForm';
import { FairPriceHint } from '@/components/pricing/FairPriceHint';
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

  const save = useMutation({
    mutationFn: (body) => (isEdit ? jobsApi.update(id, body) : jobsApi.create(body)),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.setQueryData(['job', job._id], (old) => ({ ...old, ...job }));
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

  const initial = initialJobForm({ job: existing.data, clientProfile, defaults: { category: params.get('category') ?? '' } });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8">
      <h1 className="mb-1 text-2xl font-bold sm:text-3xl">{isEdit ? 'Edit job' : 'Post a job'}</h1>
      <p className="mb-6 text-ink-600">{isEdit ? 'Changes are visible to workers straight away.' : 'Takes about two minutes. Nearby workers will start sending offers.'}</p>
      <JobForm
        initial={initial}
        submitting={save.isPending}
        serverError={save.error}
        submitLabel={isEdit ? 'Save changes' : 'Post job'}
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
