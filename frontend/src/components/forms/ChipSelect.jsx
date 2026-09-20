import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Multi-select as toggleable chips (checkbox semantics). */
export function ChipSelect({ legend, options, value = [], onChange, max, error, hint }) {
  const toggle = (v) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else if (!max || value.length < max) onChange([...value, v]);
  };

  return (
    <fieldset>
      {legend && <legend className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase">{legend}</legend>}
      <div className="flex flex-wrap gap-2">
        {options.map(({ value: v, label, icon: Icon }) => {
          const selected = value.includes(v);
          const disabled = !selected && max && value.length >= max;
          return (
            <label
              key={v}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors select-none',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-600',
                selected ? 'border-ink-950 bg-ink-950 text-white' : 'border-ink-300 bg-white text-ink-600 hover:border-ink-950 hover:text-ink-950',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <input type="checkbox" className="sr-only" checked={selected} disabled={disabled} onChange={() => toggle(v)} />
              {selected ? <Check className="size-4" aria-hidden /> : Icon && <Icon className="size-4" aria-hidden />}
              {label}
            </label>
          );
        })}
      </div>
      {hint && !error && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-danger-700" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Single-select radio cards, e.g. duration type. */
export function RadioCards({ legend, options, value, onChange, name, columns = 3 }) {
  return (
    <fieldset>
      {legend && <legend className="mb-2 text-sm font-medium text-ink-800">{legend}</legend>}
      <div className={cn('grid gap-2', columns === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer flex-col rounded-md border px-3 py-2.5 transition-colors',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary-600',
              value === o.value ? 'border-ink-950 bg-ink-950 text-white' : 'border-ink-300 bg-white hover:border-ink-950',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
            <span className="text-sm font-bold">{o.label}</span>
            {o.description && <span className="text-xs opacity-70">{o.description}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
