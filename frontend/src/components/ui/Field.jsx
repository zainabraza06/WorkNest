import { forwardRef, useId } from 'react';
import { cn } from '@/lib/cn';

const controlBase =
  'block w-full rounded-md border bg-white px-3 text-base text-ink-950 placeholder:text-ink-400 ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'focus:outline-none focus:border-ink-950 focus:ring-2 focus:ring-ink-950/10 ' +
  'disabled:bg-ink-100 disabled:text-ink-400 sm:text-sm';

const controlState = (error) => (error ? 'border-danger-600 focus:border-danger-600 focus:ring-danger-600/15' : 'border-ink-300 hover:border-ink-400');

/** Label + control + hint/error wiring with the aria attributes joined up. */
export function Field({ label, hint, error, required, children, className, id: idProp }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase">
          {label}
          {required && (
            <span className="ml-1 text-primary-500" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) || undefined, required })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ label, hint, error, className, inputClassName, required, id, leading, ...props }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} id={id}>
      {(a11y) => (
        <div className="relative">
          {leading && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-ink-400">{leading}</span>
          )}
          <input
            ref={ref}
            className={cn(controlBase, controlState(error), 'numeric h-10', leading && 'pl-9', inputClassName)}
            {...a11y}
            {...props}
          />
        </div>
      )}
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea({ label, hint, error, className, required, id, rows = 4, ...props }, ref) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} id={id}>
      {(a11y) => <textarea ref={ref} rows={rows} className={cn(controlBase, controlState(error), 'py-2.5')} {...a11y} {...props} />}
    </Field>
  );
});

export const Select = forwardRef(function Select(
  { label, hint, error, className, required, id, options, placeholder, ...props },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className} id={id}>
      {(a11y) => (
        <select ref={ref} className={cn(controlBase, controlState(error), 'h-10 cursor-pointer pr-8')} {...a11y} {...props}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
});
