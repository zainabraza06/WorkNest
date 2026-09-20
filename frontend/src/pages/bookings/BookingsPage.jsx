import { useState } from 'react';
import { Link } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarCheck, ChevronRight } from 'lucide-react';

import { bookingsApi } from '@/api/negotiation';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { formatDate, formatPKR } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import { BOOKING_STATUS_META } from './bookingMeta';

const TABS = [
  { key: 'upcoming', label: 'Upcoming', status: 'pending_payment,confirmed' },
  { key: 'active', label: 'In progress', status: 'in_progress,disputed' },
  { key: 'past', label: 'Past', status: 'completed,cancelled' },
];

export default function BookingsPage() {
  const me = useAuthStore((s) => s.user);
  const [tab, setTab] = useState('upcoming');
  const [page, setPage] = useState(1);
  const status = TABS.find((t) => t.key === tab).status;

  const query = useQuery({
    queryKey: ['bookings', status, page],
    queryFn: () => bookingsApi.list({ status, page }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:py-8">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary-600 uppercase">Work</p>
      <h1 className="mt-2 text-3xl lg:text-4xl">Bookings</h1>
      <p className="mt-2 mb-6 text-ink-500">Confirmed work, payments held in escrow, and past jobs.</p>

      <div role="tablist" aria-label="Booking status" className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-ink-200 px-4">
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
            className={cn('-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap', tab === t.key ? 'border-primary-500 text-ink-950' : 'border-transparent text-ink-400 hover:text-ink-900')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {query.isPending ? (
          <LoadingRegion label="Loading bookings" className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </LoadingRegion>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : query.data.items.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No bookings here"
            description="Bookings are created when an offer is accepted."
            action={<Button to="/negotiations">Go to offers</Button>}
          />
        ) : (
          <>
            <ul className={cn('flex flex-col gap-3', query.isPlaceholderData && 'opacity-60')}>
              {query.data.items.map((b) => {
                const other = me.role === 'worker' ? b.client : b.worker;
                const meta = BOOKING_STATUS_META[b.status];
                const needsMe = (me.role === 'client' && ['pending_payment', 'in_progress'].includes(b.status)) || (me.role === 'worker' && b.status === 'confirmed');
                return (
                  <li key={b._id}>
                    <Card interactive className="relative flex min-w-0 items-center gap-4 p-4">
                      <Avatar src={other?.avatar?.url} name={other?.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          <Link to={`/bookings/${b._id}`} className="after:absolute after:inset-0">
                            {b.job?.title}
                          </Link>
                        </p>
                        <p className="truncate text-sm text-ink-600">
                          {other?.name} · {formatDate(b.startDate)} – {formatDate(b.endDate)}
                        </p>
                      </div>
                      <div className="hidden text-right sm:block">
                        <p className="font-display font-bold">{formatPKR(b.agreedPrice)}</p>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </div>
                      {needsMe && <span className="size-2.5 rounded-full bg-secondary-500" title="Action needed" />}
                      <ChevronRight className="size-5 text-ink-400" aria-hidden />
                    </Card>
                  </li>
                );
              })}
            </ul>
            <Pagination page={query.data.page} totalPages={query.data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
