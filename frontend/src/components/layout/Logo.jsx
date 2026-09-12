import { Link } from 'react-router';
import { cn } from '@/lib/cn';

export function Logo({ className, to = '/' }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 rounded-lg', className)} aria-label="WorkNest home">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-primary-700" />
        <path d="M7 21.5 16 9l9 12.5" fill="none" className="stroke-secondary-400" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11.5 23.5h9" className="stroke-white" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span className="font-display text-xl font-extrabold tracking-tight text-ink-900">
        Work<span className="text-primary-700">Nest</span>
      </span>
    </Link>
  );
}
