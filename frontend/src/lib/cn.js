import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge about our custom type scale so `text-sm` and `text-ink-600` don't clobber each other
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'] }],
    },
  },
});

export const cn = (...inputs) => twMerge(clsx(inputs));
