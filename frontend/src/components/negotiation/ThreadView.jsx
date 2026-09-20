import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BadgeCheck, Check, CircleSlash, Info, RefreshCcw, Send, Undo2 } from 'lucide-react';

import { offersApi } from '@/api/negotiation';
import { toast } from '@/components/feedback/toastStore';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { StarDisplay } from '@/components/ui/StarRating';
import { ErrorState, InlineAlert } from '@/components/ui/States';
import { TrustBadge } from '@/components/ui/TrustScore';
import { cn } from '@/lib/cn';
import { formatBudget, formatDate, formatDuration, formatPKR } from '@/lib/format';
import { getSocket, useSocketEvent } from '@/realtime/socket';
import { useAuthStore } from '@/stores/authStore';
import { FairPriceHint } from '@/components/pricing/FairPriceHint';
import { OfferForm } from './OfferForm';
import { OfferRoundCard } from './OfferRoundCard';

const STATUS_META = {
  pending: { tone: 'secondary', label: 'Negotiating' },
  accepted: { tone: 'success', label: 'Accepted' },
  rejected: { tone: 'danger', label: 'Declined' },
  withdrawn: { tone: 'neutral', label: 'Withdrawn' },
  closed: { tone: 'neutral', label: 'Closed' },
};

const timeFmt = new Intl.DateTimeFormat('en-PK', { hour: 'numeric', minute: '2-digit' });

function Composer({ offerId, disabled }) {
  const [text, setText] = useState('');
  const typingRef = useRef({ active: false, timer: null });
  const queryClient = useQueryClient();

  const send = useMutation({
    mutationFn: (t) => offersApi.send(offerId, t),
    onSuccess: (message) => {
      setText('');
      appendMessage(queryClient, offerId, message);
    },
    onError: (err) => toast({ title: 'Message not sent', description: err.message, tone: 'danger' }),
  });

  const emitTyping = (typing) => getSocket()?.emit('thread:typing', { offerId, typing });

  const onChange = (e) => {
    setText(e.target.value);
    const t = typingRef.current;
    if (!t.active) {
      t.active = true;
      emitTyping(true);
    }
    clearTimeout(t.timer);
    t.timer = setTimeout(() => {
      t.active = false;
      emitTyping(false);
    }, 2000);
  };

  const submit = (e) => {
    e.preventDefault();
    if (text.trim()) send.mutate(text.trim());
  };

  if (disabled) {
    return <p className="border-t border-ink-200 bg-ink-100 px-4 py-3 text-center text-sm text-ink-600">This conversation is closed.</p>;
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-ink-200 bg-white p-3">
      <label htmlFor={`composer-${offerId}`} className="sr-only">
        Message
      </label>
      <textarea
        id={`composer-${offerId}`}
        rows={1}
        value={text}
        maxLength={2000}
        onChange={onChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) submit(e);
        }}
        placeholder="Write a message…"
        className="max-h-32 min-h-10 flex-1 resize-none rounded-md border border-ink-300 px-3 py-2.5 text-base focus:border-ink-950 focus:ring-2 focus:ring-ink-950/10 focus:outline-none sm:text-sm"
      />
      <Button type="submit" size="icon" loading={send.isPending} disabled={!text.trim()} aria-label="Send message">
        {!send.isPending && <Send className="size-5" />}
      </Button>
    </form>
  );
}

function appendMessage(queryClient, offerId, message) {
  queryClient.setQueryData(['messages', offerId], (data) => {
    if (!data) return data;
    const exists = data.pages.some((p) => p.items.some((m) => m._id === message._id));
    if (exists) return data;
    const [newest, ...rest] = data.pages;
    return { ...data, pages: [{ ...newest, items: [...newest.items, message] }, ...rest] };
  });
}

