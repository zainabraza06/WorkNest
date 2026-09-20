import { cn } from '@/lib/cn';

export function Card({ as: Tag = 'div', interactive = false, className, children, ...props }) {
  return (
    <Tag
      className={cn(
        'rounded-lg border border-ink-200 bg-white',
        interactive &&
          'transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-ink-300 hover:shadow-lift',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3.5', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

/** Uppercase section label with a hairline rule — used to break up long pages. */
export function SectionLabel({ children, className }) {
  return (
    <p className={cn('flex items-center gap-3 text-[11px] font-semibold tracking-[0.14em] text-ink-400 uppercase', className)}>
      {children}
      <span className="h-px flex-1 bg-ink-200" aria-hidden />
    </p>
  );
}
