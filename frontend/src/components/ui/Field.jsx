import { forwardRef, useId } from 'react';
import { cn } from '@/lib/cn';

const controlBase =
  'block w-full rounded-lg border bg-white px-3 text-base text-ink-900 placeholder:text-ink-400 transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-600/30 focus:border-primary-600 ' +
  'disabled:bg-ink-100 disabled:text-ink-500 sm:text-sm';

const controlState = (error) => (error ? 'border-danger-600' : 'border-ink-300 hover:border-ink-400');

/** Label + control + hint/error wiring with proper aria attributes. */
export function Field({ label, hint, error, required, children, className, id: idProp }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-800">
          {label}
          {required && (
            <span className="ml-0.5 text-danger-600" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) || undefined, required })}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-ink-500">
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
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-500">{leading}</span>
          )}
          <input
            ref={ref}
            className={cn(controlBase, controlState(error), 'h-11', leading && 'pl-10', inputClassName)}
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
      {(a11y) => (
        <textarea ref={ref} rows={rows} className={cn(controlBase, controlState(error), 'py-2.5')} {...a11y} {...props} />
      )}
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
        <select ref={ref} className={cn(controlBase, controlState(error), 'h-11 pr-8')} {...a11y} {...props}>
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