function ActionPanel({ offer }) {
  const [modal, setModal] = useState(null);
  const [reason, setReason] = useState('');
  const queryClient = useQueryClient();
  const current = offer.rounds.at(-1);
  const otherName = offer.myRole === 'worker' ? offer.client.name : offer.worker.name;

  const onDone = (updated) => {
    queryClient.invalidateQueries({ queryKey: ['offer', offer._id] });
    queryClient.invalidateQueries({ queryKey: ['offers'] });
    queryClient.invalidateQueries({ queryKey: ['messages', offer._id] });
    setModal(null);
    return updated;
  };

  const counter = useMutation({ mutationFn: (body) => offersApi.counter(offer._id, body), onSuccess: onDone });
  const accept = useMutation({
    mutationFn: () => offersApi.accept(offer._id),
    onSuccess: (data) => {
      onDone(data);
      toast({ title: 'Offer accepted', description: 'A booking has been created.', tone: 'success', to: `/bookings/${data.booking._id}` });
    },
  });
  const reject = useMutation({ mutationFn: () => offersApi.reject(offer._id, reason || undefined), onSuccess: onDone });
  const withdraw = useMutation({ mutationFn: () => offersApi.withdraw(offer._id, reason || undefined), onSuccess: onDone });

  if (offer.status === 'accepted') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-success-700">
          <Check className="mr-1 inline size-4" aria-hidden />
          Agreed at <strong>{formatPKR(current.amount)}</strong>
        </p>
        {offer.booking && (
          <Button size="sm" to={`/bookings/${offer.booking._id}`}>
            {offer.myRole === 'client' && offer.booking.status === 'pending_payment' ? 'Pay into escrow' : 'View booking'}
          </Button>
        )}
      </div>
    );
  }
  if (offer.status !== 'pending') {
    return <p className="text-sm text-ink-600">This negotiation is {STATUS_META[offer.status]?.label.toLowerCase()}.</p>;
  }

  return (
    <>
      {offer.isMyTurn ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setModal('accept')}>
            <Check className="size-4" aria-hidden /> Accept {formatPKR(current.amount)}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setModal('counter')}>
            <RefreshCcw className="size-4" aria-hidden /> Counter
          </Button>
          <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => setModal('reject')}>
            <CircleSlash className="size-4" aria-hidden /> Decline
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-600">Waiting for {otherName} to respond…</p>
          {offer.myRole === 'worker' && (
            <Button size="sm" variant="ghost" onClick={() => setModal('withdraw')}>
              <Undo2 className="size-4" aria-hidden /> Withdraw
            </Button>
          )}
        </div>
      )}

      <Modal open={modal === 'counter'} onClose={() => setModal(null)} title="Make a counter-offer" description={`Current offer: ${formatPKR(current.amount)} for ${formatDuration(current.durationType, current.durationCount)}`}>
        <OfferForm
          mode="counter"
          initial={current}
          reference={current}
          durationType={current.durationType}
          onSubmit={(body) => counter.mutate(body)}
          submitting={counter.isPending}
          error={counter.error}
          onCancel={() => setModal(null)}
          renderAside={(setAmount) => (
            <FairPriceHint
              compact
              category={offer.job.category}
              city={offer.job.city}
              durationType={current.durationType}
              durationCount={current.durationCount}
              onApply={(_min, _max, median) => setAmount(median)}
              applyLabel="Use typical price"
            />
          )}
        />
      </Modal>

      <Modal
        open={modal === 'accept'}
        onClose={() => setModal(null)}
        title="Accept this offer?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Not yet
            </Button>
            <Button loading={accept.isPending} onClick={() => accept.mutate()}>
              Accept & book
            </Button>
          </>
        }
      >
        {accept.error && <InlineAlert className="mb-3">{accept.error.message}</InlineAlert>}
        <OfferRoundCard round={current} label="Final terms" highlight className="max-w-none" />
        <p className="mt-3 text-sm text-ink-600">
          {offer.myRole === 'client'
            ? 'A booking will be created and you will be asked to pay into escrow. The money is only released to the worker when you confirm the job is done.'
            : 'A booking will be created. The client pays into escrow before you start, so your payment is secured.'}
        </p>
      </Modal>

      <Modal
        open={modal === 'reject' || modal === 'withdraw'}
        onClose={() => setModal(null)}
        title={modal === 'withdraw' ? 'Withdraw your offer?' : 'Decline this offer?'}
        description="This ends the negotiation. It can't be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Keep negotiating
            </Button>
            <Button variant="danger" loading={reject.isPending || withdraw.isPending} onClick={() => (modal === 'withdraw' ? withdraw : reject).mutate()}>
              {modal === 'withdraw' ? 'Withdraw' : 'Decline'}
            </Button>
          </>
        }
      >
        {(reject.error || withdraw.error) && <InlineAlert className="mb-3">{(reject.error || withdraw.error).message}</InlineAlert>}
        <Textarea label="Reason (optional)" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </>
  );
}

