import { Link } from 'react-router';
import { cn } from '@/lib/cn';

export function Logo({ className, to = '/', invert = false }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 rounded-sm', className)} aria-label="WorkNest home">
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect width="28" height="28" rx="5" className={invert ? 'fill-white' : 'fill-ink-950'} />
        <path d="M6 18.5 10 9.5l4 6 4-6 4 9" fill="none" className="stroke-primary-500" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" />
      </svg>
      <span className={cn('font-display text-lg font-extrabold tracking-tight', invert ? 'text-white' : 'text-ink-950')}>
        WorkNest
      </span>
    </Link>
  );
}
