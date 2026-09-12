import { cn } from '@/lib/cn';

const tones = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  primary: 'bg-primary-50 text-primary-800 ring-primary-200',
  secondary: 'bg-secondary-50 text-secondary-800 ring-secondary-200',
  success: 'bg-success-50 text-success-700 ring-success-600/20',
  warning: 'bg-warning-50 text-warning-700 ring-secondary-300',
  danger: 'bg-danger-50 text-danger-700 ring-danger-600/20',
};

export function Badge({ tone = 'neutral', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
