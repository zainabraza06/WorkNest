import { LogoMark } from '@/components/layout/Logo';

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] items-start justify-center px-4 py-10 sm:items-center">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark animated className="mb-5 size-14 rounded-xl shadow-lift" />
          <h1 className="animate-rise text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 animate-rise text-ink-500">{subtitle}</p>}
        </div>
        <div className="animate-rise rounded-lg border border-ink-200 bg-white p-6 sm:p-8">{children}</div>
        {footer && <p className="mt-6 text-center text-sm text-ink-500">{footer}</p>}
      </div>
    </div>
  );
}
