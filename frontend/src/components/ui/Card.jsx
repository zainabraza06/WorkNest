import { cn } from '@/lib/cn';

export function Card({ as: Tag = 'div', className, children, ...props }) {
  return (
    <Tag className={cn('rounded-xl border border-ink-200 bg-white shadow-card', className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}
