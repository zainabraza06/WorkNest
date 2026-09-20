import { cn } from '@/lib/cn';

export function Skeleton({ className }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-sm bg-ink-100 bg-[length:800px_100%]',
        'bg-gradient-to-r from-ink-100 via-ink-50 to-ink-100',
        className,
      )}
    />
  );
}

/** Wraps skeletons so screen readers announce a single "Loading…" instead of nothing. */
export function LoadingRegion({ label = 'Loading', children, className }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
