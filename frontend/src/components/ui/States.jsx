import { AlertTriangle, SearchX } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function EmptyState({ icon: Icon = SearchX, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center rounded-lg border border-dashed border-ink-300 px-6 py-14 text-center', className)}>
      <Icon className="mb-4 size-6 text-ink-400" aria-hidden />
      <h3 className="text-lg font-bold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', error, onRetry, className }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center rounded-lg border border-danger-600/20 bg-danger-50/50 px-6 py-14 text-center', className)}>
      <AlertTriangle className="mb-4 size-6 text-danger-600" aria-hidden />
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-600">{error?.message ?? 'Please try again in a moment.'}</p>
      {onRetry && (
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineAlert({ tone = 'danger', children, className }) {
  const tones = {
    danger: 'border-danger-600/25 bg-danger-50 text-danger-700',
    success: 'border-success-600/25 bg-success-50 text-success-700',
    info: 'border-ink-200 bg-ink-50 text-ink-700',
    warning: 'border-secondary-300 bg-warning-50 text-warning-700',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-md border px-3.5 py-2.5 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}
