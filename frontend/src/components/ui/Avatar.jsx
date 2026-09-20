import { useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const sizes = {
  xs: 'size-7 text-[10px] rounded-sm',
  sm: 'size-9 text-xs rounded-md',
  md: 'size-11 text-sm rounded-md',
  lg: 'size-14 text-base rounded-lg',
  xl: 'size-20 text-xl rounded-lg',
};

/** Squared avatar — reads more editorial than a circle, and aligns with the card geometry. */
export function Avatar({ src, name, size = 'md', round = false, className }) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden bg-ink-900 font-display font-bold text-white',
        sizes[size],
        round && 'rounded-full',
        className,
      )}
    >
      {showImage ? (
        <img src={src} alt={name ? `${name}'s photo` : ''} className="size-full object-cover" onError={() => setFailed(true)} loading="lazy" />
      ) : (
        <span aria-hidden>{initials(name) || '?'}</span>
      )}
    </span>
  );
}
