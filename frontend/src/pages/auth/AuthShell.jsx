export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-600">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-card sm:p-8">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-ink-600">{footer}</p>}
      </div>
    </div>
  );
}
