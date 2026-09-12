import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

/**
 * Desktop: always-visible sidebar. Mobile: toggled panel above results,
 * so filters stay one tap away without a separate screen.
 */
export function FilterPanel({ children, activeCount = 0, onReset }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2 lg:hidden">
        <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="filters">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters{activeCount > 0 && ` (${activeCount})`}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            Clear all
          </Button>
        )}
      </div>

      <aside id="filters" aria-label="Filters" className={cn('rounded-xl border border-ink-200 bg-white p-4 shadow-card lg:block lg:self-start', open ? 'block' : 'hidden')}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Filters</h2>
          <div className="flex items-center gap-1">
            {activeCount > 0 && (
              <button type="button" onClick={onReset} className="rounded px-2 py-1 text-sm font-medium text-primary-700 hover:underline">
                Clear all
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 lg:hidden" aria-label="Close filters">
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-4">{children}</div>
      </aside>
    </>
  );
}

export function SortSelect({ value, onChange, options, id = 'sort' }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm whitespace-nowrap text-ink-600">
        Sort by
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-lg border border-ink-300 bg-white px-2 text-sm focus:border-primary-600 focus:ring-2 focus:ring-primary-600/30 focus:outline-none">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
