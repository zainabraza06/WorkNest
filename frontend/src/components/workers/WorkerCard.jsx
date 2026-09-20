import { Link } from 'react-router';
import { BadgeCheck, MapPin, Sparkles } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { StarDisplay } from '@/components/ui/StarRating';
import { TrustBadge } from '@/components/ui/TrustScore';
import { CATEGORY_MAP } from '@/lib/constants';
import { formatPKR } from '@/lib/format';

export function WorkerCard({ worker, impressionId }) {
  const {
    user, headline, categories = [], skills = [], rates, city, distanceKm,
    stats, trustScore, idVerified, isAvailable, experienceYears, matchReasons,
  } = worker;

  const trade = CATEGORY_MAP[categories[0]]?.label;
  const tags = [...categories.slice(1).map((c) => CATEGORY_MAP[c]?.label ?? c), ...skills].slice(0, 2);

  return (
    // min-w-0 matters: as a grid child this card must be allowed to shrink below its content width
    <Card as="article" interactive className="relative flex h-full min-w-0 flex-col p-4">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar src={user.avatar?.url} name={user.name} size="md" />

        <div className="min-w-0 flex-1">
          <h3 className="flex min-w-0 items-center gap-1 font-display text-base font-bold text-ink-950">
            <Link
              to={impressionId ? `/workers/${user._id}?from=${impressionId}` : `/workers/${user._id}`}
              className="truncate after:absolute after:inset-0 focus:outline-none"
            >
              {user.name}
            </Link>
            {idVerified && <BadgeCheck className="size-3.5 shrink-0 text-primary-500" aria-label="ID verified" />}
          </h3>
          <p className="truncate text-sm text-ink-500">{trade ?? headline}</p>
        </div>

        {isAvailable && (
          <span className="mt-1 flex shrink-0 items-center gap-1 text-[11px] font-semibold tracking-wide text-success-600 uppercase">
            <span className="size-1.5 rounded-full bg-success-500" aria-hidden />
            Open
          </span>
        )}
      </div>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <StarDisplay rating={stats?.avgRating} count={stats?.reviewCount} />
        <TrustBadge score={trustScore?.score} />
      </div>

      {matchReasons?.length > 0 ? (
        <ul className="mt-3 min-w-0 space-y-1" aria-label="Why this worker matches">
          {matchReasons.slice(0, 2).map((reason) => (
            <li key={reason} className="flex min-w-0 items-start gap-1.5 text-xs text-ink-600">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-primary-500" aria-hidden />
              <span className="truncate">{reason}</span>
            </li>
          ))}
        </ul>
      ) : (
        tags.length > 0 && (
          <ul className="mt-3 flex min-w-0 flex-wrap gap-1.5" aria-label="Skills">
            {tags.map((t) => (
              <li key={t} className="max-w-full truncate rounded-sm border border-ink-200 px-1.5 py-0.5 text-xs text-ink-500 capitalize">
                {t}
              </li>
            ))}
          </ul>
        )
      )}

      <div className="mt-auto flex min-w-0 items-end justify-between gap-3 border-t border-ink-200 pt-3 [&:not(:nth-child(2))]:mt-4">
        <div className="min-w-0">
          <p className="numeric font-display text-lg font-extrabold text-ink-950">{formatPKR(rates?.daily)}</p>
          <p className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">per day</p>
        </div>
        <div className="min-w-0 text-right text-xs text-ink-500">
          <p className="flex min-w-0 items-center justify-end gap-1">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{distanceKm !== undefined ? `${distanceKm} km · ${city}` : city}</span>
          </p>
          {experienceYears > 0 && <p className="numeric mt-0.5">{experienceYears} yrs exp.</p>}
        </div>
      </div>
    </Card>
  );
}

export function WorkerCardSkeleton() {
  return (
    <Card className="flex h-full min-w-0 flex-col p-4">
      <div className="flex gap-3">
        <Skeleton className="size-11 rounded-md" />
        <div className="flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="mt-4 h-3 w-1/3" />
      <Skeleton className="mt-3 h-3 w-1/2" />
      <div className="mt-6 flex items-end justify-between border-t border-ink-200 pt-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  );
}
