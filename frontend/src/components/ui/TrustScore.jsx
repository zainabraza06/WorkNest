import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/cn';

export function trustTier(score = 0) {
  if (score >= 85) return { label: 'Highly trusted', stroke: 'stroke-primary-500', text: 'text-primary-600', chip: 'border-primary-200 bg-primary-50 text-primary-700' };
  if (score >= 70) return { label: 'Trusted', stroke: 'stroke-ink-900', text: 'text-ink-900', chip: 'border-ink-200 bg-ink-50 text-ink-700' };
  if (score >= 50) return { label: 'Building trust', stroke: 'stroke-ink-400', text: 'text-ink-600', chip: 'border-ink-200 bg-white text-ink-600' };
  return { label: 'New', stroke: 'stroke-ink-300', text: 'text-ink-500', chip: 'border-dashed border-ink-300 bg-white text-ink-500' };
}

/** Thin progress ring with the score set in display type. */
export function TrustScoreRing({ score = 0, size = 56, className, showLabel = false }) {
  const stroke = size >= 72 ? 4 : 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const tier = trustTier(clamped);

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={`Trust Score ${clamped} out of 100, ${tier.label}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-ink-200" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - clamped / 100)}
            className={cn(tier.stroke, 'transition-[stroke-dashoffset] duration-1000 ease-out')}
          />
        </svg>
        <span className={cn('numeric absolute inset-0 flex items-center justify-center font-display font-extrabold tracking-tight', tier.text, size >= 72 ? 'text-2xl' : 'text-sm')} aria-hidden>
          {clamped}
        </span>
      </div>
      {showLabel && (
        <div className="leading-tight">
          <p className={cn('text-sm font-bold', tier.text)}>{tier.label}</p>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-ink-400 uppercase">Trust Score</p>
        </div>
      )}
    </div>
  );
}

/** Compact inline marker for cards and lists. */
export function TrustBadge({ score = 0, className }) {
  const tier = trustTier(score);
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-bold', tier.chip, className)}
      title={`Trust Score ${Math.round(score)}/100 — ${tier.label}`}
    >
      <ShieldCheck className="size-3" aria-hidden />
      <span className="numeric">{Math.round(score)}</span>
      <span className="sr-only"> out of 100 Trust Score, {tier.label}</span>
    </span>
  );
}
