import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Briefcase } from 'lucide-react';

import { jobsApi } from '@/api';
import { fromPoint } from '@/components/forms/LocationFields';
import { JobCard, JobCardSkeleton } from '@/components/jobs/JobCard';
import { FilterPanel, SortSelect } from '@/components/search/FilterPanel';
import { SearchBar } from '@/components/search/SearchBar';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingRegion } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { CATEGORIES, CITIES, DURATION_TYPES } from '@/lib/constants';
import { useAuthStore } from '@/stores/authStore';

const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'relevance', label: 'Best match' },
  { value: 'budget_high', label: 'Highest budget' },
  { value: 'budget_low', label: 'Lowest budget' },
];

export default function BrowseJobsPage() {
  const profile = useAuthStore((s) => s.profile);
  const home = fromPoint(profile?.location);
  const { filters, update, reset, activeCount } = useUrlFilters({ sort: 'newest', page: 1 });

  // "Near my area" uses the worker's saved profile location — no GPS prompt needed
  const nearMine = filters.near === 'mine' && home;
  const params = {
    ...filters,
    near: undefined,
    ...(nearMine && { lat: home.lat, lng: home.lng, radiusKm: filters.radiusKm ?? profile.serviceRadiusKm }),
    sort: filters.sort === 'nearest' && !nearMine ? 'newest' : filters.sort,
  };

  const query = useQuery({ queryKey: ['jobs', params], queryFn: () => jobsApi.list(params), placeholderData: keepPreviousData });
  const data = query.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-primary-600 uppercase">Open work</p>
      <h1 className="mt-2 text-3xl lg:text-4xl">Find jobs</h1>
      <p className="mt-2 mb-6 text-ink-500">Open jobs from clients near you. Send an offer to start negotiating.</p>

      <SearchBar value={filters.q ?? ''} onSearch={(q) => update({ q, ...(q && { sort: 'relevance' }) })} placeholder="Search jobs, e.g. wiring, house cleaning" label="Search jobs" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[236px_minmax(0,1fr)]">
        <FilterPanel activeCount={activeCount} onReset={reset}>
          {home && (
            <label className="flex items-center gap-2 rounded-lg bg-ink-50 p-3 text-sm font-medium text-ink-900">
              <input type="checkbox" className="size-4 accent-primary-500" checked={filters.near === 'mine'} onChange={(e) => update({ near: e.target.checked && 'mine', sort: e.target.checked ? 'nearest' : 'newest' })} />
              Only within my service area ({profile.serviceRadiusKm} km)
            </label>
          )}
          <Select label="Category" placeholder="All categories" options={CATEGORIES} value={filters.category ?? ''} onChange={(e) => update({ category: e.target.value })} />
          <Select label="Duration" placeholder="Any duration" options={DURATION_TYPES} value={filters.durationType ?? ''} onChange={(e) => update({ durationType: e.target.value })} />
          <Select label="City" placeholder="All cities" options={CITIES.map((c) => ({ value: c.value }))} value={filters.city ?? ''} onChange={(e) => update({ city: e.target.value })} />
          <Input label="Minimum budget" type="number" inputMode="numeric" min={0} step={500} leading="Rs" value={filters.minBudget ?? ''} onChange={(e) => update({ minBudget: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary-500" checked={filters.urgency === 'urgent'} onChange={(e) => update({ urgency: e.target.checked && 'urgent' })} />
            Urgent jobs only
          </label>
        </FilterPanel>

        <section aria-label="Results" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600" aria-live="polite">
              {data ? `${data.total} open job${data.total === 1 ? '' : 's'}` : ' '}
            </p>
            <SortSelect value={params.sort} onChange={(sort) => update({ sort, ...(sort === 'nearest' && home && { near: 'mine' }) })} options={home ? SORTS : SORTS.filter((s) => s.value !== 'nearest')} />
          </div>

          {query.isPending ? (
            <LoadingRegion label="Loading jobs" className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </LoadingRegion>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={query.refetch} />
          ) : data.items.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="No open jobs match"
              description="New jobs are posted every day. Try widening your filters or check back soon."
              action={activeCount > 0 && <Button variant="outline" onClick={reset}>Clear filters</Button>}
            />
          ) : (
            <>
              <ul className={`grid gap-4 md:grid-cols-2 ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
                {data.items.map((job) => (
                  <li key={job._id} className="min-w-0">
                    <JobCard job={job} />
                  </li>
                ))}
              </ul>
              <Pagination page={data.page} totalPages={data.totalPages} onChange={(page) => update({ page })} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
