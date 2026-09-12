import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Check, Clock, FileQuestion, Lock, Mail, MapPin, Phone, Play, XCircle } from 'lucide-react';

import { bookingsApi } from '@/api/negotiation';
import { EscrowPayment } from '@/components/booking/EscrowPayment';
import { toast } from '@/components/feedback/toastStore';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineAlert } from '@/components/ui/States';
import { cn } from '@/lib/cn';
import { formatDate, formatDuration, formatPKR, timeAgo } from '@/lib/format';
import { BOOKING_STATUS_META, BOOKING_STEPS, PAYMENT_STATUS_META } from './bookingMeta';

function Stepper({ status }) {
  const index = BOOKING_STEPS.findIndex((s) => s.status === status);
  if (index === -1) return null;
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Booking progress">
      {BOOKING_STEPS.map((s, i) => (
        <li key={s.status} aria-current={i === index ? 'step' : undefined} className="flex flex-col items-center gap-1.5 text-center">
          <span className={cn('flex size-8 items-center justify-center rounded-full text-sm font-bold', i < index || status === 'completed' ? 'bg-primary-700 text-white' : i === index ? 'bg-primary-100 text-primary-800 ring-2 ring-primary-600' : 'bg-ink-200 text-ink-500')}>
            {i < index || status === 'completed' ? <Check className="size-4" aria-hidden /> : i + 1}
          </span>
          <span className={cn('text-xs font-medium', i <= index ? 'text-ink-800' : 'text-ink-500')}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function ConfirmAction({ open, onClose, title, description, confirmLabel, variant = 'primary', mutation, withReason, reasonLabel, reasonRequired }) {
  const [reason, setReason] = useState('');
  const tooShort = reasonRequired && reason.trim().length < 10;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Go back
          </Button>
          <Button variant={variant} loading={mutation.isPending} disabled={tooShort} onClick={() => mutation.mutate(reason.trim() || undefined)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {mutation.error && <InlineAlert className="mb-3">{mutation.error.message}</InlineAlert>}
      {withReason && <Textarea label={reasonLabel} required={reasonRequired} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} hint={reasonRequired ? 'At least 10 characters.' : undefined} />}
    </Modal>
  );
}

export default function BookingDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);

  const query = useQuery({
    queryKey: ['booking', id],
    queryFn: () => bookingsApi.get(id),
    retry: (count, err) => err.status !== 404 && count < 1,
  });

  const makeAction = (fn, successTitle) => ({
    mutationFn: fn,
    onSuccess: (booking) => {
      queryClient.setQueryData(['booking', id], booking);
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setModal(null);
      toast({ title: successTitle, tone: 'success' });
    },
  });

  const start = useMutation(makeAction(() => bookingsApi.start(id), 'Job started'));
  const complete = useMutation(makeAction(() => bookingsApi.complete(id), 'Job completed — payment released'));
  const cancel = useMutation(makeAction((reason) => bookingsApi.cancel(id, reason), 'Booking cancelled'));
  const dispute = useMutation(makeAction((reason) => bookingsApi.dispute(id, reason), 'Dispute opened — our team will review it'));

  if (query.isPending) {
    return (
      <LoadingRegion label="Loading booking" className="mx-auto max-w-4xl space-y-4 px-4 py-8">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </LoadingRegion>
    );
  }
  if (query.isError) {
    return query.error.status === 404 ? (
      <EmptyState icon={FileQuestion} title="Booking not found" action={<Button to="/bookings">All bookings</Button>} className="py-20" />
    ) : (
      <ErrorState error={query.error} onRetry={query.refetch} className="py-20" />
    );
  }

  const b = query.data;
  const role = b.myRole;
  const other = role === 'worker' ? b.client : b.worker;
  const meta = BOOKING_STATUS_META[b.status];
  const paymentMeta = b.payment ? PAYMENT_STATUS_META[b.payment.status] : null;
  const contactRevealed = Boolean(other.phone || other.email);
  const canCancel = ['pending_payment', 'confirmed'].includes(b.status);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/bookings" className="text-sm font-medium text-primary-700 hover:underline">
            ← All bookings
          </Link>
          <h1 className="mt-1 text-2xl font-bold break-words sm:text-3xl">{b.job?.title}</h1>
        </div>
        <Badge tone={meta.tone} className="px-3 py-1 text-sm">
          {meta.label}
        </Badge>
      </div>

      {b.status !== 'cancelled' && b.status !== 'disputed' && (
        <Card className="mb-5">
          <CardBody>
            <Stepper status={b.status} />
          </CardBody>
        </Card>
      )}
      {b.status === 'disputed' && (
        <InlineAlert tone="warning" className="mb-5">
          A dispute is open on this booking. Payment stays in escrow until it is resolved.
        </InlineAlert>
      )}

      <div className="grid gap-5 md:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Primary action for the current step */}
          {role === 'client' && b.status === 'pending_payment' && (
            <Card>
              <CardHeader title="Pay into escrow to confirm" />
              <CardBody>
                <EscrowPayment booking={b} />
              </CardBody>
            </Card>
          )}
          {role === 'worker' && b.status === 'pending_payment' && <InlineAlert tone="info">Waiting for {other.name} to pay into escrow. You'll be notified as soon as the booking is confirmed.</InlineAlert>}
          {role === 'worker' && b.status === 'confirmed' && (
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-700">Payment is secured in escrow. Start the job when you arrive.</p>
                <Button onClick={() => setModal('start')}>
                  <Play className="size-4" aria-hidden /> Start job
                </Button>
              </CardBody>
            </Card>
          )}
          {role === 'client' && b.status === 'confirmed' && <InlineAlert tone="info">Your payment is held safely. {other.name} will mark the job as started when they begin.</InlineAlert>}
          {role === 'client' && b.status === 'in_progress' && (
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-700">Is the work done to your satisfaction?</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" className="text-danger-700" onClick={() => setModal('dispute')}>
                    <AlertTriangle className="size-4" aria-hidden /> Report a problem
                  </Button>
                  <Button onClick={() => setModal('complete')}>
                    <Check className="size-4" aria-hidden /> Mark as complete
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}
          {role === 'worker' && b.status === 'in_progress' && <InlineAlert tone="info">When you finish, ask {other.name} to mark the job complete to release your payment.</InlineAlert>}

          <Card>
            <CardHeader title="Agreed terms" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-ink-500">Price</dt>
                  <dd className="font-display text-xl font-bold">{formatPKR(b.agreedPrice)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-ink-500">
                    <Clock className="size-3.5" aria-hidden /> Duration
                  </dt>
                  <dd className="font-semibold">{formatDuration(b.durationType, b.durationCount)}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-xs text-ink-500">
                    <CalendarDays className="size-3.5" aria-hidden /> Dates
                  </dt>
                  <dd className="font-semibold">
                    {formatDate(b.startDate)} – {formatDate(b.endDate)}
                  </dd>
                </div>
              </dl>
              {b.terms && <p className="mt-4 rounded-lg bg-ink-100 p-3 text-sm text-ink-700">{b.terms}</p>}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <CardBody>
              <ol className="relative flex flex-col gap-4 border-l border-ink-200 pl-5">
                {[...b.timeline].reverse().map((t, i) => (
                  <li key={i} className="relative">
                    <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-primary-600 ring-4 ring-white" aria-hidden />
                    <p className="text-sm font-semibold">{BOOKING_STATUS_META[t.status]?.label}</p>
                    {t.note && <p className="text-sm text-ink-600">{t.note}</p>}
                    <time className="text-xs text-ink-400" dateTime={t.at}>
                      {timeAgo(t.at)}
                    </time>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <aside className="flex flex-col gap-5">
          <Card>
            <CardHeader title={role === 'worker' ? 'Client' : 'Worker'} />
            <CardBody className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar src={other.avatar?.url} name={other.name} />
                <div>
                  <p className="font-semibold">{other.name}</p>
                  {role === 'client' && (
                    <Link to={`/workers/${other._id}`} className="text-xs text-primary-700 hover:underline">
                      View profile
                    </Link>
                  )}
                </div>
              </div>
              {contactRevealed ? (
                <ul className="flex flex-col gap-2 text-sm">
                  {other.phone && (
                    <li>
                      <a href={`tel:${other.phone}`} className="inline-flex items-center gap-2 text-primary-700 hover:underline">
                        <Phone className="size-4" aria-hidden /> {other.phone}
                      </a>
                    </li>
                  )}
                  {other.email && (
                    <li>
                      <a href={`mailto:${other.email}`} className="inline-flex items-center gap-2 break-all text-primary-700 hover:underline">
                        <Mail className="size-4" aria-hidden /> {other.email}
                      </a>
                    </li>
                  )}
                  {role === 'worker' && b.job?.address && (
                    <li className="inline-flex items-start gap-2 text-ink-700">
                      <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {b.job.address}, {b.job.city}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="flex items-start gap-2 rounded-lg bg-ink-100 p-3 text-xs text-ink-600">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  Contact details and the exact address are shared once payment is held in escrow.
                </p>
              )}
            </CardBody>
          </Card>

          {b.payment && (
            <Card>
              <CardHeader title="Payment" action={<Badge tone={paymentMeta.tone}>{paymentMeta.label}</Badge>} />
              <CardBody>
                <dl className="flex flex-col gap-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-600">Amount</dt>
                    <dd className="font-semibold">{formatPKR(b.payment.amount)}</dd>
                  </div>
                  {role === 'worker' && (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-ink-600">Platform fee (5%)</dt>
                        <dd>−{formatPKR(b.payment.platformFee)}</dd>
                      </div>
                      <div className="flex justify-between border-t border-ink-100 pt-1.5">
                        <dt className="font-semibold">Your payout</dt>
                        <dd className="font-bold">{formatPKR(b.payment.workerPayout)}</dd>
                      </div>
                    </>
                  )}
                </dl>
              </CardBody>
            </Card>
          )}

          {canCancel && (
            <Button variant="outline" className="text-danger-700" onClick={() => setModal('cancel')}>
              <XCircle className="size-4" aria-hidden /> Cancel booking
            </Button>
          )}
        </aside>
      </div>

      <ConfirmAction open={modal === 'start'} onClose={() => setModal(null)} title="Start this job?" description="Let the client know you've begun work." confirmLabel="Start job" mutation={start} />
      <ConfirmAction
        open={modal === 'complete'}
        onClose={() => setModal(null)}
        title="Confirm the job is complete?"
        description={`${formatPKR(b.agreedPrice)} will be released from escrow to ${other.name}. This can't be undone.`}
        confirmLabel="Release payment"
        mutation={complete}
      />
      <ConfirmAction
        open={modal === 'cancel'}
        onClose={() => setModal(null)}
        title="Cancel this booking?"
        description={b.payment?.status === 'held' ? 'The payment held in escrow will be refunded to the client.' : 'The booking will be cancelled.'}
        confirmLabel="Cancel booking"
        variant="danger"
        mutation={cancel}
        withReason
        reasonLabel="Reason (optional)"
      />
      <ConfirmAction
        open={modal === 'dispute'}
        onClose={() => setModal(null)}
        title="Report a problem"
        description="Payment stays in escrow while our team reviews the dispute."
        confirmLabel="Open dispute"
        variant="danger"
        mutation={dispute}
        withReason
        reasonLabel="What went wrong?"
        reasonRequired
      />
    </div>
  );
}
