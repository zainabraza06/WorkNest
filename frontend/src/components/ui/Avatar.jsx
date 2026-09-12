import { useState } from 'react';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/format';

const sizes = { sm: 'size-8 text-xs', md: 'size-11 text-sm', lg: 'size-16 text-lg', xl: 'size-24 text-2xl' };

export function Avatar({ src, name, size = 'md', className }) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100 font-semibold text-primary-800',
        sizes[size],
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
