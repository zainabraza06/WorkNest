import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

export function StarDisplay({ rating = 0, count, size = 'sm', className }) {
  const px = size === 'sm' ? 'size-3.5' : 'size-4';
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <Star className={cn(px, rating > 0 ? 'fill-ink-950 text-ink-950' : 'text-ink-300')} aria-hidden />
      <span className="numeric text-sm font-bold text-ink-900">{rating > 0 ? rating.toFixed(1) : '—'}</span>
      {count !== undefined && <span className="numeric text-sm text-ink-400">({count})</span>}
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
      <legend className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-500 uppercase">{label}</legend>
      <div className="flex gap-1.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="peer sr-only" />
            <Star
              className={cn(
                'size-8 rounded-sm transition-transform duration-150 hover:scale-110 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-500',
                n <= shown ? 'fill-primary-500 text-primary-500' : 'text-ink-300',
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
