import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Banknote, Gavel, Inbox, ShieldCheck } from 'lucide-react';

import { adminApi, earningsApi } from '@/api';
import { toast } from '@/components/feedback/toastStore';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader, SectionLabel } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineAlert } from '@/components/ui/States';
import { CATEGORY_MAP } from '@/lib/constants';
import { formatDate, formatPKR, timeAgo } from '@/lib/format';

const TABS = [
  { id: 'verifications', label: 'ID verification', icon: ShieldCheck },
  { id: 'disputes', label: 'Disputes', icon: Gavel },
  { id: 'withdrawals', label: 'Withdrawals', icon: Banknote },
];

function Stat({ label, value, hint }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className="numeric mt-1 font-display text-2xl font-extrabold text-ink-950">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

function Overview() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: adminApi.overview,
  });

  if (isError) return <ErrorState error={error} onRetry={refetch} />;
  if (isPending) {
    return (
      <LoadingRegion label="Loading platform summary" className="grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bg-white px-5 py-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-12" />
          </div>
        ))}
      </LoadingRegion>
    );
  }

  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-ink-200 bg-ink-200 sm:grid-cols-2 lg:grid-cols-4">
      <div className="bg-white"><Stat label="Workers" value={data.users.workers} hint={`${data.verification.verified} ID verified`} /></div>
      <div className="bg-white"><Stat label="Clients" value={data.users.clients} /></div>
      <div className="bg-white"><Stat label="Jobs" value={data.jobs.total} hint={`${data.jobs.open} open`} /></div>
      <div className="bg-white"><Stat label="Bookings" value={data.bookings.total} hint={`${data.bookings.active} active`} /></div>
      <div className="bg-white"><Stat label="Held in escrow" value={formatPKR(data.escrow.held)} hint={`across ${data.escrow.count} bookings`} /></div>
      <div className="bg-white"><Stat label="Reviews" value={data.reviews} /></div>
      <div className="bg-white"><Stat label="Awaiting ID review" value={data.verification.pending} /></div>
      <div className="bg-white"><Stat label="Open disputes" value={data.bookings.disputed} /></div>
    </div>
  );
}

/** The CNIC is fetched only when an admin opens it, and never lands in a list response. */
function DocumentModal({ worker, onClose, onDecide, deciding }) {
  const [imageFailed, setImageFailed] = useState(false);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'id-document', worker?.user._id],
    queryFn: () => adminApi.idDocument(worker.user._id),
    enabled: Boolean(worker),
  });

  return (
    <Modal
      open={Boolean(worker)}
      onClose={onClose}
      title={worker ? `ID document — ${worker.user.name}` : ''}
      description="Check that the name matches the account and the document is legible before approving."
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => onDecide('rejected')} loading={deciding === 'rejected'}>
            Reject
          </Button>
          <Button onClick={() => onDecide('verified')} loading={deciding === 'verified'}>
            Approve
          </Button>
        </div>
      }
    >
      {isPending && <Skeleton className="h-72 w-full" />}
      {isError && <InlineAlert tone="danger">{error?.message ?? 'Could not load the document.'}</InlineAlert>}
      {imageFailed && (
        <InlineAlert tone="warning">
          The document could not be displayed. Do not approve an identity you have not seen — ask the
          worker to submit it again.
        </InlineAlert>
      )}
      {data?.url && !imageFailed && (
        <img
          src={data.url}
          alt={`ID document submitted by ${worker.user.name}`}
          onError={() => setImageFailed(true)}
          className="max-h-[60vh] w-full rounded-md border border-ink-200 object-contain"
        />
      )}
    </Modal>
  );
}

