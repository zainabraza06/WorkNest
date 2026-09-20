import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, FileQuestion, MapPin, Pencil, Wallet, XCircle, Zap } from 'lucide-react';

import { jobsApi } from '@/api';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineAlert } from '@/components/ui/States';
import { CATEGORY_MAP, JOB_STATUS_META, URGENCY } from '@/lib/constants';
import { formatBudget, formatDate, formatDuration, timeAgo } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';

function CancelJobButton({ job }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => jobsApi.cancel(job._id, reason || undefined),
    onSuccess: (updated) => {
      queryClient.setQueryData(['job', job._id], (old) => ({ ...old, ...updated, client: old.client }));
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setOpen(false);
    },
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="text-danger-700">
        <XCircle className="size-4" aria-hidden /> Cancel job
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cancel this job?"
        description="Workers who sent offers will be notified that the job is closed."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep job
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Cancel job
            </Button>
          </>
        }
      >
        {cancel.error && <InlineAlert className="mb-3">{cancel.error.message}</InlineAlert>}
        <Textarea label="Reason (optional)" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}

export default function JobDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const viewer = useAuthStore((s) => s.user);
  const { data: job, isPending, isError, error, refetch } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id),
    retry: (count, err) => err.status !== 404 && count < 1,
  });

  if (isPending) {
    return (
      <LoadingRegion label="Loading job" className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </LoadingRegion>
    );
  }
  if (isError) {
    return error.status === 404 ? (
      <EmptyState icon={FileQuestion} title="Job not found" description="This job may have been removed." action={<Button to="/jobs">Browse jobs</Button>} className="py-20" />
    ) : (
      <ErrorState error={error} onRetry={refetch} className="py-20" />
    );
  }

  const cat = CATEGORY_MAP[job.category];
  const status = JOB_STATUS_META[job.status];
  const isOwner = viewer?._id === job.client._id;
  const isOpen = ['posted', 'negotiating'].includes(job.status);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      {params.get('posted') && (
        <InlineAlert tone="success" className="mb-5">
          Your job is live! Nearby workers can now see it and send offers. You can also{' '}
          <Link to={`/workers?category=${job.category}&city=${job.city}`} className="font-semibold underline">
            browse matching workers
          </Link>
          .
        </InlineAlert>
      )}

      <div className="grid gap-5 md:grid-cols-[1fr_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              {job.urgency === 'urgent' && (
                <Badge tone="danger">
                  <Zap className="size-3" aria-hidden /> Urgent
                </Badge>
              )}
              <span className="text-sm text-ink-500">
                {cat?.label} · posted {timeAgo(job.createdAt)}
              </span>
            </div>
            <h1 className="text-3xl break-words">{job.title}</h1>
          </div>

          <Card>
            <CardBody>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { icon: Wallet, label: 'Budget', value: formatBudget(job.budget) },
                  { icon: Clock, label: 'Duration', value: formatDuration(job.durationType, job.durationCount) },
                  { icon: CalendarDays, label: 'Starts', value: formatDate(job.startDate) },
                  { icon: MapPin, label: 'Location', value: job.address ? `${job.address}, ${job.city}` : job.city },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label}>
                    <dt className="flex items-center gap-1 text-xs text-ink-500">
                      <Icon className="size-3.5" aria-hidden /> {label}
                    </dt>
                    <dd className="mt-0.5 font-semibold break-words text-ink-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Job description" />
            <CardBody>
              <p className="whitespace-pre-line text-ink-700">{job.description}</p>
              {job.skills?.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {job.skills.map((s) => (
                    <Badge key={s} className="capitalize">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="mt-4 text-sm text-ink-600">Timing: {URGENCY.find((u) => u.value === job.urgency)?.label}</p>
            </CardBody>
          </Card>
        </div>

        <aside className="flex flex-col gap-5">
          <Card>
            <CardBody className="flex flex-col gap-3">
              {isOwner ? (
                <>
                  <p className="text-sm text-ink-600">
                    <span className="numeric font-display text-2xl font-extrabold text-ink-950">{job.offersCount}</span> offer{job.offersCount === 1 ? '' : 's'} received
                  </p>
                  {isOpen && (
                    <>
                      <Button to={`/negotiations?job=${job._id}`}>View offers</Button>
                      <Button variant="outline" to={`/jobs/${job._id}/edit`}>
                        <Pencil className="size-4" aria-hidden /> Edit job
                      </Button>
                    </>
                  )}
                  {['posted', 'negotiating'].includes(job.status) && <CancelJobButton job={job} />}
                </>
              ) : viewer?.role === 'worker' ? (
                job.myOffer ? (
                  <>
                    <p className="text-sm text-ink-600">You've already sent an offer on this job.</p>
                    <Button to={`/negotiations/${job.myOffer._id}`}>Open negotiation</Button>
                  </>
                ) : isOpen ? (
                  <Button size="lg" to={`/jobs/${job._id}/offer`}>
                    Send an offer
                  </Button>
                ) : (
                  <p className="text-sm text-ink-600">This job is no longer accepting offers.</p>
                )
              ) : !viewer ? (
                <Button size="lg" to={`/login?redirect=/jobs/${job._id}`}>
                  Sign in to send an offer
                </Button>
              ) : (
                <p className="text-sm text-ink-600">Only workers can send offers on jobs.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Posted by" />
            <CardBody className="flex items-center gap-3">
              <Avatar src={job.client.avatar?.url} name={job.client.name} />
              <div>
                <p className="font-semibold">{job.client.name}</p>
                <p className="text-xs text-ink-500">Member since {formatDate(job.client.createdAt)}</p>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
