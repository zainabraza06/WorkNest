import { useQuery } from '@tanstack/react-query';
import { Scale, TrendingUp } from 'lucide-react';

import { priceApi } from '@/api';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatPKR } from '@/lib/format';

/**
 * AI fair-price guidance. Renders nothing when the service is unavailable or the
 * inputs aren't chosen yet — guidance should never block someone from posting.
 */
export function FairPriceHint({ category, city, durationType = 'one_day', durationCount = 1, urgency, experienceYears, onApply, applyLabel = 'Use this range', className, compact = false }) {
  const params = { category, city, durationType, durationCount, urgency, experienceYears };

  const { data, isPending, isError } = useQuery({
    queryKey: ['price', params],
    queryFn: () => priceApi.suggest(params),
    enabled: Boolean(category),
    retry: false,
    staleTime: 10 * 60_000,
  });

  if (!category) return null;

  if (isPending) {
    return (
      <div className={cn('rounded-xl border border-ink-200 bg-white p-4', className)}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-6 w-40" />
        <Skeleton className="mt-2 h-3 w-full" />
      </div>
    );
  }
  // Silent when pricing is unavailable — the form still works without it
  if (isError || !data) return null;

  return (
    <aside
      className={cn('rounded-xl border border-primary-200 bg-primary-50 p-4', className)}
      aria-label="Suggested fair price"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-primary-800 uppercase">
        <Scale className="size-3.5" aria-hidden /> Fair price guide
      </p>
      <p className="mt-1.5 font-display text-xl font-bold text-ink-900">
        {formatPKR(data.min)} – {formatPKR(data.max)}
      </p>
      {!compact && (
        <p className="mt-1 text-sm text-ink-700">
          {data.explanation} Typical total: <strong>{formatPKR(data.median)}</strong>.
        </p>
      )}
      {onApply && (
        <button
          type="button"
          onClick={() => onApply(data.min, data.max, data.median)}
          className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-sm font-semibold text-primary-800 shadow-sm hover:bg-primary-100"
        >
          <TrendingUp className="size-4" aria-hidden /> {applyLabel}
        </button>
      )}
      <p className="mt-2 text-[11px] text-primary-900/70">
        Estimated from local rates for {city ?? 'Pakistan'}. You can still set any price you agree on.
      </p>
    </aside>
  );
}
