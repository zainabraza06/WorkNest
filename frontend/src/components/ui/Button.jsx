import { forwardRef } from 'react';
import { Link } from 'react-router';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const variants = {
  primary: 'bg-primary-700 text-white hover:bg-primary-800 active:bg-primary-900 shadow-sm',
  secondary: 'bg-secondary-400 text-ink-900 hover:bg-secondary-300 active:bg-secondary-500 shadow-sm',
  outline: 'border border-ink-300 bg-white text-ink-800 hover:bg-ink-100 active:bg-ink-200',
  ghost: 'text-ink-700 hover:bg-ink-100 active:bg-ink-200',
  danger: 'bg-danger-600 text-white hover:bg-danger-700 shadow-sm',
  link: 'text-primary-700 underline-offset-4 hover:underline px-0 h-auto',
};

const sizes = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2', // 44px — comfortable touch target
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-11 w-11',
};

export const buttonClasses = ({ variant = 'primary', size = 'md', className } = {}) =>
  cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-colors',
    'disabled:pointer-events-none disabled:opacity-50',
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
