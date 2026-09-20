import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Briefcase, CalendarDays, MapPin, Repeat, UserX } from 'lucide-react';

import { workersApi } from '@/api';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, Tag } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';
import { StarDisplay } from '@/components/ui/StarRating';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { TrustScoreRing } from '@/components/ui/TrustScore';
import { CATEGORY_MAP } from '@/lib/constants';
import { formatDate, formatPKR, timeAgo } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ProfileSkeleton() {
  return (
    <LoadingRegion label="Loading profile" className="mx-auto max-w-4xl space-y-5 px-4 py-8">
      <Card className="flex gap-4 p-6">
        <Skeleton className="size-24 rounded-full" />
        <div className="flex-1 space-y-3 pt-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      </Card>
      <Skeleton className="h-40 w-full rounded-xl" />
    </LoadingRegion>
  );
}

export default function WorkerProfilePage() {
  const { userId } = useParams();
  const viewer = useAuthStore((s) => s.user);
  const { data: w, isPending, isError, error, refetch } = useQuery({
    queryKey: ['worker', userId],
    queryFn: () => workersApi.get(userId),
    retry: (count, err) => err.status !== 404 && count < 1,
  });

  if (isPending) return <ProfileSkeleton />;
  if (isError) {
    return error.status === 404 ? (
      <EmptyState icon={UserX} title="Worker not found" description="This profile doesn't exist or is no longer active." action={<Button to="/workers">Browse workers</Button>} className="py-20" />
    ) : (
      <ErrorState error={error} onRetry={refetch} className="py-20" />
    );
  }

  const isSelf = viewer?._id === w.user._id;
  const workDays = new Set(w.availability?.map((s) => s.dayOfWeek));
  const completion = w.stats.totalJobs ? Math.round((w.stats.completedJobs / w.stats.totalJobs) * 100) : null;

  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 md:grid-cols-[1fr_300px] md:py-8">
      {/* Header */}
      <Card className="md:col-span-2">
        <CardBody className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <Avatar src={w.user.avatar?.url} name={w.user.name} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold sm:text-3xl">
              {w.user.name}
              {w.idVerified && (
                <Badge tone="primary">
                  <BadgeCheck className="size-3.5" aria-hidden /> ID verified
                </Badge>
              )}
            </h1>
            {w.headline && <p className="mt-1 text-ink-700">{w.headline}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-600">
              <StarDisplay rating={w.stats.avgRating} count={w.stats.reviewCount} />
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden /> {w.city}
              </span>
              {w.experienceYears > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Briefcase className="size-4" aria-hidden /> {w.experienceYears} yrs experience
                </span>
              )}
              <span className={w.isAvailable ? 'font-medium text-success-700' : 'text-ink-500'}>{w.isAvailable ? '● Available for work' : '○ Not taking work'}</span>
            </div>
          </div>
          <TrustScoreRing score={w.trustScore?.score} size={84} showLabel />
        </CardBody>
      </Card>

      <div className="flex flex-col gap-5">
        {w.bio && (
          <Card>
            <CardHeader title="About" />
            <CardBody>
              <p className="whitespace-pre-line text-ink-700">{w.bio}</p>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Services & skills" />
          <CardBody className="flex flex-wrap gap-1.5">
            {w.categories.map((c) => (
              <Badge key={c} tone="solid">
                {CATEGORY_MAP[c]?.label ?? c}
              </Badge>
            ))}
            {/* A skill that just restates a category would be noise */}
            {w.skills
              .filter((s) => !w.categories.some((c) => (CATEGORY_MAP[c]?.label ?? c).toLowerCase() === s.toLowerCase()))
              .map((s) => (
                <Tag key={s} className="capitalize">
                  {s}
                </Tag>
              ))}
          </CardBody>
        </Card>

        {w.portfolio?.length > 0 && (
          <Card>
            <CardHeader title="Past work" />
            <CardBody>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {w.portfolio.map((img) => (
                  <li key={img._id}>
                    <figure>
                      <a href={img.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-ink-100">
                        <img src={img.url} alt={img.caption || `Work by ${w.user.name}`} className="size-full object-cover transition hover:scale-105" loading="lazy" />
                      </a>
                      {img.caption && <figcaption className="mt-1 truncate text-xs text-ink-600">{img.caption}</figcaption>}
                    </figure>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title={`Reviews (${w.stats.reviewCount})`} />
          <CardBody>
            {w.recentReviews?.length ? (
              <ul className="divide-y divide-ink-100">
                {w.recentReviews.map((r) => (
                  <li key={r._id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <Avatar src={r.from?.avatar?.url} name={r.from?.name} size="sm" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{r.from?.name}</p>
                        <p className="text-xs text-ink-500">{timeAgo(r.createdAt)}</p>
                      </div>
                      <StarDisplay rating={r.rating} />
                    </div>
                    {r.text && <p className="mt-2 text-sm text-ink-700">{r.text}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-600">No reviews yet — reviews appear here after completed jobs.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <aside className="flex flex-col gap-5">
        <Card>
          <CardHeader title="Rates" />
          <CardBody>
            <dl className="divide-y divide-ink-100">
              {[
                ['Hourly', w.rates.hourly],
                ['Daily', w.rates.daily],
                ['Monthly', w.rates.monthly],
              ]
                .filter(([, v]) => v)
                .map(([label, v]) => (
                  <div key={label} className="flex justify-between py-2 first:pt-0">
                    <dt className="text-sm text-ink-600">{label}</dt>
                    <dd className="font-semibold">{formatPKR(v)}</dd>
                  </div>
                ))}
            </dl>
            {!isSelf && viewer?.role === 'client' && (
              <Button to={`/jobs/new?invite=${w.user._id}&category=${w.categories[0]}`} size="lg" className="mt-4 w-full">
                Hire {w.user.name.split(' ')[0]}
              </Button>
            )}
            {!viewer && (
              <Button to={`/login?redirect=/workers/${w.user._id}`} size="lg" className="mt-4 w-full">
                Sign in to hire
              </Button>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Track record" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-ink-500">Jobs completed</dt>
                <dd className="font-display text-xl font-bold">{w.stats.completedJobs}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Completion rate</dt>
                <dd className="font-display text-xl font-bold">{completion === null ? '—' : `${completion}%`}</dd>
              </div>
              <div>
                <dt className="inline-flex items-center gap-1 text-xs text-ink-500">
                  <Repeat className="size-3" aria-hidden /> Repeat hires
                </dt>
                <dd className="font-display text-xl font-bold">{w.stats.repeatHires}</dd>
              </div>
              <div>
                <dt className="inline-flex items-center gap-1 text-xs text-ink-500">
                  <CalendarDays className="size-3" aria-hidden /> Member since
                </dt>
                <dd className="text-sm font-semibold">{formatDate(w.user.createdAt)}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Availability" />
          <CardBody>
            <ul className="grid grid-cols-7 gap-1 text-center" aria-label="Working days">
              {DAYS.map((d, i) => (
                <li key={d} className={`rounded-sm py-2 text-xs font-bold ${workDays.has(i) ? 'bg-ink-950 text-white' : 'bg-ink-100 text-ink-300'}`}>
                  {d[0]}
                  <span className="sr-only">
                    {d} {workDays.has(i) ? 'available' : 'unavailable'}
                  </span>
                </li>
              ))}
            </ul>
            {w.availability?.[0] && (
              <p className="mt-3 text-xs text-ink-500">
                Usually {w.availability[0].startTime} – {w.availability[0].endTime} · travels up to {w.serviceRadiusKm} km
              </p>
            )}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
