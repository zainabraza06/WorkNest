import { useEffect } from 'react';
import { Link } from 'react-router';
import { Bell, CheckCircle2, X, XCircle } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useToastStore } from './toastStore';

const icons = { info: Bell, success: CheckCircle2, danger: XCircle };
const accents = { info: 'text-primary-700', success: 'text-success-600', danger: 'text-danger-600' };

function ToastItem({ toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = icons[toast.tone] ?? Bell;

  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, dismiss]);

  const body = (
    <>
      <Icon className={cn('mt-0.5 size-5 shrink-0', accents[toast.tone])} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
        {toast.description && <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">{toast.description}</p>}
      </div>
    </>
  );

  return (
    <li className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-ink-200 bg-white p-3.5 shadow-raised">
      {toast.to ? (
        <Link to={toast.to} onClick={() => dismiss(toast.id)} className="flex min-w-0 flex-1 items-start gap-3">
          {body}
        </Link>
      ) : (
        body
      )}
      <button type="button" onClick={() => dismiss(toast.id)} className="-m-1 rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Dismiss notification">
        <X className="size-4" />
      </button>
    </li>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <ol aria-live="polite" aria-label="Notifications" className="pointer-events-none fixed inset-x-0 top-18 z-50 mx-auto flex max-w-sm flex-col gap-2 px-4 sm:right-4 sm:left-auto sm:mx-0">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </ol>
  );
}
