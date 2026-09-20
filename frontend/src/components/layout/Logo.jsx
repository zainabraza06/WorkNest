import { Link } from 'react-router';
import { cn } from '@/lib/cn';

export function Logo({ className, to = '/', invert = false }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 rounded-sm', className)} aria-label="WorkNest home">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect width="28" height="28" rx="5" className={invert ? 'fill-white' : 'fill-ink-950'} />
        <path d="M6 9.5 L10 19 L14 12.5 L18 19 L22 9.5" fill="none" className="stroke-primary-500" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={cn('font-display text-lg font-extrabold tracking-tight', invert ? 'text-white' : 'text-ink-950')}>
        WorkNest
      </span>
    </Link>
  );
}
