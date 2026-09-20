import { CalendarDays, Clock, Handshake } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatDate, formatDuration, formatPKR } from '@/lib/format';

/** A structured offer — rendered as a card, not a chat bubble. */
export function OfferRoundCard({ round, label, isMine, highlight = false, className }) {
  return (
    <div
      className={cn(
        'w-full max-w-sm rounded-lg border p-3.5',
        highlight ? 'border-ink-950 bg-white ring-1 ring-ink-950' : 'border-ink-200 bg-white',
        isMine ? 'ml-auto' : 'mr-auto',
        className,
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-ink-500 uppercase">
        <Handshake className="size-3.5" aria-hidden /> {label}
      </p>
      <p className="numeric mt-1 font-display text-2xl font-extrabold text-ink-950">{formatPKR(round.amount)}</p>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-700">
        <div className="inline-flex items-center gap-1">
          <dt className="sr-only">Duration</dt>
          <Clock className="size-4 text-ink-500" aria-hidden />
          <dd>{formatDuration(round.durationType, round.durationCount)}</dd>
        </div>
        <div className="inline-flex items-center gap-1">
          <dt className="sr-only">Start date</dt>
          <CalendarDays className="size-4 text-ink-500" aria-hidden />
          <dd>from {formatDate(round.startDate)}</dd>
        </div>
      </dl>
      {round.terms && <p className="mt-2 border-t border-ink-200/70 pt-2 text-sm text-ink-700">{round.terms}</p>}
    </div>
  );
}
