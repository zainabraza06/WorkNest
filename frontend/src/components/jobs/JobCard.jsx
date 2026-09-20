import { Link } from 'react-router';
import { CalendarDays, Clock, MapPin, Zap } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { CATEGORY_MAP, JOB_STATUS_META } from '@/lib/constants';
import { formatBudget, formatDate, formatDuration, timeAgo } from '@/lib/format';

export function JobCard({ job, showStatus = false, to }) {
  const cat = CATEGORY_MAP[job.category];
  const Icon = cat?.icon;
  const status = JOB_STATUS_META[job.status];

  return (
    <Card as="article" interactive className="relative flex h-full min-w-0 flex-col p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-ink-400 uppercase">
          {Icon && <Icon className="size-3.5 shrink-0 text-primary-500" aria-hidden />}
          <span className="truncate">{cat?.label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {job.urgency === 'urgent' && (
            <Badge tone="accent">
              <Zap className="size-2.5" aria-hidden /> Urgent
            </Badge>
          )}
          {showStatus && status && <Badge tone={status.tone}>{status.label}</Badge>}
        </div>
      </div>

      <h3 className="mt-2 min-w-0 font-display text-base font-bold text-ink-950">
        <Link to={to ?? `/jobs/${job._id}`} className="line-clamp-2 after:absolute after:inset-0 focus:outline-none">
          {job.title}
        </Link>
      </h3>

      <p className="mt-1.5 line-clamp-2 min-w-0 text-sm text-ink-500">{job.description}</p>

      <dl className="mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
        <div className="inline-flex min-w-0 items-center gap-1">
          <dt className="sr-only">Duration</dt>
          <Clock className="size-3 shrink-0" aria-hidden />
          <dd className="truncate">{formatDuration(job.durationType, job.durationCount)}</dd>
        </div>
        <div className="inline-flex min-w-0 items-center gap-1">
          <dt className="sr-only">Starts</dt>
          <CalendarDays className="size-3 shrink-0" aria-hidden />
          <dd className="truncate">{formatDate(job.startDate)}</dd>
        </div>
        <div className="inline-flex min-w-0 items-center gap-1">
          <dt className="sr-only">Location</dt>
          <MapPin className="size-3 shrink-0" aria-hidden />
          <dd className="truncate">{job.distanceKm !== undefined ? `${job.distanceKm} km · ${job.city}` : job.city}</dd>
        </div>
      </dl>

      <div className="mt-auto flex min-w-0 items-end justify-between gap-3 border-t border-ink-200 pt-3 [&:not(:nth-child(4))]:mt-4">
        <div className="min-w-0">
          <p className="numeric truncate font-display text-lg font-extrabold text-ink-950">
            <span className="sr-only">Budget: </span>
            {formatBudget(job.budget)}
          </p>
          <p className="text-[11px] font-semibold tracking-wide text-ink-400 uppercase">Budget</p>
        </div>
        <p className="numeric shrink-0 text-xs text-ink-400">
          {job.offersCount ?? 0} offer{job.offersCount === 1 ? '' : 's'} · {timeAgo(job.createdAt)}
        </p>
      </div>
    </Card>
  );
}

export function JobCardSkeleton() {
  return (
    <Card className="flex h-full min-w-0 flex-col p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-4 w-3/4" />
      <Skeleton className="mt-2 h-3 w-full" />
      <Skeleton className="mt-1.5 h-3 w-5/6" />
      <Skeleton className="mt-4 h-3 w-2/3" />
      <div className="mt-6 flex items-end justify-between border-t border-ink-200 pt-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
    </Card>
  );
}
