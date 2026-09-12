import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';

import { jobsApi } from '@/api';
import { JobCard, JobCardSkeleton } from '@/components/jobs/JobCard';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingRegion } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/authStore';

const TABS = [
  { key: 'open', label: 'Open', status: 'posted,negotiating' },
  { key: 'active', label: 'Active', status: 'confirmed,in_progress' },
  { key: 'done', label: 'Completed', status: 'completed,reviewed' },
  { key: 'cancelled', label: 'Cancelled', status: 'cancelled' },
  { key: 'all', label: 'All', status: undefined },
];

export default function ClientDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState('open');
  const [page, setPage] = useState(1);
  const status = TABS.find((t) => t.key === tab).status;

  const query = useQuery({
    queryKey: ['jobs', 'mine', status, page],
    queryFn: () => jobsApi.mine({ status, page }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Hi, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-ink-600">Manage your jobs and the workers you've hired.</p>
        </div>
        <Button to="/jobs/new" size="lg">
          <Plus className="size-4" aria-hidden /> Post a job
        </Button>
      </div>

      <div role="tablist" aria-label="Job status" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-ink-200 px-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
              tab === t.key ? 'border-primary-700 text-primary-800' : 'border-transparent text-ink-500 hover:text-ink-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {query.isPending ? (
          <LoadingRegion label="Loading your jobs" className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <JobCardSkeleton key={i} />
            ))}
          </LoadingRegion>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={tab === 'open' ? 'No open jobs' : 'Nothing here yet'}
            description={tab === 'open' ? 'Post a job and nearby workers will start sending you offers.' : 'Jobs will appear here as they move through each stage.'}
            action={tab === 'open' && <Button to="/jobs/new">Post your first job</Button>}
          />
        ) : (
          <>
            <ul className={`grid gap-4 md:grid-cols-2 ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
              {query.data.items.map((job) => (
                <li key={job._id} className="flex [&>*]:flex-1">
                  <JobCard job={job} showStatus />
                </li>
              ))}
            </ul>
            <Pagination page={query.data.page} totalPages={query.data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
