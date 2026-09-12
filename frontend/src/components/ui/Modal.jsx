import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Accessible modal built on the native <dialog> element:
 * focus trapping, Esc to close and inert background come for free.
 */
export function Modal({ open, onClose, title, description, children, footer, className }) {
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // backdrop click
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 text-ink-800 shadow-raised backdrop:bg-ink-900/50',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-ink-600">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-m-2 rounded-lg p-2 text-ink-500 hover:bg-ink-100" aria-label="Close dialog">
              <X className="size-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
