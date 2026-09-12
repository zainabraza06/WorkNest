import { cn } from '@/lib/cn';

export function Skeleton({ className }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-md bg-ink-200 bg-[length:800px_100%]',
        'bg-gradient-to-r from-ink-200 via-ink-100 to-ink-200',
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
