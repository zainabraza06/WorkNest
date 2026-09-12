import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

export function trustTier(score = 0) {
  if (score >= 85) return { label: 'Highly trusted', stroke: 'stroke-primary-600', text: 'text-primary-800', bg: 'bg-primary-50' };
  if (score >= 70) return { label: 'Trusted', stroke: 'stroke-success-600', text: 'text-success-700', bg: 'bg-success-50' };
  if (score >= 50) return { label: 'Building trust', stroke: 'stroke-secondary-500', text: 'text-secondary-800', bg: 'bg-secondary-50' };
  return { label: 'New / limited history', stroke: 'stroke-ink-400', text: 'text-ink-700', bg: 'bg-ink-100' };
}

/** Circular progress ring with the score in the middle. */
export function TrustScoreRing({ score = 0, size = 56, className, showLabel = false }) {
  const stroke = size >= 72 ? 6 : 5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tier = trustTier(clamped);

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`Trust Score ${clamped} out of 100, ${tier.label}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-ink-200" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped / 100)}
            className={cn(tier.stroke, 'transition-[stroke-dashoffset] duration-700')}
          />
        </svg>
        <span className={cn('absolute inset-0 flex items-center justify-center font-display font-bold', tier.text, size >= 72 ? 'text-xl' : 'text-sm')} aria-hidden>
          {clamped}
        </span>
      </div>
      {showLabel && (
        <div className="leading-tight">
          <p className={cn('text-sm font-semibold', tier.text)}>{tier.label}</p>
          <p className="text-xs text-ink-500">Trust Score</p>
        </div>
      )}
    </div>
  );
}

/** Compact pill for cards and lists. */
export function TrustBadge({ score = 0, className }) {
  const tier = trustTier(score);
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tier.bg, tier.text, className)}
      title={`Trust Score ${Math.round(score)}/100`}
    >
      <ShieldCheck className="size-3.5" aria-hidden />
      {Math.round(score)}
      <span className="sr-only"> out of 100 Trust Score, {tier.label}</span>
    </span>
  );
}