function VerificationQueue() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [deciding, setDeciding] = useState(null);

  const query = useQuery({
    queryKey: ['admin', 'verifications', page],
    queryFn: () => adminApi.verifications({ page, limit: 10 }),
  });

  const decide = useMutation({
    mutationFn: ({ userId, status }) => adminApi.decideId(userId, status),
    onMutate: ({ status }) => setDeciding(status),
    onSettled: () => setDeciding(null),
    onSuccess: (_res, { status, name }) => {
      toast({
        title: status === 'verified' ? `${name} is now verified` : `${name}'s document was rejected`,
        description: 'Their Trust Score has been rescored.',
        tone: status === 'verified' ? 'success' : 'info',
      });
      setOpen(null);
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => toast({ title: 'Could not save that decision', description: err.message, tone: 'danger' }),
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (query.isPending) {
    return (
      <LoadingRegion label="Loading verification queue" className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </LoadingRegion>
    );
  }

  if (!query.data.items.length) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing waiting for review"
        description="Workers who submit an ID document appear here until you approve or reject it."
      />
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {query.data.items.map((w) => (
          <li key={w._id}>
            <Card className="flex flex-wrap items-center gap-4 p-4">
              <Avatar src={w.user.avatar?.url} name={w.user.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{w.user.name}</p>
                <p className="truncate text-sm text-ink-600">{w.headline}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {w.city} · {w.categories?.map((c) => CATEGORY_MAP[c] ?? c).join(', ')} ·{' '}
                  {w.stats?.completedJobs ?? 0} jobs completed · submitted {w.submittedAt ? timeAgo(w.submittedAt) : 'recently'}
                </p>
              </div>
              {!w.hasDocument && <Badge tone="warning">No document</Badge>}
              <Button size="sm" disabled={!w.hasDocument} onClick={() => setOpen(w)}>
                Review document
              </Button>
            </Card>
          </li>
        ))}
      </ul>

      {query.data.totalPages > 1 && (
        <div className="mt-6">
          <Pagination page={query.data.page} totalPages={query.data.totalPages} onChange={setPage} />
        </div>
      )}

      <DocumentModal
        worker={open}
        deciding={deciding}
        onClose={() => setOpen(null)}
        onDecide={(status) => decide.mutate({ userId: open.user._id, status, name: open.user.name })}
      />
    </>
  );
}

function DisputeQueue() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState(null);

  const query = useQuery({
    queryKey: ['admin', 'disputes', page],
    queryFn: () => adminApi.disputes({ page, limit: 10 }),
  });

  const resolve = useMutation({
    mutationFn: ({ id, outcome }) => adminApi.resolveDispute(id, outcome),
    onMutate: ({ id, outcome }) => setResolving(`${id}:${outcome}`),
    onSettled: () => setResolving(null),
    onSuccess: (_res, { outcome }) => {
      toast({
        title: outcome === 'release' ? 'Payment released to the worker' : 'Payment refunded to the client',
        tone: 'success',
      });
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => toast({ title: 'Could not resolve the dispute', description: err.message, tone: 'danger' }),
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (query.isPending) {
    return (
      <LoadingRegion label="Loading disputes" className="space-y-3">
        {Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </LoadingRegion>
    );
  }

  if (!query.data.items.length) {
    return (
      <EmptyState
        icon={BadgeCheck}
        title="No open disputes"
        description="When a client or worker disputes a booking, it lands here with the escrow amount attached."
      />
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {query.data.items.map((d) => (
          <li key={d._id}>
            <Card>
              <CardHeader
                title={d.job?.title ?? 'Booking'}
                description={`${d.client.name} vs ${d.worker.name} · disputed ${timeAgo(d.disputedAt)}`}
                action={<Badge tone="danger">Disputed</Badge>}
              />
              <CardBody className="space-y-4">
                {d.reason && <p className="text-sm text-ink-700">“{d.reason}”</p>}

                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-ink-500">Agreed price</dt><dd className="numeric font-bold">{formatPKR(d.agreedPrice)}</dd></div>
                  <div><dt className="text-xs text-ink-500">In escrow</dt><dd className="numeric font-bold">{d.payment ? formatPKR(d.payment.amount) : '—'}</dd></div>
                  <div><dt className="text-xs text-ink-500">Started</dt><dd>{formatDate(d.startDate)}</dd></div>
                  <div><dt className="text-xs text-ink-500">Payment</dt><dd className="capitalize">{d.payment?.status ?? 'none'}</dd></div>
                </dl>

                <InlineAlert tone="warning">
                  Releasing pays the worker and marks the booking completed. Refunding cancels the payment and
                  returns the money to the client. Neither can be undone from here.
                </InlineAlert>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={resolving === `${d._id}:refund`}
                    onClick={() => resolve.mutate({ id: d._id, outcome: 'refund' })}
                  >
                    Refund the client
                  </Button>
                  <Button
                    size="sm"
                    loading={resolving === `${d._id}:release`}
                    onClick={() => resolve.mutate({ id: d._id, outcome: 'release' })}
                  >
                    Release to the worker
                  </Button>
                </div>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      {query.data.totalPages > 1 && (
        <div className="mt-6">
          <Pagination page={query.data.page} totalPages={query.data.totalPages} onChange={setPage} />
        </div>
      )}
    </>
  );
}

/**
 * Workers asking for money they have earned.
 *
 * Escrow captures into the platform's own Stripe account and Stripe Connect is not available
 * for Pakistan, so the last leg is a real bank transfer made outside this app. Marking one paid
 * records that it happened, and the reference is what makes the claim checkable later.
 */
function WithdrawalQueue() {
  const qc = useQueryClient();
  const [settling, setSettling] = useState(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const query = useQuery({
    queryKey: ['admin', 'withdrawals'],
    queryFn: () => earningsApi.list({ status: 'requested', page: 1, limit: 20 }),
  });

  const settle = useMutation({
    mutationFn: ({ id, paid }) => earningsApi.settle(id, paid, { reference, note }),
    onSuccess: (_res, { paid }) => {
      toast({
        title: paid ? 'Marked as paid' : 'Request rejected',
        description: paid ? 'The worker has been notified.' : 'The amount is back in their balance.',
        tone: paid ? 'success' : 'info',
      });
      setSettling(null);
      setReference('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => toast({ title: 'Could not settle that request', description: err.message, tone: 'danger' }),
  });

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (query.isPending) {
    return (
      <LoadingRegion label="Loading withdrawals" className="space-y-3">
        {Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-28 w-full" />)}
      </LoadingRegion>
    );
  }

  if (!query.data.items.length) {
    return (
      <EmptyState
        icon={BadgeCheck}
        title="Nothing to pay out"
        description="Withdrawal requests from workers appear here, oldest first."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {query.data.items.map((w) => (
        <li key={w._id}>
          <Card>
            <CardHeader
              title={`${formatPKR(w.amount)} to ${w.worker.name}`}
              description={`Requested ${timeAgo(w.requestedAt)} · ${w.worker.email}${w.worker.phone ? ` · ${w.worker.phone}` : ''}`}
              action={<Badge tone="warning">Waiting</Badge>}
            />
            <CardBody className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-ink-500">Method</dt><dd className="font-semibold capitalize">{w.method.type === 'bank' ? w.method.bankName : w.method.type}</dd></div>
                <div><dt className="text-xs text-ink-500">Account title</dt><dd className="font-semibold">{w.method.accountTitle}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-ink-500">Account</dt><dd className="numeric truncate font-semibold">{w.method.accountNumber}</dd></div>
              </dl>

              {settling === w._id ? (
                <div className="flex flex-col gap-3 rounded-md border border-ink-200 bg-ink-50 p-4">
                  <Input
                    label="Transfer reference"
                    placeholder="e.g. HBL-88213004"
                    hint="Recorded against the withdrawal so the payment can be traced later"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                  <Input label="Note (used if you reject)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setSettling(null)}>Cancel</Button>
                    <Button size="sm" variant="outline" className="text-danger-700" onClick={() => settle.mutate({ id: w._id, paid: false })}>
                      Reject
                    </Button>
                    <Button size="sm" disabled={!reference.trim()} loading={settle.isPending} onClick={() => settle.mutate({ id: w._id, paid: true })}>
                      Mark as paid
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => setSettling(w._id)}>Settle</Button>
                </div>
              )}
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export default function AdminDashboardPage() {
  const [tab, setTab] = useState('verifications');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin</h1>
        <p className="mt-1 text-ink-600">Identity checks and disputed escrow — the two decisions only staff can make.</p>
      </header>

      <SectionLabel className="mb-3">Platform</SectionLabel>
      <Overview />

      <div className="mt-10 mb-4 flex gap-2 border-b border-ink-200">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-current={tab === id}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              tab === id ? 'border-ink-950 text-ink-950' : 'border-transparent text-ink-500 hover:text-ink-950'
            }`}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === 'verifications' && <VerificationQueue />}
      {tab === 'disputes' && <DisputeQueue />}
      {tab === 'withdrawals' && <WithdrawalQueue />}
    </div>
  );
}
