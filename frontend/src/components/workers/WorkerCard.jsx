import { Link } from 'react-router';
import { BadgeCheck, MapPin, Sparkles } from 'lucide-react';

import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { StarDisplay } from '@/components/ui/StarRating';
import { TrustBadge } from '@/components/ui/TrustScore';
import { CATEGORY_MAP } from '@/lib/constants';
import { formatPKR } from '@/lib/format';

export function WorkerCard({ worker }) {
  const { user, headline, categories = [], skills = [], rates, city, distanceKm, stats, trustScore, idVerified, isAvailable, experienceYears, matchReasons } = worker;
  const tags = [...categories.map((c) => CATEGORY_MAP[c]?.label ?? c), ...skills].slice(0, 3);

  return (
    <Card as="article" className="group relative flex flex-col p-4 transition hover:border-primary-300 hover:shadow-raised">
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar src={user.avatar?.url} name={user.name} size="lg" />
          <span
            className={`absolute right-0 bottom-0 size-3.5 rounded-full border-2 border-white ${isAvailable ? 'bg-success-600' : 'bg-ink-300'}`}
            title={isAvailable ? 'Available' : 'Not available'}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-1 truncate text-base font-semibold">
            <Link to={`/workers/${user._id}`} className="truncate after:absolute after:inset-0 focus:outline-none">
              {user.name}
            </Link>
            {idVerified && <BadgeCheck className="size-4 shrink-0 text-primary-600" aria-label="ID verified" />}
          </h3>
          <p className="truncate text-sm text-ink-600">{headline || CATEGORY_MAP[categories[0]]?.label}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StarDisplay rating={stats?.avgRating} count={stats?.reviewCount} />
            <TrustBadge score={trustScore?.score} />
          </div>
        </div>
      </div>

      {matchReasons?.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Why this worker matches">
          {matchReasons.map((reason) => (
            <li key={reason} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-800">
              <Sparkles className="size-3" aria-hidden />
              {reason}
            </li>
          ))}
        </ul>
      )}

      {tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills">
          {tags.map((t) => (
            <li key={t} className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs text-ink-700 capitalize">
              {t}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 border-t border-ink-100 pt-3 [&:not(:first-child)]:mt-4">
        <div>
          <p className="text-xs text-ink-500">Daily rate</p>
          <p className="font-display text-lg font-bold text-ink-900">{formatPKR(rates?.daily)}</p>
        </div>
        <div className="text-right text-xs text-ink-600">
          <p className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {distanceKm !== undefined ? `${distanceKm} km · ${city}` : city}
          </p>
          {experienceYears > 0 && <p>{experienceYears} yrs experience</p>}
        </div>
      </div>
    </Card>
  );
}

export function WorkerCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex gap-3">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-5 h-6 w-24" />
    </Card>
  );
}
