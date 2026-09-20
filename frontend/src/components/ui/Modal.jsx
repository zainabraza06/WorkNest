import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Accessible modal built on the native <dialog> element:
 * focus trapping, Esc to close and an inert background come for free.
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
        'm-auto w-[calc(100%-2rem)] max-w-lg rounded-xl border border-ink-200 bg-white p-0 text-ink-700 shadow-raised',
        'backdrop:bg-ink-950/60 backdrop:backdrop-blur-[2px] open:animate-rise',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-3.5">
            <div>
              <h2 id={titleId} className="text-base font-bold">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="-m-1.5 rounded-md p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-900" aria-label="Close dialog">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
