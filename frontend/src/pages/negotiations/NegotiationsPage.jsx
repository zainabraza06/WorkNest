import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';

import { offersApi } from '@/api/negotiation';
import { ThreadView } from '@/components/negotiation/ThreadView';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { formatPKR, timeAgo } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';

const STATUS_DOT = { pending: 'bg-secondary-500', accepted: 'bg-success-600', rejected: 'bg-danger-600', withdrawn: 'bg-ink-300', closed: 'bg-ink-300' };

function ThreadList({ activeId, jobFilter }) {
  const me = useAuthStore((s) => s.user);
  const query = useQuery({ queryKey: ['offers', { job: jobFilter }], queryFn: () => offersApi.list({ job: jobFilter, limit: 50 }) });

  if (query.isPending) {
    return (
      <LoadingRegion label="Loading conversations" className="flex flex-col gap-1 p-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-3 p-2">
            <Skeleton className="size-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </LoadingRegion>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const items = query.data.items;
  if (!items.length) {
    return (
      <EmptyState
        icon={MessagesSquare}
        title="No negotiations yet"
        description={me.role === 'worker' ? 'Send an offer on a job to start negotiating with a client.' : 'When workers send offers on your jobs, they appear here.'}
        action={me.role === 'worker' ? <Button to="/jobs">Find jobs</Button> : <Button to="/jobs/new">Post a job</Button>}
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-100">
      {items.map((o) => {
        const other = me.role === 'worker' ? o.client : o.worker;
        const current = o.rounds.at(-1);
        const myTurn = o.status === 'pending' && o.awaitingRole === me.role;
        return (
          <li key={o._id}>
            <Link
              to={`/negotiations/${o._id}${jobFilter ? `?job=${jobFilter}` : ''}`}
              aria-current={activeId === o._id ? 'page' : undefined}
              className={cn('flex gap-3 px-3 py-3 transition-colors hover:bg-ink-100', activeId === o._id && 'bg-ink-50 hover:bg-ink-50')}
            >
              <div className="relative">
                <Avatar src={other.avatar?.url} name={other.name} />
                <span className={cn('absolute right-0 bottom-0 size-3 rounded-full border-2 border-white', STATUS_DOT[o.status])} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn('truncate text-sm', o.unreadCount ? 'font-bold text-ink-900' : 'font-semibold text-ink-800')}>{other.name}</p>
                  <span className="shrink-0 text-[11px] text-ink-400">{timeAgo(o.lastActivityAt)}</span>
                </div>
                <p className="truncate text-xs text-ink-500">{o.job.title}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink-900">{formatPKR(current.amount)}</p>
                  {o.unreadCount > 0 ? (
                    <span className="rounded-full bg-primary-700 px-2 py-0.5 text-[11px] font-bold text-white">
                      {o.unreadCount}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : (
                    myTurn && <span className="text-[11px] font-semibold text-secondary-700">Your turn</span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function NegotiationsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const jobFilter = params.get('job') ?? undefined;

  return (
    <div className="mx-auto flex h-[calc(100dvh-4rem-4rem)] max-w-6xl md:h-[calc(100dvh-4rem)] md:px-4 md:py-6">
      <div className="flex min-h-0 flex-1 overflow-hidden border-ink-200 bg-white md:rounded-lg md:border md:shadow-card">
        <aside aria-label="Conversations" className={cn('flex w-full min-h-0 flex-col border-r border-ink-200 md:w-80', id && 'hidden md:flex')}>
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <h1 className="text-lg font-bold">Offers & chats</h1>
            {jobFilter && (
              <Link to="/negotiations" className="text-xs font-semibold text-ink-950 underline decoration-primary-500 decoration-2 underline-offset-4 hover:decoration-ink-950">
                Show all
              </Link>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ThreadList activeId={id} jobFilter={jobFilter} />
          </div>
        </aside>

        <section aria-label="Conversation" className={cn('min-h-0 flex-1 flex-col bg-ink-50', id ? 'flex' : 'hidden md:flex')}>
          {id ? (
            <ThreadView key={id} offerId={id} onBack={() => navigate(`/negotiations${jobFilter ? `?job=${jobFilter}` : ''}`)} />
          ) : (
            <EmptyState icon={MessagesSquare} title="Select a conversation" description="Pick a negotiation on the left to see offers and messages." className="m-auto" />
          )}
        </section>
      </div>
    </div>
  );
}
