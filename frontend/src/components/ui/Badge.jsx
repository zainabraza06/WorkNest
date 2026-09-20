import { cn } from '@/lib/cn';

const tones = {
  neutral: 'border-ink-200 bg-ink-50 text-ink-600',
  solid: 'border-ink-950 bg-ink-950 text-white',
  primary: 'border-primary-200 bg-ink-50 text-primary-600',
  accent: 'border-primary-500 bg-primary-500 text-white',
  secondary: 'border-secondary-300 bg-secondary-50 text-secondary-800',
  success: 'border-success-600/25 bg-success-50 text-success-700',
  warning: 'border-secondary-300 bg-warning-50 text-warning-700',
  danger: 'border-danger-600/25 bg-danger-50 text-danger-700',
};

/** Small, squared, uppercase micro-label — deliberately not a fat pill. */
export function Badge({ tone = 'neutral', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/** Lowercase variant for skills and free-text tags, where shouting would be wrong. */
export function Tag({ className, children }) {
  return (
    <span className={cn('inline-flex items-center rounded-sm border border-ink-200 bg-white px-1.5 py-0.5 text-xs text-ink-600', className)}>
      {children}
    </span>
  );
}