export function ThreadView({ offerId, onBack }) {
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const scrollRef = useRef(null);
  const [typing, setTyping] = useState(false);

  const offerQuery = useQuery({ queryKey: ['offer', offerId], queryFn: () => offersApi.get(offerId) });
  const messagesQuery = useInfiniteQuery({
    queryKey: ['messages', offerId],
    queryFn: ({ pageParam }) => offersApi.messages(offerId, { before: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (last) => (last.hasMore ? last.items[0]?.createdAt : undefined),
  });

  const markRead = useMutation({ mutationFn: () => offersApi.markRead(offerId), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['offers'] }) });

  // Join the thread room (and re-join after reconnects)
  useEffect(() => {
    const s = getSocket();
    if (!s) return undefined;
    const join = () => s.emit('thread:join', offerId);
    join();
    s.on('connect', join);
    return () => {
      s.off('connect', join);
      s.emit('thread:leave', offerId);
    };
  }, [offerId]);

  useEffect(() => {
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId]);

  useSocketEvent('message:new', (message) => {
    if (message.offer !== offerId) return;
    appendMessage(queryClient, offerId, message);
    if (message.type !== 'text') queryClient.invalidateQueries({ queryKey: ['offer', offerId] });
    if (message.sender && message.sender !== me._id && document.visibilityState === 'visible') markRead.mutate();
    setTyping(false);
  });

  useSocketEvent('thread:typing', (e) => {
    if (e.offerId === offerId && e.userId !== me._id) setTyping(e.typing);
  });

  const messages = useMemo(() => (messagesQuery.data ? [...messagesQuery.data.pages].reverse().flatMap((p) => p.items) : []), [messagesQuery.data]);

  const lastId = messages.at(-1)?._id;
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [lastId, typing]);

  if (offerQuery.isPending || messagesQuery.isPending) {
    return (
      <LoadingRegion label="Loading conversation" className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="ml-auto h-24 w-2/3" />
        <Skeleton className="h-10 w-1/2" />
      </LoadingRegion>
    );
  }
  if (offerQuery.isError) return <ErrorState error={offerQuery.error} onRetry={offerQuery.refetch} className="flex-1" />;

  const offer = offerQuery.data;
  const other = offer.myRole === 'worker' ? offer.client : offer.worker;
  const rounds = new Map(offer.rounds.map((r, i) => [r._id, { round: r, index: i }]));
  const latestRoundId = offer.rounds.at(-1)?._id;
  const status = STATUS_META[offer.status];
  const closed = ['rejected', 'withdrawn', 'closed'].includes(offer.status);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-ink-200 bg-white px-3 py-2.5">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden" aria-label="Back to conversations">
            <ArrowLeft className="size-5" />
          </Button>
        )}
        <Avatar src={other.avatar?.url} name={other.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-semibold">
            {offer.myRole === 'client' ? (
              <Link to={`/workers/${other._id}`} className="hover:underline">
                {other.name}
              </Link>
            ) : (
              other.name
            )}
            {offer.myRole === 'client' && offer.workerSummary?.idVerified && <BadgeCheck className="size-4 text-primary-600" aria-label="ID verified" />}
          </p>
          <Link to={`/jobs/${offer.job._id}`} className="block truncate text-xs text-ink-500 hover:underline">
            {offer.job.title}
          </Link>
        </div>
        {offer.myRole === 'client' && offer.workerSummary && (
          <div className="hidden items-center gap-2 sm:flex">
            <StarDisplay rating={offer.workerSummary.avgRating} count={offer.workerSummary.reviewCount} />
            <TrustBadge score={offer.workerSummary.trustScore} />
          </div>
        )}
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>

      {/* Current terms + actions (sticky so they stay visible while scrolling the chat) */}
      <section aria-label="Current offer" className="border-b border-ink-200 bg-ink-50 px-4 py-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-500">
          <span>Client budget: {formatBudget(offer.job.budget)}</span>
          <span>
            Round {offer.rounds.length} · {formatDuration(offer.rounds.at(-1).durationType, offer.rounds.at(-1).durationCount)} from {formatDate(offer.rounds.at(-1).startDate)}
          </span>
        </div>
        <ActionPanel offer={offer} />
      </section>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite" aria-relevant="additions">
        {messagesQuery.hasNextPage && (
          <div className="mb-4 text-center">
            <Button variant="ghost" size="sm" onClick={() => messagesQuery.fetchNextPage()} loading={messagesQuery.isFetchingNextPage}>
              Load earlier messages
            </Button>
          </div>
        )}
        <ol className="flex flex-col gap-3">
          {messages.map((m) => {
            const mine = m.sender === me._id;
            if (m.type === 'system') {
              return (
                <li key={m._id} className="mx-auto flex max-w-md items-start gap-1.5 rounded-sm bg-ink-100 px-2.5 py-1 text-center text-xs text-ink-500">
                  <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                  {m.text}
                </li>
              );
            }
            if (m.type === 'offer') {
              const entry = rounds.get(m.roundId);
              if (!entry) return null;
              const label = entry.index === 0 ? (mine ? 'Your offer' : 'Offer') : mine ? 'Your counter-offer' : 'Counter-offer';
              return (
                <li key={m._id} className="flex flex-col gap-1">
                  <OfferRoundCard round={entry.round} label={label} isMine={mine} highlight={m.roundId === latestRoundId && offer.status === 'pending'} />
                  {m.text && <p className={cn('max-w-sm rounded-2xl px-3.5 py-2 text-sm', mine ? 'ml-auto bg-ink-950 text-white' : 'mr-auto border border-ink-200 bg-white text-ink-700')}>{m.text}</p>}
                  <time className={cn('text-[11px] text-ink-400', mine ? 'text-right' : '')} dateTime={m.createdAt}>
                    {timeFmt.format(new Date(m.createdAt))}
                  </time>
                </li>
              );
            }
            return (
              <li key={m._id} className={cn('flex max-w-[80%] flex-col', mine ? 'ml-auto items-end' : 'mr-auto items-start')}>
                <p className={cn('rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-line', mine ? 'rounded-br-xs bg-ink-950 text-white' : 'rounded-bl-xs border border-ink-200 bg-white text-ink-700')}>
                  <span className="sr-only">{mine ? 'You' : other.name}: </span>
                  {m.text}
                </p>
                <time className="mt-0.5 text-[11px] text-ink-400" dateTime={m.createdAt}>
                  {timeFmt.format(new Date(m.createdAt))}
                  {mine && m.readBy?.length > 1 && ' · Seen'}
                </time>
              </li>
            );
          })}
        </ol>
        {typing && <p className="mt-3 text-xs text-ink-500 italic">{other.name} is typing…</p>}
      </div>

      <Composer offerId={offerId} disabled={closed} />
    </div>
  );
}
