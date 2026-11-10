import { Link } from 'react-router';
import { cn } from '@/lib/cn';

/**
 * The WorkNest mark: an ink tile with an orange "W" stroke.
 * Keep the geometry in sync with flutter_app/lib/widgets/logo.dart and
 * scripts/generate_brand_assets.py.
 *
 * `animated` pops the tile in and draws the W — used on the sign-in screens and the welcome
 * transition. Reduced-motion users get the finished mark (the global media query collapses it).
 */
export function LogoMark({ className, invert = false, animated = false }) {
  return (
    <svg viewBox="0 0 28 28" className={cn('size-7', className)} aria-hidden>
      <rect
        width="28"
        height="28"
        rx="5"
        className={cn(invert ? 'fill-white' : 'fill-ink-950', animated && 'origin-center animate-tile-pop')}
      />
      <path
        d="M6 9.5 L10 19 L14 12.5 L18 19 L22 9.5"
        fill="none"
        pathLength="1"
        className={cn('stroke-primary-500', animated && 'animate-draw-w')}
        style={animated ? { strokeDasharray: 1 } : undefined}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, to = '/', invert = false }) {
  return (
    <Link to={to} className={cn('inline-flex items-center gap-2 rounded-sm', className)} aria-label="WorkNest home">
      <LogoMark invert={invert} />
      <span className={cn('font-display text-lg font-extrabold tracking-tight', invert ? 'text-white' : 'text-ink-950')}>
        WorkNest
      </span>
    </Link>
  );
}
