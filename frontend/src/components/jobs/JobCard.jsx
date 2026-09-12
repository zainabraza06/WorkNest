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
    <Card as="article" className="relative flex flex-col gap-3 p-4 transition hover:border-primary-300 hover:shadow-raised">
      <div className="flex items-start gap-3">
        {Icon && (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">
            <Link to={to ?? `/jobs/${job._id}`} className="line-clamp-2 after:absolute after:inset-0 focus:outline-none">
              {job.title}
            </Link>
          </h3>
          <p className="text-sm text-ink-600">
            {cat?.label} · posted {timeAgo(job.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {showStatus && status && <Badge tone={status.tone}>{status.label}</Badge>}
          {job.urgency === 'urgent' && (
            <Badge tone="danger">
              <Zap className="size-3" aria-hidden /> Urgent
            </Badge>
          )}
        </div>
      </div>

      <p className="line-clamp-2 text-sm text-ink-700">{job.description}</p>

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-600">
        <div className="inline-flex items-center gap-1">
          <dt className="sr-only">Duration</dt>
          <Clock className="size-4" aria-hidden />
          <dd>{formatDuration(job.durationType, job.durationCount)}</dd>
        </div>
        <div className="inline-flex items-center gap-1">
          <dt className="sr-only">Starts</dt>
          <CalendarDays className="size-4" aria-hidden />
          <dd>{formatDate(job.startDate)}</dd>
        </div>
        <div className="inline-flex items-center gap-1">
          <dt className="sr-only">Location</dt>
          <MapPin className="size-4" aria-hidden />
          <dd>{job.distanceKm !== undefined ? `${job.distanceKm} km · ${job.city}` : job.city}</dd>
        </div>
      </dl>

      <div className="flex items-center justify-between border-t border-ink-100 pt-3">
        <p className="font-display text-lg font-bold text-ink-900">
          <span className="sr-only">Budget: </span>
          {formatBudget(job.budget)}
        </p>
        <p className="text-xs text-ink-500">
          {job.offersCount ?? 0} offer{job.offersCount === 1 ? '' : 's'}
        </p>
      </div>
    </Card>
  );
}

export function JobCardSkeleton() {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex gap-3">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-6 w-32" />
    </Card>
  );
}
