import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

export function StarDisplay({ rating = 0, count, size = 'sm', className }) {
  const px = size === 'sm' ? 'size-4' : 'size-5';
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Star className={cn(px, rating > 0 ? 'fill-secondary-400 text-secondary-500' : 'text-ink-300')} aria-hidden />
      <span className="text-sm font-semibold text-ink-800">{rating > 0 ? rating.toFixed(1) : 'New'}</span>
      {count !== undefined && <span className="text-sm text-ink-500">({count})</span>}
      <span className="sr-only">
        {rating > 0 ? `Rated ${rating.toFixed(1)} out of 5` : 'No ratings yet'}
        {count !== undefined && ` from ${count} reviews`}
      </span>
    </span>
  );
}

/** Keyboard-accessible 1–5 star input (radio group semantics). */
export function StarInput({ value, onChange, label = 'Rating', name = 'rating' }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink-800">{label}</legend>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <Star
              className={cn(
                'size-8 rounded transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-primary-600',
                n <= shown ? 'fill-secondary-400 text-secondary-500' : 'text-ink-300',
              )}
              aria-hidden
            />
            <span className="sr-only">
              {n} star{n > 1 && 's'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
