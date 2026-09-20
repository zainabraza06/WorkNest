import { forwardRef } from 'react';
import { Link } from 'react-router';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const variants = {
  // Solid ink is the workhorse; hi-vis accent is reserved for the single primary action on a view
  primary: 'bg-ink-950 text-white hover:bg-ink-800 active:bg-ink-950 shadow-card',
  accent: 'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700 shadow-card',
  outline: 'border border-ink-300 bg-white text-ink-900 hover:border-ink-950 hover:bg-ink-50 active:bg-ink-100',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-950 active:bg-ink-200',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 shadow-card',
  invert: 'bg-white text-ink-950 hover:bg-ink-100 active:bg-ink-200',
  link: 'text-ink-950 underline decoration-primary-500 decoration-2 underline-offset-4 hover:decoration-ink-950 px-0 h-auto',
};

const sizes = {
  sm: 'h-8 px-2.5 text-xs gap-1.5',
  md: 'h-10 px-3.5 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
  icon: 'h-10 w-10',
};

export const buttonClasses = ({ variant = 'primary', size = 'md', className } = {}) =>
  cn(
    'group/btn inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-40',
    variants[variant],
    variant !== 'link' && sizes[size],
    className,
  );

export const Button = forwardRef(function Button(
  { variant, size, className, loading = false, disabled, children, type = 'button', to, ...props },
  ref,
) {
  const classes = buttonClasses({ variant, size, className });

  if (to) {
    return (
      <Link ref={ref} to={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button ref={ref} type={type} className={classes} disabled={disabled || loading} aria-busy={loading} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
