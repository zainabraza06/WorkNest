import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/**
 * Desktop: a quiet sidebar with no card chrome competing with the results.
 * Mobile: the same panel, toggled open above the results.
 */
export function FilterPanel({ children, activeCount = 0, onReset }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="filters">
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Filters{activeCount > 0 && ` (${activeCount})`}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            Clear all
          </Button>
        )}
      </div>

      <aside
        id="filters"
        aria-label="Filters"
        className={cn(
          'min-w-0 rounded-lg border border-ink-200 p-4 lg:sticky lg:top-20 lg:block lg:self-start lg:rounded-none lg:border-0 lg:border-r lg:p-0 lg:pr-6',
          open ? 'block' : 'hidden',
        )}
      >
        <div className="mb-4 flex items-center justify-between border-b border-ink-200 pb-3 lg:mb-5">
          <h2 className="text-[11px] font-semibold tracking-[0.14em] text-ink-500 uppercase">Filters</h2>
          <div className="flex items-center gap-1">
            {activeCount > 0 && (
              <button type="button" onClick={onReset} className="rounded-sm px-1.5 py-0.5 text-xs font-semibold text-primary-600 hover:underline">
                Clear all
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-ink-400 hover:bg-ink-100 lg:hidden" aria-label="Close filters">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-5">{children}</div>
      </aside>
    </>
  );
}

export function SortSelect({ value, onChange, options, id = 'sort' }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Sort by
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 cursor-pointer rounded-md border border-ink-300 bg-white px-2 text-xs font-semibold text-ink-700 transition-colors hover:border-ink-950 focus:border-ink-950 focus:ring-2 focus:ring-ink-950/10 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            Sort: {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
