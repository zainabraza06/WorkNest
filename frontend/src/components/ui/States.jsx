import { AlertTriangle, SearchX } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function EmptyState({ icon: Icon = SearchX, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary-50 text-primary-700">
        <Icon className="size-7" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', error, onRetry, className }) {
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-danger-50 text-danger-600">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-600">{error?.message ?? 'Please try again in a moment.'}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineAlert({ tone = 'danger', children, className }) {
  const tones = {
    danger: 'bg-danger-50 text-danger-700 border-danger-600/20',
    success: 'bg-success-50 text-success-700 border-success-600/20',
    info: 'bg-primary-50 text-primary-800 border-primary-200',
    warning: 'bg-warning-50 text-warning-700 border-secondary-300',
  };
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone], className)}>
      {children}
    </div>
  );
}
